import { createFileRoute } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { QRCodeSVG } from "qrcode.react";
import { Copy } from "lucide-react";

export const Route = createFileRoute("/_authenticated/settings")({
  component: SettingsPage,
});

type Property = {
  id: string;
  name: string;
  slug: string;
  logo_url: string | null;
  brand_color: string | null;
  address: string | null;
  wifi_ssid: string | null;
  wifi_password: string | null;
  checkin_time: string | null;
  checkout_time: string | null;
  welcome_message: string | null;
  report_email: string | null;
};

function SettingsPage() {
  const qc = useQueryClient();
  const { data: property } = useQuery({
    queryKey: ["current-property"],
    queryFn: async () => {
      const { data: prof } = await supabase.from("staff_profiles").select("property_id").maybeSingle();
      if (!prof?.property_id) return null;
      const { data } = await supabase.from("properties").select("*").eq("id", prof.property_id).maybeSingle();
      return data as Property | null;
    },
  });

  const [form, setForm] = useState<Property | null>(null);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);

  useEffect(() => { if (property) setForm(property); }, [property]);

  if (!form) return <div className="p-6 text-sm text-muted-foreground">Loading…</div>;

  const guestUrl = `${typeof window !== "undefined" ? window.location.origin : ""}/checkin/${form.slug}`;

  async function save() {
    if (!form) return;
    setSaving(true);
    const { error } = await supabase.from("properties").update({
      name: form.name,
      brand_color: form.brand_color ?? undefined,
      address: form.address,
      wifi_ssid: form.wifi_ssid,
      wifi_password: form.wifi_password,
      checkin_time: form.checkin_time,
      checkout_time: form.checkout_time,
      welcome_message: form.welcome_message,
      report_email: form.report_email,
    }).eq("id", form.id);
    setSaving(false);
    if (error) return toast.error(error.message);
    toast.success("Saved");
    qc.invalidateQueries({ queryKey: ["current-property"] });
  }

  async function uploadLogo(file: File) {
    if (!form) return;
    setUploading(true);
    const path = `${form.id}/logo-${Date.now()}-${file.name}`;
    const { error } = await supabase.storage.from("property-logos").upload(path, file, { upsert: true });
    if (error) { setUploading(false); return toast.error(error.message); }
    const { data } = supabase.storage.from("property-logos").getPublicUrl(path);
    await supabase.from("properties").update({ logo_url: data.publicUrl }).eq("id", form.id);
    setForm({ ...form, logo_url: data.publicUrl });
    setUploading(false);
    toast.success("Logo updated");
    qc.invalidateQueries({ queryKey: ["current-property"] });
  }

  return (
    <div className="p-6 space-y-6 max-w-4xl">
      <div>
        <h1 className="font-serif text-3xl">Settings</h1>
        <p className="text-sm text-muted-foreground">Configure your property and guest surface.</p>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <Card className="p-5 space-y-4">
          <h2 className="font-medium">Property</h2>
          <div><Label>Name</Label><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
          <div>
            <Label>Brand color</Label>
            <div className="flex gap-2 items-center">
              <input type="color" value={form.brand_color ?? "#0b6b75"} onChange={(e) => setForm({ ...form, brand_color: e.target.value })} className="h-10 w-14 rounded border border-border" />
              <Input value={form.brand_color ?? ""} onChange={(e) => setForm({ ...form, brand_color: e.target.value })} />
            </div>
          </div>
          <div>
            <Label>Logo</Label>
            <div className="flex items-center gap-3">
              {form.logo_url ? <img src={form.logo_url} alt="Logo" className="h-14 w-14 rounded-lg border border-border object-cover" /> : <div className="h-14 w-14 rounded-lg border border-dashed border-border" />}
              <Input type="file" accept="image/*" onChange={(e) => e.target.files?.[0] && uploadLogo(e.target.files[0])} disabled={uploading} />
            </div>
          </div>
          <div><Label>Address</Label><Textarea value={form.address ?? ""} onChange={(e) => setForm({ ...form, address: e.target.value })} rows={2} /></div>
        </Card>

        <Card className="p-5 space-y-4">
          <h2 className="font-medium">Stay details</h2>
          <div className="grid grid-cols-2 gap-3">
            <div><Label>Check-in</Label><Input value={form.checkin_time ?? ""} onChange={(e) => setForm({ ...form, checkin_time: e.target.value })} placeholder="3:00 PM" /></div>
            <div><Label>Check-out</Label><Input value={form.checkout_time ?? ""} onChange={(e) => setForm({ ...form, checkout_time: e.target.value })} placeholder="11:00 AM" /></div>
          </div>
          <div><Label>Wifi SSID</Label><Input value={form.wifi_ssid ?? ""} onChange={(e) => setForm({ ...form, wifi_ssid: e.target.value })} /></div>
          <div><Label>Wifi password</Label><Input value={form.wifi_password ?? ""} onChange={(e) => setForm({ ...form, wifi_password: e.target.value })} /></div>
          <div><Label>Welcome message</Label><Textarea value={form.welcome_message ?? ""} onChange={(e) => setForm({ ...form, welcome_message: e.target.value })} rows={3} /></div>
          <div>
            <Label>Weekly report email</Label>
            <Input value={form.report_email ?? ""} onChange={(e) => setForm({ ...form, report_email: e.target.value })} placeholder="manager@hotel.com, frontdesk@hotel.com" />
            <p className="text-[11px] text-muted-foreground mt-1">Comma-separated. Gets a weekly analytics summary. Leave blank to turn off.</p>
          </div>
        </Card>
      </div>

      <div className="flex justify-end">
        <Button onClick={save} disabled={saving}>{saving ? "Saving…" : "Save changes"}</Button>
      </div>

      <AutonomyCard propertyId={form.id} />

      <MessagingNumbersCard propertyId={form.id} />

      <StaffCard propertyId={form.id} />

      <Card className="p-5">
        <h2 className="font-medium">Guest check-in link</h2>
        <p className="text-sm text-muted-foreground mb-4">Print or share this QR so guests can check in from their phone.</p>
        <div className="flex flex-col sm:flex-row gap-6 items-start">
          <div className="p-4 bg-white rounded-lg border border-border">
            <QRCodeSVG value={guestUrl} size={180} />
          </div>
          <div className="flex-1 space-y-2 min-w-0">
            <Label>URL</Label>
            <div className="flex gap-2">
              <Input readOnly value={guestUrl} />
              <Button variant="outline" size="icon" title="Copy link" onClick={() => { navigator.clipboard.writeText(guestUrl); toast.success("Copied"); }}>
                <Copy className="h-4 w-4" />
              </Button>
            </div>
            <a href={guestUrl} target="_blank" rel="noreferrer" className="text-sm text-primary hover:underline inline-block">Open guest surface →</a>
          </div>
        </div>
      </Card>
    </div>
  );
}

