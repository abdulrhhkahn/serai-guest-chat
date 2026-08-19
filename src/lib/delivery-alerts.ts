// Pure helper (no imports): turn recent outbound delivery statuses into
// dashboard-level alerts, so repeated failures surface as a banner rather than
// hiding one-per-message in the inbox.

export type DeliveryRow = {
  conversation_id: string | null;
  delivery_status: string | null;
  created_at: string; // ISO
};

export type DeliveryAlert = {
  severity: "warning" | "critical";
  title: string;
  detail: string;
  failedConversationIds: string[];
};

const FAILED = new Set(["failed", "undelivered"]);

export type AlertOptions = {
  now?: number;            // ms epoch, for tests
  windowHours?: number;    // look-back window (default 24)
  minFailures?: number;    // minimum failures to alert (default 3)
  rateThreshold?: number;  // failure share (0–1) that escalates to critical (default 0.3)
  repeatPerConversation?: number; // failures in one thread that flag a bad number (default 2)
};

/**
 * Returns 0–2 alerts:
 *  - a volume/rate alert when outbound failures in the window cross the floor,
 *    escalating to "critical" if the failure share is high;
 *  - a "likely bad number" alert listing conversations that failed repeatedly.
 * Only failed/undelivered count as failures; sent/delivered/queued are fine.
 */
export function deliveryAlerts(rows: DeliveryRow[], opts: AlertOptions = {}): DeliveryAlert[] {
  const now = opts.now ?? Date.now();
  const windowMs = (opts.windowHours ?? 24) * 3_600_000;
  const minFailures = opts.minFailures ?? 3;
  const rateThreshold = opts.rateThreshold ?? 0.3;
  const repeatPer = opts.repeatPerConversation ?? 2;

  const recent = rows.filter((r) => r.delivery_status && now - Date.parse(r.created_at) <= windowMs);
  const outbound = recent.filter((r) => r.delivery_status !== "queued" && r.delivery_status !== "sending");
  const failures = recent.filter((r) => FAILED.has(r.delivery_status!));

  const alerts: DeliveryAlert[] = [];

  if (failures.length >= minFailures) {
    const rate = outbound.length ? failures.length / outbound.length : 0;
    const critical = rate >= rateThreshold;
    alerts.push({
      severity: critical ? "critical" : "warning",
      title: `${failures.length} message${failures.length === 1 ? "" : "s"} failed to deliver`,
      detail: `${Math.round(rate * 100)}% of outbound messages in the last ${opts.windowHours ?? 24}h didn't reach guests${critical ? " — check your Twilio account or number status." : "."}`,
      failedConversationIds: unique(failures.map((f) => f.conversation_id).filter(Boolean) as string[]),
    });
  }

  // Repeated failures to the same conversation → probably a bad/unreachable number.
  const perConv = new Map<string, number>();
  for (const f of failures) if (f.conversation_id) perConv.set(f.conversation_id, (perConv.get(f.conversation_id) ?? 0) + 1);
  const badThreads = [...perConv.entries()].filter(([, n]) => n >= repeatPer).map(([id]) => id);
  if (badThreads.length) {
    alerts.push({
      severity: "warning",
      title: `${badThreads.length} conversation${badThreads.length === 1 ? "" : "s"} repeatedly failing`,
      detail: "Messages keep bouncing — the guest's number may be wrong or unreachable.",
      failedConversationIds: badThreads,
    });
  }

  return alerts;
}

function unique<T>(arr: T[]): T[] {
  return Array.from(new Set(arr));
}
