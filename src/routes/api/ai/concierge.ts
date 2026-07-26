import { createFileRoute } from "@tanstack/react-router";
import { generateText } from "ai";

export const Route = createFileRoute("/api/ai/concierge")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const { conversationId, propertyId, question } = (await request.json()) as {
          conversationId: string; propertyId: string; question: string;
        };
        if (!conversationId || !propertyId || !question) {
          return new Response("Bad request", { status: 400 });
        }

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

        const { data: faqs } = await supabaseAdmin
          .from("faqs")
          .select("question,answer,category")
          .eq("property_id", propertyId);

        const { data: prop } = await supabaseAdmin
          .from("properties")
          .select("name,wifi_ssid,wifi_password,checkin_time,checkout_time,address,welcome_message")
          .eq("id", propertyId).maybeSingle();

        const apiKey = process.env.LOVABLE_API_KEY;

        async function flagForStaff(body: string) {
          await supabaseAdmin.from("messages").insert({
            conversation_id: conversationId,
            sender: "ai",
            body,
            approved: true,
            source: "ai_direct",
          });
          await supabaseAdmin.from("conversations")
            .update({ last_message_at: new Date().toISOString(), status: "open", needs_staff: true })
            .eq("id", conversationId);
        }

        // Graceful fallback: no LLM configured yet
        if (!apiKey) {
          await flagForStaff("Thanks for your message! A team member will reply shortly.");
          return Response.json({ ok: true, uncertain: true, fallback: true });
        }

        try {
          const { createLovableAiGatewayProvider } = await import("@/lib/ai-gateway.server");
          const gateway = createLovableAiGatewayProvider(apiKey);
          const model = gateway("google/gemini-2.5-flash");

          const context = [
            prop ? `Property: ${prop.name}` : "",
            prop?.checkin_time ? `Check-in: ${prop.checkin_time}` : "",
            prop?.checkout_time ? `Check-out: ${prop.checkout_time}` : "",
            prop?.wifi_ssid ? `Wifi SSID: ${prop.wifi_ssid}` : "",
            prop?.wifi_password ? `Wifi password: ${prop.wifi_password}` : "",
            prop?.address ? `Address: ${prop.address}` : "",
            "",
            "FAQs:",
            ...(faqs ?? []).map((f) => `Q: ${f.question}\nA: ${f.answer}`),
          ].filter(Boolean).join("\n");

          const { text } = await generateText({
            model,
            system: `You are a warm, concise concierge for ${prop?.name ?? "this hotel"}. Answer guest questions using ONLY the property info and FAQs below. If you don't have enough info, reply EXACTLY: "Let me get a team member to help." Keep replies under 3 sentences, friendly, no emojis.\n\n${context}`,
            prompt: question,
          });

          const uncertain = /team member to help/i.test(text);

          await supabaseAdmin.from("messages").insert({
            conversation_id: conversationId,
            sender: "ai",
            body: text,
            approved: true,
            source: "ai_direct",
          });
          await supabaseAdmin.from("conversations")
            .update({
              last_message_at: new Date().toISOString(),
              status: "open",
              ...(uncertain ? { needs_staff: true } : {}),
            })
            .eq("id", conversationId);
          return Response.json({ ok: true, uncertain });
        } catch (e) {
          console.error("concierge error", e);
          await flagForStaff("Let me get a team member to help you with that.");
          return Response.json({ ok: true, uncertain: true, error: true });
        }
      },
    },
  },
});
