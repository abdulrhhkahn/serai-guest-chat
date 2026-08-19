// Pure helper (no imports beyond types): per-property rollup for a group view.

export type RollupInput = {
  properties: { id: string; name: string }[];
  decisions: { property_id: string; outcome: string }[];
  csat: { property_id: string; csat_rating: number | null }[];
  failuresByProperty: Map<string, number>;
};

export type RollupRow = {
  id: string;
  name: string;
  questions: number;
  containmentPct: number;
  csatAvg: number;
  csatCount: number;
  failures: number;
};

/** One row per property, sorted by question volume desc. */
export function propertyRollup(input: RollupInput): RollupRow[] {
  const rows = input.properties.map((p) => {
    const decs = input.decisions.filter((d) => d.property_id === p.id);
    const auto = decs.filter((d) => d.outcome === "auto").length;
    const ratings = input.csat.filter((c) => c.property_id === p.id && typeof c.csat_rating === "number").map((c) => c.csat_rating as number);
    const csatAvg = ratings.length ? Math.round((ratings.reduce((s, r) => s + r, 0) / ratings.length) * 10) / 10 : 0;
    return {
      id: p.id,
      name: p.name,
      questions: decs.length,
      containmentPct: decs.length ? Math.round((auto / decs.length) * 100) : 0,
      csatAvg,
      csatCount: ratings.length,
      failures: input.failuresByProperty.get(p.id) ?? 0,
    };
  });
  return rows.sort((a, b) => b.questions - a.questions);
}
