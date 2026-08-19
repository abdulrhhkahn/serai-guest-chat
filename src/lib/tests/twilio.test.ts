import { describe, it, expect, beforeAll } from "vitest";
import crypto from "node:crypto";
import { verifyTwilioSignature } from "../twilio.server";

const TOKEN = "test_auth_token_1234567890";
const URL = "https://app.example.com/api/webhooks/twilio";

// Build a valid signature the same way Twilio does, to use as a known-answer fixture.
function sign(url: string, params: Record<string, string>, token: string): string {
  const data = url + Object.keys(params).sort().map((k) => k + params[k]).join("");
  return crypto.createHmac("sha1", token).update(Buffer.from(data, "utf-8")).digest("base64");
}

const params = { From: "whatsapp:+14155550001", To: "whatsapp:+14155559999", Body: "Hi there", MessageSid: "SM123" };

describe("verifyTwilioSignature", () => {
  beforeAll(() => { process.env.TWILIO_AUTH_TOKEN = TOKEN; });

  it("accepts a correct signature", async () => {
    const sig = sign(URL, params, TOKEN);
    expect(await verifyTwilioSignature(URL, params, sig)).toBe(true);
  });

  it("rejects a tampered body", async () => {
    const sig = sign(URL, params, TOKEN);
    const tampered = { ...params, Body: "Hi there!" };
    expect(await verifyTwilioSignature(URL, tampered, sig)).toBe(false);
  });

  it("rejects a signature from a different token", async () => {
    const sig = sign(URL, params, "wrong_token");
    expect(await verifyTwilioSignature(URL, params, sig)).toBe(false);
  });

  it("rejects a missing signature", async () => {
    expect(await verifyTwilioSignature(URL, params, null)).toBe(false);
  });

  it("is insensitive to param order (sorted before signing)", async () => {
    const sig = sign(URL, params, TOKEN);
    const reordered = { Body: params.Body, MessageSid: params.MessageSid, From: params.From, To: params.To };
    expect(await verifyTwilioSignature(URL, reordered, sig)).toBe(true);
  });

  it("returns false when no auth token is configured", async () => {
    const saved = process.env.TWILIO_AUTH_TOKEN;
    delete process.env.TWILIO_AUTH_TOKEN;
    const sig = sign(URL, params, TOKEN);
    expect(await verifyTwilioSignature(URL, params, sig)).toBe(false);
    process.env.TWILIO_AUTH_TOKEN = saved;
  });
});
