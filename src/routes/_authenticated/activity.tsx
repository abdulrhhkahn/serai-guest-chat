import { createFileRoute } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { useQuery } from "@tanstack/react-query";
import { useState, useMemo } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { format } from "date-fns";

export const Route = createFileRoute("/_authenticated/activity")({
  component: ActivityPage,
});

type Entry = { id: string; email: string; actionType: string; detail: string | null; createdAt: string };

const RANGE_DAYS: Record<string, number> = { daily: 1, weekly: 7, monthly: 30, yearly: 365 };

const ACTION_LABEL: Record<string, string> = {
  message_sent: "Sent a guest reply",
  conversation_resolved: "Resolved a conversation",
  settings_updated: "Updated property settings",
};

function ActivityPage() {
  const [range, setRange] = useState<keyof typeof RANGE_DAYS>("daily");

  const { data: property } = useQuery({
    queryKey: ["current-property"],
    queryFn: async () => {
      const { data: auth } = await supabase.auth.getUser();
      const { data: prof } = await supabase.from("staff_profiles").select("property_id").eq("id", auth.user?.id ?? "").maybeSingle();
      if (!prof?.property_id) return null;
      const { data: p } = await supabase.from("properties").select("id").eq("id", prof.property_id).maybeSingle();
      return p;
    },
  });

  const since = useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() - RANGE_DAYS[range]);
    return d.toISOString();
  }, [range]);

  const { data: entries, isLoading, isError, error } = useQuery({
    queryKey: ["activity-log", property?.id, range],
    enabled: !!property?.id,
    queryFn: async (): Promise<Entry[]> => {
      const { data: s } = await supabase.auth.getSession();
      const res = await fetch("/api/admin/activity-log", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${s.session?.access_token ?? ""}` },
        body: JSON.stringify({ propertyId: property!.id, since }),
      });
      if (!res.ok) throw new Error(await res.text());
      const body = await res.json();
      return body.entries;
    },
  });

  const grouped = useMemo(() => {
    const map = new Map<string, Entry[]>();
    for (const e of entries ?? []) {
      const list = map.get(e.email) ?? [];
      list.push(e);
      map.set(e.email, list);
    }
    return [...map.entries()].sort((a, b) => b[1].length - a[1].length);
  }, [entries]);

  return (
    <div className="p-6 max-w-4xl space-y-4">
      <div>
        <h1 className="font-serif text-3xl">Staff activity</h1>
        <p className="text-sm text-muted-foreground">Tasks carried out by each staff member, grouped by email. History stays available to revisit anytime.</p>
      </div>

      <Tabs value={range} onValueChange={(v) => setRange(v as keyof typeof RANGE_DAYS)}>
        <TabsList>
          <TabsTrigger value="daily">Daily</TabsTrigger>
          <TabsTrigger value="weekly">Weekly</TabsTrigger>
          <TabsTrigger value="monthly">Monthly</TabsTrigger>
          <TabsTrigger value="yearly">Yearly</TabsTrigger>
        </TabsList>

        <TabsContent value={range} className="mt-4">
          {isLoading ? (
            <p className="text-sm text-muted-foreground">Loading…</p>
          ) : isError ? (
            <p className="text-sm text-destructive">Couldn't load activity: {String((error as Error)?.message ?? error)}</p>
          ) : grouped.length === 0 ? (
            <p className="text-sm text-muted-foreground">No activity recorded in this period.</p>
          ) : (
            <div className="space-y-4">
              {grouped.map(([email, list]) => (
                <div key={email} className="rounded-lg border border-border overflow-hidden">
                  <div className="flex items-center justify-between bg-muted/40 px-4 py-2.5">
                    <span className="text-sm font-medium">{email}</span>
                    <span className="text-xs text-muted-foreground">{list.length} action{list.length === 1 ? "" : "s"}</span>
                  </div>
                  <ul className="divide-y divide-border">
                    {list.map((e) => (
                      <li key={e.id} className="flex items-center justify-between px-4 py-2 text-sm">
                        <span>
                          {ACTION_LABEL[e.actionType] ?? e.actionType}
                          {e.detail && <span className="text-muted-foreground"> — {e.detail}</span>}
                        </span>
                        <span className="text-xs text-muted-foreground shrink-0 ml-3">{format(new Date(e.createdAt), "MMM d, h:mm a")}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
