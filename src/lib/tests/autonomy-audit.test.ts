import { describe, it, expect } from "vitest";
import { formatChange, isGraduationToAuto, graduationDateSet } from "../autonomy-audit";

describe("formatChange", () => {
  it("shows a category level transition", () => {
    expect(formatChange({ category: "wifi", old_level: "approve", new_level: "auto", created_at: "" }))
      .toBe("Wifi: approve → auto");
  });
  it("shows a first-time set (no old level)", () => {
    expect(formatChange({ category: "billing", old_level: null, new_level: "approve", created_at: "" }))
      .toBe("Billing: set to approve");
  });
  it("shows a removed override", () => {
    expect(formatChange({ category: "parking", old_level: "auto", new_level: "default", created_at: "" }))
      .toBe("Parking: removed (→ default)");
  });
  it("labels the property default change", () => {
    expect(formatChange({ category: null, old_level: "auto", new_level: "approve", created_at: "" }))
      .toBe("Default: auto → approve");
  });
});

describe("isGraduationToAuto", () => {
  it("is true only when moving to auto from something else", () => {
    expect(isGraduationToAuto({ category: "wifi", old_level: "approve", new_level: "auto", created_at: "" })).toBe(true);
    expect(isGraduationToAuto({ category: "wifi", old_level: null, new_level: "auto", created_at: "" })).toBe(true);
    expect(isGraduationToAuto({ category: "wifi", old_level: "auto", new_level: "auto", created_at: "" })).toBe(false);
    expect(isGraduationToAuto({ category: "wifi", old_level: "auto", new_level: "approve", created_at: "" })).toBe(false);
  });
});

describe("graduationDateSet", () => {
  const key = (iso: string) => iso.slice(0, 10);
  it("collects day buckets where something graduated to auto", () => {
    const audit = [
      { category: "wifi", old_level: "approve", new_level: "auto", created_at: "2026-08-02T10:00:00Z" },
      { category: "billing", old_level: "approve", new_level: "suggest", created_at: "2026-08-03T10:00:00Z" },
      { category: "parking", old_level: null, new_level: "auto", created_at: "2026-08-05T09:00:00Z" },
    ];
    expect(graduationDateSet(audit, key)).toEqual(new Set(["2026-08-02", "2026-08-05"]));
  });
});
