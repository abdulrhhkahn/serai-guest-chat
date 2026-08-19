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
