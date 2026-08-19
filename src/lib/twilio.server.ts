/**
 * Twilio helpers (server-only). Requires env:
 *   TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN
 * Optional: TWILIO_WEBHOOK_URL (exact public URL Twilio calls — set this if the
 * app runs behind a proxy/CDN so signature verification uses the right URL).
 */

function base64(bytes: ArrayBuffer): string {
  let bin = "";
  const arr = new Uint8Array(bytes);
  for (let i = 0; i < arr.length; i++) bin += String.fromCharCode(arr[i]);
  return btoa(bin);
}

export function twilioConfigured(): boolean {
  return !!(process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN);
}

/** Public URL Twilio should POST delivery-status updates to (opt-in via env). */
export function statusCallbackUrl(): string | undefined {
  return process.env.TWILIO_STATUS_CALLBACK_URL || undefined;
}

/**
 * Validate the X-Twilio-Signature header for an incoming webhook.
 * Algorithm: HMAC-SHA1(authToken, url + sorted(key+value...)) → base64.
 */
export async function verifyTwilioSignature(
  url: string,
  params: Record<string, string>,
  signature: string | null,
): Promise<boolean> {
  const token = process.env.TWILIO_AUTH_TOKEN;
  if (!token || !signature) return false;

  const data = url + Object.keys(params).sort().map((k) => k + params[k]).join("");
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(token),
    { name: "HMAC", hash: "SHA-1" },
    false,
    ["sign"],
  );
  const mac = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(data));
  const expected = base64(mac);

  // constant-time-ish compare
  if (expected.length !== signature.length) return false;
  let diff = 0;
  for (let i = 0; i < expected.length; i++) diff |= expected.charCodeAt(i) ^ signature.charCodeAt(i);
  return diff === 0;
}

export type Channel = "sms" | "whatsapp";

/** Send a message via Twilio. Numbers are bare E.164; whatsapp: prefix is added. */
export async function sendTwilioMessage(opts: {
  channel: Channel;
  to: string;
  from: string;
  body: string;
  statusCallback?: string;
}): Promise<{ ok: boolean; sid?: string; error?: string }> {
  const sid = process.env.TWILIO_ACCOUNT_SID;
  const token = process.env.TWILIO_AUTH_TOKEN;
  if (!sid || !token) return { ok: false, error: "Twilio not configured" };

  const pfx = opts.channel === "whatsapp" ? "whatsapp:" : "";
  const form = new URLSearchParams({
    To: `${pfx}${opts.to}`,
    From: `${pfx}${opts.from}`,
    Body: opts.body,
  });
  if (opts.statusCallback) form.set("StatusCallback", opts.statusCallback);

  const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${btoa(`${sid}:${token}`)}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: form,
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    return { ok: false, error: `Twilio ${res.status}: ${text.slice(0, 200)}` };
  }
  const data = (await res.json()) as { sid?: string };
  return { ok: true, sid: data.sid };
}
