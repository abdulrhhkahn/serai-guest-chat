import { createFileRoute } from "@tanstack/react-router";
import { buildWeeklyDigest, renderDigestHtml, renderDigestText } from "@/lib/digest";
import { sendEmail, emailConfigured } from "@/lib/email.server";

/**
 * Weekly analytics digest. For each property with a report_email set, computes
 * the last 7 days (vs the prior 7 for the delta) and emails a summary.
 *
 * Protect + schedule like the retention job:
 *   - CRON_SECRET (required); callers send `x-cron-secret: <value>`
 *   - RESEND_API_KEY + REPORT_FROM_EMAIL to actually send (else dry-run)
 *   - trigger weekly (Cloudflare Cron, Supabase pg_cron, or a GitHub Action)
 */
export const Route = createFileRoute("/api/admin/weekly-digest")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const secret = process.env.CRON_SECRET;
        if (!secret || request.headers.get("x-cron-secret") !== secret) {
          return new Response("Unauthorized", { status: 401 });
        }

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

        const now = Date.now();
        const weekMs = 7 * 86_400_000;
        const start = new Date(now - weekMs).toISOString();
        const prevStart = new Date(now - 2 * weekMs).toISOString();
        const rangeLabel = `${new Date(now - weekMs).toLocaleDateString()} – ${new Date(now).toLocaleDateString()}`;

        const { data: allProps } = await supabaseAdmin
          .from("properties")
          .select("id, name, report_email")
          .not("report_email", "is", null);

        // Weekly digest is a Growth+ feature (PLAN_FEATURES.weeklyDigest in
        // src/lib/billing.ts). Filter out Starter properties before doing
        // any of the expensive per-property aggregation below.
        const props: typeof allProps = [];
        for (const p of allProps ?? []) {
          const { data: planOk } = await supabaseAdmin.rpc("property_has_plan_at_least", {
            _property_id: p.id,
            min_tier: "growth",
          });
          if (planOk) props.push(p);
        }

        const results: { property: string; sent: boolean; recipients?: number; error?: string; dryRun?: boolean }[] = [];

        for (const p of props ?? []) {
          const recipients = String(p.report_email).split(",").map((s) => s.trim()).filter(Boolean);
          if (!recipients.length) continue;

          const [decisions, prev, csat, convs, delivery] = await Promise.all([
            supabaseAdmin.from("ai_decisions").select("category, outcome, created_at").eq("property_id", p.id).gte("created_at", start),
            supabaseAdmin.from("ai_decisions").select("outcome, created_at").eq("property_id", p.id).gte("created_at", prevStart).lt("created_at", start),
            supabaseAdmin.from("conversations").select("csat_rating").eq("property_id", p.id).not("csat_rating", "is", null).gte("csat_at", start),
            supabaseAdmin.from("conversations").select("id, channel").eq("property_id", p.id),
            supabaseAdmin.from("messages").select("conversation_id, sender, delivery_status, created_at").gte("created_at", start),
          ]);

          const convChannels = new Map<string, string>();
          for (const c of convs.data ?? []) convChannels.set(c.id, c.channel || "web");
          const propMsgs = (delivery.data ?? []).filter((m) => convChannels.has(m.conversation_id));
          const failedDeliveries = propMsgs.filter((m) => m.delivery_status === "failed" || m.delivery_status === "undelivered").length;

          const model = buildWeeklyDigest({
            decisions: (decisions.data ?? []).map((d) => ({ category: d.category, outcome: d.outcome })),
            prevDecisions: (prev.data ?? []).map((d) => ({ outcome: d.outcome })),
            csatRatings: (csat.data ?? []).map((c) => c.csat_rating),
            convChannels,
            messages: propMsgs.map((m) => ({ conversation_id: m.conversation_id, sender: m.sender })),
            failedDeliveries,
          });

          const html = renderDigestHtml(model, p.name, rangeLabel);
          const text = renderDigestText(model, p.name, rangeLabel);
          const subject = `Serai weekly report — ${p.name}`;

          if (!emailConfigured()) {
            results.push({ property: p.name, sent: false, dryRun: true });
            continue;
          }
          const sent = await sendEmail({ to: recipients, subject, html, text });
          results.push({ property: p.name, sent: sent.ok, recipients: recipients.length, error: sent.error });
        }

        return Response.json({ ok: true, properties: results.length, dryRun: !emailConfigured(), results });
      },
    },
  },
});
