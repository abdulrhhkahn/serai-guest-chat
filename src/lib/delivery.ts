// Pure helper mapping a Twilio message status to a display label + tone.
// Twilio statuses: queued, sending, sent, delivered, read, undelivered, failed.

export type DeliveryTone = "none" | "pending" | "ok" | "error";

export function deliveryLabel(status: string | null | undefined, error?: string | null): {
  label: string;
  tone: DeliveryTone;
  failed: boolean;
} {
  switch (status) {
    case "delivered":
    case "read":
      return { label: status === "read" ? "Read" : "Delivered", tone: "ok", failed: false };
    case "sent":
    case "queued":
    case "sending":
    case "accepted":
      return { label: "Sent", tone: "pending", failed: false };
    case "failed":
    case "undelivered":
      return { label: error ? `Failed (${error})` : "Failed", tone: "error", failed: true };
    default:
      return { label: "", tone: "none", failed: false };
  }
}
