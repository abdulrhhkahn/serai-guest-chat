import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@supabase/supabase-js";

/**
 * Backs the /activity page. Same authorization shape as property-staff.ts
 * (staff on the property, org admin for it, or site admin) — this is a
 * read of potentially every staff member's actions, so it's gated the
 * same way admin-facing staff data already is.
 *
 * POST body: { propertyId, since } — since is an ISO timestamp string;
 * only rows at or after it are returned.
 */
export const Route = createFileRoute("/api/admin/activity-log")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const authHeader = request.headers.get("Authorization");
        if (!authHeader) return new Response("Unauthorized", { status: 401 });

        const asUser = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_PUBLISHABLE_KEY!, {
          global: { headers: { Authorization: authHeader } },
          auth: { persistSession: false, autoRefreshToken: false },
        });
        const { data: userData, error: userErr } = await asUser.auth.getUser();
        if (userErr || !userData.user) return new Response("Unauthorized", { status: 401 });
        const uid = userData.user.id;

        let body: { propertyId?: string; since?: string };
        try {
          body = await request.json();
        } catch {
          return new Response("Bad request", { status: 400 });
        }
        const propertyId = String(body.propertyId ?? "");
        const since = String(body.since ?? "");
        if (!propertyId) return new Response("Missing propertyId", { status: 400 });
        if (!since) return new Response("Missing since", { status: 400 });

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

        const [{ data: roles }, { data: property }, { data: selfProfile }] = await Promise.all([
          supabaseAdmin.from("user_roles").select("role").eq("user_id", uid),
          supabaseAdmin.from("properties").select("organization_id").eq("id", propertyId).maybeSingle(),
          supabaseAdmin.from("staff_profiles").select("property_id").eq("id", uid).maybeSingle(),
        ]);
        let authorized = (roles ?? []).some((r) => r.role === "admin") || selfProfile?.property_id === propertyId;
        if (!authorized && property?.organization_id) {
          const { data: orgAdminRow } = await supabaseAdmin
            .from("org_admins")
            .select("user_id")
            .eq("org_id", property.organization_id)
            .eq("user_id", uid)
            .maybeSingle();
          authorized = !!orgAdminRow;
        }
        if (!authorized) return new Response("Forbidden", { status: 403 });

        const { data: rows, error } = await supabaseAdmin
          .from("staff_activity_log")
          .select("id, staff_id, action_type, detail, created_at")
          .eq("property_id", propertyId)
          .gte("created_at", since)
          .order("created_at", { ascending: false })
          .limit(1000);
        if (error) return new Response(error.message, { status: 500 });

        const staffIds = [...new Set((rows ?? []).map((r) => r.staff_id))];
        const emailById = new Map<string, string | null>();
        await Promise.all(
          staffIds.map(async (id) => {
            const { data } = await supabaseAdmin.auth.admin.getUserById(id);
            emailById.set(id, data?.user?.email ?? null);
          }),
        );

        const entries = (rows ?? []).map((r) => ({
          id: r.id,
          email: emailById.get(r.staff_id) ?? "Unknown",
          actionType: r.action_type,
          detail: r.detail,
          createdAt: r.created_at,
        }));

        return Response.json({ entries });
      },
    },
  },
});
