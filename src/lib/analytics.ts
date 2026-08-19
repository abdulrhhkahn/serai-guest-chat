// Pure analytics helpers (no imports) so the aggregation logic is unit-testable.

export type Decision = { category: string | null; outcome: string; channel?: string | null };

export type TopicStat = {
  category: string;
  total: number;
  auto: number;
  escalated: number;
  containmentPct: number; // auto / total, 0–100
};

/**
 * Containment per topic: of the questions classified into a topic, what share
 * the AI handled on its own (outcome "auto") vs. handed to staff ("escalated").
 * Sorted by volume, highest first. Null/empty categories fold into "Other".
 */
export function containmentByTopic(decisions: Decision[]): TopicStat[] {
  const map = new Map<string, { auto: number; escalated: number }>();
  for (const d of decisions) {
    const key = (d.category && d.category.trim()) || "Other";
    const b = map.get(key) ?? { auto: 0, escalated: 0 };
    if (d.outcome === "auto") b.auto++;
    else b.escalated++;
    map.set(key, b);
  }
  return Array.from(map.entries())
    .map(([category, v]) => {
      const total = v.auto + v.escalated;
      return {
        category,
        total,
        auto: v.auto,
        escalated: v.escalated,
        containmentPct: total ? Math.round((v.auto / total) * 100) : 0,
      };
    })
    .sort((a, b) => b.total - a.total);
}

/** Overall containment across all decisions (0–100). */
export function overallContainment(decisions: Decision[]): number {
  if (!decisions.length) return 0;
  const auto = decisions.filter((d) => d.outcome === "auto").length;
  return Math.round((auto / decisions.length) * 100);
}

export type ChannelRow = { channel: string; conversations: number; inbound: number; outbound: number };

/**
 * Volume per channel. `convChannels` maps conversation_id → channel; messages
 * are split into inbound (guest) vs outbound (ai/staff). Channels with no
 * activity are omitted.
 */
export function channelVolume(
  convChannels: Map<string, string>,
  messages: { conversation_id: string; sender: string }[],
): ChannelRow[] {
  const convSeen = new Map<string, Set<string>>(); // channel → set of conv ids
  const counts = new Map<string, { inbound: number; outbound: number }>();

  for (const [convId, ch] of convChannels) {
    if (!convSeen.has(ch)) convSeen.set(ch, new Set());
    convSeen.get(ch)!.add(convId);
    if (!counts.has(ch)) counts.set(ch, { inbound: 0, outbound: 0 });
  }
  for (const m of messages) {
    const ch = convChannels.get(m.conversation_id);
    if (!ch) continue;
    const c = counts.get(ch) ?? { inbound: 0, outbound: 0 };
    if (m.sender === "guest") c.inbound++;
    else if (m.sender === "ai" || m.sender === "staff") c.outbound++;
    counts.set(ch, c);
  }
  return Array.from(counts.entries())
    .map(([channel, v]) => ({ channel, conversations: convSeen.get(channel)?.size ?? 0, ...v }))
    .sort((a, b) => b.inbound + b.outbound - (a.inbound + a.outbound));
}
