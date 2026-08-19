import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@supabase/supabase-js";
import { canAssignProperty, canRemoveAdmin, isValidEmail } from "@/lib/org-manage";

/**
 * Org management for org admins. Every action verifies the caller (from their
 * JWT) is an admin of the target org before doing anything with the service role.
 * Property assignment is guarded so an admin can't pull in a property they don't
 * control (see canAssignProperty).
 *
 * POST body: { action, orgId, ...args }
 *   rename            { name }
 *   addAdmin          { email }
 *   removeAdmin       { userId }
 *   assignProperty    { propertyId }
 *   unassignProperty  { propertyId }
 */
export const Route = createFileRoute("/api/admin/org")({
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

        let body: Record<string, unknown>;
        try { body = await request.json(); } catch { return new Response("Bad request", { status: 400 }); }
        const action = String(body.action ?? "");
        const orgId = String(body.orgId ?? "");
        if (!orgId) return new Response("Missing orgId", { status: 400 });

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

        // Caller must be an admin of this org.
        const { data: membership } = await supabaseAdmin
          .from("org_admins").select("user_id").eq("org_id", orgId).eq("user_id", uid).maybeSingle();
        if (!membership) return new Response("Forbidden", { status: 403 });

        const ok = (data: unknown = {}) => Response.json({ ok: true, ...(data as object) });
        const bad = (msg: string, code = 400) => new Response(msg, { status: code });

        switch (action) {
          case "rename": {
            const name = String(body.name ?? "").trim();
            if (!name) return bad("Name required");
            const { error } = await supabaseAdmin.from("organizations").update({ name }).eq("id", orgId);
            return error ? bad(error.message, 500) : ok();
          }

          case "addAdmin": {
            const email = String(body.email ?? "").trim();
            if (!isValidEmail(email)) return bad("Invalid email");
            // Look up the user by email (first page is plenty for typical staff counts).
            const { data: list } = await supabaseAdmin.auth.admin.listUsers({ page: 1, perPage: 200 });
            const target = list?.users?.find((u) => u.email?.toLowerCase() === email.toLowerCase());
            if (!target) return bad("No user with that email — they must sign in once first", 404);
            const { error } = await supabaseAdmin.from("org_admins").upsert({ org_id: orgId, user_id: target.id });
            return error ? bad(error.message, 500) : ok();
          }

          case "removeAdmin": {
            const userId = String(body.userId ?? "");
            if (!userId) return bad("Missing userId");
            const { count } = await supabaseAdmin
              .from("org_admins").select("user_id", { count: "exact", head: true }).eq("org_id", orgId);
            if (!canRemoveAdmin({ adminCount: count ?? 0 })) return bad("Can't remove the last admin", 409);
            const { error } = await supabaseAdmin.from("org_admins").delete().eq("org_id", orgId).eq("user_id", userId);
            return error ? bad(error.message, 500) : ok();
          }

          case "assignProperty": {
            const propertyId = String(body.propertyId ?? "");
            if (!propertyId) return bad("Missing propertyId");
            const { data: prop } = await supabaseAdmin
              .from("properties").select("organization_id").eq("id", propertyId).maybeSingle();
            if (!prop) return bad("No such property", 404);
            // Is the caller staff of this property?
            const { data: staff } = await supabaseAdmin
              .from("staff_profiles").select("property_id").eq("id", uid).maybeSingle();
            const callerIsStaffOfProperty = staff?.property_id === propertyId;
            if (!canAssignProperty({ propertyOrgId: prop.organization_id ?? null, targetOrgId: orgId, callerIsStaffOfProperty })) {
              return bad("That property belongs to another organisation", 409);
            }
            const { error } = await supabaseAdmin.from("properties").update({ organization_id: orgId }).eq("id", propertyId);
            return error ? bad(error.message, 500) : ok();
          }

          case "unassignProperty": {
            const propertyId = String(body.propertyId ?? "");
            if (!propertyId) return bad("Missing propertyId");
            // Only unassign a property currently in THIS org.
            const { error } = await supabaseAdmin
              .from("properties").update({ organization_id: null }).eq("id", propertyId).eq("organization_id", orgId);
            return error ? bad(error.message, 500) : ok();
          }

          default:
            return bad("Unknown action");
        }
      },
    },
  },
});
