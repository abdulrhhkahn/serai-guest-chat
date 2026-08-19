import { createFileRoute } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { CalendarDays, ClipboardList, MessageSquare, Users, Sparkles, AlertTriangle, CheckCircle2, Circle } from "lucide-react";
import { format } from "date-fns";
import { Link } from "@tanstack/react-router";
import { deliveryAlerts } from "@/lib/delivery-alerts";
import { buildOnboarding } from "@/lib/onboarding";

export const Route = createFileRoute("/_authenticated/dashboard")({
  component: Dashboard,
});

function Dashboard() {
  const today = format(new Date(), "yyyy-MM-dd");

  const { data: stats } = useQuery({
    queryKey: ["dashboard-stats", today],
    queryFn: async () => {
      const [arrivals, pending, open] = await Promise.all([
        supabase.from("checkins").select("id", { count: "exact", head: true }).eq("arrival_date", today),
        supabase.from("checkins").select("id", { count: "exact", head: true }).eq("status", "pending"),
        supabase.from("conversations").select("id", { count: "exact", head: true }).eq("status", "open"),
      ]);
      return {
        arrivals: arrivals.count ?? 0,
        pending: pending.count ?? 0,
        open: open.count ?? 0,
      };
    },
  });

  const { data: replyStats } = useQuery({
    queryKey: ["reply-stats"],
    queryFn: async () => {
      const since = new Date(Date.now() - 1000 * 60 * 60 * 24 * 30).toISOString();
      const { data } = await supabase
        .from("messages")
        .select("sender, created_at")
        .in("sender", ["ai", "staff"])
        .gte("created_at", since);
      const rows = data ?? [];
      const ai = rows.filter((r) => r.sender === "ai").length;
      const staff = rows.filter((r) => r.sender === "staff").length;
      const total = ai + staff;
      return {
        ai,
        staff,
        total,
        aiPct: total ? Math.round((ai / total) * 100) : 0,
        staffPct: total ? Math.round((staff / total) * 100) : 0,
      };
    },
  });

  const { data: deliveryRows } = useQuery({
    queryKey: ["dashboard-delivery"],
    refetchInterval: 60_000,
    queryFn: async () => {
      const since = new Date(Date.now() - 24 * 3_600_000).toISOString();
      const { data } = await supabase
        .from("messages")
        .select("conversation_id, delivery_status, created_at")
        .not("delivery_status", "is", null)
        .gte("created_at", since);
      return data ?? [];
    },
  });

  const alerts = deliveryAlerts(deliveryRows ?? []);

  const { data: onboarding } = useQuery({
    queryKey: ["onboarding-state"],
    queryFn: async () => {
      const { data: auth } = await supabase.auth.getUser();
      const uid = auth.user?.id;
      if (!uid) return null;
      const { data: profile } = await supabase.from("staff_profiles").select("property_id").eq("id", uid).maybeSingle();
      const pid = profile?.property_id;
      if (!pid) return null;
      const [prop, faqs, cats, nums, checkins, audit] = await Promise.all([
        supabase.from("properties").select("name, checkin_time, checkout_time, wifi_ssid, address, slug").eq("id", pid).maybeSingle(),
        supabase.from("faqs").select("id", { count: "exact", head: true }).eq("property_id", pid),
        supabase.from("category_autonomy").select("id", { count: "exact", head: true }).eq("property_id", pid),
        supabase.from("messaging_numbers").select("id", { count: "exact", head: true }).eq("property_id", pid),
        supabase.from("checkins").select("id", { count: "exact", head: true }).eq("property_id", pid),
        supabase.from("autonomy_audit").select("id", { count: "exact", head: true }).eq("property_id", pid),
      ]);
      const p = prop.data;
      return {
        slug: p?.slug ?? null,
        state: {
          detailsComplete: !!(p?.name && p?.checkin_time && p?.checkout_time && (p?.wifi_ssid || p?.address)),
          faqCount: faqs.count ?? 0,
          autonomyTouched: (cats.count ?? 0) > 0 || (audit.count ?? 0) > 0,
          messagingCount: nums.count ?? 0,
          checkinCount: checkins.count ?? 0,
        },
      };
    },
  });

  const checklist = onboarding ? buildOnboarding(onboarding.state) : null;

  const { data: todaysGuests } = useQuery({
    queryKey: ["todays-guests", today],
    queryFn: async () => {
      const { data } = await supabase
        .from("checkins")
        .select("*")
        .eq("arrival_date", today)
        .order("created_at", { ascending: false });
      return data ?? [];
    },
  });

  return (
    <div className="p-6 space-y-6 max-w-6xl">
      <div>
        <h1 className="font-serif text-3xl">Good day.</h1>
        <p className="text-sm text-muted-foreground">Here's what's happening today.</p>
      </div>

      {alerts.length > 0 && (
        <div className="space-y-2">
          {alerts.map((a, i) => (
            <div
              key={i}
              className={`flex items-start gap-3 rounded-lg border p-3 ${
                a.severity === "critical"
                  ? "border-red-300 bg-red-50 text-red-900"
                  : "border-amber-300 bg-amber-50 text-amber-900"
              }`}
            >
              <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
              <div className="flex-1 text-sm">
                <div className="font-medium">{a.title}</div>
                <div className="opacity-80">{a.detail}</div>
              </div>
              <Link to="/inbox" className="text-sm font-medium underline hover:no-underline shrink-0">
                Open inbox
              </Link>
            </div>
          ))}
        </div>
      )}

      {checklist && !checklist.allRequiredDone && (
        <Card className="border-primary/30">
          <CardHeader>
            <CardTitle className="flex items-center justify-between text-base">
              <span>Finish setting up your property</span>
              <span className="text-sm font-normal text-muted-foreground">{checklist.requiredDone}/{checklist.requiredTotal} done</span>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="space-y-2">
              {checklist.steps.map((step) => (
                <li key={step.key} className="flex items-start gap-3">
                  {step.done
                    ? <CheckCircle2 className="h-4 w-4 mt-0.5 text-emerald-600 shrink-0" />
                    : <Circle className="h-4 w-4 mt-0.5 text-muted-foreground shrink-0" />}
                  <div className="flex-1">
                    <div className={`text-sm ${step.done ? "text-muted-foreground line-through" : "font-medium"}`}>
                      {step.label}
                      {step.optional && !step.done && <span className="ml-1 text-xs font-normal text-muted-foreground">· optional</span>}
                    </div>
                    {!step.done && <div className="text-xs text-muted-foreground">{step.hint}</div>}
                  </div>
                  {!step.done && (
                    step.key === "share" && onboarding?.slug
                      ? <Link to="/checkin/$slug" params={{ slug: onboarding.slug }} className="text-sm font-medium text-primary underline hover:no-underline shrink-0">View</Link>
                      : <Link to={step.to as "/settings" | "/knowledge"} className="text-sm font-medium text-primary underline hover:no-underline shrink-0">Set up</Link>
                  )}
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Kpi label="Today's arrivals" value={stats?.arrivals ?? 0} icon={<CalendarDays className="h-4 w-4" />} />
        <Kpi label="Pending check-ins" value={stats?.pending ?? 0} icon={<ClipboardList className="h-4 w-4" />} />
        <Kpi label="Open conversations" value={stats?.open ?? 0} icon={<MessageSquare className="h-4 w-4" />} />
        <Kpi label="Guests expected" value={todaysGuests?.reduce((s, g) => s + (g.num_guests ?? 1), 0) ?? 0} icon={<Users className="h-4 w-4" />} />
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Sparkles className="h-4 w-4 text-primary" /> Reply mix · last 30 days
          </CardTitle>
        </CardHeader>
        <CardContent>
          {!replyStats?.total ? (
            <p className="text-sm text-muted-foreground py-4">No guest replies yet.</p>
          ) : (
            <div className="space-y-3">
              <div className="flex items-baseline justify-between">
                <div>
                  <div className="text-3xl font-serif">{replyStats.aiPct}%</div>
                  <div className="text-xs text-muted-foreground">answered by AI</div>
                </div>
                <div className="text-right">
                  <div className="text-3xl font-serif">{replyStats.staffPct}%</div>
                  <div className="text-xs text-muted-foreground">by staff</div>
                </div>
              </div>
              <div className="flex h-2 w-full overflow-hidden rounded-full bg-muted">
                <div className="bg-primary" style={{ width: `${replyStats.aiPct}%` }} />
                <div className="bg-amber-400" style={{ width: `${replyStats.staffPct}%` }} />
              </div>
              <div className="text-xs text-muted-foreground">
                {replyStats.ai} AI · {replyStats.staff} staff · {replyStats.total} total replies
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Today's arrivals</CardTitle></CardHeader>
        <CardContent>
          {!todaysGuests?.length ? (
            <p className="text-sm text-muted-foreground py-8 text-center">No arrivals expected today.</p>
          ) : (
            <div className="divide-y divide-border">
              {todaysGuests.map((g) => (
                <div key={g.id} className="py-3 flex items-center justify-between gap-4">
                  <div className="min-w-0">
                    <div className="font-medium truncate">{g.guest_name}</div>
                    <div className="text-xs text-muted-foreground truncate">
                      {g.booking_reference ? `Ref ${g.booking_reference} • ` : ""}
                      {g.num_guests ?? 1} guest{(g.num_guests ?? 1) > 1 ? "s" : ""}
                    </div>
                  </div>
                  <StatusBadge status={g.status} />
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function Kpi({ label, value, icon }: { label: string; value: number; icon: React.ReactNode }) {
  return (
    <Card>
      <CardContent className="pt-6">
        <div className="flex items-center justify-between">
          <span className="text-xs text-muted-foreground">{label}</span>
          <span className="text-muted-foreground">{icon}</span>
        </div>
        <div className="mt-2 text-3xl font-serif">{value}</div>
      </CardContent>
    </Card>
  );
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    pending: "bg-amber-100 text-amber-800",
    verified: "bg-blue-100 text-blue-800",
    completed: "bg-emerald-100 text-emerald-800",
  };
  return (
    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${map[status] ?? "bg-muted text-muted-foreground"}`}>
      {status}
    </span>
  );
}
