import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/properties")({
  component: PropertiesPage,
});

type PropertyRow = {
  id: string;
  name: string;
  slug: string;
  organizationName: string | null;
  planTier: string;
  status: string | null;
};

function PropertiesPage() {
  const qc = useQueryClient();
  const navigate = useNavigate();

  const { data: properties, isLoading, isError, error } = useQuery({
    queryKey: ["properties-overview"],
    queryFn: async (): Promise<PropertyRow[]> => {
      const { data: s } = await supabase.auth.getSession();
      const res = await fetch("/api/staff/properties-overview", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${s.session?.access_token ?? ""}` },
      });
      if (!res.ok) throw new Error(await res.text());
      const body = await res.json();
      return body.properties;
    },
  });

  async function switchTo(propertyId: string) {
    const { data: u } = await supabase.auth.getUser();
    if (!u.user) return;
    const { error } = await supabase.from("staff_profiles").update({ property_id: propertyId }).eq("id", u.user.id);
    if (error) return toast.error(error.message);
    toast.success("Switched property");
    await qc.invalidateQueries();
    navigate({ to: "/dashboard" });
  }

  return (
    <div className="p-6 max-w-5xl space-y-4">
      <div>
        <h1 className="font-serif text-3xl">Properties</h1>
        <p className="text-sm text-muted-foreground">Every property across every hotel. Click a row to switch into its dashboard.</p>
      </div>

      {isLoading ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : isError ? (
        <p className="text-sm text-destructive">Couldn't load properties: {String((error as Error)?.message ?? error)}</p>
      ) : (properties?.length ?? 0) === 0 ? (
        <p className="text-sm text-muted-foreground">No properties yet.</p>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-border">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/40 text-left text-xs uppercase tracking-wide text-muted-foreground">
                <th className="px-4 py-3 font-medium">Property</th>
                <th className="px-4 py-3 font-medium">Organisation</th>
                <th className="px-4 py-3 font-medium">Plan</th>
                <th className="px-4 py-3 font-medium">Check-in link</th>
              </tr>
            </thead>
            <tbody>
              {properties!.map((p) => (
                <tr
                  key={p.id}
                  onClick={() => switchTo(p.id)}
                  className="cursor-pointer border-b border-border last:border-0 hover:bg-muted/30"
                >
                  <td className="px-4 py-3 font-medium text-foreground">{p.name}</td>
                  <td className="px-4 py-3 text-muted-foreground">{p.organizationName ?? "—"}</td>
                  <td className="px-4 py-3 capitalize">{p.planTier}</td>
                  <td className="px-4 py-3 text-muted-foreground font-mono text-xs">/checkin/{p.slug}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
