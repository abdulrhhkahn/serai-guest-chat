import { createFileRoute } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { CreditCard } from "lucide-react";
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

  const currentTier = (subscription?.plan_tier as PlanTier | "starter") ?? "starter";
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

  // A property with no organisation at all (only the demo property, in
  // practice) has nothing to subscribe — there's no admin to ask either,
  // since there's no org for one to exist in.
  if (!myProperty?.organization_id) {
    return (
      <div className="p-6 max-w-2xl space-y-6">
        <div className="flex items-center gap-2">
          <CreditCard className="h-6 w-6" />
          <h1 className="font-serif text-3xl">Billing</h1>
        </div>
        <p className="text-sm text-muted-foreground">
          This property isn't linked to an organisation yet, so it can't subscribe to a paid plan.
        </p>
        <div className="grid gap-4 sm:grid-cols-3 items-start">
          <PlanCard tier="starter" isCurrent />
          {(["growth", "pro"] as PlanTier[]).map((tier) => <PlanCard key={tier} tier={tier} isCurrent={false} />)}
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-3xl space-y-6">
      <div className="flex items-center gap-2">
        <CreditCard className="h-6 w-6" />
        <h1 className="font-serif text-3xl">Billing</h1>
      </div>
      <p className="text-sm text-muted-foreground">
        {isActive ? `Current plan: ${PLAN_PRICING_PKR[currentTier as PlanTier]?.label ?? "Starter"}` : "You're on the free Starter plan."}
        {!canManageBilling && " Only your hotel's admin can change plans."}
      </p>

      <div className="grid gap-4 sm:grid-cols-3 items-start">
        <PlanCard tier="starter" isCurrent={!isActive} />
        {(["growth", "pro"] as PlanTier[]).map((tier) => (
          <PlanCard
            key={tier}
            tier={tier}
            isCurrent={isActive && currentTier === tier}
            onSubscribe={canManageBilling ? () => handleSubscribe(tier) : undefined}
            redirecting={redirecting === tier}
            restrictedNote={canManageBilling ? undefined : "Ask your hotel's admin to upgrade"}
          />
        ))}
      </div>
    </div>
  );
}

function PlanCard({
  tier,
  isCurrent,
  onSubscribe,
  redirecting,
  restrictedNote,
}: {
  tier: "starter" | PlanTier;
  isCurrent: boolean;
  onSubscribe?: () => void;
  redirecting?: boolean;
  restrictedNote?: string;
}) {
  const features = PLAN_FEATURES[tier];
  const pricing = tier === "starter" ? null : PLAN_PRICING_PKR[tier];
  const label = pricing?.label ?? "Starter";

  return (
    <Card className={isCurrent ? "border-primary" : undefined}>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle>{label}</CardTitle>
          {isCurrent && <Badge>Current</Badge>}
        </div>
        <p className="text-2xl font-semibold">
          {pricing ? `PKR ${pricing.monthlyPkr.toLocaleString()}/mo` : "Free"}
        </p>
        {pricing && <p className="text-xs text-muted-foreground">per property, billed monthly</p>}
      </CardHeader>
      <CardContent className="space-y-4">
        <ul className="text-sm space-y-2.5 text-muted-foreground">
          <li>
            <span className="font-medium text-foreground">Channels — </span>
            {features.channels.map((c) => (c === "web" ? "Web chat" : c === "sms" ? "SMS" : "WhatsApp")).join(", ")}
          </li>
          <li>
            <span className="font-medium text-foreground">AI behaviour — </span>
            {AUTONOMY_COPY[features.aiAutonomy]}
          </li>
          <li>
            <span className="font-medium text-foreground">Conversations/month — </span>
            {features.maxConversationsPerMonth ?? "Unlimited"}
          </li>
          <li>
            <span className="font-medium text-foreground">Analytics — </span>
            {features.analytics ? "Reply mix, containment, wait times, CSAT" : "Not included"}
          </li>
          <li>
            <span className="font-medium text-foreground">Weekly email digest — </span>
            {features.weeklyDigest ? "Included" : "Not included"}
          </li>
          <li>
            <span className="font-medium text-foreground">Multi-property — </span>
            {features.orgRollup ? "Add properties, cross-property comparison" : "Single property"}
          </li>
        </ul>

        {onSubscribe && !isCurrent && (
          <div className="space-y-2">
            <Button className="w-full" onClick={onSubscribe} disabled={redirecting}>
              {redirecting ? "Redirecting…" : "Subscribe"}
            </Button>
            <p className="text-center text-xs text-muted-foreground">
              or <a href={salesMailto(label)} className="underline">contact sales</a>
            </p>
          </div>
        )}
        {!onSubscribe && !isCurrent && restrictedNote && (
          <p className="text-center text-xs text-muted-foreground">{restrictedNote}</p>
        )}
      </CardContent>
    </Card>
  );
}
