import { createFileRoute } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useMemo, useState } from "react";
import { format, subDays, parseISO, eachDayOfInterval } from "date-fns";

export const Route = createFileRoute("/_authenticated/analytics")({
  component: AnalyticsPage,
});

type MsgRow = { id: string; sender: string; source: string | null; sender_user_id: string | null; created_at: string };

function AnalyticsPage() {
  const [from, setFrom] = useState(format(subDays(new Date(), 14), "yyyy-MM-dd"));
  const [to, setTo] = useState(format(new Date(), "yyyy-MM-dd"));

  const { data: rows } = useQuery({
    queryKey: ["analytics-messages", from, to],
    queryFn: async () => {
      const start = new Date(from + "T00:00:00").toISOString();
      const end = new Date(to + "T23:59:59").toISOString();
      const { data } = await supabase
        .from("messages")
        .select("id, sender, source, sender_user_id, created_at")
        .in("sender", ["ai", "staff"])
        .gte("created_at", start)
        .lte("created_at", end)
        .order("created_at");
      return (data ?? []) as MsgRow[];
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

  const days = useMemo(() => {
    const startDate = parseISO(from);
    const endDate = parseISO(to);
    if (endDate < startDate) return [];
    return eachDayOfInterval({ start: startDate, end: endDate });
  }, [from, to]);

  const byDay = useMemo(() => {
    const map = new Map<string, { ai: number; staff: number }>();
    for (const d of days) map.set(format(d, "yyyy-MM-dd"), { ai: 0, staff: 0 });
    for (const r of rows ?? []) {
      const key = format(parseISO(r.created_at), "yyyy-MM-dd");
      const bucket = map.get(key);
      if (!bucket) continue;
      if (r.sender === "ai") bucket.ai++; else if (r.sender === "staff") bucket.staff++;
    }
    return Array.from(map.entries()).map(([date, v]) => ({ date, ...v, total: v.ai + v.staff }));
  }, [rows, days]);

  const maxDay = Math.max(1, ...byDay.map((d) => d.total));

  const byAgent = useMemo(() => {
    const map = new Map<string, { manual: number; approved: number; edited: number; total: number }>();
    for (const r of rows ?? []) {
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
  }, [rows, staffName]);

  const totals = useMemo(() => {
    const ai = (rows ?? []).filter((r) => r.sender === "ai").length;
    const staff = (rows ?? []).filter((r) => r.sender === "staff").length;
    const total = ai + staff;
    return { ai, staff, total, aiPct: total ? Math.round((ai / total) * 100) : 0 };
  }, [rows]);

  function preset(days: number) {
    setFrom(format(subDays(new Date(), days - 1), "yyyy-MM-dd"));
    setTo(format(new Date(), "yyyy-MM-dd"));
  }

  return (
    <div className="p-6 space-y-6 max-w-6xl">
      <div className="flex flex-wrap items-end gap-3">
        <div>
          <h1 className="font-serif text-3xl">Analytics</h1>
          <p className="text-sm text-muted-foreground">AI vs staff replies over time and per agent.</p>
        </div>
        <div className="ml-auto flex flex-wrap items-end gap-2">
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
