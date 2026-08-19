import { createFileRoute } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Building2, Plus, X } from "lucide-react";
import { isValidEmail } from "@/lib/org-manage";

export const Route = createFileRoute("/_authenticated/organization")({
  component: OrganizationPage,
});

async function callOrg(action: string, orgId: string, args: Record<string, unknown> = {}) {
  const { data: s } = await supabase.auth.getSession();
  const res = await fetch("/api/admin/org", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${s.session?.access_token ?? ""}` },
    body: JSON.stringify({ action, orgId, ...args }),
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

function OrganizationPage() {
  const qc = useQueryClient();
  const [name, setName] = useState("");
  const [newAdmin, setNewAdmin] = useState("");

  // Which org(s) does the current user administer? Use the first.
  const { data: org, isLoading } = useQuery({
    queryKey: ["my-org"],
    queryFn: async () => {
      const { data: auth } = await supabase.auth.getUser();
      const uid = auth.user?.id;
      if (!uid) return null;
      const { data: mem } = await supabase.from("org_admins").select("org_id").eq("user_id", uid).limit(1).maybeSingle();
      if (!mem) return null;
      const { data: o } = await supabase.from("organizations").select("id, name").eq("id", mem.org_id).maybeSingle();
      if (o) setName(o.name);
      return o;
    },
  });

  const orgId = org?.id ?? "";

  const { data: properties } = useQuery({
    queryKey: ["org-properties", orgId],
    enabled: !!orgId,
    queryFn: async () => {
      const { data } = await supabase.from("properties").select("id, name, organization_id").order("name");
      return data ?? [];
    },
  });

  const { data: admins } = useQuery({
    queryKey: ["org-admins", orgId],
    enabled: !!orgId,
    queryFn: async () => {
      const { data } = await supabase.from("org_admins").select("user_id").eq("org_id", orgId);
      return data ?? [];
    },
  });

  const { data: myPropertyId } = useQuery({
    queryKey: ["my-property"],
    queryFn: async () => {
      const { data: auth } = await supabase.auth.getUser();
      const { data } = await supabase.from("staff_profiles").select("property_id").eq("id", auth.user?.id ?? "").maybeSingle();
      return data?.property_id ?? null;
    },
  });

  if (isLoading) return <div className="p-6 text-sm text-muted-foreground">Loading…</div>;
  if (!org) {
    return (
      <div className="p-6 max-w-2xl">
        <h1 className="font-serif text-3xl mb-2">Organisation</h1>
        <p className="text-sm text-muted-foreground">You don't administer an organisation. Ask your account owner to add you as an org admin.</p>
      </div>
    );
  }

  const inOrg = (properties ?? []).filter((p) => p.organization_id === orgId);
  const assignable = (properties ?? []).filter((p) => p.organization_id !== orgId && (p.organization_id == null || p.id === myPropertyId));

  async function run(promise: Promise<unknown>, okMsg: string) {
    try { await promise; toast.success(okMsg); qc.invalidateQueries(); }
    catch (e) { toast.error(String((e as Error).message)); }
  }

  return (
    <div className="p-6 max-w-3xl space-y-6">
      <div className="flex items-center gap-2">
        <Building2 className="h-6 w-6" />
        <h1 className="font-serif text-3xl">Organisation</h1>
      </div>

      <Card>
        <CardHeader><CardTitle className="text-base">Name</CardTitle></CardHeader>
        <CardContent>
          <div className="flex gap-2">
            <Input value={name} onChange={(e) => setName(e.target.value)} />
            <Button onClick={() => run(callOrg("rename", orgId, { name }), "Renamed")} disabled={!name.trim() || name === org.name}>Save</Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">Properties in this group</CardTitle></CardHeader>
        <CardContent>
          {inOrg.length === 0 ? (
            <p className="text-sm text-muted-foreground">No properties yet.</p>
          ) : (
            <ul className="divide-y divide-border text-sm">
              {inOrg.map((p) => (
                <li key={p.id} className="py-2 flex items-center justify-between">
                  <span>{p.name}</span>
                  <Button variant="ghost" size="sm" onClick={() => run(callOrg("unassignProperty", orgId, { propertyId: p.id }), "Removed from group")}>
                    <X className="h-3.5 w-3.5" />
                  </Button>
                </li>
              ))}
            </ul>
          )}
          {assignable.length > 0 && (
            <div className="mt-3 pt-3 border-t border-border">
              <div className="text-xs text-muted-foreground mb-1">Add a property you manage</div>
              <ul className="space-y-1">
                {assignable.map((p) => (
                  <li key={p.id} className="flex items-center justify-between text-sm">
                    <span>{p.name}</span>
                    <Button variant="outline" size="sm" onClick={() => run(callOrg("assignProperty", orgId, { propertyId: p.id }), "Added to group")}>
                      <Plus className="h-3.5 w-3.5 mr-1" /> Add
                    </Button>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">Admins</CardTitle></CardHeader>
        <CardContent>
          <ul className="divide-y divide-border text-sm mb-3">
            {(admins ?? []).map((a) => (
              <li key={a.user_id} className="py-2 flex items-center justify-between">
                <span className="font-mono text-xs">{a.user_id}</span>
                <Button variant="ghost" size="sm" disabled={(admins ?? []).length <= 1}
                  onClick={() => run(callOrg("removeAdmin", orgId, { userId: a.user_id }), "Admin removed")}>
                  <X className="h-3.5 w-3.5" />
                </Button>
              </li>
            ))}
          </ul>
          <div className="flex gap-2">
            <Input placeholder="admin@hotel.com" value={newAdmin} onChange={(e) => setNewAdmin(e.target.value)} />
            <Button disabled={!isValidEmail(newAdmin)}
              onClick={() => run(callOrg("addAdmin", orgId, { email: newAdmin }).then(() => setNewAdmin("")), "Admin added")}>
              Add admin
            </Button>
          </div>
          <p className="text-[11px] text-muted-foreground mt-1">The person must have signed in at least once before they can be added.</p>
        </CardContent>
      </Card>
    </div>
  );
}
