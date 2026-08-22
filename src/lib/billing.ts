export type PlanTier = "growth" | "pro"; // Basic stays free/unbilled

// Create these in the Safepay dashboard (Developer > Plans) first, then
// paste the real plan_xxx IDs here.
export const PLAN_PRICING_PKR: Record<PlanTier, { label: string; monthlyPkr: number; planId: string }> = {
  growth: { label: "Growth", monthlyPkr: 12_999, planId: "plan_growth_pkr" },
  pro: { label: "Pro", monthlyPkr: 27_999, planId: "plan_pro_pkr" },
};

export function tierFromPlanId(planId: string): PlanTier {
  const entry = Object.entries(PLAN_PRICING_PKR).find(([, v]) => v.planId === planId);
  if (!entry) throw new Error(`Unknown Safepay plan id: ${planId}`);
  return entry[0] as PlanTier;
}

export const PLAN_FEATURES: Record<
  "basic" | PlanTier,
  {
    channels: ("web" | "sms" | "whatsapp")[];
    aiAutonomy: "suggest" | "approve_all" | "auto";
    analytics: boolean;
    weeklyDigest: boolean;
    orgRollup: boolean;
    maxConversationsPerMonth: number | null;
    maxStaff: number | null;
    mobileCheckin: boolean;
  }
> = {
  basic: {
    channels: ["web"],
    aiAutonomy: "suggest",
    analytics: false,
    weeklyDigest: false,
    orgRollup: false,
    maxConversationsPerMonth: 25,
    maxStaff: 2,
    mobileCheckin: true,
  },
  growth: {
    channels: ["web", "sms", "whatsapp"],
    aiAutonomy: "approve_all",
    analytics: true,
    weeklyDigest: true,
    orgRollup: false,
    maxConversationsPerMonth: 50,
    maxStaff: 5,
    mobileCheckin: true,
  },
  pro: {
    channels: ["web", "sms", "whatsapp"],
    aiAutonomy: "auto",
    analytics: true,
    weeklyDigest: true,
    orgRollup: true,
    maxConversationsPerMonth: null,
    maxStaff: null,
    mobileCheckin: true,
  },
};
