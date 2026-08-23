import { createFileRoute } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogClose } from "@/components/ui/dialog";
import { GuestTurnstile } from "@/components/GuestTurnstile";
import { toast } from "sonner";
import {
  DollarSign,
  MessageSquare,
  Bot,
  BarChart3,
  LineChart,
  Mail,
  Building2,
  QrCode,
  X,
  Users,
  UserCheck,
} from "lucide-react";
import { PLAN_FEATURES, PLAN_PRICING_PKR, type PlanTier } from "@/lib/billing";

export const Route = createFileRoute("/_authenticated/billing")({
  component: BillingPage,
});

const AUTONOMY_COPY: Record<string, string> = {
  suggest: "AI suggests replies, staff sends every message",
  approve_all: "AI drafts replies, staff approves before sending",
  auto: "AI auto-sends on trusted topics, staff handles the rest",
};

const TIER_DESCRIPTION: Record<"basic" | PlanTier, string> = {
  basic: "Get started with in app web chat and essential guest messaging.",
  growth: "Reach guests on every channel with smarter AI assistance.",
  pro: "Full automation and multi-property control for growing portfolios.",
};

async function startCheckout(orgId: string, tier: PlanTier) {
  const { data: s } = await supabase.auth.getSession();
  const res = await fetch("/api/billing/checkout", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${s.session?.access_token ?? ""}` },
    body: JSON.stringify({ orgId, tier }),
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json() as Promise<{ url: string }>;
}

function BillingPage() {
  const [redirecting, setRedirecting] = useState<PlanTier | null>(null);
  const [leadFormTier, setLeadFormTier] = useState<PlanTier | null>(null);

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
  // Gates the Subscribe/Buy now actions only — pricing itself is always
  // visible.
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

  async function handleSubscribe(tier: PlanTier) {
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
      <div className="flex flex-col items-center text-center gap-2">
        <div className="h-10 w-10 rounded-full border border-border flex items-center justify-center">
          <DollarSign className="h-5 w-5 text-brand" />
        </div>
        <p className="text-xs font-medium tracking-widest uppercase text-muted-foreground">Pricing</p>
        <h1 className="font-serif text-3xl sm:text-4xl">Choose the Perfect Plan for Your Needs</h1>
        <p className="text-sm text-muted-foreground mt-1">
          {isActive ? `Current plan: ${PLAN_PRICING_PKR[currentTier as PlanTier]?.label ?? "Basic"}` : "You're on the free Basic plan."}
          {!noOrg && !canManageBilling && " Only your hotel's admin can change plans."}
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-3 items-stretch">
        <PlanCard tier="basic" isCurrent={noOrg || !isActive} />
        {(["growth", "pro"] as PlanTier[]).map((tier) => (
          <PlanCard
            key={tier}
            tier={tier}
            isCurrent={!noOrg && isActive && currentTier === tier}
            onSubscribe={!noOrg && canManageBilling ? () => setLeadFormTier(tier) : undefined}
            onBuyNow={!noOrg && canManageBilling ? () => handleSubscribe(tier) : undefined}
            redirecting={redirecting === tier}
            restrictedNote={!noOrg && !canManageBilling ? "Ask your hotel's admin to upgrade" : undefined}
          />
        ))}
      </div>

      {/* Subscribe just captures the lead and closes — it does NOT proceed
          to checkout on its own. "or buy now" on the card is the only path
          that goes straight to Safepay. */}
      {leadFormTier && orgId && (
        <SubscribeLeadForm tier={leadFormTier} onClose={() => setLeadFormTier(null)} />
      )}
    </div>
  );
}

const FEATURE_ICON = {
  channels: MessageSquare,
  ai: Bot,
  conversations: BarChart3,
  analytics: LineChart,
  digest: Mail,
  multiProperty: Building2,
  checkin: QrCode,
  seats: Users,
  verify: UserCheck,
} as const;

function FeatureRow({ icon, label, value }: { icon: keyof typeof FEATURE_ICON; label: string; value?: string }) {
  const IconComp = FEATURE_ICON[icon];
  return (
    <li className="flex items-start gap-2.5">
      <IconComp className="h-4 w-4 text-brand shrink-0 mt-0.5" />
      <span className="text-sm text-muted-foreground">
        {value ? (
          <>
            <span className="font-medium text-foreground">{label} — </span>
            {value}
          </>
        ) : (
          <span className="font-medium text-foreground">{label}</span>
        )}
      </span>
    </li>
  );
}

const PROPERTY_TYPES = ["Hotel", "Guesthouse", "Bed & Breakfast", "Resort", "Serviced Apartments", "Other"];
const HEARD_ABOUT_OPTIONS = ["Google Search", "Social Media", "Referral", "Industry Event", "Other"];
const TURNSTILE_SITE_KEY = import.meta.env.VITE_TURNSTILE_SITE_KEY as string | undefined;

function SubscribeLeadForm({
  tier,
  onClose,
}: {
  tier: PlanTier;
  onClose: () => void;
}) {
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

  // Submitting is the entire action — it saves the lead and closes the
  // dialog. It deliberately does NOT continue on to Safepay checkout;
  // "or buy now" on the card is the only path that does that.
  //
  // While submitting: every field, the Select triggers, the top-right
  // close X, and backdrop-click/Escape (all via onOpenChange below,
  // since Radix's built-in Close button routes through it too) are
  // disabled — no way to edit or close mid-flight and leave a
  // half-finished insert.
  async function submit() {
    if (!isValid || submitting) return;
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
      });
      if (error) throw error;
      toast.success("Thanks — we'll be in touch shortly.");
      onClose();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't submit the form");
      setSubmitting(false);
    }
  }

  return (
    <Dialog open onOpenChange={(open) => !open && !submitting && onClose()}>
      <DialogContent className="sm:max-w-md relative" hideClose>
        <DialogClose
          disabled={submitting}
          className="absolute right-6 top-6 opacity-70 hover:opacity-100 disabled:pointer-events-none disabled:opacity-30"
        >
          <X className="h-4 w-4" />
          <span className="sr-only">Close</span>
        </DialogClose>
        <DialogHeader>
          <DialogTitle>Subscribe to {PLAN_PRICING_PKR[tier].label}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
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
        </div>
        <DialogFooter className="sm:justify-center">
          <Button onClick={submit} disabled={!isValid || submitting}>
            {submitting ? "Submitting…" : "Submit"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function PlanCard({
  tier,
  isCurrent,
  onSubscribe,
  onBuyNow,
  redirecting,
  restrictedNote,
}: {
  tier: "basic" | PlanTier;
  isCurrent: boolean;
  onSubscribe?: () => void;
  onBuyNow?: () => void;
  redirecting?: boolean;
  restrictedNote?: string;
}) {
  const features = PLAN_FEATURES[tier];
  const pricing = tier === "basic" ? null : PLAN_PRICING_PKR[tier];
  const label = pricing?.label ?? "Basic";
  const isPopular = tier === "growth";

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
        <div className="flex items-start justify-between gap-2">
          <p className="text-3xl font-bold">
            {pricing ? `PKR ${pricing.monthlyPkr.toLocaleString()}` : "Free"}
            {pricing && <span className="text-sm font-normal text-muted-foreground">/mo</span>}
          </p>
          {isCurrent && <Badge>Current</Badge>}
        </div>
        <p className="text-brand font-medium">{label}</p>
        <p className="text-sm text-muted-foreground">{TIER_DESCRIPTION[tier]}</p>
      </CardHeader>

      <div className="border-t border-border" />

      <CardContent className="flex flex-col flex-1 pt-5">
        <ul className="space-y-3 flex-1">
          <FeatureRow icon="checkin" label="Mobile check-in" value="QR code check-in for guests" />
          <FeatureRow icon="verify" label="Review and verify guest arrivals" />
          <FeatureRow
            icon="channels"
            label="Channels"
            value={features.channels.map((c) => (c === "web" ? "In app web chat" : c === "sms" ? "SMS" : "WhatsApp")).join(", ")}
          />
          <FeatureRow icon="ai" label="AI behaviour" value={AUTONOMY_COPY[features.aiAutonomy]} />
          <FeatureRow
            icon="conversations"
            label="Conversations/month"
            value={features.maxConversationsPerMonth ? String(features.maxConversationsPerMonth) : "Unlimited"}
          />
          <FeatureRow
            icon="seats"
            label="Email seats"
            value={features.maxStaff ? String(features.maxStaff) : "Unlimited"}
          />
          <FeatureRow icon="analytics" label="Analytics" value={features.analytics ? "Reply mix, containment, wait times, CSAT" : "Not included"} />
          <FeatureRow icon="digest" label="Weekly email digest" value={features.weeklyDigest ? "Included" : "Not included"} />
          <FeatureRow
            icon="multiProperty"
            label={features.orgRollup ? "Multi-property" : "Property type"}
            value={features.orgRollup ? "Add properties, cross-property comparison" : "Single property"}
          />
        </ul>

        <div className="mt-6 space-y-2">
          {onSubscribe && !isCurrent ? (
            <Button className="w-full" onClick={onSubscribe} disabled={redirecting}>
              {redirecting ? "Redirecting…" : "Subscribe"}
            </Button>
          ) : (
            <Button className="w-full" variant={isCurrent ? "outline" : "default"} disabled>
              {isCurrent ? "Current plan" : "Subscribe"}
            </Button>
          )}
          {!isCurrent && (
            <p className="text-center text-xs text-muted-foreground">
              {restrictedNote ?? (onBuyNow ? (
                <>or <button type="button" onClick={onBuyNow} disabled={redirecting} className="underline">buy now</button></>
              ) : null)}
            </p>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
