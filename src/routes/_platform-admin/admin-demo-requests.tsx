import { createFileRoute } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { useQuery } from "@tanstack/react-query";
import { useState, useMemo } from "react";
import { Input } from "@/components/ui/input";
import { Search } from "lucide-react";
import { format, isFuture } from "date-fns";

export const Route = createFileRoute("/_platform-admin/admin-demo-requests")({
  component: AdminDemoRequestsPage,
});

const FETCH_LIMIT = 300;

type Lead = {
  id: string;
  first_name: string;
  last_name: string;
  work_email: string;
  phone: string;
  property_type: string;
  property_count: number;
  plan_tier: string;
  heard_about: string | null;
  scheduled_at: string | null;
  created_at: string;
};

function AdminDemoRequestsPage() {
  const [search, setSearch] = useState("");

  const { data: leads, isLoading, isError, error } = useQuery({
    queryKey: ["demo-requests"],
    queryFn: async (): Promise<Lead[]> => {
      const { data, error } = await supabase
        .from("plan_interest_leads")
        .select("id, first_name, last_name, work_email, phone, property_type, property_count, plan_tier, heard_about, scheduled_at, created_at")
        .order("scheduled_at", { ascending: true, nullsFirst: false })
        .limit(FETCH_LIMIT);
      if (error) throw error;
      return data ?? [];
    },
  });

  const filtered = useMemo(() => {
    const list = leads ?? [];
    const q = search.trim().toLowerCase();
    if (!q) return list;
    return list.filter((l) =>
      `${l.first_name} ${l.last_name}`.toLowerCase().includes(q) || l.work_email.toLowerCase().includes(q),
    );
  }, [leads, search]);

  return (
    <div className="p-6 max-w-6xl space-y-4">
      <div>
        <h1 className="font-serif text-3xl">Demo requests</h1>
        <p className="text-sm text-muted-foreground">Everyone who's booked a demo call from the pricing page.</p>
      </div>

      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by name or email…"
          className="pl-9"
        />
      </div>

      {isLoading ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : isError ? (
        <p className="text-sm text-destructive">Couldn't load demo requests: {String((error as Error)?.message ?? error)}</p>
      ) : !filtered.length ? (
        <p className="text-sm text-muted-foreground">
          {search.trim() ? "No requests match your search." : "No demo requests yet."}
        </p>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-border">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/40 text-left text-xs uppercase tracking-wide text-muted-foreground">
                <th className="px-4 py-3 font-medium">Name</th>
                <th className="px-4 py-3 font-medium">Contact</th>
                <th className="px-4 py-3 font-medium">Property</th>
                <th className="px-4 py-3 font-medium">Interested in</th>
                <th className="px-4 py-3 font-medium">Scheduled</th>
                <th className="px-4 py-3 font-medium">Heard about</th>
                <th className="px-4 py-3 font-medium">Submitted</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((l) => {
                const upcoming = l.scheduled_at ? isFuture(new Date(l.scheduled_at)) : false;
                return (
                  <tr key={l.id} className="border-b border-border last:border-0 hover:bg-muted/30">
                    <td className="px-4 py-3 font-medium text-foreground">{l.first_name} {l.last_name}</td>
                    <td className="px-4 py-3 text-muted-foreground">
                      <div>{l.work_email}</div>
                      <div className="text-xs">{l.phone}</div>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">{l.property_type} · {l.property_count} {l.property_count === 1 ? "property" : "properties"}</td>
                    <td className="px-4 py-3 capitalize">{l.plan_tier}</td>
                    <td className="px-4 py-3">
                      {l.scheduled_at ? (
                        <span className={`rounded-md px-2 py-0.5 text-xs ${upcoming ? "bg-brand/15 text-brand" : "bg-muted text-muted-foreground"}`}>
                          {format(new Date(l.scheduled_at), "MMM d, h:mm a")}
                        </span>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">{l.heard_about ?? "—"}</td>
                    <td className="px-4 py-3 text-muted-foreground">{format(new Date(l.created_at), "MMM d")}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
