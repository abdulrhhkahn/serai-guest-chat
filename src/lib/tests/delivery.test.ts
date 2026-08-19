import { describe, it, expect } from "vitest";
import { deliveryLabel } from "../delivery";

describe("deliveryLabel", () => {
  it("marks delivered/read as ok", () => {
    expect(deliveryLabel("delivered")).toEqual({ label: "Delivered", tone: "ok", failed: false });
    expect(deliveryLabel("read")).toEqual({ label: "Read", tone: "ok", failed: false });
  });

  it("treats in-flight statuses as pending 'Sent'", () => {
    for (const s of ["sent", "queued", "sending", "accepted"]) {
      expect(deliveryLabel(s)).toEqual({ label: "Sent", tone: "pending", failed: false });
    }
  });

  it("marks failed/undelivered as error and failed=true", () => {
    expect(deliveryLabel("failed").failed).toBe(true);
    expect(deliveryLabel("undelivered").tone).toBe("error");
  });

  it("includes the Twilio error code when present", () => {
    expect(deliveryLabel("failed", "30007").label).toBe("Failed (30007)");
  });

  it("is silent (tone none) for web messages / unknown status", () => {
    expect(deliveryLabel(null)).toEqual({ label: "", tone: "none", failed: false });
    expect(deliveryLabel(undefined).tone).toBe("none");
    expect(deliveryLabel("something-else").tone).toBe("none");
  });
});
