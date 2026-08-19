import { containmentByTopic, overallContainment, channelVolume } from "@/lib/analytics";
import { csatSummary } from "@/lib/csat";

export type DigestInput = {
  decisions: { category: string | null; outcome: string }[];
  prevDecisions: { outcome: string }[];
  csatRatings: (number | null | undefined)[];
  convChannels: Map<string, string>;
  messages: { conversation_id: string; sender: string }[];
  failedDeliveries: number;
};

export type DigestModel = {
  containmentPct: number;
  containmentDelta: number; // vs previous 7 days, in points
  totalQuestions: number;
  topTopics: { category: string; total: number; containmentPct: number }[];
  csatAvg: number;
  csatCount: number;
  channels: { channel: string; inbound: number; outbound: number }[];
  failedDeliveries: number;
};

/** Assemble the weekly digest model from raw rows (all pure). */
export function buildWeeklyDigest(input: DigestInput): DigestModel {
  const containmentPct = overallContainment(input.decisions);
  const prevPct = overallContainment(input.prevDecisions);
  const csat = csatSummary(input.csatRatings);
  const channels = channelVolume(input.convChannels, input.messages).map((c) => ({
    channel: c.channel, inbound: c.inbound, outbound: c.outbound,
  }));
  return {
    containmentPct,
    containmentDelta: containmentPct - prevPct,
    totalQuestions: input.decisions.length,
    topTopics: containmentByTopic(input.decisions).slice(0, 3).map((t) => ({
      category: t.category, total: t.total, containmentPct: t.containmentPct,
    })),
    csatAvg: csat.average,
    csatCount: csat.count,
    channels,
    failedDeliveries: input.failedDeliveries,
  };
}

function delta(n: number): string {
  if (n === 0) return "±0";
  return n > 0 ? `+${n}` : `${n}`;
}

/** Plain-text digest — easy to test and a safe email fallback. */
export function renderDigestText(m: DigestModel, propertyName: string, rangeLabel: string): string {
  const lines = [
    `Serai weekly report — ${propertyName}`,
    rangeLabel,
    "",
    `AI containment: ${m.containmentPct}% (${delta(m.containmentDelta)} pts vs last week)`,
    `Questions handled: ${m.totalQuestions}`,
    m.csatCount ? `Guest satisfaction: ${m.csatAvg}/5 from ${m.csatCount} rating${m.csatCount === 1 ? "" : "s"}` : "Guest satisfaction: no ratings yet",
    m.failedDeliveries ? `Delivery failures: ${m.failedDeliveries} — check the dashboard` : "Delivery failures: none",
    "",
    "Top topics:",
    ...(m.topTopics.length
      ? m.topTopics.map((t) => `  • ${t.category}: ${t.total} question${t.total === 1 ? "" : "s"}, ${t.containmentPct}% auto`)
      : ["  (no questions this week)"]),
    "",
    "Channels:",
    ...(m.channels.length
      ? m.channels.map((c) => `  • ${c.channel}: ${c.inbound} in / ${c.outbound} out`)
      : ["  (no activity)"]),
  ];
  return lines.join("\n");
}

/** Minimal HTML digest (inline styles for email clients). */
export function renderDigestHtml(m: DigestModel, propertyName: string, rangeLabel: string): string {
  const esc = (s: string) => s.replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c]!));
  const topics = m.topTopics.length
    ? m.topTopics.map((t) => `<li>${esc(t.category)} — ${t.total} question${t.total === 1 ? "" : "s"}, ${t.containmentPct}% auto</li>`).join("")
    : "<li>No questions this week</li>";
  const channels = m.channels.length
    ? m.channels.map((c) => `<li>${esc(c.channel)}: ${c.inbound} in / ${c.outbound} out</li>`).join("")
    : "<li>No activity</li>";
  return `<div style="font-family:system-ui,sans-serif;max-width:560px;margin:0 auto;color:#1f2937">
  <h2 style="margin:0 0 4px">Serai weekly report</h2>
  <div style="color:#6b7280;font-size:13px">${esc(propertyName)} · ${esc(rangeLabel)}</div>
  <table style="width:100%;margin:16px 0;border-collapse:collapse">
    <tr><td style="padding:8px 0"><strong>${m.containmentPct}%</strong> AI containment (${delta(m.containmentDelta)} pts)</td></tr>
    <tr><td style="padding:8px 0;border-top:1px solid #eee">${m.totalQuestions} questions handled</td></tr>
    <tr><td style="padding:8px 0;border-top:1px solid #eee">${m.csatCount ? `${m.csatAvg}/5 satisfaction (${m.csatCount})` : "No guest ratings yet"}</td></tr>
    <tr><td style="padding:8px 0;border-top:1px solid #eee">${m.failedDeliveries ? `${m.failedDeliveries} delivery failure(s)` : "No delivery failures"}</td></tr>
  </table>
  <h3 style="font-size:14px;margin:12px 0 4px">Top topics</h3>
  <ul style="margin:0;padding-left:18px;font-size:14px">${topics}</ul>
  <h3 style="font-size:14px;margin:12px 0 4px">Channels</h3>
  <ul style="margin:0;padding-left:18px;font-size:14px">${channels}</ul>
</div>`;
}
