import { describe, it, expect } from "vitest";
import { summaryCsvRows } from "../report-csv";

describe("summaryCsvRows", () => {
  const rows = summaryCsvRows({
    rangeLabel: "Aug 1–7",
    containmentPct: 78,
    totalQuestions: 143,
    csatAvg: 4.6,
    csatCount: 27,
    topics: [{ category: "Wifi", total: 52, containmentPct: 92 }],
    channels: [{ channel: "web", inbound: 80, outbound: 120 }],
  });

  it("includes headline metrics", () => {
    expect(rows).toContainEqual(["AI containment %", 78]);
    expect(rows).toContainEqual(["Questions handled", 143]);
    expect(rows).toContainEqual(["Guest satisfaction (avg)", 4.6]);
  });

  it("includes topic and channel rows", () => {
    expect(rows).toContainEqual(["Wifi", 52, 92]);
    expect(rows).toContainEqual(["web", 80, 120]);
  });

  it("shows n/a satisfaction when there are no ratings", () => {
    const r = summaryCsvRows({ rangeLabel: "x", containmentPct: 0, totalQuestions: 0, csatAvg: 0, csatCount: 0, topics: [], channels: [] });
    expect(r).toContainEqual(["Guest satisfaction (avg)", "n/a"]);
  });
});
