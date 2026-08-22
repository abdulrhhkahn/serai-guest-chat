import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@supabase/supabase-js";
import { isValidEmail } from "@/lib/org-manage";
import { PLAN_PRICING_PKR, type PlanTier } from "@/lib/billing";

/**
 * Platform-admin customer onboarding. Unlike /api/admin/org, which requires
 * the caller to already be an admin of the target org, these actions are
 * gated purely by the site-wide `admin` role (user_roles) PLUS a separate
 * passphrase header — see /admin-login and /api/admin/verify-passphrase.
 * The passphrase isn't stored in the Supabase user database at all, so a
 * compromised staff/admin Supabase session alone still can't reach this.
 *
 * POST body: { action, ...args }
 *   createHotel          { hotelName, adminName?, adminEmail } — the main flow
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

        const gateSecret = process.env.PLATFORM_ADMIN_PASSPHRASE;
        const gateHeader = request.headers.get("x-admin-gate");
        if (!gateSecret || gateHeader !== gateSecret) return new Response("Unauthorized", { status: 401 });

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

        function slugify(s: string) {
          return s.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40) || `hotel-${Date.now()}`;
        }

        switch (action) {
          // The main onboarding flow: hotel name + admin's email in one
          // step. Creates the org, the property, invites the admin via
          // Supabase's own email (creates their auth.users row immediately,
          // so we can add them to org_admins right away without waiting
          // for them to click the link), and logs a staff_invites row.
          case "createHotel": {
            const hotelName = String(body.hotelName ?? "").trim();
            const adminName = body.adminName ? String(body.adminName).trim() : undefined;
            const adminEmail = String(body.adminEmail ?? "").trim();
            const planTier = body.planTier as PlanTier | "starter" | undefined;
            if (!hotelName) return bad("Hotel name required");
            if (!isValidEmail(adminEmail)) return bad("Invalid admin email");
            if (planTier && planTier !== "starter" && planTier !== "growth" && planTier !== "pro") {
              return bad("planTier must be starter, growth, or pro");
            }

            const { data: org, error: orgErr } = await supabaseAdmin
              .from("organizations").insert({ name: hotelName }).select("id").single();
            if (orgErr) return bad(orgErr.message, 500);

            const { data: property, error: propErr } = await supabaseAdmin
              .from("properties")
              .insert({ name: hotelName, slug: slugify(hotelName), organization_id: org.id })
              .select("id")
              .single();
            if (propErr) return bad(propErr.message, 500);

            const appUrl = process.env.APP_URL ?? new URL(request.url).origin;
            const { data: invited, error: inviteErr } = await supabaseAdmin.auth.admin.inviteUserByEmail(adminEmail, {
              data: { invited_property_id: property.id, full_name: adminName },
              redirectTo: `${appUrl}/dashboard`,
            });
            if (inviteErr || !invited?.user) return bad(inviteErr?.message ?? "Invite failed", 500);

            await supabaseAdmin.from("org_admins").upsert({ org_id: org.id, user_id: invited.user.id });
            await supabaseAdmin.from("staff_invites").insert({
              property_id: property.id,
              email: adminEmail,
              invited_by: uid,
            });

            // Starter needs no subscription row at all (its absence IS the
            // Starter default — see org_has_plan_at_least). Only Growth/Pro
            // create one, at 1 property since this is a brand-new hotel.
            let amountPkr: number | undefined;
            if (planTier === "growth" || planTier === "pro") {
              const plan = PLAN_PRICING_PKR[planTier];
              amountPkr = plan.monthlyPkr;
              const periodEnd = new Date();
              periodEnd.setDate(periodEnd.getDate() + 30);
              const { error: subErr } = await supabaseAdmin.from("subscriptions").insert({
                organization_id: org.id,
                safepay_subscription_reference: `manual-${org.id}-${Date.now()}`,
                safepay_plan_id: plan.planId,
                plan_tier: planTier,
                status: "active",
                property_count: 1,
                amount_pkr: amountPkr,
                current_period_end: periodEnd.toISOString(),
              });
              if (subErr) return bad(subErr.message, 500);
            }

            return ok({ orgId: org.id, propertyId: property.id, amountPkr });
          }

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
