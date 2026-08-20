import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@supabase/supabase-js";
import { isValidEmail } from "@/lib/org-manage";
import { PLAN_PRICING_PKR, type PlanTier } from "@/lib/billing";

/**
 * Platform-admin customer onboarding. Unlike /api/admin/org, which requires
 * the caller to already be an admin of the target org, these actions are
 * gated purely by the site-wide `admin` role (user_roles), since the whole
 * point is bootstrapping orgs that don't have any admins yet.
 *
 * POST body: { action, ...args }
 *   createOrg            { name }
 *   assignProperty       { orgId, propertyId }
 *   addOrgAdmin          { orgId, email }
 *   activateSubscription { orgId, planTier, propertyCount, periodDays? }
 */
export const Route = createFileRoute("/api/admin/customers")({
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

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

        // Site-wide platform admin only — same user_roles('admin') role
        // already used to gate cross-property actions elsewhere.
        const { data: roles } = await supabaseAdmin.from("user_roles").select("role").eq("user_id", uid);
        const isPlatformAdmin = (roles ?? []).some((r) => r.role === "admin");
        if (!isPlatformAdmin) return new Response("Forbidden", { status: 403 });

        let body: Record<string, unknown>;
        try { body = await request.json(); } catch { return new Response("Bad request", { status: 400 }); }
        const action = String(body.action ?? "");

        const ok = (data: unknown = {}) => Response.json({ ok: true, ...(data as object) });
        const bad = (msg: string, code = 400) => new Response(msg, { status: code });

        switch (action) {
          case "createOrg": {
            const name = String(body.name ?? "").trim();
            if (!name) return bad("Name required");
            const { data, error } = await supabaseAdmin.from("organizations").insert({ name }).select("id").single();
            return error ? bad(error.message, 500) : ok({ orgId: data.id });
          }

          case "assignProperty": {
            const orgId = String(body.orgId ?? "");
            const propertyId = String(body.propertyId ?? "");
            if (!orgId || !propertyId) return bad("Missing orgId/propertyId");
            const { error } = await supabaseAdmin.from("properties").update({ organization_id: orgId }).eq("id", propertyId);
            return error ? bad(error.message, 500) : ok();
          }

          case "addOrgAdmin": {
            const orgId = String(body.orgId ?? "");
            const email = String(body.email ?? "").trim();
            if (!orgId) return bad("Missing orgId");
            if (!isValidEmail(email)) return bad("Invalid email");
            const { data: list } = await supabaseAdmin.auth.admin.listUsers({ page: 1, perPage: 200 });
            const target = list?.users?.find((u) => u.email?.toLowerCase() === email.toLowerCase());
            if (!target) return bad("No user with that email — they must sign in once first", 404);
            const { error } = await supabaseAdmin.from("org_admins").upsert({ org_id: orgId, user_id: target.id });
            return error ? bad(error.message, 500) : ok();
          }

          case "activateSubscription": {
            const orgId = String(body.orgId ?? "");
            const planTier = body.planTier as PlanTier;
            const propertyCount = Math.max(1, Number(body.propertyCount ?? 1));
            const periodDays = Math.max(1, Number(body.periodDays ?? 30));
            if (!orgId) return bad("Missing orgId");
            if (planTier !== "growth" && planTier !== "pro") return bad("planTier must be growth or pro");

            const plan = PLAN_PRICING_PKR[planTier];
            const amountPkr = plan.monthlyPkr * propertyCount;
            const periodEnd = new Date();
            periodEnd.setDate(periodEnd.getDate() + periodDays);

            const { error } = await supabaseAdmin.from("subscriptions").insert({
              organization_id: orgId,
              // No real Safepay checkout happened — this is a manually
              // activated subscription (e.g. bank transfer, trial grant).
              // Reference must stay unique per row since it's the webhook's
              // reconciliation key for real Safepay-originated rows.
              safepay_subscription_reference: `manual-${orgId}-${Date.now()}`,
              safepay_plan_id: plan.planId,
              plan_tier: planTier,
              status: "active",
              property_count: propertyCount,
              amount_pkr: amountPkr,
              current_period_end: periodEnd.toISOString(),
            });
            return error ? bad(error.message, 500) : ok({ amountPkr, periodEnd: periodEnd.toISOString() });
          }

          default:
            return bad("Unknown action");
        }
      },
    },
  },
});
