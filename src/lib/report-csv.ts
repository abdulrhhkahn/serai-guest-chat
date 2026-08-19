// Pure helper: build the rows for an analytics-summary CSV export.

export type SummaryCsvInput = {
  rangeLabel: string;
  containmentPct: number;
  totalQuestions: number;
  csatAvg: number;
  csatCount: number;
  topics: { category: string; total: number; containmentPct: number }[];
  channels: { channel: string; inbound: number; outbound: number }[];
};

/** Returns a 2-D array of cells suitable for the existing downloadCsv(). */
export function summaryCsvRows(s: SummaryCsvInput): (string | number)[][] {
  const rows: (string | number)[][] = [
    ["Serai analytics summary", s.rangeLabel],
    [],
    ["Metric", "Value"],
    ["AI containment %", s.containmentPct],
    ["Questions handled", s.totalQuestions],
    ["Guest satisfaction (avg)", s.csatCount ? s.csatAvg : "n/a"],
    ["Ratings", s.csatCount],
    [],
    ["Topic", "Questions", "Containment %"],
    ...s.topics.map((t) => [t.category, t.total, t.containmentPct]),
    [],
    ["Channel", "Inbound", "Outbound"],
    ...s.channels.map((c) => [c.channel, c.inbound, c.outbound]),
  ];
  return rows;
}
