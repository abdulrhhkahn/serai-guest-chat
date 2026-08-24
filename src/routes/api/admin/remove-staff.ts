import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@supabase/supabase-js";

/**
 * Removes someone from a property's staff list — deletes their
 * staff_profiles row, which is what actually gates their access (RLS
 * checks current_staff_property_id()). Doesn't touch their user_roles or
 * any org_admins entry; those are managed separately, not tied to a
 * single property's staff list.
 *
 * POST body: { propertyId, userId }
 */
export const Route = createFileRoute("/api/admin/remove-staff")({
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

        let body: { propertyId?: string; userId?: string };
        try {
          body = await request.json();
        } catch {
          return new Response("Bad request", { status: 400 });
        }
        const propertyId = String(body.propertyId ?? "");
        const userId = String(body.userId ?? "");
        if (!propertyId) return new Response("Missing propertyId", { status: 400 });
        if (!userId) return new Response("Missing userId", { status: 400 });
        if (userId === uid) return new Response("Can't remove yourself", { status: 400 });

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

        // Same authorization shape as invite-staff.ts.
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

        const { error } = await supabaseAdmin.from("staff_profiles").delete().eq("id", userId).eq("property_id", propertyId);
        if (error) return new Response(error.message, { status: 500 });
        return Response.json({ ok: true });
      },
    },
  },
});
