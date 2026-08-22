import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@supabase/supabase-js";

/**
 * Staff emails live in auth.users, which clients can never query directly
 * (no RLS policy exposes it, by design) — so listing "name + email" for a
 * property's staff has to go through a server route with the service-role
 * client. Read-only; same authorization shape as invite-staff.ts.
 *
 * POST body: { propertyId }
 */
export const Route = createFileRoute("/api/admin/property-staff")({
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

        let body: { propertyId?: string };
        try {
          body = await request.json();
        } catch {
          return new Response("Bad request", { status: 400 });
        }
        const propertyId = String(body.propertyId ?? "");
        if (!propertyId) return new Response("Missing propertyId", { status: 400 });

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

        // Authorized: staff on this property, org admin for it, or site admin.
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

        const { data: profiles } = await supabaseAdmin
          .from("staff_profiles")
          .select("id, full_name")
          .eq("property_id", propertyId);

        const staff = await Promise.all(
          (profiles ?? []).map(async (p) => {
            const { data } = await supabaseAdmin.auth.admin.getUserById(p.id);
            return { id: p.id, full_name: p.full_name, email: data?.user?.email ?? null };
          }),
        );

        const { data: invites } = await supabaseAdmin
          .from("staff_invites")
          .select("id, email, status, created_at")
          .eq("property_id", propertyId)
          .eq("status", "pending")
          .order("created_at", { ascending: false });

        return Response.json({ staff, invites: invites ?? [] });
      },
    },
  },
});
