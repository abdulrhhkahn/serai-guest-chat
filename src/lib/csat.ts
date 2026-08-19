// Pure helper (no imports): summarise guest CSAT ratings for analytics.

export type CsatSummary = {
  count: number;
  average: number;          // 1 decimal, 0 when no ratings
  distribution: number[];   // index 0 = 1★ … index 4 = 5★
  positivePct: number;      // share of 4–5★ (0–100)
};

/** Summarise a set of ratings (values outside 1–5 or null are ignored). */
export function csatSummary(ratings: (number | null | undefined)[]): CsatSummary {
  const valid = ratings.filter((r): r is number => typeof r === "number" && r >= 1 && r <= 5);
  const distribution = [0, 0, 0, 0, 0];
  let sum = 0;
  for (const r of valid) {
    distribution[r - 1]++;
    sum += r;
  }
  const count = valid.length;
  const positive = distribution[3] + distribution[4]; // 4★ + 5★
  return {
    count,
    average: count ? Math.round((sum / count) * 10) / 10 : 0,
    distribution,
    positivePct: count ? Math.round((positive / count) * 100) : 0,
  };
}

/**
 * Interpret an inbound SMS/WhatsApp body as a CSAT reply: a bare 1–5.
 * Returns the number, or null if it isn't a rating (so it's treated as a normal
 * question instead). Tolerates surrounding whitespace and a trailing "star(s)".
 */
export function parseCsatReply(body: string): number | null {
  const m = (body ?? "").trim().match(/^([1-5])(?:\s*stars?)?$/i);
  return m ? Number(m[1]) : null;
}
