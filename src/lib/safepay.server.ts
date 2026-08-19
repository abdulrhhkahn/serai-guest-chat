/**
 * Safepay helpers (server-only). Requires env:
 *   SAFEPAY_API_KEY, SAFEPAY_WEBHOOK_SECRET, SAFEPAY_ENVIRONMENT (sandbox|production)
 * Uses the REST API directly rather than @sfpy/node-sdk, matching the
 * fetch-based pattern in twilio.server.ts — one less dependency to vet.
 */

function apiBase(): string {
  return process.env.SAFEPAY_ENVIRONMENT === "production"
    ? "https://api.getsafepay.com"
    : "https://sandbox.api.getsafepay.com";
}

export function safepayConfigured(): boolean {
  return !!(process.env.SAFEPAY_API_KEY && process.env.SAFEPAY_WEBHOOK_SECRET);
}

/**
 * Creates a subscription checkout URL for a given plan. `reference` is set
 * to the organization_id — the webhook uses it to map an incoming event
 * back to the right org with no separate lookup table.
 *
 * NOTE: verify this exact request shape against the Safepay dashboard/docs
 * in sandbox before relying on it — the public docs cover the Node SDK's
 * `checkout.createSubscription` call but not the underlying raw endpoint,
 * so this is reconstructed by analogy. Test one full checkout in sandbox
 * and adjust the path/body below if it 404s or the fields differ.
 */
export async function createSubscriptionCheckoutUrl(opts: {
  planId: string;
  reference: string;
  redirectUrl: string;
  cancelUrl: string;
}): Promise<{ ok: boolean; url?: string; error?: string }> {
  const apiKey = process.env.SAFEPAY_API_KEY;
  if (!apiKey) return { ok: false, error: "Safepay not configured" };

  const res = await fetch(`${apiBase()}/checkouts/v2/subscriptions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      plan_id: opts.planId,
      reference: opts.reference,
      redirect_url: opts.redirectUrl,
      cancel_url: opts.cancelUrl,
    }),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    return { ok: false, error: `Safepay ${res.status}: ${text.slice(0, 200)}` };
  }
  const data = (await res.json()) as { url?: string };
  return { ok: true, url: data.url };
}

/**
 * Verifies a Safepay webhook signature. Confirmed shape from Safepay docs:
 * `hash_hmac('sha256', tracker, secret)` compared against the signature
 * Safepay sends — matches the pattern used in their published PHP/WooCommerce
 * plugin. Adjust the header name below if your sandbox test shows different.
 */
export async function verifySafepayWebhook(
  trackerOrToken: string,
  signature: string | null,
): Promise<boolean> {
  const secret = process.env.SAFEPAY_WEBHOOK_SECRET;
  if (!secret || !signature) return false;

  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const mac = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(trackerOrToken));
  const expected = Array.from(new Uint8Array(mac)).map((b) => b.toString(16).padStart(2, "0")).join("");

  if (expected.length !== signature.length) return false;
  let diff = 0;
  for (let i = 0; i < expected.length; i++) diff |= expected.charCodeAt(i) ^ signature.charCodeAt(i);
  return diff === 0;
}