const LEVELS: [string, string][] = [
  ["suggest", "Suggest only"],
  ["approve", "Staff approves"],
  ["auto", "Auto-send"],
];

// Mirrors autonomy_level_allowed() in the DB — used to grey out options
// before a save attempt, not as the actual enforcement (the DB trigger is).
function usePlanTier(propertyId: string) {
  return useQuery({
    queryKey: ["plan-tier", propertyId],
    queryFn: async () => {
      const [{ data: growthOk }, { data: proOk }] = await Promise.all([
        supabase.rpc("property_has_plan_at_least", { _property_id: propertyId, min_tier: "growth" }),
        supabase.rpc("property_has_plan_at_least", { _property_id: propertyId, min_tier: "pro" }),
      ]);
      return { growthOk: !!growthOk, proOk: !!proOk };
    },
  });
}

function levelAllowed(level: string, plan?: { growthOk: boolean; proOk: boolean }) {
  if (!plan) return true; // don't block the UI while loading
  if (level === "suggest") return true;
  if (level === "approve") return plan.growthOk;
  if (level === "auto") return plan.proOk;
  return true;
}

function AutonomyCard({ propertyId }: { propertyId: string }) {
  const qc = useQueryClient();
  const { data: plan } = usePlanTier(propertyId);
  const { data } = useQuery({
    queryKey: ["autonomy", propertyId],
    queryFn: async () => {
      const [{ data: prop }, { data: faqs }, { data: rules }] = await Promise.all([
        supabase.from("properties").select("default_autonomy").eq("id", propertyId).maybeSingle(),
        supabase.from("faqs").select("category").eq("property_id", propertyId),
        supabase.from("category_autonomy").select("category, level").eq("property_id", propertyId),
      ]);
      const cats = Array.from(new Set((faqs ?? []).map((f) => f.category).filter((c): c is string => !!c)));
      const ruleMap: Record<string, string> = {};
      (rules ?? []).forEach((r) => { ruleMap[r.category] = r.level; });
      return { def: (prop?.default_autonomy as string) ?? "suggest", cats, ruleMap };
    },
  });

  const [def, setDef] = useState("suggest");
  const [rules, setRules] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  useEffect(() => { if (data) { setDef(data.def); setRules(data.ruleMap); } }, [data]);

  async function save() {
    setSaving(true);
    const { error: e1 } = await supabase.from("properties").update({ default_autonomy: def }).eq("id", propertyId);
    let e2: { message: string } | null = null;
    const rows = Object.entries(rules).map(([category, level]) => ({ property_id: propertyId, category, level }));
    if (rows.length) {
      const { error } = await supabase.from("category_autonomy").upsert(rows, { onConflict: "property_id,category" });
      e2 = error;
    }
    setSaving(false);
    if (e1 || e2) return toast.error((e1 ?? e2)!.message);
    toast.success("Autonomy saved");
    qc.invalidateQueries({ queryKey: ["autonomy", propertyId] });
  }

  return (
    <Card className="p-5 space-y-4">
      <div>
        <h2 className="font-medium">AI autonomy</h2>
        <p className="text-sm text-muted-foreground">
          How far the concierge can go on its own. Set a default, then override per topic — e.g. auto-answer Wifi, but always approve anything about billing.
        </p>
      </div>
      <div>
        <Label>Default</Label>
        <select value={def} onChange={(e) => setDef(e.target.value)} className="mt-1 h-10 w-full rounded-md border border-border bg-background px-3 text-sm">
          {LEVELS.map(([v, l]) => (
            <option key={v} value={v} disabled={!levelAllowed(v, plan)}>
              {l}{!levelAllowed(v, plan) ? " (upgrade required)" : ""}
            </option>
          ))}
        </select>
      </div>
      {(data?.cats.length ?? 0) > 0 && (
        <div className="space-y-2">
          <Label>Per topic</Label>
          {data!.cats.map((cat) => (
            <div key={cat} className="flex items-center gap-3">
              <span className="text-sm flex-1 truncate">{cat}</span>
              <select
                value={rules[cat] ?? def}
                onChange={(e) => setRules((prev) => ({ ...prev, [cat]: e.target.value }))}
                className="h-9 w-40 rounded-md border border-border bg-background px-2 text-sm"
              >
                {LEVELS.map(([v, l]) => (
                  <option key={v} value={v} disabled={!levelAllowed(v, plan)}>
                    {l}{!levelAllowed(v, plan) ? " (upgrade)" : ""}
                  </option>
                ))}
              </select>
            </div>
          ))}
        </div>
      )}
      <div className="flex justify-end">
        <Button onClick={save} disabled={saving}>{saving ? "Saving…" : "Save autonomy"}</Button>
      </div>
    </Card>
  );
}

