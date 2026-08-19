import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@supabase/supabase-js";
import { sendTwilioMessage, twilioConfigured, statusCallbackUrl, type Channel } from "@/lib/twilio.server";

/**
 * Called by the staff inbox after it inserts a reply. If the conversation is on
 * SMS/WhatsApp, this sends the text out via Twilio. For web conversations it's a
 * no-op (the guest gets the message over realtime). The inbox owns the DB write;
 * this route only handles the outbound leg.
 */
export const Route = createFileRoute("/api/outbound/dispatch")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const authHeader = request.headers.get("authorization");
        if (!authHeader?.startsWith("Bearer ")) return new Response("Unauthorized", { status: 401 });

        const { conversationId, body, messageId } = (await request.json()) as {
          conversationId?: string;
          body?: string;
          messageId?: string;
        };
        if (!conversationId || !body?.trim()) return new Response("Bad request", { status: 400 });

        // Authorize as the staff user; RLS returns the conversation only if it's
        // in their property.
        const asUser = createClient(
          process.env.SUPABASE_URL!,
          process.env.SUPABASE_PUBLISHABLE_KEY!,
          { global: { headers: { Authorization: authHeader } }, auth: { persistSession: false, autoRefreshToken: false } },
        );
        const { data: conv } = await asUser
          .from("conversations")
          .select("id, channel, guest_contact, property_id")
          .eq("id", conversationId)
          .maybeSingle();
        if (!conv) return new Response("Forbidden", { status: 403 });

        if (conv.channel === "web" || !conv.guest_contact) {
          return Response.json({ ok: true, skipped: "web" });
        }
        if (!twilioConfigured()) {
          return Response.json({ ok: false, error: "Twilio not configured" });
        }

        const channel = conv.channel as Channel;
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { data: num } = await supabaseAdmin
          .from("messaging_numbers")
          .select("phone_number")
          .eq("property_id", conv.property_id)
          .eq("channel", channel)
          .maybeSingle();
        if (!num) return Response.json({ ok: false, error: `No ${channel} number configured` });

        const sent = await sendTwilioMessage({
          channel, to: conv.guest_contact, from: num.phone_number, body: body.trim(),
          statusCallback: statusCallbackUrl(),
        });

        // Link the Twilio SID + initial status back to the message the inbox
        // inserted, so the status-callback webhook can update it later and the
        // inbox can show delivered/failed.
        if (messageId) {
          await supabaseAdmin.from("messages").update({
            external_id: sent.sid ?? null,
            delivery_status: sent.ok ? "sent" : "failed",
            delivery_error: sent.ok ? null : (sent.error ?? "send_failed"),
          }).eq("id", messageId);
        }

        return Response.json(sent);
      },
    },
  },
});
