import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@supabase/supabase-js";
import { generateText } from "ai";
import { verifyTurnstile, turnstileEnabled } from "@/lib/turnstile.server";

export const Route = createFileRoute("/api/ai/concierge")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        // 1. Require the guest's (anonymous) session token.
        const authHeader = request.headers.get("authorization");
        if (!authHeader?.startsWith("Bearer ")) {
          return new Response("Unauthorized", { status: 401 });
        }

        const { conversationId, question, turnstileToken } = (await request.json()) as {
          conversationId?: string;
          question?: string;
          turnstileToken?: string;
        };
        if (!conversationId || typeof question !== "string" || !question.trim()) {
          return new Response("Bad request", { status: 400 });
        }
        if (question.length > 2000) {
          return new Response("Question too long", { status: 413 });
        }

        // 2. Resolve + authorize the caller.
        const asUser = createClient(
          process.env.SUPABASE_URL!,
          process.env.SUPABASE_PUBLISHABLE_KEY!,
          {
            global: { headers: { Authorization: authHeader } },
            auth: { persistSession: false, autoRefreshToken: false },
          },
        );

        const { data: userData, error: userErr } = await asUser.auth.getUser();
        if (userErr || !userData.user) {
          return new Response("Unauthorized", { status: 401 });
        }

        const { supabaseAdmin } = await import(
          "@/integrations/supabase/client.server"
        );

        // 3. Durable rate limit (shared across all instances via Postgres).
        const { data: allowed } = await supabaseAdmin.rpc("check_rate_limit", {
          _bucket: "concierge",
          _identity: userData.user.id,
          _max: 20,
          _window_secs: 60,
        });
        if (allowed === false) {
          return new Response("Too many requests", { status: 429 });
        }

        // 4. Ownership: RLS on this token-scoped client only returns the row if
        //    guest_user_id = auth.uid(), so this doubly enforces ownership.
        const { data: conv } = await asUser
          .from("conversations")
          .select("id, property_id, guest_user_id")
          .eq("id", conversationId)
          .maybeSingle();
        if (!conv || conv.guest_user_id !== userData.user.id) {
          return new Response("Forbidden", { status: 403 });
        }
        const propertyId = conv.property_id;

        // 5. Turnstile (opt-in): only challenge the FIRST guest message of a
        //    conversation, so a verified guest isn't re-challenged per message.
        if (turnstileEnabled()) {
          const { count } = await supabaseAdmin
            .from("messages")
            .select("id", { count: "exact", head: true })
            .eq("conversation_id", conversationId)
            .eq("sender", "guest");
          const isFirst = (count ?? 0) <= 1;
          if (isFirst) {
            const ip =
              request.headers.get("cf-connecting-ip") ??
              request.headers.get("x-forwarded-for");
            const ok = await verifyTurnstile(turnstileToken, ip);
            if (!ok) {
              return new Response("Verification required", { status: 403 });
            }
          }
        }

        // 6. Generate + persist the reply (service role, gated by all the above).
        const { data: faqs } = await supabaseAdmin
          .from("faqs")
          .select("question,answer,category")
          .eq("property_id", propertyId);

        const { data: prop } = await supabaseAdmin
          .from("properties")
          .select("name,wifi_ssid,wifi_password,checkin_time,checkout_time,address,welcome_message")
          .eq("id", propertyId)
          .maybeSingle();

        const apiKey = process.env.LOVABLE_API_KEY;

        async function flagForStaff(body: string) {
          await supabaseAdmin.from("messages").insert({
            conversation_id: conversationId,
            sender: "ai",
            body,
            approved: true,
            source: "ai_direct",
          });
          await supabaseAdmin
            .from("conversations")
            .update({ last_message_at: new Date().toISOString(), status: "open", needs_staff: true })
            .eq("id", conversationId);
        }

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
          await supabaseAdmin
            .from("conversations")
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