function MessagingNumbersCard({ propertyId }: { propertyId: string }) {
  const qc = useQueryClient();
  const { data: plan } = usePlanTier(propertyId);
  const { data: numbers } = useQuery({
    queryKey: ["messaging-numbers", propertyId],
    queryFn: async () => {
      const { data } = await supabase
        .from("messaging_numbers")
        .select("id, channel, phone_number")
        .eq("property_id", propertyId)
        .order("channel");
      return data ?? [];
    },
  });

  const [channel, setChannel] = useState("sms");
  const [phone, setPhone] = useState("");
  const [adding, setAdding] = useState(false);

  async function add() {
    const value = phone.trim();
    if (!/^\+[1-9]\d{6,15}$/.test(value)) return toast.error("Enter a number in E.164 format, e.g. +14155551234");
    setAdding(true);
    const { error } = await supabase.from("messaging_numbers").insert({ property_id: propertyId, channel, phone_number: value });
    setAdding(false);
    if (error) return toast.error(error.message);
    setPhone("");
    toast.success("Number added");
    qc.invalidateQueries({ queryKey: ["messaging-numbers", propertyId] });
  }

  async function remove(id: string) {
    const { error } = await supabase.from("messaging_numbers").delete().eq("id", id);
    if (error) return toast.error(error.message);
    qc.invalidateQueries({ queryKey: ["messaging-numbers", propertyId] });
  }

  if (plan && !plan.growthOk) {
    return (
      <Card className="p-5 space-y-2">
        <h2 className="font-medium">Messaging numbers</h2>
        <p className="text-sm text-muted-foreground">
          SMS and WhatsApp are available on the Growth plan and above.{" "}
          <a href="/billing" className="underline">Upgrade to enable this</a>.
        </p>
      </Card>
    );
  }

  return (
    <Card className="p-5 space-y-4">
      <div>
        <h2 className="font-medium">Messaging numbers</h2>
        <p className="text-sm text-muted-foreground">
          Connect a Twilio SMS or WhatsApp number so guests can text you and replies go back out the same channel.
          Point that number's webhook at <span className="font-mono text-xs">/api/webhooks/twilio</span>.
        </p>
      </div>

      {(numbers?.length ?? 0) > 0 && (
        <div className="space-y-2">
          {numbers!.map((n) => (
            <div key={n.id} className="flex items-center gap-3 text-sm">
              <span className="rounded-md bg-muted px-2 py-0.5 text-xs uppercase tracking-wide">{n.channel}</span>
              <span className="font-mono flex-1">{n.phone_number}</span>
              <Button variant="ghost" size="sm" onClick={() => remove(n.id)}>Remove</Button>
            </div>
          ))}
        </div>
      )}

      <div className="flex flex-col sm:flex-row gap-2 sm:items-end">
        <div>
          <Label>Channel</Label>
          <select value={channel} onChange={(e) => setChannel(e.target.value)} className="mt-1 h-10 w-full sm:w-32 rounded-md border border-border bg-background px-3 text-sm">
            <option value="sms">SMS</option>
            <option value="whatsapp">WhatsApp</option>
          </select>
        </div>
        <div className="flex-1">
          <Label>Number (E.164)</Label>
          <Input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+14155551234" className="mt-1" />
        </div>
        <Button onClick={add} disabled={adding}>{adding ? "Adding…" : "Add"}</Button>
      </div>
    </Card>
  );
}

