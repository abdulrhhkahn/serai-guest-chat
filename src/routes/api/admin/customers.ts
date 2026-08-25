import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@supabase/supabase-js";
import { isValidEmail, canRemoveAdmin } from "@/lib/org-manage";
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
            const planTier = body.planTier as PlanTier | "basic" | undefined;
            if (!hotelName) return bad("Hotel name required");
            if (!isValidEmail(adminEmail)) return bad("Invalid admin email");
            if (planTier && planTier !== "basic" && planTier !== "growth" && planTier !== "pro") {
              return bad("planTier must be basic, growth, or pro");
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
              redirectTo: `${appUrl}/set-password`,
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

          case "removeOrgAdmin": {
            const orgId = String(body.orgId ?? "");
            const userId = String(body.userId ?? "");
            if (!orgId) return bad("Missing orgId");
            if (!userId) return bad("Missing userId");
            const { count } = await supabaseAdmin
              .from("org_admins").select("user_id", { count: "exact", head: true }).eq("org_id", orgId);
            if (!canRemoveAdmin({ adminCount: count ?? 0 })) return bad("Can't remove the last admin", 409);
            const { error } = await supabaseAdmin.from("org_admins").delete().eq("org_id", orgId).eq("user_id", userId);
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

          // Cancels the org's current subscription — reverts them to
          // Basic everywhere else in the app (plan-gating checks status
          // in ('active','past_due'), so 'canceled' falls through to the
          // Basic default automatically). Keeps the row for history
          // rather than deleting it.
          case "deactivateSubscription": {
            const orgId = String(body.orgId ?? "");
            if (!orgId) return bad("Missing orgId");
            const { data: latest } = await supabaseAdmin
              .from("subscriptions").select("id").eq("organization_id", orgId)
              .order("created_at", { ascending: false }).limit(1).maybeSingle();

            if (latest) {
              const { error } = await supabaseAdmin.from("subscriptions").update({ status: "canceled" }).eq("id", latest.id);
              return error ? bad(error.message, 500) : ok();
            }

            // A hotel that's always been on Basic has no subscription row
            // at all to cancel — insert a placeholder canceled one purely
            // as an "offboarded" marker. amount_pkr: 0 and plan_tier
            // 'basic' here don't affect plan-gating anywhere else in the
            // app, since those checks only ever look at status
            // in ('active','past_due') — a canceled row is invisible to
            // them exactly like having no row at all, except it now
            // correctly places the hotel in Offboarded customers.
            const { error } = await supabaseAdmin.from("subscriptions").insert({
              organization_id: orgId,
              safepay_subscription_reference: `manual-offboard-${orgId}-${Date.now()}`,
              safepay_plan_id: "plan_basic_offboarded",
              plan_tier: "basic",
              status: "canceled",
              property_count: 1,
              amount_pkr: 0,
            });
            return error ? bad(error.message, 500) : ok();
          }

          // Reactivating a hotel onto Basic specifically (as opposed to
          // Deactivate, which explicitly offboards them) means restoring
          // the true "no subscription row" state — same as a hotel that's
          // always been free. Deleting the row(s) rather than updating
          // status is deliberate: nothing in the subscription_status enum
          // means "not offboarded, but also not paying," so a canceled
          // marker left behind would trap the org in Offboarded forever.
          case "clearSubscription": {
            const orgId = String(body.orgId ?? "");
            if (!orgId) return bad("Missing orgId");
            const { error } = await supabaseAdmin.from("subscriptions").delete().eq("organization_id", orgId);
            return error ? bad(error.message, 500) : ok();
          }

          // Edits an EXISTING subscription's tier/property count in place
          // — unlike activateSubscription, this doesn't touch status or
          // current_period_end (no renewal reset), it's just correcting
          // details on what's already active. Nothing to update if the
          // org has never had a subscription at all.
          case "updateSubscription": {
            const orgId = String(body.orgId ?? "");
            const planTier = body.planTier as PlanTier;
            const propertyCount = Math.max(1, Number(body.propertyCount ?? 1));
            if (!orgId) return bad("Missing orgId");
            if (planTier !== "growth" && planTier !== "pro") return bad("planTier must be growth or pro");

            const { data: latest } = await supabaseAdmin
              .from("subscriptions").select("id").eq("organization_id", orgId)
              .order("created_at", { ascending: false }).limit(1).maybeSingle();
            if (!latest) return bad("No subscription to update — activate one first", 404);

            const plan = PLAN_PRICING_PKR[planTier];
            const amountPkr = plan.monthlyPkr * propertyCount;
            const { error } = await supabaseAdmin
              .from("subscriptions")
              .update({ plan_tier: planTier, safepay_plan_id: plan.planId, property_count: propertyCount, amount_pkr: amountPkr })
              .eq("id", latest.id);
            return error ? bad(error.message, 500) : ok({ amountPkr });
          }

          // Reads every org with its properties and latest subscription,
          // via the service-role client — the browser's own Supabase
          // client can't do this itself, since organizations/subscriptions
          // RLS only lets a user read orgs THEY personally administer, and
          // the site admin isn't added as an org_admin of every hotel they
          // onboard on a customer's behalf.
          case "listOrgs": {
            const { data: orgRows, error: orgErr } = await supabaseAdmin.from("organizations").select("id, name").order("name");
            if (orgErr) return bad(orgErr.message, 500);

            const { data: propRows, error: propErr } = await supabaseAdmin
              .from("properties")
              .select("id, name, organization_id")
              .not("organization_id", "is", null);
            if (propErr) return bad(propErr.message, 500);

            const { data: subRows, error: subErr } = await supabaseAdmin
              .from("subscriptions")
              .select("organization_id, plan_tier, status, property_count, current_period_end")
              .order("created_at", { ascending: false });
            if (subErr) return bad(subErr.message, 500);

            const latestSubByOrg = new Map<string, (typeof subRows)[number]>();
            for (const s of subRows ?? []) {
              if (!latestSubByOrg.has(s.organization_id)) latestSubByOrg.set(s.organization_id, s);
            }

            const orgs = (orgRows ?? []).map((o) => ({
              id: o.id,
              name: o.name,
              properties: (propRows ?? [])
                .filter((p) => p.organization_id === o.id)
                .map((p) => ({ id: p.id, name: p.name })),
              subscription: latestSubByOrg.get(o.id) ?? null,
            }));
            return ok({ orgs });
          }

          // Full detail for one org — the "click a hotel, see everything"
          // view. Includes admin emails, which listOrgs above doesn't
          // fetch (email lookups are per-user Admin API calls, wasteful
          // to do for every org in the table view).
          case "orgDetail": {
            const orgId = String(body.orgId ?? "");
            if (!orgId) return bad("Missing orgId");

            const { data: org, error: orgErr } = await supabaseAdmin.from("organizations").select("id, name").eq("id", orgId).maybeSingle();
            if (orgErr) return bad(orgErr.message, 500);
            if (!org) return bad("Not found", 404);

            const { data: properties } = await supabaseAdmin.from("properties").select("id, name, slug, created_at").eq("organization_id", orgId).order("name");

            const { data: sub } = await supabaseAdmin
              .from("subscriptions").select("*").eq("organization_id", orgId)
              .order("created_at", { ascending: false }).limit(1).maybeSingle();

            const { data: adminRows } = await supabaseAdmin.from("org_admins").select("user_id, created_at").eq("org_id", orgId);
            const admins = await Promise.all(
              (adminRows ?? []).map(async (a) => {
                const { data } = await supabaseAdmin.auth.admin.getUserById(a.user_id);
                return { id: a.user_id, email: data?.user?.email ?? null, addedAt: a.created_at };
              }),
            );

            return ok({
              org,
              properties: properties ?? [],
              subscription: sub ?? null,
              admins,
            });
          }

          default:
            return bad("Unknown action");
        }
      },
    },
  },
});
