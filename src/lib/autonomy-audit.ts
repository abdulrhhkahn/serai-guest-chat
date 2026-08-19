// Pure helpers (no imports) for the autonomy config-change audit.

export type AuditEntry = {
  category: string | null;
  old_level: string | null;
  new_level: string;
  created_at: string;
  changed_by?: string | null;
};

/** "Wifi: approve → auto", "Billing: set to approve", "Parking: removed (→ default)", "Default: auto → approve". */
export function formatChange(e: AuditEntry): string {
  const subject = e.category ? cap(e.category) : "Default";
  if (e.new_level === "default") return `${subject}: removed (→ default)`;
  if (!e.old_level) return `${subject}: set to ${e.new_level}`;
  return `${subject}: ${e.old_level} → ${e.new_level}`;
}

/** True when this change turned something on to full auto-send. */
export function isGraduationToAuto(e: AuditEntry): boolean {
  return e.new_level === "auto" && e.old_level !== "auto";
}

/**
 * The set of day-buckets (via dateKey) on which something graduated to auto —
 * used to mark the containment-over-time chart where trust was extended.
 */
export function graduationDateSet(audit: AuditEntry[], dateKey: (iso: string) => string): Set<string> {
  const out = new Set<string>();
  for (const e of audit) if (isGraduationToAuto(e)) out.add(dateKey(e.created_at));
  return out;
}

function cap(s: string): string {
  return s.length ? s[0].toUpperCase() + s.slice(1) : s;
}
