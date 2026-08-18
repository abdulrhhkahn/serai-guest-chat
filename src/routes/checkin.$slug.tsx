import { createFileRoute, notFound, useNavigate } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "sonner";
import SignatureCanvas from "react-signature-canvas";
import { ArrowRight, ArrowLeft, Check, Camera, Wifi } from "lucide-react";

export const Route = createFileRoute("/checkin/$slug")({
  loader: async ({ params }) => {
    const { data } = await supabase
      .from("properties")
      .select("id,name,slug,logo_url,brand_color,address,wifi_ssid,wifi_password,checkin_time,checkout_time,welcome_message")
      .eq("slug", params.slug)
      .maybeSingle();
    if (!data) throw notFound();
    return { property: data };
  },
  head: ({ loaderData }) => ({
    meta: [
      { title: loaderData ? `Check in — ${loaderData.property.name}` : "Check in" },
      { name: "description", content: "Mobile check-in for your stay." },
      { name: "theme-color", content: loaderData?.property.brand_color ?? "#0b6b75" },
    ],
  }),
  component: CheckinFlow,
  notFoundComponent: () => (
    <div className="min-h-screen grid place-items-center p-6 text-center">
      <div>
        <h1 className="font-serif text-2xl">Property not found</h1>
        <p className="text-sm text-muted-foreground mt-2">Check the link or QR code you scanned.</p>
      </div>
    </div>
  ),
});

type Property = {
  id: string; name: string; slug: string; logo_url: string | null; brand_color: string | null;
  address: string | null; wifi_ssid: string | null; wifi_password: string | null;
  checkin_time: string | null; checkout_time: string | null; welcome_message: string | null;
};

