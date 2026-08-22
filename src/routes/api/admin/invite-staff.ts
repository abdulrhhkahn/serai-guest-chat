import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@supabase/supabase-js";
import { isValidEmail } from "@/lib/org-manage";

/**
 * Invite-based staff onboarding, replacing open self-signup for real
 * properties. Caller must be an org admin for the target property, or a
 * site-wide admin. Uses Supabase's own admin.inviteUserByEmail — this
 * creates the auth.users row and sends Supabase's built-in invite email;
 * we don't handle password-setting or email delivery ourselves.
 *
 * POST body: { propertyId, email, fullName? }
 */
export const Route = createFileRoute("/api/admin/invite-staff")({
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

        let body: { propertyId?: string; email?: string; fullName?: string };
        try {
          body = await request.json();
        } catch {
          return new Response("Bad request", { status: 400 });
        }
        const propertyId = String(body.propertyId ?? "");
        const email = String(body.email ?? "").trim();
        const fullName = body.fullName ? String(body.fullName).trim() : undefined;
        if (!propertyId) return new Response("Missing propertyId", { status: 400 });
        if (!isValidEmail(email)) return new Response("Invalid email", { status: 400 });

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

        // Authorized: org admin for this property, or site-wide admin.
        // Called via the service-role client here (not the caller's own
        // session), so auth.uid()-based RPCs like is_org_admin_for_property
        // won't resolve the right user — check membership directly instead.
        const [{ data: roles }, { data: property }] = await Promise.all([
          supabaseAdmin.from("user_roles").select("role").eq("user_id", uid),
          supabaseAdmin.from("properties").select("organization_id").eq("id", propertyId).maybeSingle(),
        ]);
        let authorized = (roles ?? []).some((r) => r.role === "admin");
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

        // Seat cap per plan (PLAN_FEATURES.maxStaff in src/lib/billing.ts).
        const { data: seatOk } = await supabaseAdmin.rpc("staff_seat_limit_ok", { _property_id: propertyId });
        if (!seatOk) {
          return new Response("Staff seat limit reached for the current plan. Upgrade to invite more.", { status: 403 });
        }

        const appUrl = process.env.APP_URL ?? new URL(request.url).origin;

        const { error: inviteError } = await supabaseAdmin.auth.admin.inviteUserByEmail(email, {
          data: { invited_property_id: propertyId, full_name: fullName },
          redirectTo: `${appUrl}/dashboard`,
        });
        if (inviteError) return new Response(inviteError.message, { status: 500 });

        await supabaseAdmin.from("staff_invites").insert({
          property_id: propertyId,
          email,
          invited_by: uid,
        });

        return Response.json({ ok: true });
      },
    },
  },
});
