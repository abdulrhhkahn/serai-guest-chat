import { describe, it, expect } from "vitest";
import { deliveryAlerts } from "../delivery-alerts";

const NOW = Date.parse("2026-08-14T12:00:00Z");
const ago = (mins: number) => new Date(NOW - mins * 60_000).toISOString();

describe("deliveryAlerts", () => {
  it("returns no alerts below the failure floor", () => {
    const rows = [
      { conversation_id: "a", delivery_status: "failed", created_at: ago(10) },
      { conversation_id: "b", delivery_status: "delivered", created_at: ago(10) },
    ];
    expect(deliveryAlerts(rows, { now: NOW })).toEqual([]);
  });

  it("raises a warning once failures cross the floor", () => {
    const rows = [
      { conversation_id: "a", delivery_status: "failed", created_at: ago(5) },
      { conversation_id: "b", delivery_status: "failed", created_at: ago(6) },
      { conversation_id: "c", delivery_status: "failed", created_at: ago(7) },
      ...Array.from({ length: 20 }, (_, i) => ({ conversation_id: `d${i}`, delivery_status: "delivered", created_at: ago(8) })),
    ];
    const alerts = deliveryAlerts(rows, { now: NOW });
    expect(alerts.length).toBeGreaterThanOrEqual(1);
    expect(alerts[0].severity).toBe("warning"); // 3/23 ≈ 13% < 30%
    expect(alerts[0].title).toMatch(/3 messages failed/);
  });

  it("escalates to critical when the failure rate is high", () => {
    const rows = [
      { conversation_id: "a", delivery_status: "failed", created_at: ago(1) },
      { conversation_id: "b", delivery_status: "failed", created_at: ago(2) },
      { conversation_id: "c", delivery_status: "failed", created_at: ago(3) },
      { conversation_id: "d", delivery_status: "delivered", created_at: ago(4) },
    ];
    const alert = deliveryAlerts(rows, { now: NOW })[0];
    expect(alert.severity).toBe("critical"); // 3/4 = 75%
  });

  it("flags a conversation that fails repeatedly (bad number)", () => {
    const rows = [
      { conversation_id: "x", delivery_status: "failed", created_at: ago(1) },
      { conversation_id: "x", delivery_status: "failed", created_at: ago(2) },
      { conversation_id: "y", delivery_status: "failed", created_at: ago(3) },
    ];
    const alerts = deliveryAlerts(rows, { now: NOW });
    const bad = alerts.find((a) => /repeatedly failing/.test(a.title));
    expect(bad).toBeTruthy();
    expect(bad!.failedConversationIds).toEqual(["x"]);
  });

  it("ignores failures outside the window", () => {
    const rows = [
      { conversation_id: "a", delivery_status: "failed", created_at: ago(60 * 48) },
      { conversation_id: "b", delivery_status: "failed", created_at: ago(60 * 48) },
      { conversation_id: "c", delivery_status: "failed", created_at: ago(60 * 48) },
    ];
    expect(deliveryAlerts(rows, { now: NOW, windowHours: 24 })).toEqual([]);
  });

  it("does not count queued/sending as failures or as outbound denominator", () => {
    const rows = [
      { conversation_id: "a", delivery_status: "queued", created_at: ago(1) },
      { conversation_id: "b", delivery_status: "sending", created_at: ago(1) },
      { conversation_id: "c", delivery_status: "delivered", created_at: ago(1) },
    ];
    expect(deliveryAlerts(rows, { now: NOW })).toEqual([]);
  });
});
