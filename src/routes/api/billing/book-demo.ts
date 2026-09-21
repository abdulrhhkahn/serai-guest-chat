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
        try {
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
        // Temporary diagnostics — surfaced directly in the response so a
        // test booking shows exactly what happened, without needing to
        // dig through Vercel's function logs (which have been genuinely
        // hard to locate reliably). Safe to remove once this is confirmed
        // working end-to-end; nothing here is sensitive.
        const debug: string[] = [];

        if (googleMeetConfigured()) {
          try {
            const meeting = await createGoogleMeet({
              summary: `Serai demo — ${firstName} ${lastName}`,
              startTimeIso: scheduledAtIso,
              durationMinutes: 30,
              attendeeEmail: workEmail,
            });
            meetJoinUrl = meeting.joinUrl;
            debug.push("meet: created ok");
            await supabaseAdmin
              .from("plan_interest_leads")
              .update({ meet_join_url: meeting.joinUrl, meet_event_id: meeting.eventId })
              .eq("id", lead.id);
          } catch (e) {
            console.error("Google Meet creation failed for lead", lead.id, e);
            debug.push(`meet: FAILED — ${e instanceof Error ? e.message : String(e)}`);
          }
        } else {
          debug.push("meet: not configured (missing GOOGLE_OAUTH_CLIENT_ID/SECRET/REFRESH_TOKEN)");
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
          if (!result.ok) {
            console.error("Demo confirmation email failed for lead", lead.id, result.error);
            debug.push(`guest email: FAILED — ${result.error}`);
          } else {
            debug.push(`guest email: sent to ${workEmail}`);
          }

          // Separate from the guest-facing confirmation above — sent to
          // whoever should actually see new bookings land, not to the
          // domain's own "demos@" sender address (that address only
          // sends, it has no real inbox behind it). Skipped entirely if
          // DEMO_NOTIFY_EMAIL isn't set, same fail-open spirit as the
          // rest of this route — a missing notification shouldn't ever
          // block a booking from succeeding.
          const notifyEmail = process.env.DEMO_NOTIFY_EMAIL;
          if (notifyEmail) {
            const notifyResult = await sendEmail({
              to: [notifyEmail],
              subject: `New demo booked — ${firstName} ${lastName}`,
              html: `
                <p>New demo request.</p>
                <ul>
                  <li><strong>Name:</strong> ${firstName} ${lastName}</li>
                  <li><strong>Email:</strong> ${workEmail}</li>
                  <li><strong>Phone:</strong> ${phone}</li>
                  <li><strong>Property type:</strong> ${propertyType} (${propertyCount})</li>
                  <li><strong>Plan interested in:</strong> ${planTier}</li>
                  <li><strong>Scheduled:</strong> ${when}</li>
                  ${heardAbout ? `<li><strong>Heard about us via:</strong> ${heardAbout}</li>` : ""}
                </ul>
                ${meetLine}
              `,
              text: `New demo request.\n\nName: ${firstName} ${lastName}\nEmail: ${workEmail}\nPhone: ${phone}\nProperty type: ${propertyType} (${propertyCount})\nPlan interested in: ${planTier}\nScheduled: ${when}${heardAbout ? `\nHeard about us via: ${heardAbout}` : ""}\n\n${meetLineText}`,
            });
            if (!notifyResult.ok) {
              console.error("Demo notify email failed for lead", lead.id, notifyResult.error);
              debug.push(`notify email: FAILED — ${notifyResult.error}`);
            } else {
              debug.push(`notify email: sent to ${notifyEmail}`);
            }
          } else {
            debug.push("notify email: DEMO_NOTIFY_EMAIL not set");
          }
        } else {
          debug.push("email: not configured (missing RESEND_API_KEY/REPORT_FROM_EMAIL)");
        }

        return Response.json({ ok: true, meetJoinUrl, debug });
        } catch (e) {
          // Any unhandled crash lands here instead of falling through to
          // a generic HTML error page — returns the actual error message
          // and stack as plain JSON, so it shows up readably in the
          // browser instead of a wall of raw markup.
          console.error("book-demo crashed", e);
          return Response.json(
            {
              ok: false,
              error: e instanceof Error ? e.message : String(e),
              stack: e instanceof Error ? e.stack : undefined,
            },
            { status: 500 },
          );
        }
      },
    },
  },
});
