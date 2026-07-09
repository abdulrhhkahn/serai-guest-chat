import { createFileRoute } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { CalendarDays, ClipboardList, MessageSquare, Users } from "lucide-react";
import { format } from "date-fns";

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

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Kpi label="Today's arrivals" value={stats?.arrivals ?? 0} icon={<CalendarDays className="h-4 w-4" />} />
        <Kpi label="Pending check-ins" value={stats?.pending ?? 0} icon={<ClipboardList className="h-4 w-4" />} />
        <Kpi label="Open conversations" value={stats?.open ?? 0} icon={<MessageSquare className="h-4 w-4" />} />
        <Kpi label="Guests expected" value={todaysGuests?.reduce((s, g) => s + (g.num_guests ?? 1), 0) ?? 0} icon={<Users className="h-4 w-4" />} />
      </div>

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
