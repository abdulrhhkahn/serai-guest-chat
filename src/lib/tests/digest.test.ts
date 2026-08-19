import { describe, it, expect } from "vitest";
import { buildWeeklyDigest, renderDigestText, type DigestInput } from "../digest";

const input: DigestInput = {
  decisions: [
    { category: "Wifi", outcome: "auto" },
    { category: "Wifi", outcome: "auto" },
    { category: "Wifi", outcome: "escalated" },
    { category: "Billing", outcome: "escalated" },
  ],
  prevDecisions: [
    { outcome: "auto" },
    { outcome: "escalated" },
    { outcome: "escalated" },
    { outcome: "escalated" },
  ], // 25% last week
  csatRatings: [5, 4, 5],
  convChannels: new Map([["c1", "web"], ["c2", "sms"]]),
  messages: [
    { conversation_id: "c1", sender: "guest" },
    { conversation_id: "c1", sender: "ai" },
    { conversation_id: "c2", sender: "guest" },
  ],
  failedDeliveries: 2,
};

describe("buildWeeklyDigest", () => {
  const m = buildWeeklyDigest(input);

  it("computes containment and the week-over-week delta", () => {
    expect(m.containmentPct).toBe(50); // 2 auto / 4
    expect(m.containmentDelta).toBe(25); // 50 - 25
  });

  it("ranks top topics by volume", () => {
    expect(m.topTopics[0]).toMatchObject({ category: "Wifi", total: 3 });
    expect(m.topTopics.length).toBeLessThanOrEqual(3);
  });

  it("summarises CSAT and carries failures", () => {
    expect(m.csatAvg).toBeCloseTo(4.7, 1);
    expect(m.csatCount).toBe(3);
    expect(m.failedDeliveries).toBe(2);
  });

  it("includes channel splits", () => {
    const sms = m.channels.find((c) => c.channel === "sms")!;
    expect(sms).toEqual({ channel: "sms", inbound: 1, outbound: 0 });
  });
});

describe("renderDigestText", () => {
  it("renders the key numbers", () => {
    const txt = renderDigestText(buildWeeklyDigest(input), "The Cedar Inn", "Aug 1–7");
    expect(txt).toContain("The Cedar Inn");
    expect(txt).toContain("AI containment: 50% (+25 pts");
    expect(txt).toContain("Guest satisfaction: 4.7/5");
    expect(txt).toContain("Wifi: 3 questions, 67% auto");
  });

  it("handles an empty week gracefully", () => {
    const empty = buildWeeklyDigest({ decisions: [], prevDecisions: [], csatRatings: [], convChannels: new Map(), messages: [], failedDeliveries: 0 });
    const txt = renderDigestText(empty, "Inn", "range");
    expect(txt).toContain("no ratings yet");
    expect(txt).toContain("(no questions this week)");
  });
});
