import { describe, it, expect } from "vitest";
import { canAssignProperty, canRemoveAdmin, isValidEmail } from "../org-manage";

describe("canAssignProperty", () => {
  it("allows claiming an unassigned property", () => {
    expect(canAssignProperty({ propertyOrgId: null, targetOrgId: "o1", callerIsStaffOfProperty: false })).toBe(true);
  });
  it("is idempotent when already in the org", () => {
    expect(canAssignProperty({ propertyOrgId: "o1", targetOrgId: "o1", callerIsStaffOfProperty: false })).toBe(true);
  });
  it("blocks stealing another org's property you don't staff", () => {
    expect(canAssignProperty({ propertyOrgId: "o2", targetOrgId: "o1", callerIsStaffOfProperty: false })).toBe(false);
  });
  it("allows moving your own staffed property between orgs", () => {
    expect(canAssignProperty({ propertyOrgId: "o2", targetOrgId: "o1", callerIsStaffOfProperty: true })).toBe(true);
  });
});

describe("canRemoveAdmin", () => {
  it("blocks removing the last admin", () => {
    expect(canRemoveAdmin({ adminCount: 1 })).toBe(false);
    expect(canRemoveAdmin({ adminCount: 2 })).toBe(true);
  });
});

describe("isValidEmail", () => {
  it("accepts a normal address and rejects junk", () => {
    expect(isValidEmail("manager@hotel.com")).toBe(true);
    expect(isValidEmail(" a@b.co ")).toBe(true);
    expect(isValidEmail("nope")).toBe(false);
    expect(isValidEmail("a@b")).toBe(false);
    expect(isValidEmail("")).toBe(false);
  });
});
