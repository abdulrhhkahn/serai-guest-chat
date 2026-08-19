// Pure helper (no imports): build a property onboarding checklist from detected
// setup state, so the dashboard can show what's left and hide itself once live.

export type OnboardingState = {
  detailsComplete: boolean; // core property fields filled
  faqCount: number;
  autonomyTouched: boolean; // an autonomy rule set or the default changed
  messagingCount: number;
  checkinCount: number; // a guest has used the check-in link
};

export type OnboardingStep = {
  key: string;
  label: string;
  hint: string;
  to: string;        // route to complete it
  done: boolean;
  optional: boolean;
};

const MIN_FAQS = 3;

export function buildOnboarding(s: OnboardingState): {
  steps: OnboardingStep[];
  requiredDone: number;
  requiredTotal: number;
  allRequiredDone: boolean;
} {
  const steps: OnboardingStep[] = [
    {
      key: "details",
      label: "Add your property details",
      hint: "Name, check-in/out times, wifi and address power the concierge's answers.",
      to: "/settings",
      done: s.detailsComplete,
      optional: false,
    },
    {
      key: "knowledge",
      label: "Seed your knowledge base",
      hint: s.faqCount > 0 ? `${s.faqCount}/${MIN_FAQS} FAQs added` : `Add at least ${MIN_FAQS} FAQs the AI can answer from.`,
      to: "/knowledge",
      done: s.faqCount >= MIN_FAQS,
      optional: false,
    },
    {
      key: "autonomy",
      label: "Set how much the AI can do",
      hint: "Choose auto-send, staff-approve, or suggest — per topic.",
      to: "/settings",
      done: s.autonomyTouched,
      optional: false,
    },
    {
      key: "share",
      label: "Share your check-in link",
      hint: s.checkinCount > 0 ? "Guests are checking in." : "Print the QR or send the link so guests can start.",
      to: "/checkin/$slug",
      done: s.checkinCount > 0,
      optional: false,
    },
    {
      key: "messaging",
      label: "Connect SMS / WhatsApp (optional)",
      hint: s.messagingCount > 0 ? "Connected." : "Let guests reach you by text, not just web chat.",
      to: "/settings",
      done: s.messagingCount > 0,
      optional: true,
    },
  ];

  const required = steps.filter((st) => !st.optional);
  const requiredDone = required.filter((st) => st.done).length;
  return {
    steps,
    requiredDone,
    requiredTotal: required.length,
    allRequiredDone: requiredDone === required.length,
  };
}
