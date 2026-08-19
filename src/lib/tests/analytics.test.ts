import { describe, it, expect } from "vitest";
import { containmentByTopic, overallContainment, channelVolume } from "../analytics";

describe("containmentByTopic", () => {
  const decisions = [
    { category: "Wifi", outcome: "auto" },
    { category: "Wifi", outcome: "auto" },
    { category: "Wifi", outcome: "escalated" },
    { category: "Billing", outcome: "escalated" },
    { category: null, outcome: "auto" },
  ];

  it("aggregates auto vs escalated per topic with containment %", () => {
    const stats = containmentByTopic(decisions);
    const wifi = stats.find((s) => s.category === "Wifi")!;
    expect(wifi).toMatchObject({ total: 3, auto: 2, escalated: 1, containmentPct: 67 });
  });

  it("folds null/empty categories into 'Other'", () => {
    const other = containmentByTopic(decisions).find((s) => s.category === "Other")!;
    expect(other.total).toBe(1);
    expect(other.auto).toBe(1);
  });

  it("sorts by volume desc", () => {
    const stats = containmentByTopic(decisions);
    expect(stats[0].category).toBe("Wifi"); // 3 is the largest bucket
  });

  it("returns [] for no data", () => {
    expect(containmentByTopic([])).toEqual([]);
  });
});

describe("overallContainment", () => {
  it("computes auto share as a percentage", () => {
    expect(overallContainment([
      { category: "a", outcome: "auto" },
      { category: "b", outcome: "auto" },
      { category: "c", outcome: "escalated" },
    ])).toBe(67);
  });
  it("is 0 with no data", () => {
    expect(overallContainment([])).toBe(0);
  });
});

describe("channelVolume", () => {
  it("splits inbound/outbound and counts conversations per channel", () => {
    const convChannels = new Map<string, string>([
      ["c1", "web"], ["c2", "sms"], ["c3", "sms"],
    ]);
    const messages = [
      { conversation_id: "c1", sender: "guest" },
      { conversation_id: "c1", sender: "ai" },
      { conversation_id: "c2", sender: "guest" },
      { conversation_id: "c2", sender: "staff" },
      { conversation_id: "c3", sender: "guest" },
      { conversation_id: "unknown", sender: "guest" }, // ignored
    ];
    const rows = channelVolume(convChannels, messages);
    const sms = rows.find((r) => r.channel === "sms")!;
    const web = rows.find((r) => r.channel === "web")!;
    expect(sms).toEqual({ channel: "sms", conversations: 2, inbound: 2, outbound: 1 });
    expect(web).toEqual({ channel: "web", conversations: 1, inbound: 1, outbound: 1 });
  });

  it("orders channels by total volume", () => {
    const convChannels = new Map<string, string>([["c1", "web"], ["c2", "whatsapp"], ["c3", "whatsapp"]]);
    const messages = [
      { conversation_id: "c2", sender: "guest" },
      { conversation_id: "c3", sender: "guest" },
      { conversation_id: "c1", sender: "guest" },
    ];
    expect(channelVolume(convChannels, messages)[0].channel).toBe("whatsapp");
  });
});

import { containmentByDay } from "../analytics";

describe("containmentByDay", () => {
  const key = (iso: string) => iso.slice(0, 10); // UTC day for tests

  it("buckets decisions per day and fills empty days", () => {
    const decisions = [
      { created_at: "2026-08-01T09:00:00Z", outcome: "auto" },
      { created_at: "2026-08-01T10:00:00Z", outcome: "auto" },
      { created_at: "2026-08-01T11:00:00Z", outcome: "escalated" },
      { created_at: "2026-08-03T09:00:00Z", outcome: "escalated" },
    ];
    const rows = containmentByDay(decisions, ["2026-08-01", "2026-08-02", "2026-08-03"], key);
    expect(rows).toHaveLength(3);
    expect(rows[0]).toEqual({ date: "2026-08-01", auto: 2, escalated: 1, total: 3, pct: 67 });
    expect(rows[1]).toEqual({ date: "2026-08-02", auto: 0, escalated: 0, total: 0, pct: 0 });
    expect(rows[2]).toEqual({ date: "2026-08-03", auto: 0, escalated: 1, total: 1, pct: 0 });
  });

  it("ignores decisions outside the given dates", () => {
    const rows = containmentByDay(
      [{ created_at: "2026-07-30T00:00:00Z", outcome: "auto" }],
      ["2026-08-01"],
      key,
    );
    expect(rows[0].total).toBe(0);
  });

  it("shows the trend rising as auto share grows", () => {
    const decisions = [
      { created_at: "2026-08-01T00:00:00Z", outcome: "escalated" },
      { created_at: "2026-08-02T00:00:00Z", outcome: "auto" },
    ];
    const rows = containmentByDay(decisions, ["2026-08-01", "2026-08-02"], key);
    expect(rows[0].pct).toBe(0);
    expect(rows[1].pct).toBe(100);
  });
});
