import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@supabase/supabase-js";
import { generateText } from "ai";

export const Route = createFileRoute("/api/ai/suggest-reply")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const authHeader = request.headers.get("authorization");
        if (!authHeader?.startsWith("Bearer ")) {
          return new Response("Unauthorized", { status: 401 });
        }

        const supabase = createClient(
          process.env.SUPABASE_URL!,
          process.env.SUPABASE_PUBLISHABLE_KEY!,
          {
            global: { headers: { Authorization: authHeader } },
            auth: { persistSession: false, autoRefreshToken: false },
          },
        );

        const { data: userData, error: userErr } = await supabase.auth.getUser();
        if (userErr || !userData.user) return new Response("Unauthorized", { status: 401 });

        const { conversationId } = (await request.json()) as { conversationId: string };
        if (!conversationId) return new Response("Bad request", { status: 400 });

        const { data: conv } = await supabase.from("conversations").select("property_id").eq("id", conversationId).maybeSingle();
        if (!conv) return new Response("Not found", { status: 404 });

        const [{ data: messages }, { data: faqs }, { data: prop }] = await Promise.all([
          supabase.from("messages").select("sender,body").eq("conversation_id", conversationId).order("created_at").limit(20),
          supabase.from("faqs").select("question,answer").eq("property_id", conv.property_id),
          supabase.from("properties").select("name,wifi_ssid,wifi_password,checkin_time,checkout_time,address").eq("id", conv.property_id).maybeSingle(),
        ]);

        const apiKey = process.env.LOVABLE_API_KEY;
        if (!apiKey) {
          return Response.json({ reply: "Thanks for reaching out — I'll get right back to you." });
        }

        const { createLovableAiGatewayProvider } = await import("@/lib/ai-gateway.server");
        const gateway = createLovableAiGatewayProvider(apiKey);
        const model = gateway("google/gemini-2.5-flash");

        const context_str = [
          prop ? `Property: ${prop.name}` : "",
          prop?.checkin_time ? `Check-in: ${prop.checkin_time}` : "",
          prop?.checkout_time ? `Check-out: ${prop.checkout_time}` : "",
          prop?.wifi_ssid ? `Wifi: ${prop.wifi_ssid} / ${prop.wifi_password ?? ""}` : "",
          prop?.address ? `Address: ${prop.address}` : "",
          "FAQs:",
          ...(faqs ?? []).map((f) => `Q: ${f.question}\nA: ${f.answer}`),
        ].filter(Boolean).join("\n");

        const transcript = (messages ?? []).map((m) => `${m.sender}: ${m.body}`).join("\n");

        try {
          const { text } = await generateText({
            model,
            system: `You are drafting a reply for hotel staff to send to a guest. Be warm, concise, and specific. Use the property info and FAQs below. Never invent details. Keep to 2-4 sentences.\n\n${context_str}`,
            prompt: `Conversation so far:\n${transcript}\n\nDraft the staff's next reply.`,
          });
          return Response.json({ reply: text });
        } catch (e) {
          console.error("suggest error", e);
          return Response.json({ reply: "Thanks for reaching out — I'll help you with that shortly." });
        }
      },
    },
  },
});
