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
        <p className="text-sm text-muted-foreground">Internal tool — not visible to hotel staff.</p>
      </div>

      <NewHotelCard onDone={refreshAll} />

      {(unassigned?.length ?? 0) > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Unassigned properties</CardTitle>
            <p className="text-xs text-muted-foreground">
              Legacy or leftover properties not tied to an organisation — new hotels created above don't end up here.
            </p>
          </CardHeader>
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

function NewHotelCard({ onDone }: { onDone: () => void }) {
  const [hotelName, setHotelName] = useState("");
  const [adminName, setAdminName] = useState("");
  const [adminEmail, setAdminEmail] = useState("");
  const [planTier, setPlanTier] = useState<"basic" | PlanTier>("basic");
  const [saving, setSaving] = useState(false);

  async function save() {
    if (!hotelName.trim() || !adminEmail.trim()) return;
    setSaving(true);
    try {
      const res = await callAdmin({
        action: "createHotel",
        hotelName: hotelName.trim(),
        adminName: adminName.trim() || undefined,
        adminEmail: adminEmail.trim(),
        planTier,
      });
      toast.success(
        res.amountPkr
          ? `${hotelName.trim()} created on ${planTier} (PKR ${res.amountPkr.toLocaleString()}/mo) — login details sent to ${adminEmail.trim()}`
          : `${hotelName.trim()} created — login details sent to ${adminEmail.trim()}`,
      );
      setHotelName("");
      setAdminName("");
      setAdminEmail("");
      setPlanTier("basic");
      onDone();
    } catch (e) {
      toast.error(String((e as Error).message));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">New hotel</CardTitle>
        <p className="text-sm text-muted-foreground">
          Creates the hotel and emails the admin a link to set their password and sign in.
        </p>
      </CardHeader>
      <CardContent className="space-y-3">
        <div>
          <Label className="text-xs">Hotel name</Label>
          <Input className="mt-1" placeholder="Cedar Inn" value={hotelName} onChange={(e) => setHotelName(e.target.value)} />
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <Label className="text-xs">Admin name</Label>
            <Input className="mt-1" placeholder="Optional" value={adminName} onChange={(e) => setAdminName(e.target.value)} />
          </div>
          <div>
            <Label className="text-xs">Admin email</Label>
            <Input className="mt-1" type="email" placeholder="owner@cedarinn.com" value={adminEmail} onChange={(e) => setAdminEmail(e.target.value)} />
          </div>
        </div>
        <div>
          <Label className="text-xs">Plan</Label>
          <Select value={planTier} onValueChange={(v) => setPlanTier(v as "basic" | PlanTier)}>
            <SelectTrigger className="mt-1 w-40"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="basic">Basic (free)</SelectItem>
              <SelectItem value="growth">Growth</SelectItem>
              <SelectItem value="pro">Pro</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <Button onClick={save} disabled={saving || !hotelName.trim() || !adminEmail.trim()}>
          {saving ? "Saving…" : "Save & send login details"}
        </Button>
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
          <Input placeholder="Add another admin by email" value={email} onChange={(e) => setEmail(e.target.value)} className="flex-1" />
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
