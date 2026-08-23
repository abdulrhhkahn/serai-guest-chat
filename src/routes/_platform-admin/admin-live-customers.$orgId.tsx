import { createFileRoute } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { PLAN_PRICING_PKR, type PlanTier } from "@/lib/billing";

export const Route = createFileRoute("/_platform-admin/admin-live-customers/$orgId")({
  component: OrgDetailPage,
});

type OrgDetail = {
  org: { id: string; name: string };
  properties: { id: string; name: string; slug: string; created_at: string }[];
  subscription: { plan_tier: string; status: string; property_count: number; current_period_end: string | null; amount_pkr: number } | null;
  admins: { id: string; email: string | null; addedAt: string }[];
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

function OrgDetailPage() {
  const { orgId } = Route.useParams();
  const qc = useQueryClient();

  const { data, isLoading, refetch } = useQuery({
    queryKey: ["org-detail", orgId],
    queryFn: async (): Promise<OrgDetail> => callAdmin({ action: "orgDetail", orgId }),
  });

  const [email, setEmail] = useState("");
  const [addingAdmin, setAddingAdmin] = useState(false);
  const [tier, setTier] = useState<PlanTier>("growth");
  const [propertyCount, setPropertyCount] = useState(1);
  const [activating, setActivating] = useState(false);

  async function addAdmin() {
    if (!email.trim()) return;
    setAddingAdmin(true);
    try {
      await callAdmin({ action: "addOrgAdmin", orgId, email: email.trim() });
      toast.success("Admin added");
      setEmail("");
      refetch();
    } catch (e) {
      toast.error(String((e as Error).message));
    } finally {
      setAddingAdmin(false);
    }
  }

  async function activate() {
    setActivating(true);
    try {
      const res = await callAdmin({ action: "activateSubscription", orgId, planTier: tier, propertyCount });
      toast.success(`Activated — PKR ${res.amountPkr?.toLocaleString()}/mo`);
      refetch();
      qc.invalidateQueries({ queryKey: ["all-orgs-with-subs"] });
    } catch (e) {
      toast.error(String((e as Error).message));
    } finally {
      setActivating(false);
    }
  }

  if (isLoading || !data) {
    return <div className="p-6 text-sm text-muted-foreground">Loading…</div>;
  }

  const sub = data.subscription;
  const amount = PLAN_PRICING_PKR[tier].monthlyPkr * propertyCount;

  return (
    <div className="p-6 max-w-2xl space-y-6">
      <div>
        <h1 className="font-serif text-3xl">{data.org.name}</h1>
        <p className="text-sm text-muted-foreground">
          {sub ? `${sub.plan_tier} plan (${sub.status})` : "No subscription — Basic"}
          {sub?.current_period_end && ` · renews ${new Date(sub.current_period_end).toLocaleDateString()}`}
        </p>
      </div>

      <Card>
        <CardHeader><CardTitle className="text-base">Properties</CardTitle></CardHeader>
        <CardContent>
          {data.properties.length === 0 ? (
            <p className="text-sm text-muted-foreground">No properties yet.</p>
          ) : (
            <ul className="space-y-2 text-sm">
              {data.properties.map((p) => (
                <li key={p.id} className="flex items-center justify-between">
                  <span>{p.name}</span>
                  <span className="text-xs text-muted-foreground font-mono">/checkin/{p.slug}</span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">Admins</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          {data.admins.length === 0 ? (
            <p className="text-sm text-muted-foreground">No admins yet.</p>
          ) : (
            <ul className="space-y-1 text-sm">
              {data.admins.map((a) => (
                <li key={a.id}>{a.email ?? "Unknown"}</li>
              ))}
            </ul>
          )}
          <div className="flex gap-2">
            <Input placeholder="Add another admin by email" value={email} onChange={(e) => setEmail(e.target.value)} className="flex-1" />
            <Button size="sm" variant="outline" onClick={addAdmin} disabled={addingAdmin || !email.trim()}>
              {addingAdmin ? "Adding…" : "Add admin"}
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">Subscription</CardTitle></CardHeader>
        <CardContent>
          <div className="flex items-end gap-2">
            <div>
              <Label className="text-xs">Plan</Label>
              <Select value={tier} onValueChange={(v) => setTier(v as PlanTier)}>
                <SelectTrigger className="w-32 mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="growth">Growth</SelectItem>
                  <SelectItem value="pro">Pro</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Properties</Label>
              <Input type="number" min={1} value={propertyCount} onChange={(e) => setPropertyCount(Math.max(1, Number(e.target.value)))} className="w-20 mt-1" />
            </div>
            <p className="text-sm text-muted-foreground flex-1">PKR {amount.toLocaleString()}/mo</p>
            <Button size="sm" onClick={activate} disabled={activating}>
              {activating ? "Activating…" : "Activate 30 days"}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
