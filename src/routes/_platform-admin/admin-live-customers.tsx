import { createFileRoute, Link } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { useQuery } from "@tanstack/react-query";

export const Route = createFileRoute("/_platform-admin/admin-live-customers")({
  component: LiveCustomersPage,
});

type Org = {
  id: string;
  name: string;
  properties: { id: string; name: string }[];
  subscription: { plan_tier: string; status: string; property_count: number; current_period_end: string | null } | null;
};

async function callAdmin(body: Record<string, unknown>) {
  const { data: s } = await supabase.auth.getSession();
  const gate = sessionStorage.getItem("admin_gate_token") ?? "";
  const res = await fetch("/api/admin/customers", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${s.session?.access_token ?? ""}`,
      "x-admin-gate": gate,
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

function LiveCustomersPage() {
  const { data: orgs, isLoading, isError, error } = useQuery({
    queryKey: ["all-orgs-with-subs"],
    queryFn: async (): Promise<Org[]> => {
      const res = await callAdmin({ action: "listOrgs" });
      return res.orgs;
    },
  });

  return (
    <div className="p-6 max-w-6xl space-y-4">
      <div>
        <h1 className="font-serif text-3xl">Live customers</h1>
        <p className="text-sm text-muted-foreground">Every onboarded hotel. Click a row to open its full detail in a new tab.</p>
      </div>

      {isLoading ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : isError ? (
        <p className="text-sm text-destructive">Couldn't load customers: {String((error as Error)?.message ?? error)}</p>
      ) : (orgs?.length ?? 0) === 0 ? (
        <p className="text-sm text-muted-foreground">No customers yet — onboard one first.</p>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-border">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/40 text-left text-xs uppercase tracking-wide text-muted-foreground">
                <th className="px-4 py-3 font-medium">Hotel</th>
                <th className="px-4 py-3 font-medium">Properties</th>
                <th className="px-4 py-3 font-medium">Plan</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 font-medium">Renews</th>
              </tr>
            </thead>
            <tbody>
              {orgs!.map((org) => {
                const sub = org.subscription;
                return (
                  <tr key={org.id} className="border-b border-border last:border-0 hover:bg-muted/30">
                    <td className="px-4 py-3">
                      <Link
                        to="/admin-live-customers/$orgId"
                        params={{ orgId: org.id }}
                        target="_blank"
                        className="font-medium text-foreground underline-offset-2 hover:underline"
                      >
                        {org.name}
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {org.properties.length === 0 ? "—" : org.properties.map((p) => p.name).join(", ")}
                    </td>
                    <td className="px-4 py-3 capitalize">{sub?.plan_tier ?? "basic"}</td>
                    <td className="px-4 py-3">
                      <span className={`rounded-md px-2 py-0.5 text-xs capitalize ${sub?.status === "active" ? "bg-brand/15 text-brand" : "bg-muted text-muted-foreground"}`}>
                        {sub?.status ?? "no subscription"}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {sub?.current_period_end ? new Date(sub.current_period_end).toLocaleDateString() : "—"}
                    </td>
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
