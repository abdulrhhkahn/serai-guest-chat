import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@supabase/supabase-js";
import { generateText } from "ai";
import { verifyTurnstile, turnstileEnabled } from "@/lib/turnstile.server";

type Level = "suggest" | "approve" | "auto";

export const Route = createFileRoute("/api/ai/concierge")({
  server: {
    handlers: {
      POST: async ({ request }) => {
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

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

        // Durable, shared rate limit.
        const { data: allowed } = await supabaseAdmin.rpc("check_rate_limit", {
          _bucket: "concierge",
          _identity: userData.user.id,
          _max: 20,
          _window_secs: 60,
        });
        if (allowed === false) return new Response("Too many requests", { status: 429 });

        // Ownership.
        const { data: conv } = await asUser
          .from("conversations")
          .select("id, property_id, guest_user_id")
          .eq("id", conversationId)
          .maybeSingle();
        if (!conv || conv.guest_user_id !== userData.user.id) {
          return new Response("Forbidden", { status: 403 });
        }
        const propertyId = conv.property_id;

        // Turnstile (opt-in) on the first guest message only.
        if (turnstileEnabled()) {
          const { count } = await supabaseAdmin
            .from("messages")
            .select("id", { count: "exact", head: true })
            .eq("conversation_id", conversationId)
            .eq("sender", "guest");
          if ((count ?? 0) <= 1) {
            const ip = request.headers.get("cf-connecting-ip") ?? request.headers.get("x-forwarded-for");
            if (!(await verifyTurnstile(turnstileToken, ip))) {
              return new Response("Verification required", { status: 403 });
            }
          }
        }

        // Context: FAQs, property (incl. default autonomy), and per-category rules.
        const [{ data: faqs }, { data: prop }, { data: rules }] = await Promise.all([
          supabaseAdmin.from("faqs").select("question,answer,category").eq("property_id", propertyId),
          supabaseAdmin
            .from("properties")
            .select("name,wifi_ssid,wifi_password,checkin_time,checkout_time,address,welcome_message,default_autonomy")
            .eq("id", propertyId)
            .maybeSingle(),
          supabaseAdmin.from("category_autonomy").select("category,level").eq("property_id", propertyId),
        ]);

        const defaultLevel: Level = (prop?.default_autonomy as Level) ?? "auto";
        const ruleMap = new Map<string, Level>((rules ?? []).map((r) => [r.category.toLowerCase(), r.level as Level]));
        const categories = Array.from(
          new Set((faqs ?? []).map((f) => f.category).filter((c): c is string => !!c)),
        );

        const apiKey = process.env.LOVABLE_API_KEY;

        async function sendToGuest(body: string, uncertain: boolean) {
          await supabaseAdmin.from("messages").insert({
            conversation_id: conversationId, sender: "ai", body, approved: true, source: "ai_direct",
          });
          await supabaseAdmin.from("conversations")
            .update({ last_message_at: new Date().toISOString(), status: "open", ...(uncertain ? { needs_staff: true } : {}) })
            .eq("id", conversationId);
        }

        // Escalate: store the draft for staff and flag the conversation. The
        // guest is NOT answered directly; they see the "getting a team member"
        // state via the needs_staff flag they already subscribe to.
        async function escalate(draft: string, category: string | null) {
          await supabaseAdmin.from("ai_drafts").insert({
            conversation_id: conversationId, property_id: propertyId, category, draft,
          });
          await supabaseAdmin.from("conversations")
            .update({ last_message_at: new Date().toISOString(), status: "open", needs_staff: true })
            .eq("id", conversationId);
        }

        if (!apiKey) {
          await escalate("(No AI configured — a team member will reply.)", null);
          return Response.json({ ok: true, escalated: true, fallback: true });
        }

        try {
          const { createLovableAiGatewayProvider } = await import("@/lib/ai-gateway.server");
          const model = createLovableAiGatewayProvider(apiKey)("google/gemini-2.5-flash");

          const context = [
            prop ? `Property: ${prop.name}` : "",
            prop?.checkin_time ? `Check-in: ${prop.checkin_time}` : "",
            prop?.checkout_time ? `Check-out: ${prop.checkout_time}` : "",
            prop?.wifi_ssid ? `Wifi SSID: ${prop.wifi_ssid}` : "",
            prop?.wifi_password ? `Wifi password: ${prop.wifi_password}` : "",
            prop?.address ? `Address: ${prop.address}` : "",
            "", "FAQs:",
            ...(faqs ?? []).map((f) => `[${f.category ?? "General"}] Q: ${f.question}\nA: ${f.answer}`),
          ].filter(Boolean).join("\n");

          const catList = categories.length ? categories.join(", ") : "(none)";
          const { text } = await generateText({
            model,
            system:
              `You are a warm, concise concierge for ${prop?.name ?? "this hotel"}. Answer using ONLY the property info and FAQs below. ` +
              `If you don't have enough info, set "answer" to exactly "Let me get a team member to help." ` +
              `Also classify the question into ONE category from this list: [${catList}] — or "other" if none fit. ` +
              `Reply with ONLY minified JSON, no code fences: {"answer":"...","category":"..."}. Keep the answer under 3 sentences, friendly, no emojis.\n\n${context}`,
            prompt: question,
          });

          // Parse the model's JSON defensively.
          let answer = text.trim();
          let category = "other";
          try {
            const cleaned = answer.replace(/^```(?:json)?/i, "").replace(/```$/, "").trim();
            const parsed = JSON.parse(cleaned) as { answer?: string; category?: string };
            if (parsed.answer) answer = parsed.answer.trim();
            if (parsed.category) category = parsed.category.trim();
          } catch {
            // not JSON — treat the whole thing as the answer, category stays "other"
          }

          const uncertain = /team member to help/i.test(answer);
          const level: Level = uncertain ? "approve" : (ruleMap.get(category.toLowerCase()) ?? defaultLevel);

          if (level === "auto") {
            await sendToGuest(answer, false);
            return Response.json({ ok: true, level, category, sent: true });
          }
          // suggest / approve (or uncertain) → hand to staff
          await escalate(answer, category);
          return Response.json({ ok: true, level, category, escalated: true });
        } catch (e) {
          console.error("concierge error", e);
          await escalate("Let me get a team member to help you with that.", null);
          return Response.json({ ok: true, escalated: true, error: true });
        }
      },
    },
  },
});
