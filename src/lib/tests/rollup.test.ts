import { describe, it, expect } from "vitest";
import { propertyRollup } from "../rollup";

describe("propertyRollup", () => {
  const input = {
    properties: [{ id: "p1", name: "Cedar" }, { id: "p2", name: "Birch" }],
    decisions: [
      { property_id: "p1", outcome: "auto" },
      { property_id: "p1", outcome: "auto" },
      { property_id: "p1", outcome: "escalated" },
      { property_id: "p2", outcome: "escalated" },
    ],
    csat: [
      { property_id: "p1", csat_rating: 5 },
      { property_id: "p1", csat_rating: 4 },
      { property_id: "p2", csat_rating: null },
    ],
    failuresByProperty: new Map([["p2", 3]]),
  };

  it("computes per-property metrics", () => {
    const rows = propertyRollup(input);
    const cedar = rows.find((r) => r.id === "p1")!;
    expect(cedar).toMatchObject({ questions: 3, containmentPct: 67, csatAvg: 4.5, csatCount: 2, failures: 0 });
    const birch = rows.find((r) => r.id === "p2")!;
    expect(birch).toMatchObject({ questions: 1, containmentPct: 0, csatCount: 0, failures: 3 });
  });

  it("sorts by question volume", () => {
    expect(propertyRollup(input)[0].id).toBe("p1");
  });

  it("handles a property with no data", () => {
    const rows = propertyRollup({ properties: [{ id: "x", name: "Empty" }], decisions: [], csat: [], failuresByProperty: new Map() });
    expect(rows[0]).toMatchObject({ questions: 0, containmentPct: 0, csatAvg: 0, csatCount: 0, failures: 0 });
  });
});
