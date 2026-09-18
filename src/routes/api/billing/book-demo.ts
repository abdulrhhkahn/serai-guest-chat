import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@supabase/supabase-js";
import { googleMeetConfigured, createGoogleMeet } from "@/lib/google-meet.server";
import { emailConfigured, sendEmail } from "@/lib/email.server";

/**
 * POST body: { planTier, firstName, lastName, workEmail, propertyType,
 * propertyCount, phone, heardAbout, scheduledAtIso }
 *
 * Order matters: the lead row is inserted FIRST, since that's what the
 * database's unique constraint on scheduled_at actually protects — if
 * the slot was just taken, this fails immediately and cheaply, before
 * ever calling Google or Resend. Meet creation and the confirmation
 * email both fail OPEN — the booking itself still succeeds either way,
 * just without a link or without an email, rather than losing a real
 * lead over a third-party outage.
 */
export const Route = createFileRoute("/api/billing/book-demo")({
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

        let body: Record<string, unknown>;
        try {
          body = await request.json();
        } catch {
          return new Response("Bad request", { status: 400 });
        }

        const planTier = String(body.planTier ?? "");
        const firstName = String(body.firstName ?? "").trim();
        const lastName = String(body.lastName ?? "").trim();
        const workEmail = String(body.workEmail ?? "").trim();
        const propertyType = String(body.propertyType ?? "");
        const propertyCount = Number(body.propertyCount ?? 0);
        const phone = String(body.phone ?? "").trim();
        const heardAbout = body.heardAbout ? String(body.heardAbout) : null;
        const scheduledAtIso = String(body.scheduledAtIso ?? "");

        if (!firstName || !lastName || !workEmail || !propertyType || !propertyCount || !phone || !scheduledAtIso) {
          return new Response("Missing required fields", { status: 400 });
        }

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

        const { data: lead, error: insertError } = await supabaseAdmin
          .from("plan_interest_leads")
          .insert({
            submitted_by: userData.user.id,
            plan_tier: planTier,
            first_name: firstName,
            last_name: lastName,
            work_email: workEmail,
            property_type: propertyType,
            property_count: propertyCount,
            phone,
            heard_about: heardAbout,
            scheduled_at: scheduledAtIso,
          })
          .select("id")
          .single();

        if (insertError) {
          if (insertError.code === "23505") {
            return new Response(JSON.stringify({ code: "slot_taken" }), {
              status: 409,
              headers: { "Content-Type": "application/json" },
            });
          }
          return new Response(insertError.message, { status: 500 });
        }

        let meetJoinUrl: string | null = null;

        if (googleMeetConfigured()) {
          try {
            const meeting = await createGoogleMeet({
              summary: `Serai demo — ${firstName} ${lastName}`,
              startTimeIso: scheduledAtIso,
              durationMinutes: 30,
              attendeeEmail: workEmail,
            });
            meetJoinUrl = meeting.joinUrl;
            await supabaseAdmin
              .from("plan_interest_leads")
              .update({ meet_join_url: meeting.joinUrl, meet_event_id: meeting.eventId })
              .eq("id", lead.id);
          } catch (e) {
            console.error("Google Meet creation failed for lead", lead.id, e);
          }
        }

        if (emailConfigured()) {
          const when = new Date(scheduledAtIso).toLocaleString("en-US", {
            weekday: "long",
            month: "long",
            day: "numeric",
            hour: "numeric",
            minute: "2-digit",
            timeZoneName: "short",
          });
          const meetLine = meetJoinUrl
            ? `<p>Join here: <a href="${meetJoinUrl}">${meetJoinUrl}</a></p>`
            : `<p>We'll send the meeting link separately before the call.</p>`;
          const meetLineText = meetJoinUrl
            ? `Join here: ${meetJoinUrl}`
            : `We'll send the meeting link separately before the call.`;

          const result = await sendEmail({
            to: [workEmail],
            subject: "Your Serai demo is booked",
            html: `
              <p>Hi ${firstName},</p>
              <p>Your demo is confirmed for <strong>${when}</strong>.</p>
              ${meetLine}
              <p>Looking forward to it!</p>
              <p>— The Serai team</p>
            `,
            text: `Hi ${firstName},\n\nYour demo is confirmed for ${when}.\n\n${meetLineText}\n\nLooking forward to it!\n\n— The Serai team`,
          });
          if (!result.ok) console.error("Demo confirmation email failed for lead", lead.id, result.error);
        }

        return Response.json({ ok: true, meetJoinUrl });
      },
    },
  },
});
