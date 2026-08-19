import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@supabase/supabase-js";
import { verifyTurnstile, turnstileEnabled } from "@/lib/turnstile.server";

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

        // Classify + resolve autonomy via the shared core (same path SMS/WhatsApp use).
        const { classifyAndAnswer } = await import("@/lib/concierge-core.server");

        async function logDecision(category: string | null, level: string, outcome: "auto" | "escalated") {
          await supabaseAdmin.from("ai_decisions").insert({
            property_id: propertyId, conversation_id: conversationId,
            channel: "web", category, level, outcome,
          });
        }

        async function sendToGuest(body: string) {
          await supabaseAdmin.from("messages").insert({
            conversation_id: conversationId, sender: "ai", body, approved: true, source: "ai_direct",
          });
          await supabaseAdmin.from("conversations")
            .update({ last_message_at: new Date().toISOString(), status: "open" })
            .eq("id", conversationId);
        }

        // Escalate: store the draft for staff and flag the conversation. The guest
        // is NOT answered directly; they see the "getting a team member" state via
        // the needs_staff flag they already subscribe to.
        async function escalate(draft: string, category: string | null) {
          await supabaseAdmin.from("ai_drafts").insert({
            conversation_id: conversationId, property_id: propertyId, category, draft,
          });
          await supabaseAdmin.from("conversations")
            .update({ last_message_at: new Date().toISOString(), status: "open", needs_staff: true })
            .eq("id", conversationId);
        }

        try {
          const { answer, category, level } = await classifyAndAnswer({ supabaseAdmin, propertyId, question });

          if (level === "auto") {
            await sendToGuest(answer);
            await logDecision(category, level, "auto");
            return Response.json({ ok: true, level, category, sent: true });
          }
          await escalate(answer, category);
          await logDecision(category, level, "escalated");
          return Response.json({ ok: true, level, category, escalated: true });
        } catch (e) {
          console.error("concierge error", e);
          await escalate("Let me get a team member to help you with that.", null);
          await logDecision(null, "approve", "escalated");
          return Response.json({ ok: true, escalated: true, error: true });
        }
      },
    },
  },
});
