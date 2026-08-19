import { describe, it, expect } from "vitest";
import { buildOnboarding, type OnboardingState } from "../onboarding";

const base: OnboardingState = {
  detailsComplete: false,
  faqCount: 0,
  autonomyTouched: false,
  messagingCount: 0,
  checkinCount: 0,
};

describe("buildOnboarding", () => {
  it("marks nothing done for a fresh property", () => {
    const r = buildOnboarding(base);
    expect(r.requiredDone).toBe(0);
    expect(r.allRequiredDone).toBe(false);
    expect(r.steps.every((s) => !s.done)).toBe(true);
  });

  it("requires at least 3 FAQs for the knowledge step", () => {
    expect(buildOnboarding({ ...base, faqCount: 2 }).steps.find((s) => s.key === "knowledge")!.done).toBe(false);
    expect(buildOnboarding({ ...base, faqCount: 3 }).steps.find((s) => s.key === "knowledge")!.done).toBe(true);
  });

  it("treats messaging as optional and excludes it from required totals", () => {
    const r = buildOnboarding(base);
    expect(r.steps.find((s) => s.key === "messaging")!.optional).toBe(true);
    expect(r.requiredTotal).toBe(4);
  });

  it("is fully done when all required steps pass, even without messaging", () => {
    const r = buildOnboarding({
      detailsComplete: true, faqCount: 5, autonomyTouched: true, messagingCount: 0, checkinCount: 2,
    });
    expect(r.allRequiredDone).toBe(true);
    expect(r.requiredDone).toBe(4);
  });

  it("counts partial progress", () => {
    const r = buildOnboarding({ ...base, detailsComplete: true, faqCount: 3 });
    expect(r.requiredDone).toBe(2);
    expect(r.allRequiredDone).toBe(false);
  });
});
