// Pure guards (no imports) for org management. Kept separate so the sensitive
// rules are unit-tested and identical between the server route and the UI.

/**
 * A property may be pulled into the caller's org only if it isn't already owned
 * by a *different* org (unassigned), or the caller is staff of it. This prevents
 * an org admin from stealing another org's property to read its data.
 */
export function canAssignProperty(opts: { propertyOrgId: string | null; targetOrgId: string; callerIsStaffOfProperty: boolean }): boolean {
  if (opts.propertyOrgId === opts.targetOrgId) return true; // already there — idempotent
  if (opts.propertyOrgId == null) return true;              // unassigned — free to claim
  return opts.callerIsStaffOfProperty;                      // reassigning: only your own property
}

/** Don't let the org be left with no admins. */
export function canRemoveAdmin(opts: { adminCount: number }): boolean {
  return opts.adminCount > 1;
}

/** Light email validation for the add-admin form. */
export function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test((email ?? "").trim());
}
