import { createFileRoute } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Download } from "lucide-react";
import { useMemo, useState } from "react";
import { format, subDays, parseISO, eachDayOfInterval } from "date-fns";
import { containmentByTopic, overallContainment, channelVolume, containmentByDay } from "@/lib/analytics";
import { formatChange, graduationDateSet, type AuditEntry } from "@/lib/autonomy-audit";

export const Route = createFileRoute("/_authenticated/analytics")({
  component: AnalyticsPage,
});

type MsgRow = {
  id: string;
  conversation_id: string;
  sender: string;
  source: string | null;
  sender_user_id: string | null;
  created_at: string;
};

type ConvRow = {
  id: string;
  property_id: string;
  guest_name: string | null;
  needs_staff: boolean | null;
  resolved_at: string | null;
  channel: string | null;
};

type DecisionRow = {
  property_id: string;
  category: string | null;
  level: string;
  outcome: string;
  channel: string | null;
  created_at: string;
};

function fmtDuration(ms: number | null): string {
  if (ms === null || !isFinite(ms)) return "—";
  const mins = Math.round(ms / 60000);
  if (mins < 60) return `${mins}m`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  if (h < 24) return `${h}h ${m}m`;
  return `${Math.floor(h / 24)}d ${h % 24}h`;
}

function avg(list: number[]): number | null {
  if (!list.length) return null;
  return list.reduce((a, b) => a + b, 0) / list.length;
}

/** Minutes with one decimal, blank when there is no data. */
function mins(ms: number | null): string {
  if (ms === null || !isFinite(ms)) return "";
  return (ms / 60000).toFixed(1);
}