async function callInviteStaff(body: { propertyId: string; email: string; fullName?: string }) {
  const { data: s } = await supabase.auth.getSession();
  const res = await fetch("/api/admin/invite-staff", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${s.session?.access_token ?? ""}` },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

function StaffCard({ propertyId }: { propertyId: string }) {
  const qc = useQueryClient();
  const [email, setEmail] = useState("");
  const [fullName, setFullName] = useState("");
  const [inviting, setInviting] = useState(false);

  const { data: plan } = usePlanTier(propertyId);
  const maxStaff = plan?.proOk ? null : plan?.growthOk ? 5 : 2;

  const { data } = useQuery({
    queryKey: ["property-staff", propertyId],
    queryFn: async () => {
      const { data: s } = await supabase.auth.getSession();
      const res = await fetch("/api/admin/property-staff", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${s.session?.access_token ?? ""}` },
        body: JSON.stringify({ propertyId }),
      });
      if (!res.ok) throw new Error(await res.text());
      return res.json() as Promise<{
        staff: { id: string; full_name: string | null; email: string | null }[];
        invites: { id: string; email: string; status: string; created_at: string }[];
      }>;
    },
  });

  const staff = data?.staff ?? [];
  const invites = data?.invites ?? [];
  const seatsUsed = staff.length + invites.length;
  const atLimit = maxStaff !== null && seatsUsed >= maxStaff;

  async function invite() {
    if (!email.trim()) return;
    setInviting(true);
    try {
      await callInviteStaff({ propertyId, email: email.trim(), fullName: fullName.trim() || undefined });
      toast.success(`Invite sent to ${email.trim()}`);
      setEmail("");
      setFullName("");
      qc.invalidateQueries({ queryKey: ["property-staff", propertyId] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to invite");
    } finally {
      setInviting(false);
    }
  }

  return (
    <Card className="p-5 space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="font-medium">Invite Staff</h2>
        {maxStaff !== null && (
          <span className="text-xs text-muted-foreground">{seatsUsed} of {maxStaff} seats used</span>
        )}
      </div>

      {staff.length > 0 && (
        <ul className="text-sm space-y-1">
          {staff.map((s) => (
            <li key={s.id} className="flex items-center gap-2">
              <span className="font-medium">{s.full_name || "Unnamed"}</span>
              {s.email && <span className="text-muted-foreground">— {s.email}</span>}
            </li>
          ))}
        </ul>
      )}

      {invites.length > 0 && (
        <div className="space-y-1">
          <p className="text-xs uppercase tracking-wide text-muted-foreground">Pending</p>
          {invites.map((inv) => (
            <div key={inv.id} className="flex items-center gap-2 text-sm">
              <span className="flex-1">{inv.email}</span>
              <span className="rounded-md bg-muted px-2 py-0.5 text-xs capitalize">{inv.status}</span>
            </div>
          ))}
        </div>
      )}

      {atLimit ? (
        <p className="text-sm text-muted-foreground">
          Staff seat limit reached for your current plan.{" "}
          <a href="/billing" className="underline">Upgrade to invite more</a>.
        </p>
      ) : (
        <div className="flex flex-col sm:flex-row gap-2 sm:items-end">
          <div className="flex-1">
            <Label>Full name</Label>
            <Input value={fullName} onChange={(e) => setFullName(e.target.value)} placeholder="Optional" className="mt-1" />
          </div>
          <div className="flex-1">
            <Label>Email</Label>
            <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="staff@hotel.com" className="mt-1" />
          </div>
          <Button onClick={invite} disabled={inviting || !email.trim()}>{inviting ? "Inviting…" : "Send invite"}</Button>
        </div>
      )}
    </Card>
  );
}
