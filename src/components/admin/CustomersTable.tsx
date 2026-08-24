import { supabase } from "@/integrations/supabase/client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "sonner";
import { PLAN_PRICING_PKR, type PlanTier } from "@/lib/billing";

type Org = {
  id: string;
  name: string;
  properties: { id: string; name: string }[];
  subscription: { plan_tier: string; status: string; property_count: number; current_period_end: string | null } | null;
};

type OrgDetail = {
  org: { id: string; name: string };
  properties: { id: string; name: string; slug: string; created_at: string }[];
  subscription: { plan_tier: string; status: string; property_count: number; current_period_end: string | null; amount_pkr: number } | null;
  admins: { id: string; email: string | null; addedAt: string }[];
};

export async function callAdmin(body: Record<string, unknown>) {
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

/**
 * Shared by both /admin-live-customers and /admin-offboarded-customers —
 * same table, same detail dialog, just a different slice of the same
 * listOrgs data. A hotel moves between the two pages purely based on its
 * latest subscription's status: "canceled" (via Deactivate) puts it here
 * in Offboarded; reactivating it (Activate 30 days in the same dialog)
 * moves it straight back to Live on the next refresh — no separate
 * "offboarded" flag or table anywhere, just this one filter.
 */
export function CustomersTable({
  variant,
  title,
  description,
  emptyMessage,
}: {
  variant: "live" | "offboarded";
  title: string;
  description: string;
  emptyMessage: string;
}) {
  const [selectedOrgId, setSelectedOrgId] = useState<string | null>(null);

  const { data: allOrgs, isLoading, isError, error } = useQuery({
    queryKey: ["all-orgs-with-subs"],
    queryFn: async (): Promise<Org[]> => {
      const res = await callAdmin({ action: "listOrgs" });
      return res.orgs;
    },
  });

  const orgs = (allOrgs ?? []).filter((o) =>
    variant === "offboarded" ? o.subscription?.status === "canceled" : o.subscription?.status !== "canceled",
  );

  return (
    <div className="p-6 max-w-6xl space-y-4">
      <div>
        <h1 className="font-serif text-3xl">{title}</h1>
        <p className="text-sm text-muted-foreground">{description}</p>
      </div>

      {isLoading ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : isError ? (
        <p className="text-sm text-destructive">Couldn't load customers: {String((error as Error)?.message ?? error)}</p>
      ) : orgs.length === 0 ? (
        <p className="text-sm text-muted-foreground">{emptyMessage}</p>
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
              {orgs.map((org) => {
                const sub = org.subscription;
                return (
                  <tr
                    key={org.id}
                    onClick={() => setSelectedOrgId(org.id)}
                    className="cursor-pointer border-b border-border last:border-0 hover:bg-muted/30"
                  >
                    <td className="px-4 py-3 font-medium text-foreground">{org.name}</td>
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
                      {sub?.status === "active" && sub.current_period_end ? new Date(sub.current_period_end).toLocaleDateString() : "—"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {selectedOrgId && (
        <HotelDetailDialog orgId={selectedOrgId} onClose={() => setSelectedOrgId(null)} />
      )}
    </div>
  );
}

function HotelDetailDialog({ orgId, onClose }: { orgId: string; onClose: () => void }) {
  const qc = useQueryClient();

  const { data, isLoading, refetch } = useQuery({
    queryKey: ["org-detail", orgId],
    queryFn: async (): Promise<OrgDetail> => callAdmin({ action: "orgDetail", orgId }),
  });

  const [email, setEmail] = useState("");
  const [addingAdmin, setAddingAdmin] = useState(false);
  const [tier, setTier] = useState<"basic" | PlanTier>("basic");
  const [propertyCount, setPropertyCount] = useState(1);
  const [activating, setActivating] = useState(false);
  const [deactivating, setDeactivating] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!data) return;
    const sub = data.subscription;
    if (sub && sub.status === "active" && (sub.plan_tier === "growth" || sub.plan_tier === "pro")) {
      setTier(sub.plan_tier);
      setPropertyCount(sub.property_count || 1);
    } else {
      setTier("basic");
      setPropertyCount(1);
    }
  }, [data]);

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

  // Also the reactivation path for an offboarded hotel — inserting a
  // fresh 'active' row here is what moves it back to Live Customers.
  // If Basic is selected, this restores the true "no subscription"
  // state instead — bringing a Live-but-free hotel back, or un-offboarding
  // one that was deactivated. This is deliberately NOT the same action as
  // Deactivate: choosing Basic here means "stay/become a live customer on
  // the free tier," not "offboard them."
  async function activate() {
    setActivating(true);
    try {
      if (tier === "basic") {
        await callAdmin({ action: "clearSubscription", orgId });
        toast.success("Live on Basic");
      } else {
        const res = await callAdmin({ action: "activateSubscription", orgId, planTier: tier, propertyCount });
        toast.success(`Activated — PKR ${res.amountPkr?.toLocaleString()}/mo`);
      }
      refetch();
      qc.invalidateQueries({ queryKey: ["all-orgs-with-subs"] });
    } catch (e) {
      toast.error(String((e as Error).message));
    } finally {
      setActivating(false);
    }
  }

  // Always means "explicitly offboard this hotel" — unrelated to
  // whatever tier happens to be selected in the dropdown.
  async function deactivate() {
    setDeactivating(true);
    try {
      await callAdmin({ action: "deactivateSubscription", orgId });
      toast.success("Subscription deactivated — moved to Offboarded customers");
      refetch();
      qc.invalidateQueries({ queryKey: ["all-orgs-with-subs"] });
    } catch (e) {
      toast.error(String((e as Error).message));
    } finally {
      setDeactivating(false);
    }
  }

  // Same Basic-vs-paid distinction as activate() above.
  async function save() {
    setSaving(true);
    try {
      if (tier === "basic") {
        await callAdmin({ action: "clearSubscription", orgId });
        toast.success("Live on Basic");
      } else {
        const res = await callAdmin({ action: "updateSubscription", orgId, planTier: tier, propertyCount });
        toast.success(`Saved — PKR ${res.amountPkr?.toLocaleString()}/mo`);
      }
      refetch();
      qc.invalidateQueries({ queryKey: ["all-orgs-with-subs"] });
    } catch (e) {
      toast.error(String((e as Error).message));
    } finally {
      setSaving(false);
    }
  }

  const sub = data?.subscription;
  const amount = tier === "basic" ? 0 : PLAN_PRICING_PKR[tier].monthlyPkr * propertyCount;

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-2xl max-h-[85vh] overflow-y-auto">
        {isLoading || !data ? (
          <p className="text-sm text-muted-foreground py-6">Loading…</p>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle className="font-serif text-2xl">{data.org.name}</DialogTitle>
              <p className="text-sm text-muted-foreground">
                {sub ? `${sub.plan_tier} plan (${sub.status})` : "No subscription — Basic"}
                {sub?.status === "active" && sub.current_period_end && ` · renews ${new Date(sub.current_period_end).toLocaleDateString()}`}
              </p>
            </DialogHeader>

            <div className="space-y-4 mt-2">
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
                <CardContent className="space-y-4">
                  <div className="flex items-end gap-2">
                    <div>
                      <Label className="text-xs">Plan</Label>
                      <Select value={tier} onValueChange={(v) => setTier(v as "basic" | PlanTier)}>
                        <SelectTrigger className="w-32 mt-1"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="basic">Basic</SelectItem>
                          <SelectItem value="growth">Growth</SelectItem>
                          <SelectItem value="pro">Pro</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label className="text-xs">Properties</Label>
                      <Input type="number" min={1} value={propertyCount} onChange={(e) => setPropertyCount(Math.max(1, Number(e.target.value)))} className="w-20 mt-1" disabled={tier === "basic"} />
                    </div>
                    <p className="text-sm text-muted-foreground flex-1">
                      {tier === "basic" ? "Free" : `PKR ${amount.toLocaleString()}/mo`}
                    </p>
                  </div>
                  <div className="flex justify-end gap-2">
                    <Button size="sm" onClick={activate} disabled={activating}>
                      {activating ? "Activating…" : "Activate 30 days"}
                    </Button>
                    <Button size="sm" variant="outline" onClick={deactivate} disabled={deactivating}>
                      {deactivating ? "Deactivating…" : "Deactivate"}
                    </Button>
                    <Button size="sm" variant="outline" onClick={save} disabled={saving}>
                      {saving ? "Saving…" : "Save"}
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
