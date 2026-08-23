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
import { type PlanTier } from "@/lib/billing";

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

  // Only used to populate the "assign to organisation" dropdown below —
  // the full org list with properties/subscriptions now lives on the
  // Live customers page instead.
  const { data: orgNames, refetch: refetchOrgNames } = useQuery({
    queryKey: ["org-names-for-assign"],
    queryFn: async (): Promise<{ id: string; name: string }[]> => {
      const res = await callAdmin({ action: "listOrgs" });
      return (res.orgs as Org[]).map((o) => ({ id: o.id, name: o.name }));
    },
  });

  function refreshAll() {
    qc.invalidateQueries({ queryKey: ["unassigned-properties"] });
    refetchOrgNames();
  }

  return (
    <div className="p-6 max-w-4xl space-y-6">
      <div>
        <h1 className="font-serif text-3xl">Onboard customer</h1>
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
              <AssignPropertyRow key={p.id} propertyId={p.id} propertyName={p.name} orgs={orgNames ?? []} onDone={refreshAll} />
            ))}
          </CardContent>
        </Card>
      )}
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
          <Label className="text-xs">Hotel name <span className="text-destructive">*</span></Label>
          <Input className="mt-1" placeholder="Cedar Inn" value={hotelName} onChange={(e) => setHotelName(e.target.value)} />
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <Label className="text-xs">Admin name</Label>
            <Input className="mt-1" placeholder="Optional" value={adminName} onChange={(e) => setAdminName(e.target.value)} />
          </div>
          <div>
            <Label className="text-xs">Admin email <span className="text-destructive">*</span></Label>
            <Input className="mt-1" type="email" placeholder="owner@cedarinn.com" value={adminEmail} onChange={(e) => setAdminEmail(e.target.value)} />
          </div>
        </div>
        <div>
          <Label className="text-xs">Plan <span className="text-destructive">*</span></Label>
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
}: { propertyId: string; propertyName: string; orgs: { id: string; name: string }[]; onDone: () => void }) {
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
