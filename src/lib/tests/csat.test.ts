import { describe, it, expect } from "vitest";
import { csatSummary } from "../csat";

describe("csatSummary", () => {
  it("is empty for no ratings", () => {
    expect(csatSummary([])).toEqual({ count: 0, average: 0, distribution: [0, 0, 0, 0, 0], positivePct: 0 });
  });

  it("computes count, average, distribution and positive share", () => {
    const s = csatSummary([5, 5, 4, 3, 1]);
    expect(s.count).toBe(5);
    expect(s.average).toBe(3.6); // 18/5
    expect(s.distribution).toEqual([1, 0, 1, 1, 2]); // 1★×1, 3★×1, 4★×1, 5★×2
    expect(s.positivePct).toBe(60); // (1+2)/5
  });

  it("ignores nulls and out-of-range values", () => {
    const s = csatSummary([5, null, 0, 6, 4, undefined]);
    expect(s.count).toBe(2);
    expect(s.average).toBe(4.5);
  });

  it("rounds the average to one decimal", () => {
    expect(csatSummary([5, 4, 4]).average).toBe(4.3); // 13/3 = 4.333…
  });
});

import { parseCsatReply } from "../csat";

describe("parseCsatReply", () => {
  it("parses a bare 1-5", () => {
    expect(parseCsatReply("5")).toBe(5);
    expect(parseCsatReply(" 3 ")).toBe(3);
    expect(parseCsatReply("4 stars")).toBe(4);
  });
  it("rejects non-ratings", () => {
    expect(parseCsatReply("hello")).toBeNull();
    expect(parseCsatReply("6")).toBeNull();
    expect(parseCsatReply("0")).toBeNull();
    expect(parseCsatReply("5 please")).toBeNull();
    expect(parseCsatReply("")).toBeNull();
  });
});
