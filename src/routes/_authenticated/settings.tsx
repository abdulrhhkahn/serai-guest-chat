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
      brand_color: form.brand_color,
      address: form.address,
      wifi_ssid: form.wifi_ssid,
      wifi_password: form.wifi_password,
      checkin_time: form.checkin_time,
      checkout_time: form.checkout_time,
      welcome_message: form.welcome_message,
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
        </Card>
      </div>

      <div className="flex justify-end">
        <Button onClick={save} disabled={saving}>{saving ? "Saving…" : "Save changes"}</Button>
      </div>

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
              <Button variant="outline" size="icon" onClick={() => { navigator.clipboard.writeText(guestUrl); toast.success("Copied"); }}>
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