function csvCell(v: string | number): string {
  const s = String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function downloadCsv(filename: string, rows: (string | number)[][]) {
  const csv = rows.map((r) => r.map(csvCell).join(",")).join("\n");
  const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function AnalyticsPage() {
  const [from, setFrom] = useState(format(subDays(new Date(), 14), "yyyy-MM-dd"));
  const [to, setTo] = useState(format(new Date(), "yyyy-MM-dd"));
  const [propertyId, setPropertyId] = useState<string>("all");

  const range = useMemo(() => ({
    start: new Date(from + "T00:00:00").toISOString(),
    end: new Date(to + "T23:59:59").toISOString(),
  }), [from, to]);

  const { data: allRows } = useQuery({
    queryKey: ["analytics-messages", range.start, range.end],
    queryFn: async () => {
      const { data } = await supabase
        .from("messages")
        .select("id, conversation_id, sender, source, sender_user_id, created_at")
        .gte("created_at", range.start)
        .lte("created_at", range.end)
        .order("created_at");
      return (data ?? []) as MsgRow[];
    },
  });

  const { data: convs } = useQuery({
    queryKey: ["analytics-conversations"],
    queryFn: async () => {
      const { data } = await supabase
        .from("conversations")
        .select("id, property_id, guest_name, needs_staff, resolved_at, channel");
      return (data ?? []) as ConvRow[];
    },
  });

  const { data: decisions } = useQuery({
    queryKey: ["analytics-decisions", range.start, range.end],
    queryFn: async () => {
      const { data } = await supabase
        .from("ai_decisions")
        .select("property_id, category, level, outcome, channel, created_at")
        .gte("created_at", range.start)
        .lte("created_at", range.end);
      return (data ?? []) as DecisionRow[];
    },
  });

  const { data: autonomyRules } = useQuery({
    queryKey: ["analytics-autonomy"],
    queryFn: async () => {
      const { data } = await supabase.from("category_autonomy").select("property_id, category, level");
      return data ?? [];
    },
  });

  const { data: autonomyAudit } = useQuery({
    queryKey: ["analytics-autonomy-audit", range.start, range.end],
    queryFn: async () => {
      const { data } = await supabase
        .from("autonomy_audit")
        .select("property_id, category, old_level, new_level, changed_by, created_at")
        .gte("created_at", range.start)
        .lte("created_at", range.end)
        .order("created_at", { ascending: false });
      return (data ?? []) as (AuditEntry & { property_id: string; changed_by: string | null })[];
    },
  });

  const { data: properties } = useQuery({
    queryKey: ["analytics-properties"],
    queryFn: async () => {
      const { data } = await supabase.from("properties").select("id, name").order("name");
      return data ?? [];
    },
  });

  const { data: staff } = useQuery({
    queryKey: ["staff-profiles-all"],
    queryFn: async () => {
      const { data } = await supabase.from("staff_profiles").select("id, full_name");
      return data ?? [];
    },
  });

  const staffName = useMemo(() => {
    const m = new Map<string, string>();
    for (const s of staff ?? []) m.set(s.id, s.full_name || "Staff");
    return m;
  }, [staff]);

  const convById = useMemo(() => {
    const m = new Map<string, ConvRow>();
    for (const c of convs ?? []) m.set(c.id, c);
    return m;
  }, [convs]);

  // property options limited to properties that actually have conversation data visible
  const propertyOptions = useMemo(() => {
    const ids = new Set((convs ?? []).map((c) => c.property_id));
    return (properties ?? []).filter((p) => ids.has(p.id));
  }, [properties, convs]);

  const rows = useMemo(() => {
    const list = (allRows ?? []).filter((r) => {
      if (propertyId === "all") return true;
      return convById.get(r.conversation_id)?.property_id === propertyId;
    });
    return list;
  }, [allRows, propertyId, convById]);

  const replyRows = useMemo(() => rows.filter((r) => r.sender === "ai" || r.sender === "staff"), [rows]);

  const days = useMemo(() => {
    const startDate = parseISO(from);
    const endDate = parseISO(to);
    if (endDate < startDate) return [];
    return eachDayOfInterval({ start: startDate, end: endDate });
  }, [from, to]);

  const byDay = useMemo(() => {
    const map = new Map<string, { ai: number; staff: number }>();
    for (const d of days) map.set(format(d, "yyyy-MM-dd"), { ai: 0, staff: 0 });
    for (const r of replyRows) {
      const key = format(parseISO(r.created_at), "yyyy-MM-dd");
      const bucket = map.get(key);
      if (!bucket) continue;
      if (r.sender === "ai") bucket.ai++; else if (r.sender === "staff") bucket.staff++;
    }
    return Array.from(map.entries()).map(([date, v]) => ({ date, ...v, total: v.ai + v.staff }));
  }, [replyRows, days]);

  const maxDay = Math.max(1, ...byDay.map((d) => d.total));

  const byAgent = useMemo(() => {
    const map = new Map<string, { manual: number; approved: number; edited: number; total: number }>();
    for (const r of replyRows) {
      if (r.sender !== "staff") continue;
      const key = r.sender_user_id ?? "unknown";
      const b = map.get(key) ?? { manual: 0, approved: 0, edited: 0, total: 0 };
      if (r.source === "ai_draft_approved") b.approved++;
      else if (r.source === "ai_draft_edited") b.edited++;
      else b.manual++;
      b.total++;
      map.set(key, b);
    }
    return Array.from(map.entries())
      .map(([uid, v]) => ({ uid, name: uid === "unknown" ? "Unknown" : (staffName.get(uid) ?? "Staff"), ...v }))
      .sort((a, b) => b.total - a.total);
  }, [replyRows, staffName]);

  const totals = useMemo(() => {
    const ai = replyRows.filter((r) => r.sender === "ai").length;
    const staffCount = replyRows.filter((r) => r.sender === "staff").length;
    const total = ai + staffCount;
    return { ai, staff: staffCount, total, aiPct: total ? Math.round((ai / total) * 100) : 0 };
  }, [replyRows]);

  // AI containment (from the durable decision log), filtered by property.
  const decisionRows = useMemo(
    () => (decisions ?? []).filter((d) => propertyId === "all" || d.property_id === propertyId),
    [decisions, propertyId],
  );
  const topicStats = useMemo(() => containmentByTopic(decisionRows), [decisionRows]);
  const containment = useMemo(() => overallContainment(decisionRows), [decisionRows]);

  // Containment trend over the selected range (uses the same `days` axis as the
  // Replies-by-day chart). date-fns parseISO/format give local-day buckets.
  const containmentTrend = useMemo(() => {
    const dateStrs = days.map((d) => format(d, "yyyy-MM-dd"));
    return containmentByDay(
      decisionRows.map((d) => ({ created_at: d.created_at, outcome: d.outcome })),
      dateStrs,
      (iso) => format(parseISO(iso), "yyyy-MM-dd"),
    );
  }, [decisionRows, days]);
  const trendHasData = useMemo(() => containmentTrend.some((d) => d.total > 0), [containmentTrend]);

  // Autonomy config-change audit (property-filtered) + graduation markers.
  const auditRows = useMemo(
    () => (autonomyAudit ?? []).filter((a) => propertyId === "all" || a.property_id === propertyId),
    [autonomyAudit, propertyId],
  );
  const graduationDays = useMemo(
    () => graduationDateSet(auditRows, (iso) => format(parseISO(iso), "yyyy-MM-dd")),
    [auditRows],
  );

  // Channel mix, filtered by property.
  const channelRows = useMemo(() => {
    const convChannels = new Map<string, string>();
    for (const c of convs ?? []) {
      if (propertyId !== "all" && c.property_id !== propertyId) continue;
      convChannels.set(c.id, c.channel || "web");
    }
    return channelVolume(convChannels, rows.map((r) => ({ conversation_id: r.conversation_id, sender: r.sender })));
  }, [convs, rows, propertyId]);

  // Trust configuration snapshot: how many topics sit at each autonomy level.
  const trustConfig = useMemo(() => {
    const filtered = (autonomyRules ?? []).filter((r) => propertyId === "all" || r.property_id === propertyId);
    const counts = { suggest: 0, approve: 0, auto: 0 } as Record<string, number>;
    for (const r of filtered) if (counts[r.level] !== undefined) counts[r.level]++;
    return { counts, total: filtered.length };
  }, [autonomyRules, propertyId]);

  /**
   * Wait-time metrics for the "Needs attention" queue.
   * For each guest message we measure the gap to the next reply of any kind
   * (guest wait time) and to the next staff reply (time-to-staff-response).
   * Threads flagged for staff (needs_staff) are reported separately, since those
   * are exactly the ones that land in the Needs attention queue.
   */
  const waitMetrics = useMemo(() => {
    const byConv = new Map<string, MsgRow[]>();
    for (const r of rows) {
      const list = byConv.get(r.conversation_id) ?? [];
      list.push(r);
      byConv.set(r.conversation_id, list);
    }

    const anyWaits: number[] = [];
    const staffWaits: number[] = [];
    const attentionWaits: number[] = [];
    const attentionStaffWaits: number[] = [];
    const openWaits: { conv: ConvRow | undefined; id: string; ms: number; flagged: boolean }[] = [];
    const perProperty = new Map<string, { anyWait: number[]; staffWait: number[]; flaggedWait: number[]; threads: Set<string> }>();

    for (const [convId, list] of byConv) {
      const conv = convById.get(convId);
      const flagged = !!conv?.needs_staff;
      const sorted = [...list].sort((a, b) => a.created_at.localeCompare(b.created_at));
      const pKey = conv?.property_id ?? "unknown";
      const pBucket = perProperty.get(pKey) ?? { anyWait: [], staffWait: [], flaggedWait: [], threads: new Set<string>() };
      pBucket.threads.add(convId);

      for (let i = 0; i < sorted.length; i++) {
        const m = sorted[i];
        if (m.sender !== "guest") continue;
        const asked = new Date(m.created_at).getTime();
        const nextAny = sorted.slice(i + 1).find((x) => x.sender !== "guest");
        const nextStaff = sorted.slice(i + 1).find((x) => x.sender === "staff");
        if (nextAny) {
          const d = new Date(nextAny.created_at).getTime() - asked;
          anyWaits.push(d);
          pBucket.anyWait.push(d);
          if (flagged) { attentionWaits.push(d); pBucket.flaggedWait.push(d); }
        } else if (i === sorted.length - 1 && !conv?.resolved_at) {
          // still waiting right now
          openWaits.push({ conv, id: convId, ms: Date.now() - asked, flagged });
        }
        if (nextStaff) {
          const d = new Date(nextStaff.created_at).getTime() - asked;
          staffWaits.push(d);
          pBucket.staffWait.push(d);
          if (flagged) attentionStaffWaits.push(d);
        }
      }
      perProperty.set(pKey, pBucket);
    }

    return {
      avgAny: avg(anyWaits),
      avgStaff: avg(staffWaits),
      avgAttention: avg(attentionWaits),
      avgAttentionStaff: avg(attentionStaffWaits),
      answered: anyWaits.length,
      staffAnswered: staffWaits.length,
      openWaits: openWaits.sort((a, b) => b.ms - a.ms).slice(0, 8),
      perProperty: Array.from(perProperty.entries()).map(([pid, v]) => ({
        propertyId: pid,
        name: (properties ?? []).find((p) => p.id === pid)?.name ?? "Unknown property",
        threads: v.threads.size,
        avgAny: avg(v.anyWait),
        avgStaff: avg(v.staffWait),
        avgFlagged: avg(v.flaggedWait),
      })).sort((a, b) => (b.threads - a.threads)),
    };
  }, [rows, convById, properties]);

  function preset(days: number) {
    setFrom(format(subDays(new Date(), days - 1), "yyyy-MM-dd"));
    setTo(format(new Date(), "yyyy-MM-dd"));
  }

  /** Wait-time report by property for the selected range, in minutes. */
  function exportCsv() {
    const rows: (string | number)[][] = [
      ["Property", "Date from", "Date to", "Threads", "Avg guest wait (min)", "Avg time to staff response (min)", "Flagged avg wait (min)"],
      ...waitMetrics.perProperty.map((p) => [
        p.name, from, to, p.threads, mins(p.avgAny), mins(p.avgStaff), mins(p.avgFlagged),
      ]),
      [
        propertyId === "all" ? "All properties (overall)" : "Selected property (overall)",
        from, to, waitMetrics.perProperty.reduce((a, p) => a + p.threads, 0),
        mins(waitMetrics.avgAny), mins(waitMetrics.avgStaff), mins(waitMetrics.avgAttention),
      ],
    ];
    downloadCsv(`serai-wait-times-${from}_${to}.csv`, rows);
  }

  return (
    <div className="p-6 space-y-6 max-w-6xl">
      <div className="flex flex-wrap items-end gap-3">
        <div>
          <h1 className="font-serif text-3xl">Analytics</h1>
          <p className="text-sm text-muted-foreground">Reply mix, wait times and response speed for the Needs attention queue.</p>
        </div>
        <div className="ml-auto flex flex-wrap items-end gap-2">
          <div>
            <Label htmlFor="property" className="text-xs">Property</Label>
            <select
              id="property"
              value={propertyId}
              onChange={(e) => setPropertyId(e.target.value)}
              className="h-9 rounded-md border border-input bg-background px-2 text-sm block"
            >
              <option value="all">All properties</option>
              {propertyOptions.map((p) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
          </div>
          <div>
            <Label htmlFor="from" className="text-xs">From</Label>
            <Input id="from" type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="h-9" />
          </div>
          <div>
            <Label htmlFor="to" className="text-xs">To</Label>
            <Input id="to" type="date" value={to} onChange={(e) => setTo(e.target.value)} className="h-9" />
          </div>
          <div className="flex gap-1">
            <button onClick={() => preset(7)} className="text-xs px-2 py-1 rounded border border-border hover:bg-accent">7d</button>
            <button onClick={() => preset(14)} className="text-xs px-2 py-1 rounded border border-border hover:bg-accent">14d</button>
            <button onClick={() => preset(30)} className="text-xs px-2 py-1 rounded border border-border hover:bg-accent">30d</button>
          </div>
          <Button variant="outline" size="sm" className="h-9" onClick={exportCsv} disabled={!waitMetrics.perProperty.length}>
            <Download className="h-3.5 w-3.5 mr-1.5" /> Export CSV
          </Button>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <Card><CardContent className="pt-6">
          <div className="text-xs text-muted-foreground">Total replies</div>
          <div className="text-3xl font-serif mt-1">{totals.total}</div>
        </CardContent></Card>
        <Card><CardContent className="pt-6">
          <div className="text-xs text-muted-foreground">AI-answered</div>
          <div className="text-3xl font-serif mt-1">{totals.ai} <span className="text-base text-muted-foreground">· {totals.aiPct}%</span></div>
        </CardContent></Card>
        <Card><CardContent className="pt-6">
          <div className="text-xs text-muted-foreground">Staff replies</div>
          <div className="text-3xl font-serif mt-1">{totals.staff}</div>
        </CardContent></Card>
      </div>

      <div className="grid gap-4 sm:grid-cols-4">
        <Card><CardContent className="pt-6">
          <div className="text-xs text-muted-foreground">Avg guest wait (any reply)</div>
          <div className="text-2xl font-serif mt-1">{fmtDuration(waitMetrics.avgAny)}</div>
          <div className="text-[11px] text-muted-foreground mt-1">{waitMetrics.answered} answered questions</div>
        </CardContent></Card>
        <Card><CardContent className="pt-6">
          <div className="text-xs text-muted-foreground">Avg time to staff response</div>
          <div className="text-2xl font-serif mt-1">{fmtDuration(waitMetrics.avgStaff)}</div>
          <div className="text-[11px] text-muted-foreground mt-1">{waitMetrics.staffAnswered} staff-answered</div>
        </CardContent></Card>
        <Card><CardContent className="pt-6">
          <div className="text-xs text-muted-foreground">Needs attention · avg wait</div>
          <div className="text-2xl font-serif mt-1">{fmtDuration(waitMetrics.avgAttention)}</div>
          <div className="text-[11px] text-muted-foreground mt-1">flagged threads only</div>
        </CardContent></Card>
        <Card><CardContent className="pt-6">
          <div className="text-xs text-muted-foreground">Needs attention · to staff</div>
          <div className="text-2xl font-serif mt-1">{fmtDuration(waitMetrics.avgAttentionStaff)}</div>
          <div className="text-[11px] text-muted-foreground mt-1">flagged threads only</div>
        </CardContent></Card>
      </div>

      <Card>
        <CardHeader><CardTitle className="text-base">Wait times by property</CardTitle></CardHeader>
        <CardContent>
          {waitMetrics.perProperty.length === 0 ? (
            <p className="text-sm text-muted-foreground py-6 text-center">No guest messages in this range.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs text-muted-foreground border-b border-border">
                    <th className="py-2">Property</th>
                    <th className="py-2 text-right">Threads</th>
                    <th className="py-2 text-right">Avg guest wait</th>
                    <th className="py-2 text-right">Avg to staff</th>
                    <th className="py-2 text-right">Flagged avg wait</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {waitMetrics.perProperty.map((p) => (
                    <tr key={p.propertyId}>
                      <td className="py-2 font-medium">{p.name}</td>
                      <td className="py-2 text-right">{p.threads}</td>
                      <td className="py-2 text-right">{fmtDuration(p.avgAny)}</td>
                      <td className="py-2 text-right">{fmtDuration(p.avgStaff)}</td>
                      <td className="py-2 text-right">{fmtDuration(p.avgFlagged)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">Currently waiting longest</CardTitle></CardHeader>
        <CardContent>
          {waitMetrics.openWaits.length === 0 ? (
            <p className="text-sm text-muted-foreground py-6 text-center">Nothing is waiting on a reply right now.</p>
          ) : (
            <ul className="divide-y divide-border text-sm">
              {waitMetrics.openWaits.map((w) => (
                <li key={w.id} className="py-2 flex items-center justify-between gap-3">
                  <span className="truncate">
                    {w.conv?.guest_name || "Guest"}
                    {w.flagged && <span className="ml-2 text-[10px] uppercase tracking-wide bg-amber-100 text-amber-900 rounded-full px-1.5 py-0.5">Needs staff</span>}
                  </span>
                  <span className="font-mono text-xs text-amber-700">{fmtDuration(w.ms)}</span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader><CardTitle className="text-base">AI containment by topic</CardTitle></CardHeader>
          <CardContent>
            <div className="mb-4 flex items-baseline gap-2">
              <span className="text-3xl font-semibold">{containment}%</span>
              <span className="text-sm text-muted-foreground">handled by AI without staff ({decisionRows.length} question{decisionRows.length === 1 ? "" : "s"})</span>
            </div>
            {topicStats.length === 0 ? (
              <p className="text-sm text-muted-foreground py-4">No AI decisions in this range yet. Topics appear here once the concierge answers questions.</p>
            ) : (
              <table className="w-full text-sm">
                <thead className="text-left text-xs text-muted-foreground border-b border-border">
                  <tr><th className="py-2">Topic</th><th className="py-2 text-right">Questions</th><th className="py-2 text-right">Auto</th><th className="py-2 text-right">Containment</th></tr>
                </thead>
                <tbody>
                  {topicStats.map((t) => (
                    <tr key={t.category} className="border-b border-border/50">
                      <td className="py-2 capitalize">{t.category}</td>
                      <td className="py-2 text-right tabular-nums">{t.total}</td>
                      <td className="py-2 text-right tabular-nums">{t.auto}</td>
                      <td className="py-2 text-right tabular-nums">
                        <span className="inline-flex items-center gap-2">
                          <span className="inline-block h-1.5 w-16 rounded-full bg-muted overflow-hidden align-middle">
                            <span className="block h-full bg-primary" style={{ width: `${t.containmentPct}%` }} />
                          </span>
                          {t.containmentPct}%
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </CardContent>
        </Card>

        <div className="space-y-4">
          <Card>
            <CardHeader><CardTitle className="text-base">Channel mix</CardTitle></CardHeader>
            <CardContent>
              {channelRows.length === 0 ? (
                <p className="text-sm text-muted-foreground py-4">No messages in this range.</p>
              ) : (
                <table className="w-full text-sm">
                  <thead className="text-left text-xs text-muted-foreground border-b border-border">
                    <tr><th className="py-2">Channel</th><th className="py-2 text-right">Threads</th><th className="py-2 text-right">In</th><th className="py-2 text-right">Out</th></tr>
                  </thead>
                  <tbody>
                    {channelRows.map((c) => (
                      <tr key={c.channel} className="border-b border-border/50">
                        <td className="py-2 uppercase text-xs tracking-wide">{c.channel}</td>
                        <td className="py-2 text-right tabular-nums">{c.conversations}</td>
                        <td className="py-2 text-right tabular-nums">{c.inbound}</td>
                        <td className="py-2 text-right tabular-nums">{c.outbound}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
              <p className="text-[11px] text-muted-foreground mt-3">Outbound counts drive your Twilio cost — multiply by your per-message rate.</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle className="text-base">Trust configuration</CardTitle></CardHeader>
            <CardContent>
              {trustConfig.total === 0 ? (
                <p className="text-sm text-muted-foreground py-2">No per-topic autonomy rules set — all topics follow the property default. Configure them in Settings → AI autonomy.</p>
              ) : (
                <div className="flex gap-6">
                  <div><div className="text-2xl font-semibold">{trustConfig.counts.auto}</div><div className="text-xs text-muted-foreground">auto-send</div></div>
                  <div><div className="text-2xl font-semibold">{trustConfig.counts.approve}</div><div className="text-xs text-muted-foreground">staff approves</div></div>
                  <div><div className="text-2xl font-semibold">{trustConfig.counts.suggest}</div><div className="text-xs text-muted-foreground">suggest only</div></div>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      <Card>
        <CardHeader><CardTitle className="text-base">AI containment over time</CardTitle></CardHeader>
        <CardContent>
          {!trendHasData ? (
            <p className="text-sm text-muted-foreground py-6 text-center">No AI decisions in this range yet. As the concierge answers questions, this shows the share handled without staff — the line rising means the AI is graduating to auto.</p>
          ) : (() => {
            const W = 720, H = 180, padL = 28, padB = 22, padT = 8;
            const n = containmentTrend.length;
            const innerW = W - padL - 8;
            const innerH = H - padB - padT;
            const maxVol = Math.max(1, ...containmentTrend.map((d) => d.total));
            const x = (i: number) => padL + (n <= 1 ? innerW / 2 : (i * innerW) / (n - 1));
            const y = (pct: number) => padT + innerH - (pct / 100) * innerH;
            const barW = Math.max(2, (innerW / Math.max(n, 1)) * 0.5);
            // Only connect days that actually had questions — a quiet day is a
            // gap, not a crash to 0% containment.
            const active = containmentTrend.map((d, i) => ({ d, i })).filter((o) => o.d.total > 0);
            const linePts = active.map((o) => `${x(o.i)},${y(o.d.pct)}`).join(" ");
            return (
              <div>
                <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label="AI containment percentage per day">
                  {[0, 25, 50, 75, 100].map((g) => (
                    <g key={g}>
                      <line x1={padL} x2={W - 8} y1={y(g)} y2={y(g)} stroke="currentColor" className="text-border" strokeWidth={1} />
                      <text x={0} y={y(g) + 3} className="fill-muted-foreground" fontSize={9}>{g}</text>
                    </g>
                  ))}
                  {containmentTrend.map((d, i) => (
                    <rect key={d.date} x={x(i) - barW / 2} y={padT + innerH - (d.total / maxVol) * innerH}
                      width={barW} height={(d.total / maxVol) * innerH}
                      className="fill-muted" opacity={0.5} />
                  ))}
                  {containmentTrend.map((d, i) => graduationDays.has(d.date) ? (
                    <g key={`g-${d.date}`}>
                      <line x1={x(i)} x2={x(i)} y1={padT} y2={padT + innerH} stroke="currentColor" className="text-emerald-500" strokeWidth={1} strokeDasharray="3 3" opacity={0.7} />
                      <text x={x(i)} y={padT - 1} textAnchor="middle" fontSize={8} className="fill-emerald-600">→auto</text>
                    </g>
                  ) : null)}
                  <polyline points={linePts} fill="none" stroke="currentColor" className="text-primary" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
                  {containmentTrend.map((d, i) => d.total > 0 ? (
                    <circle key={d.date} cx={x(i)} cy={y(d.pct)} r={2.5} className="fill-primary" />
                  ) : null)}
                </svg>
                <div className="flex items-center justify-between text-[11px] text-muted-foreground mt-1 px-1">
                  <span>{containmentTrend[0]?.date}</span>
                  <span className="flex items-center gap-3">
                    <span className="inline-flex items-center gap-1"><span className="inline-block w-3 h-0.5 bg-primary align-middle" /> containment %</span>
                    <span className="inline-flex items-center gap-1"><span className="inline-block w-2 h-2 bg-muted align-middle" /> question volume</span>
                  </span>
                  <span>{containmentTrend[n - 1]?.date}</span>
                </div>
              </div>
            );
          })()}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">Autonomy changes</CardTitle></CardHeader>
        <CardContent>
          {auditRows.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4">No autonomy config changes in this range. Adjust levels in Settings → AI autonomy and they'll be logged here.</p>
          ) : (
            <ul className="divide-y divide-border text-sm">
              {auditRows.slice(0, 30).map((e, i) => {
                const grad = e.new_level === "auto" && e.old_level !== "auto";
                return (
                  <li key={i} className="py-2 flex items-center justify-between gap-3">
                    <span className="flex items-center gap-2">
                      {grad && <span className="inline-block w-1.5 h-1.5 rounded-full bg-emerald-500" />}
                      <span>{formatChange(e)}</span>
                    </span>
                    <span className="text-xs text-muted-foreground shrink-0">
                      {e.changed_by ? (staffName.get(e.changed_by) ?? "Staff") : "System"} · {format(parseISO(e.created_at), "MMM d")}
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">Replies by day</CardTitle></CardHeader>
        <CardContent>
          {byDay.length === 0 || totals.total === 0 ? (
            <p className="text-sm text-muted-foreground py-6 text-center">No replies in this range.</p>
          ) : (
            <div className="space-y-2">
              <div className="flex items-end gap-1 h-40">
                {byDay.map((d) => (
                  <div key={d.date} className="flex-1 flex flex-col justify-end gap-0.5 group relative">
                    <div className="bg-amber-400 rounded-t-sm" style={{ height: `${(d.staff / maxDay) * 100}%` }} />
                    <div className="bg-primary rounded-b-sm" style={{ height: `${(d.ai / maxDay) * 100}%` }} />
                    <div className="absolute -top-8 left-1/2 -translate-x-1/2 hidden group-hover:block bg-popover border border-border rounded px-1.5 py-0.5 text-[10px] whitespace-nowrap z-10">
                      {format(parseISO(d.date), "MMM d")} · AI {d.ai} / staff {d.staff}
                    </div>
                  </div>
                ))}
              </div>
              <div className="flex justify-between text-[10px] text-muted-foreground">
                <span>{format(parseISO(byDay[0].date), "MMM d")}</span>
                <span>{format(parseISO(byDay[byDay.length - 1].date), "MMM d")}</span>
              </div>
              <div className="flex gap-4 text-xs pt-2">
                <span className="flex items-center gap-1.5"><span className="h-2 w-3 rounded bg-primary" /> AI</span>
                <span className="flex items-center gap-1.5"><span className="h-2 w-3 rounded bg-amber-400" /> Staff</span>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">Staff replies by agent</CardTitle></CardHeader>
        <CardContent>
          {byAgent.length === 0 ? (
            <p className="text-sm text-muted-foreground py-6 text-center">No staff replies in this range.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs text-muted-foreground border-b border-border">
                    <th className="py-2">Agent</th>
                    <th className="py-2 text-right">Manual</th>
                    <th className="py-2 text-right">AI-approved</th>
                    <th className="py-2 text-right">AI-edited</th>
                    <th className="py-2 text-right">Total</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {byAgent.map((a) => (
                    <tr key={a.uid}>
                      <td className="py-2 font-medium">{a.name}</td>
                      <td className="py-2 text-right">{a.manual}</td>
                      <td className="py-2 text-right">{a.approved}</td>
                      <td className="py-2 text-right">{a.edited}</td>
                      <td className="py-2 text-right font-medium">{a.total}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
