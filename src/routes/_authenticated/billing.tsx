import { createFileRoute } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
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
} from "lucide-react";
import { PLAN_FEATURES, PLAN_PRICING_PKR, type PlanTier } from "@/lib/billing";

export const Route = createFileRoute("/_authenticated/billing")({
  component: BillingPage,
});

// TODO: replace with your real sales contact.
const SALES_EMAIL = "sales@serai.app";
const salesMailto = (tier: string) =>
  `mailto:${SALES_EMAIL}?subject=${encodeURIComponent(`Serai ${tier} plan — question before subscribing`)}`;

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
  // Gates the Subscribe action only — pricing itself is always visible.
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
            onSubscribe={!noOrg && canManageBilling ? () => handleSubscribe(tier) : undefined}
            redirecting={redirecting === tier}
            restrictedNote={!noOrg && !canManageBilling ? "Ask your hotel's admin to upgrade" : undefined}
          />
        ))}
      </div>
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
} as const;

function FeatureRow({ icon, label, value }: { icon: keyof typeof FEATURE_ICON; label: string; value: string }) {
  const IconComp = FEATURE_ICON[icon];
  return (
    <li className="flex items-start gap-2.5">
      <IconComp className="h-4 w-4 text-brand shrink-0 mt-0.5" />
      <span className="text-sm text-muted-foreground">
        <span className="font-medium text-foreground">{label} — </span>
        {value}
      </span>
    </li>
  );
}

function PlanCard({
  tier,
  isCurrent,
  onSubscribe,
  redirecting,
  restrictedNote,
}: {
  tier: "basic" | PlanTier;
  isCurrent: boolean;
  onSubscribe?: () => void;
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
              {restrictedNote ?? <>or <a href={salesMailto(label)} className="underline">contact sales</a></>}
            </p>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
