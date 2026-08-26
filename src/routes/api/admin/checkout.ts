import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@supabase/supabase-js";
import { createSubscriptionCheckoutUrl } from "@/lib/safepay.server";
import { PLAN_PRICING_PKR, type PlanTier } from "@/lib/billing";

/**
 * POST body: { orgId, tier: "growth" | "pro" }
 * Returns { url } to redirect the browser to for Safepay checkout.
 */
export const Route = createFileRoute("/api/admin/checkout")({
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

        let body: { orgId?: string; tier?: string };
        try {
          body = await request.json();
        } catch {
          return new Response("Bad request", { status: 400 });
        }
        const orgId = String(body.orgId ?? "");
        const tier = body.tier as PlanTier;
        if (!orgId || !(tier === "growth" || tier === "pro")) {
          return new Response("Missing or invalid orgId/tier", { status: 400 });
        }

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

        const { data: membership } = await supabaseAdmin
          .from("org_admins").select("user_id").eq("org_id", orgId).eq("user_id", uid).maybeSingle();
        if (!membership) return new Response("Forbidden", { status: 403 });

        const plan = PLAN_PRICING_PKR[tier];
        const appUrl = process.env.APP_URL ?? new URL(request.url).origin;

        const result = await createSubscriptionCheckoutUrl({
          planId: plan.planId,
          reference: orgId,
          redirectUrl: `${appUrl}/organization/billing?success=true`,
          cancelUrl: `${appUrl}/organization/billing?canceled=true`,
        });

        if (!result.ok || !result.url) {
          return new Response(result.error ?? "Checkout failed", { status: 502 });
        }
        return Response.json({ url: result.url });
      },
    },
  },
});
