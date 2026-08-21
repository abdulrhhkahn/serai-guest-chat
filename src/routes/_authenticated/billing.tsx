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

  // Same "which org does the current user administer" pattern as organization.tsx.
  const { data: org, isLoading } = useQuery({
    queryKey: ["my-org"],
    queryFn: async () => {
      const { data: auth } = await supabase.auth.getUser();
      const uid = auth.user?.id;
      if (!uid) return null;
      const { data: mem } = await supabase.from("org_admins").select("org_id").eq("user_id", uid).limit(1).maybeSingle();
      if (!mem) return null;
      const { data: o } = await supabase.from("organizations").select("id, name").eq("id", mem.org_id).maybeSingle();
      return o;
    },
  });

  const orgId = org?.id ?? "";

  const { data: subscription } = useQuery({
    queryKey: ["subscription", orgId],
    enabled: !!orgId,
    queryFn: async () => {
      const { data } = await supabase
        .from("subscriptions").select("*").eq("organization_id", orgId)
        .order("created_at", { ascending: false }).limit(1).maybeSingle();
      return data;
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

  if (isLoading) return <div className="p-6 text-sm text-muted-foreground">Loading…</div>;
  if (!org) {
    return (
      <div className="p-6 max-w-2xl">
        <h1 className="font-serif text-3xl mb-2">Billing</h1>
        <p className="text-sm text-muted-foreground">You don't administer an organisation. Ask your account owner to add you as an org admin.</p>
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
      </p>

      <div className="grid gap-4 sm:grid-cols-3 items-start">
        <PlanCard tier="starter" isCurrent={!isActive} />
        {(["growth", "pro"] as PlanTier[]).map((tier) => (
          <PlanCard
            key={tier}
            tier={tier}
            isCurrent={isActive && currentTier === tier}
            onSubscribe={() => handleSubscribe(tier)}
            redirecting={redirecting === tier}
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
}: {
  tier: "starter" | PlanTier;
  isCurrent: boolean;
  onSubscribe?: () => void;
  redirecting?: boolean;
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
      </CardContent>
    </Card>
  );
}
