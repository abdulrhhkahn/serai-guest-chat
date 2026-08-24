import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@supabase/supabase-js";

/**
 * Backs the staff-dashboard "Properties" page (site admins only, via the
 * regular /auth login) — deliberately separate from /api/admin/customers,
 * which additionally requires the platform-admin passphrase. This is the
 * same trust level as the property switcher dropdown: the `admin` role
 * alone is enough, since it's reached through the ordinary staff login,
 * not the separate admin surface.
 */
export const Route = createFileRoute("/api/staff/properties-overview")({
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

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

        const { data: roles } = await supabaseAdmin.from("user_roles").select("role").eq("user_id", userData.user.id);
        if (!(roles ?? []).some((r) => r.role === "admin")) return new Response("Forbidden", { status: 403 });

        const { data: properties, error: propErr } = await supabaseAdmin
          .from("properties")
          .select("id, name, slug, organization_id")
          .order("name");
        if (propErr) return new Response(propErr.message, { status: 500 });

        const orgIds = [...new Set((properties ?? []).map((p) => p.organization_id).filter((id): id is string => !!id))];
        const { data: orgs } = orgIds.length
          ? await supabaseAdmin.from("organizations").select("id, name").in("id", orgIds)
          : { data: [] };
        const { data: subs } = orgIds.length
          ? await supabaseAdmin.from("subscriptions").select("organization_id, plan_tier, status").in("organization_id", orgIds).order("created_at", { ascending: false })
          : { data: [] };

        const orgNameById = new Map((orgs ?? []).map((o) => [o.id, o.name]));
        const latestSubByOrg = new Map<string, { plan_tier: string; status: string }>();
        for (const s of subs ?? []) {
          if (!latestSubByOrg.has(s.organization_id)) latestSubByOrg.set(s.organization_id, s);
        }

        const result = (properties ?? []).map((p) => {
          const sub = p.organization_id ? latestSubByOrg.get(p.organization_id) : undefined;
          return {
            id: p.id,
            name: p.name,
            slug: p.slug,
            organizationName: p.organization_id ? (orgNameById.get(p.organization_id) ?? "Unknown") : null,
            planTier: sub?.status === "active" ? sub.plan_tier : "basic",
            status: sub?.status ?? null,
          };
        });

        return Response.json({ properties: result });
      },
    },
  },
});
