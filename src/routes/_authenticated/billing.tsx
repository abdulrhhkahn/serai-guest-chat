import { createFileRoute } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { useQuery } from "@tanstack/react-query";
import { useState, useMemo } from "react";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogClose } from "@/components/ui/dialog";
import { GuestTurnstile } from "@/components/GuestTurnstile";
import { toast } from "sonner";
import {
  X,
  Check,
  Calendar as CalendarIcon,
} from "lucide-react";
import { PLAN_PRICING_PKR, type PlanTier } from "@/lib/billing";

export const Route = createFileRoute("/_authenticated/billing")({
  component: BillingPage,
});

const YEARLY_DISCOUNT_PERCENT = 10;
const ONBOARDING_COST_PKR = 5000;

const TIER_DESCRIPTION: Record<"basic" | PlanTier, string> = {
  basic: "Get started with in app web chat and essential guest messaging.",
  growth: "Reach guests on every channel with smarter AI assistance.",
  pro: "Full automation and multi-property control for growing portfolios.",
};

async function startCheckout(orgId: string, tier: PlanTier) {
  const { data: s } = await supabase.auth.getSession();
  const res = await fetch("/api/admin/checkout", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${s.session?.access_token ?? ""}` },
    body: JSON.stringify({ orgId, tier }),
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json() as Promise<{ url: string }>;
}

function BillingPage() {
  const [redirecting, setRedirecting] = useState<PlanTier | null>(null);
  const [demoFormTier, setDemoFormTier] = useState<PlanTier | null>(null);
  const [billingCycle, setBillingCycle] = useState<"monthly" | "yearly">("monthly");

  // Informational data — which org (if any) does MY property belong to,
  // and what's its current plan. Works for any staff member, regardless
  // of whether they can manage billing.
  const { data: myProperty, isLoading: propertyLoading } = useQuery({
    queryKey: ["current-property"],
    queryFn: async () => {
      const { data: auth } = await supabase.auth.getUser();
      const { data: prof } = await supabase.from("staff_profiles").select("property_id").eq("id", auth.user?.id ?? "").maybeSingle();
      if (!prof?.property_id) return null;
      const { data } = await supabase.from("properties").select("id, organization_id").eq("id", prof.property_id).maybeSingle();
      return data;
    },
  });

  const orgId = myProperty?.organization_id ?? "";

  const { data: subscription, isLoading: subLoading } = useQuery({
    queryKey: ["subscription", orgId],
    enabled: !!orgId,
    queryFn: async () => {
      const { data } = await supabase
        .from("subscriptions").select("*").eq("organization_id", orgId)
        .order("created_at", { ascending: false }).limit(1).maybeSingle();
      return data;
    },
  });

  // Separately: am I actually allowed to manage billing for that org?
  // Gates the Buy Now action only — pricing itself is always visible.
  const { data: canManageBilling, isLoading: adminCheckLoading } = useQuery({
    queryKey: ["is-org-admin", orgId],
    enabled: !!orgId,
    queryFn: async () => {
      const { data: auth } = await supabase.auth.getUser();
      const { data } = await supabase
        .from("org_admins").select("user_id").eq("org_id", orgId).eq("user_id", auth.user?.id ?? "").maybeSingle();
      return !!data;
    },
  });

  const currentTier = (subscription?.plan_tier as PlanTier | "basic") ?? "basic";
  const isActive = subscription?.status === "active";

  async function handleBuyNow(tier: PlanTier) {
    if (!orgId) return;
    setRedirecting(tier);
    try {
      const { url } = await startCheckout(orgId, tier);
      window.location.href = url;
    } catch (e) {
      toast.error(String((e as Error).message));
      setRedirecting(null);
    }
  }

  if (propertyLoading || (!!orgId && (subLoading || adminCheckLoading))) {
    return <div className="p-6 text-sm text-muted-foreground">Loading…</div>;
  }

  const noOrg = !myProperty?.organization_id;

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-8">
      <div className="flex flex-col items-center text-center gap-3">
        <p className="text-sm text-muted-foreground">
          {isActive ? `Current plan: ${PLAN_PRICING_PKR[currentTier as PlanTier]?.label ?? "Basic"}` : "You're on the free Basic plan."}
          {!noOrg && !canManageBilling && " Only your hotel's admin can change plans."}
        </p>

        <div className="inline-flex items-center rounded-full border border-border p-1 bg-muted/40">
          <button
            type="button"
            onClick={() => setBillingCycle("monthly")}
            className={`rounded-full px-4 py-1.5 text-sm font-medium transition ${billingCycle === "monthly" ? "bg-background shadow-sm" : "text-muted-foreground"}`}
          >
            Monthly
          </button>
          <button
            type="button"
            onClick={() => setBillingCycle("yearly")}
            className={`rounded-full px-4 py-1.5 text-sm font-medium transition flex items-center gap-1.5 ${billingCycle === "yearly" ? "bg-background shadow-sm" : "text-muted-foreground"}`}
          >
            Yearly <span className="text-brand">Save {YEARLY_DISCOUNT_PERCENT}%</span>
          </button>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-3 items-stretch">
        <PlanCard tier="basic" isCurrent={noOrg || !isActive} billingCycle={billingCycle} />
        {(["growth", "pro"] as PlanTier[]).map((tier) => (
          <PlanCard
            key={tier}
            tier={tier}
            isCurrent={!noOrg && isActive && currentTier === tier}
            billingCycle={billingCycle}
            onBuyNow={(!noOrg && canManageBilling) || import.meta.env.DEV ? () => handleBuyNow(tier) : undefined}
            onBookDemo={() => setDemoFormTier(tier)}
            redirecting={redirecting === tier}
            restrictedNote={!noOrg && !canManageBilling && !import.meta.env.DEV ? "Ask your hotel's admin to upgrade" : undefined}
          />
        ))}
      </div>

      {/* Buy Now goes straight to Safepay checkout. Book a demo is the
          separate, secondary path — it opens the scheduling form below and
          does NOT touch checkout at all; a human follows up afterward. */}
      {demoFormTier && (
        <BookDemoForm tier={demoFormTier} onClose={() => setDemoFormTier(null)} />
      )}
    </div>
  );
}

// Static per the pricing card mockup — no longer derived from
// PLAN_FEATURES, since the requested wording ("Everything in Basic and…")
// doesn't map cleanly onto individual feature flags anyway.
const TIER_FEATURE_LIST: Record<"basic" | PlanTier, string[]> = {
  basic: [
    "QR code mobile check-in for guests",
    "QR code enabled hotel menu for guests",
    "QR code enabled local tour/activities for guests",
    "Dedicated hotel guest surface",
    "Review and verify guests",
    "AI Concierge - Suggests replies",
    "Channel - In-app web chat",
    "Conversations - 50/month",
    "Email seats - 2",
    "Single property",
    "Offline capabilities and lightweight data load",
    "24/7 chat support",
  ],
  growth: [
    "Everything in Basic and",
    "AI Concierge - Drafts replies",
    "Channel - WhatsApp & SMS",
    "Conversations - Unlimited",
    "Advanced analytics",
    "Weekly analytics report",
    "In-app staff activity tracker",
    "Email seats - 5",
  ],
  pro: [
    "Everything in Growth and",
    "AI Concierge - Auto sends replies",
    "Email seats - Unlimited",
    "Multi-properties",
    "Cross property comparison",
  ],
};

function TickRow({ text, bold }: { text: string; bold?: boolean }) {
  if (bold) {
    return <li className="text-sm font-semibold text-foreground leading-6">{text}</li>;
  }
  return (
    <li className="flex items-start gap-2.5">
      <span className="h-5 w-5 shrink-0 flex items-center justify-center">
        <Check className="h-4 w-4 text-brand" strokeWidth={2.5} />
      </span>
      <span className="text-sm leading-6 text-muted-foreground">
        {text}
      </span>
    </li>
  );
}

// ---- Book a demo: step 1 picks a slot, step 2 is the qualification form ----

const PROPERTY_TYPES = ["Hotel", "Guesthouse", "Bed & Breakfast", "Resort", "Serviced Apartments", "Other"];
const HEARD_ABOUT_OPTIONS = ["Google Search", "Social Media", "Referral", "Industry Event", "Other"];
const TURNSTILE_SITE_KEY = import.meta.env.VITE_TURNSTILE_SITE_KEY as string | undefined;

type Slot = { date: Date; label: string };

// Next 10 weekdays (Mon-Fri), 30-minute slots 9:00 AM - 5:00 PM (last slot 4:30).
function buildAvailableDays(): Date[] {
  const days: Date[] = [];
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + 1); // start tomorrow
  while (days.length < 10) {
    const day = d.getDay();
    if (day >= 1 && day <= 5) days.push(new Date(d));
    d.setDate(d.getDate() + 1);
  }
  return days;
}

function buildSlotsForDay(day: Date): Slot[] {
  const slots: Slot[] = [];
  for (let hour = 9; hour < 17; hour++) {
    for (const minute of [0, 30]) {
      const dt = new Date(day);
      dt.setHours(hour, minute, 0, 0);
      slots.push({ date: dt, label: dt.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }) });
    }
  }
  return slots;
}

function BookDemoForm({ tier, onClose }: { tier: PlanTier; onClose: () => void }) {
  const [step, setStep] = useState<1 | 2>(1);
  const availableDays = useMemo(buildAvailableDays, []);
  const [selectedDay, setSelectedDay] = useState<Date>(availableDays[0]);
  const [selectedSlot, setSelectedSlot] = useState<Slot | null>(null);

  // Which slots are already booked by anyone (any hotel) — fetched via a
  // narrow server route that returns only timestamps, never the other
  // leads' names/emails, since plan_interest_leads itself is admin-only
  // to read directly.
  const { data: takenSlots, refetch: refetchAvailability } = useQuery({
    queryKey: ["demo-availability"],
    queryFn: async (): Promise<Set<number>> => {
      const { data: s } = await supabase.auth.getSession();
      const from = availableDays[0];
      const to = new Date(availableDays[availableDays.length - 1]);
      to.setHours(23, 59, 59, 999);
      const res = await fetch("/api/billing/demo-availability", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${s.session?.access_token ?? ""}` },
        body: JSON.stringify({ from: from.toISOString(), to: to.toISOString() }),
      });
      if (!res.ok) return new Set();
      const body = await res.json();
      return new Set((body.taken as string[]).map((t) => new Date(t).getTime()));
    },
  });

  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [workEmail, setWorkEmail] = useState("");
  const [propertyType, setPropertyType] = useState("");
  const [propertyCount, setPropertyCount] = useState("");
  const [phone, setPhone] = useState("");
  const [heardAbout, setHeardAbout] = useState("");
  const [captchaToken, setCaptchaToken] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const propertyCountNum = Number(propertyCount);
  const isValid =
    firstName.trim() &&
    lastName.trim() &&
    /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(workEmail.trim()) &&
    propertyType &&
    propertyCount.trim() &&
    Number.isFinite(propertyCountNum) &&
    propertyCountNum > 0 &&
    phone.trim() &&
    (!TURNSTILE_SITE_KEY || captchaToken);

  async function submit() {
    if (!isValid || !selectedSlot || submitting) return;
    setSubmitting(true);
    try {
      const { data: auth } = await supabase.auth.getUser();
      const { error } = await supabase.from("plan_interest_leads").insert({
        submitted_by: auth.user?.id,
        plan_tier: tier,
        first_name: firstName.trim(),
        last_name: lastName.trim(),
        work_email: workEmail.trim(),
        property_type: propertyType,
        property_count: propertyCountNum,
        phone: phone.trim(),
        heard_about: heardAbout || null,
        scheduled_at: selectedSlot.date.toISOString(),
      });
      if (error) throw error;
      toast.success(`Meeting scheduled for ${selectedSlot.date.toLocaleDateString([], { weekday: "long", month: "short", day: "numeric" })} at ${selectedSlot.label}.`);
      onClose();
    } catch (e) {
      // 23505 = unique_violation — someone else took this exact slot
      // between it loading and this submit (the race the DB constraint
      // exists to catch). Send them back to pick a different one instead
      // of showing a raw constraint error.
      if (e && typeof e === "object" && "code" in e && (e as { code: string }).code === "23505") {
        toast.error("That slot was just taken — pick another.");
        setSelectedSlot(null);
        setStep(1);
        refetchAvailability();
      } else {
        toast.error(e instanceof Error ? e.message : "Couldn't schedule the meeting");
      }
      setSubmitting(false);
    }
  }

  const daySlots = buildSlotsForDay(selectedDay);

  return (
    <Dialog open onOpenChange={(open) => !open && !submitting && onClose()}>
      <DialogContent className="sm:max-w-lg top-8 translate-y-0 max-h-[85vh] overflow-y-auto" hideClose>
        <DialogClose
          disabled={submitting}
          className="absolute right-6 top-6 opacity-70 hover:opacity-100 disabled:pointer-events-none disabled:opacity-30"
        >
          <X className="h-4 w-4" />
          <span className="sr-only">Close</span>
        </DialogClose>
        <DialogHeader>
          <DialogTitle>Book a demo — {PLAN_PRICING_PKR[tier].label}</DialogTitle>
        </DialogHeader>

        {step === 1 ? (
          <div className="space-y-4">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <CalendarIcon className="h-4 w-4" />
              Pick a 30-minute slot, Monday to Friday, 9 AM–5 PM.
            </div>
            <div className="flex gap-1.5 overflow-x-auto pb-1">
              {availableDays.map((day) => (
                <button
                  key={day.toISOString()}
                  type="button"
                  onClick={() => { setSelectedDay(day); setSelectedSlot(null); }}
                  className={`shrink-0 rounded-md border px-3 py-2 text-xs text-center ${
                    day.toDateString() === selectedDay.toDateString()
                      ? "border-brand bg-brand/10 text-brand"
                      : "border-border text-muted-foreground hover:border-foreground/30"
                  }`}
                >
                  <div className="font-medium">{day.toLocaleDateString([], { weekday: "short" })}</div>
                  <div>{day.toLocaleDateString([], { month: "short", day: "numeric" })}</div>
                </button>
              ))}
            </div>
            <div className="grid grid-cols-4 gap-2">
              {daySlots.map((slot) => {
                const isTaken = takenSlots?.has(slot.date.getTime()) ?? false;
                return (
                  <button
                    key={slot.date.toISOString()}
                    type="button"
                    onClick={() => !isTaken && setSelectedSlot(slot)}
                    disabled={isTaken}
                    title={isTaken ? "Already booked" : undefined}
                    className={`rounded-md border px-2 py-1.5 text-xs ${
                      isTaken
                        ? "border-border text-muted-foreground/50 line-through cursor-not-allowed bg-muted/30"
                        : selectedSlot?.date.getTime() === slot.date.getTime()
                        ? "border-brand bg-brand/10 text-brand"
                        : "border-border hover:border-foreground/30"
                    }`}
                  >
                    {slot.label}
                  </button>
                );
              })}
            </div>
            <DialogFooter className="sm:justify-center">
              <Button onClick={() => setStep(2)} disabled={!selectedSlot}>
                Continue
              </Button>
            </DialogFooter>
          </div>
        ) : (
          <div className="space-y-3">
            <p className="text-xs text-muted-foreground">
              {selectedDay.toLocaleDateString([], { weekday: "long", month: "short", day: "numeric" })} at {selectedSlot?.label} —{" "}
              <button type="button" onClick={() => setStep(1)} className="underline">change</button>
            </p>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs">First name <span className="text-destructive">*</span></Label>
                <Input className="mt-1" value={firstName} onChange={(e) => setFirstName(e.target.value)} disabled={submitting} />
              </div>
              <div>
                <Label className="text-xs">Last name <span className="text-destructive">*</span></Label>
                <Input className="mt-1" value={lastName} onChange={(e) => setLastName(e.target.value)} disabled={submitting} />
              </div>
            </div>
            <div>
              <Label className="text-xs">Work email <span className="text-destructive">*</span></Label>
              <Input className="mt-1" type="email" value={workEmail} onChange={(e) => setWorkEmail(e.target.value)} disabled={submitting} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs">Property type <span className="text-destructive">*</span></Label>
                <Select value={propertyType} onValueChange={setPropertyType} disabled={submitting}>
                  <SelectTrigger className="mt-1"><SelectValue placeholder="Select" /></SelectTrigger>
                  <SelectContent>
                    {PROPERTY_TYPES.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs">Properties (number) <span className="text-destructive">*</span></Label>
                <Input className="mt-1" type="number" min={1} value={propertyCount} onChange={(e) => setPropertyCount(e.target.value)} disabled={submitting} />
              </div>
            </div>
            <div>
              <Label className="text-xs">Phone <span className="text-destructive">*</span></Label>
              <Input className="mt-1" type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} disabled={submitting} />
            </div>
            <div>
              <Label className="text-xs">Where did you hear about us? (optional)</Label>
              <Select value={heardAbout} onValueChange={setHeardAbout} disabled={submitting}>
                <SelectTrigger className="mt-1"><SelectValue placeholder="Select" /></SelectTrigger>
                <SelectContent>
                  {HEARD_ABOUT_OPTIONS.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <GuestTurnstile onToken={setCaptchaToken} />
            <DialogFooter className="sm:justify-center">
              <Button onClick={submit} disabled={!isValid || submitting}>
                {submitting ? "Scheduling…" : "Schedule Meeting"}
              </Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function PlanCard({
  tier,
  isCurrent,
  billingCycle,
  onBuyNow,
  onBookDemo,
  redirecting,
  restrictedNote,
}: {
  tier: "basic" | PlanTier;
  isCurrent: boolean;
  billingCycle: "monthly" | "yearly";
  onBuyNow?: () => void;
  onBookDemo?: () => void;
  redirecting?: boolean;
  restrictedNote?: string;
}) {
  const pricing = tier === "basic" ? null : PLAN_PRICING_PKR[tier];
  const label = pricing?.label ?? "Basic";
  const isPopular = tier === "growth";
  const displayedMonthly = pricing ? (billingCycle === "yearly" ? Math.round(pricing.monthlyPkr * (1 - YEARLY_DISCOUNT_PERCENT / 100)) : pricing.monthlyPkr) : null;

  return (
    <Card className={`relative h-full flex flex-col ${tier === "growth" ? "border-primary" : ""}`}>
      {isPopular && (
        <div className="absolute -top-3 left-1/2 -translate-x-1/2">
          <span className="rounded-full bg-brand text-brand-foreground text-xs font-medium px-3 py-1 whitespace-nowrap">
            Most popular
          </span>
        </div>
      )}
      <CardHeader className="space-y-1">
        <div>
          <p className="text-3xl font-bold">
            {displayedMonthly !== null ? `PKR ${displayedMonthly.toLocaleString()}` : "Free"}
            {pricing ? (
              <span className="text-sm font-normal text-muted-foreground">/mo</span>
            ) : (
              <span className="text-sm font-normal text-muted-foreground"> / Onboarding fees PKR {ONBOARDING_COST_PKR.toLocaleString()}</span>
            )}
          </p>
          {pricing && billingCycle === "yearly" && (
            <p className="text-xs text-muted-foreground mt-0.5">Billed annually — save {YEARLY_DISCOUNT_PERCENT}%</p>
          )}
        </div>
        <p className="text-brand font-medium">{label}</p>
        <p className="text-sm text-muted-foreground">{TIER_DESCRIPTION[tier]}</p>
      </CardHeader>

      <div className="border-t border-border" />

      <CardContent className="flex flex-col flex-1 pt-4">
        <ul className="space-y-3 flex-1">
          {TIER_FEATURE_LIST[tier].map((text, i) => (
            <TickRow key={i} text={text} bold={i === 0 && tier !== "basic"} />
          ))}
        </ul>

        <div className="mt-6 space-y-2">
          {onBuyNow && !isCurrent ? (
            <Button className="w-full" onClick={onBuyNow} disabled={redirecting}>
              {redirecting ? "Redirecting…" : "Buy Now"}
            </Button>
          ) : (
            <Button className="w-full" variant={isCurrent ? "outline" : "default"} disabled>
              {isCurrent ? "Current plan" : "Buy Now"}
            </Button>
          )}
          {!isCurrent && (
            <p className="text-center text-xs text-muted-foreground">
              {restrictedNote ?? (onBookDemo ? (
                <>or <button type="button" onClick={onBookDemo} className="underline">book a demo</button></>
              ) : null)}
            </p>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