function CheckinFlow() {
  const { property } = Route.useLoaderData() as { property: Property };
  const navigate = useNavigate();
  const brand = property.brand_color ?? "#0b6b75";
  const [step, setStep] = useState(0);
  const [submitting, setSubmitting] = useState(false);

  const [form, setForm] = useState({
    guest_name: "", guest_email: "", guest_phone: "", booking_reference: "",
    arrival_date: "", departure_date: "", num_guests: 1,
    id_file: null as File | null,
    terms: false,
  });
  const sigRef = useRef<SignatureCanvas | null>(null);

  useEffect(() => {
    document.documentElement.style.setProperty("--brand", brand);
  }, [brand]);

  const steps = ["Welcome", "Details", "ID", "Sign", "Done"];

  async function submit() {
    if (!form.terms) return toast.error("Please accept the terms");
    if (sigRef.current?.isEmpty()) return toast.error("Please sign");
    setSubmitting(true);
    try {
      let id_document_url: string | null = null;
      let signature_url: string | null = null;

      if (form.id_file) {
        const path = `${property.id}/${crypto.randomUUID()}-${form.id_file.name}`;
        const { error } = await supabase.storage.from("guest-ids").upload(path, form.id_file);
        if (error) throw error;
        id_document_url = path;
      }

      const dataUrl = sigRef.current!.getCanvas().toDataURL("image/png");
      const blob = await (await fetch(dataUrl)).blob();
      const sigPath = `${property.id}/${crypto.randomUUID()}.png`;
      const { error: sigErr } = await supabase.storage.from("guest-signatures").upload(sigPath, blob, { contentType: "image/png" });
      if (sigErr) throw sigErr;
      signature_url = sigPath;

      const { data: created, error } = await supabase.from("checkins").insert({
        property_id: property.id,
        guest_name: form.guest_name,
        guest_email: form.guest_email || null,
        guest_phone: form.guest_phone || null,
        booking_reference: form.booking_reference || null,
        arrival_date: form.arrival_date || null,
        departure_date: form.departure_date || null,
        num_guests: form.num_guests,
        id_document_url,
        signature_url,
        status: "pending",
      }).select("id").single();
      if (error) throw error;
      // Remember this check-in so the guest hub can attach it to the chat,
      // giving staff room/stay context in the inbox.
      if (typeof localStorage !== "undefined" && created?.id) {
        localStorage.setItem(`serai-checkin-${property.id}`, created.id);
      }
      setStep(4);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Something went wrong");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="guest-surface min-h-screen bg-background text-foreground">
      <div className="mx-auto max-w-lg px-5 py-6 sm:py-10">
        {/* header */}
        <div className="flex items-center gap-3 mb-6">
          {property.logo_url ? (
            <img src={property.logo_url} alt={property.name} className="h-10 w-10 rounded-lg object-cover" />
          ) : (
            <div className="h-10 w-10 rounded-lg" style={{ background: brand }} />
          )}
          <div className="font-serif text-lg">{property.name}</div>
        </div>

        {/* progress */}
        {step < 4 && (
          <div className="flex gap-1.5 mb-8">
            {steps.slice(0, 4).map((_, i) => (
              <div key={i} className="h-1 flex-1 rounded-full" style={{ background: i <= step ? brand : "hsl(var(--muted))" }} />
            ))}
          </div>
        )}

        {step === 0 && (
          <div className="text-center pt-8">
            <h1 className="font-serif text-4xl leading-tight">Welcome to<br />{property.name}.</h1>
            <p className="mt-4 text-muted-foreground">{property.welcome_message ?? "Check in from your phone in under a minute."}</p>
            <Button className="mt-10 w-full h-14 text-base" style={{ background: brand, color: "white" }} onClick={() => setStep(1)}>
              Start check-in <ArrowRight className="ml-2 h-4 w-4" />
            </Button>
          </div>
        )}

        {step === 1 && (
          <div className="space-y-4">
            <h2 className="font-serif text-2xl">Your details</h2>
            <div><Label>Full name</Label><Input required value={form.guest_name} onChange={(e) => setForm({ ...form, guest_name: e.target.value })} /></div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Email</Label><Input type="email" value={form.guest_email} onChange={(e) => setForm({ ...form, guest_email: e.target.value })} /></div>
              <div><Label>Phone</Label><Input type="tel" value={form.guest_phone} onChange={(e) => setForm({ ...form, guest_phone: e.target.value })} /></div>
            </div>
            <div><Label>Booking reference</Label><Input value={form.booking_reference} onChange={(e) => setForm({ ...form, booking_reference: e.target.value })} /></div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Arrival</Label><Input type="date" value={form.arrival_date} onChange={(e) => setForm({ ...form, arrival_date: e.target.value })} /></div>
              <div><Label>Departure</Label><Input type="date" value={form.departure_date} onChange={(e) => setForm({ ...form, departure_date: e.target.value })} /></div>
            </div>
            <div><Label>Number of guests</Label><Input type="number" min={1} value={form.num_guests} onChange={(e) => setForm({ ...form, num_guests: parseInt(e.target.value) || 1 })} /></div>
            <NavButtons brand={brand} onBack={() => setStep(0)} onNext={() => {
              if (!form.guest_name.trim()) return toast.error("Please enter your name");
              setStep(2);
            }} />
          </div>
        )}

        {step === 2 && (
          <div className="space-y-4">
            <h2 className="font-serif text-2xl">ID document</h2>
            <p className="text-sm text-muted-foreground">Optional. Snap a photo of your passport or ID.</p>
            <label className="block border-2 border-dashed border-border rounded-2xl p-8 text-center cursor-pointer hover:bg-muted/30">
              <input type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => setForm({ ...form, id_file: e.target.files?.[0] ?? null })} />
              <Camera className="h-8 w-8 mx-auto text-muted-foreground" />
              <div className="mt-3 text-sm">{form.id_file ? form.id_file.name : "Tap to take a photo"}</div>
            </label>
            <NavButtons brand={brand} onBack={() => setStep(1)} onNext={() => setStep(3)} nextLabel="Continue" />
          </div>
        )}

        {step === 3 && (
          <div className="space-y-4">
            <h2 className="font-serif text-2xl">Sign & agree</h2>
            <p className="text-sm text-muted-foreground">Sign below to confirm your check-in details.</p>
            <div className="rounded-xl border border-border bg-white">
              <SignatureCanvas ref={(r) => { sigRef.current = r; }} canvasProps={{ className: "w-full h-48 rounded-xl" }} />
            </div>
            <div className="flex justify-between text-xs">
              <button onClick={() => sigRef.current?.clear()} className="text-muted-foreground underline">Clear</button>
            </div>
            <label className="flex items-start gap-3 p-3 rounded-xl bg-muted/40">
              <Checkbox checked={form.terms} onCheckedChange={(v) => setForm({ ...form, terms: !!v })} className="mt-0.5" />
              <span className="text-sm">I confirm the information is accurate and accept the house rules.</span>
            </label>
            <NavButtons brand={brand} onBack={() => setStep(2)} onNext={submit} nextLabel={submitting ? "Submitting…" : "Complete check-in"} disabled={submitting} />
          </div>
        )}

        {step === 4 && (
          <div className="text-center pt-6 space-y-6">
            <div className="mx-auto h-16 w-16 rounded-full grid place-items-center" style={{ background: brand }}>
              <Check className="h-8 w-8 text-white" />
            </div>
            <div>
              <h2 className="font-serif text-3xl">You're all set.</h2>
              <p className="text-muted-foreground mt-2">Thanks, {form.guest_name.split(" ")[0]}. See you soon.</p>
            </div>

            <div className="rounded-2xl border border-border p-5 text-left space-y-3">
              {property.checkin_time && <Info label="Check-in from" value={property.checkin_time} />}
              {property.checkout_time && <Info label="Check-out by" value={property.checkout_time} />}
              {property.address && <Info label="Address" value={property.address} />}
              {property.wifi_ssid && (
                <div className="pt-2 border-t border-border">
                  <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1"><Wifi className="h-3 w-3" /> Wifi</div>
                  <div className="text-sm"><span className="text-muted-foreground">Network:</span> {property.wifi_ssid}</div>
                  {property.wifi_password && <div className="text-sm"><span className="text-muted-foreground">Password:</span> <span className="font-mono">{property.wifi_password}</span></div>}
                </div>
              )}
            </div>

            <Button className="w-full h-12" style={{ background: brand, color: "white" }} onClick={() => navigate({ to: "/stay/$slug", params: { slug: property.slug } })}>
              Enter guest hub →
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}

function NavButtons({ brand, onBack, onNext, nextLabel = "Continue", disabled }: { brand: string; onBack: () => void; onNext: () => void; nextLabel?: string; disabled?: boolean }) {
  return (
    <div className="flex gap-2 pt-4">
      <Button variant="outline" onClick={onBack} className="h-12"><ArrowLeft className="h-4 w-4" /></Button>
      <Button onClick={onNext} disabled={disabled} className="flex-1 h-12" style={{ background: brand, color: "white" }}>
        {nextLabel} <ArrowRight className="ml-2 h-4 w-4" />
      </Button>
    </div>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="text-sm">{value}</div>
    </div>
  );
}
