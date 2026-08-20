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

export const Route = createFileRoute("/_platform-admin/admin-customers")({
  component: CustomersAdminPage,
});

type Org = {
  id: string;
  name: string;
  properties: { id: string; name: string }[];
  subscription: { plan_tier: string; status: string; property_count: number; current_period_end: string | null } | null;
};

async function callAdmin(body: Record<string, unknown>) {
  const { data: s } = await supabase.auth.getSession();
  const res = await fetch("/api/admin/customers", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${s.session?.access_token ?? ""}` },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

function CustomersAdminPage() {
  const qc = useQueryClient();

  const { data: unassigned } = useQuery({
    queryKey: ["unassigned-properties"],
    queryFn: async () => {
      const { data } = await supabase.from("properties").select("id, name").is("organization_id", null).order("name");
      return data ?? [];
    },
  });

  const { data: orgs, refetch: refetchOrgs } = useQuery({
    queryKey: ["all-orgs-with-subs"],
    queryFn: async (): Promise<Org[]> => {
      const { data: orgRows } = await supabase.from("organizations").select("id, name").order("name");
      const { data: propRows } = await supabase.from("properties").select("id, name, organization_id").not("organization_id", "is", null);
      const { data: subRows } = await supabase
        .from("subscriptions")
        .select("organization_id, plan_tier, status, property_count, current_period_end")
        .order("created_at", { ascending: false });

      const latestSubByOrg = new Map<string, Org["subscription"]>();
      for (const s of subRows ?? []) {
        if (!latestSubByOrg.has(s.organization_id)) latestSubByOrg.set(s.organization_id, s);
      }

      return (orgRows ?? []).map((o) => ({
        id: o.id,
        name: o.name,
        properties: (propRows ?? []).filter((p) => p.organization_id === o.id).map((p) => ({ id: p.id, name: p.name })),
        subscription: latestSubByOrg.get(o.id) ?? null,
      }));
    },
  });

  function refreshAll() {
    qc.invalidateQueries({ queryKey: ["unassigned-properties"] });
    refetchOrgs();
  }

  return (
    <div className="p-6 max-w-4xl space-y-6">
      <div>
        <h1 className="font-serif text-3xl">Customer onboarding</h1>
        <p className="text-sm text-muted-foreground">Assign hotels to organisations and activate their plan. Internal tool — not visible to hotel staff.</p>
      </div>

      <NewOrgCard onDone={refreshAll} />

      {(unassigned?.length ?? 0) > 0 && (
        <Card>
          <CardHeader><CardTitle className="text-base">Unassigned properties</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            {unassigned!.map((p) => (
              <AssignPropertyRow key={p.id} propertyId={p.id} propertyName={p.name} orgs={orgs ?? []} onDone={refreshAll} />
            ))}
          </CardContent>
        </Card>
      )}

      <div className="space-y-4">
        {(orgs ?? []).map((org) => (
          <OrgCard key={org.id} org={org} onDone={refreshAll} />
        ))}
      </div>
    </div>
  );
}

function NewOrgCard({ onDone }: { onDone: () => void }) {
  const [name, setName] = useState("");
  const [saving, setSaving] = useState(false);

  async function create() {
    if (!name.trim()) return;
    setSaving(true);
    try {
      await callAdmin({ action: "createOrg", name: name.trim() });
      toast.success("Organisation created");
      setName("");
      onDone();
    } catch (e) {
      toast.error(String((e as Error).message));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card>
      <CardHeader><CardTitle className="text-base">New organisation</CardTitle></CardHeader>
      <CardContent className="flex gap-2">
        <Input placeholder="Hotel group name" value={name} onChange={(e) => setName(e.target.value)} />
        <Button onClick={create} disabled={saving || !name.trim()}>{saving ? "Creating…" : "Create"}</Button>
      </CardContent>
    </Card>
  );
}

function AssignPropertyRow({
  propertyId, propertyName, orgs, onDone,
}: { propertyId: string; propertyName: string; orgs: Org[]; onDone: () => void }) {
  const [orgId, setOrgId] = useState<string>("");
  const [assigning, setAssigning] = useState(false);

  async function assign() {
    if (!orgId) return;
    setAssigning(true);
    try {
      await callAdmin({ action: "assignProperty", orgId, propertyId });
      toast.success("Assigned");
      onDone();
    } catch (e) {
      toast.error(String((e as Error).message));
    } finally {
      setAssigning(false);
    }
  }

  return (
    <div className="flex items-center gap-2">
      <span className="flex-1 text-sm">{propertyName}</span>
      <Select value={orgId} onValueChange={setOrgId}>
        <SelectTrigger className="w-56"><SelectValue placeholder="Choose organisation" /></SelectTrigger>
        <SelectContent>
          {orgs.map((o) => <SelectItem key={o.id} value={o.id}>{o.name}</SelectItem>)}
        </SelectContent>
      </Select>
      <Button size="sm" onClick={assign} disabled={!orgId || assigning}>{assigning ? "Assigning…" : "Assign"}</Button>
    </div>
  );
}

function OrgCard({ org, onDone }: { org: Org; onDone: () => void }) {
  const [email, setEmail] = useState("");
  const [addingAdmin, setAddingAdmin] = useState(false);
  const [tier, setTier] = useState<PlanTier>("growth");
  const [propertyCount, setPropertyCount] = useState(Math.max(1, org.properties.length));
  const [activating, setActivating] = useState(false);

  async function addAdmin() {
    if (!email.trim()) return;
    setAddingAdmin(true);
    try {
      await callAdmin({ action: "addOrgAdmin", orgId: org.id, email: email.trim() });
      toast.success("Admin added");
      setEmail("");
      onDone();
    } catch (e) {
      toast.error(String((e as Error).message));
    } finally {
      setAddingAdmin(false);
    }
  }

  async function activate() {
    setActivating(true);
    try {
      const res = await callAdmin({ action: "activateSubscription", orgId: org.id, planTier: tier, propertyCount });
      toast.success(`Activated — PKR ${res.amountPkr?.toLocaleString()}/mo`);
      onDone();
    } catch (e) {
      toast.error(String((e as Error).message));
    } finally {
      setActivating(false);
    }
  }

  const sub = org.subscription;
  const amount = PLAN_PRICING_PKR[tier].monthlyPkr * propertyCount;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center justify-between">
          <span>{org.name}</span>
          <span className="text-sm font-normal text-muted-foreground">
            {org.properties.length} propert{org.properties.length === 1 ? "y" : "ies"}
            {sub ? ` · ${sub.plan_tier} (${sub.status})${sub.current_period_end ? ` until ${new Date(sub.current_period_end).toLocaleDateString()}` : ""}` : " · Starter (no subscription)"}
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {org.properties.length > 0 && (
          <p className="text-xs text-muted-foreground">{org.properties.map((p) => p.name).join(", ")}</p>
        )}

        <div className="flex gap-2">
          <Input placeholder="admin@hotel.com" value={email} onChange={(e) => setEmail(e.target.value)} className="flex-1" />
          <Button size="sm" variant="outline" onClick={addAdmin} disabled={addingAdmin || !email.trim()}>
            {addingAdmin ? "Adding…" : "Add admin"}
          </Button>
        </div>

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
  );
}
