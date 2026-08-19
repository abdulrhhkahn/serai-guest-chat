import { createFileRoute } from "@tanstack/react-router";
import { verifyTwilioSignature } from "@/lib/twilio.server";

/**
 * Twilio POSTs here as an outbound message moves through queued → sent →
 * delivered (or failed/undelivered). We match by MessageSid (stored on the
 * message as external_id) and record the status + any error code.
 *
 * Enable by setting TWILIO_STATUS_CALLBACK_URL to this route's public URL; sends
 * then include it as StatusCallback. Without it, nothing calls this endpoint.
 */
export const Route = createFileRoute("/api/webhooks/twilio-status")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const raw = await request.text();
        const params = Object.fromEntries(new URLSearchParams(raw)) as Record<string, string>;

        const url = process.env.TWILIO_STATUS_CALLBACK_URL || request.url;
        const ok = await verifyTwilioSignature(url, params, request.headers.get("x-twilio-signature"));
        if (!ok) return new Response("Invalid signature", { status: 403 });

        const sid = params.MessageSid ?? params.SmsSid;
        const status = params.MessageStatus ?? params.SmsStatus;
        const error = params.ErrorCode || null;
        if (!sid || !status) return new Response("", { status: 200 });

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        await supabaseAdmin
          .from("messages")
          .update({ delivery_status: status, delivery_error: error })
          .eq("external_id", sid);

        return new Response("", { status: 200 });
      },
    },
  },
});
