/**
 * Cloudflare Turnstile server-side verification.
 *
 * Opt-in: if TURNSTILE_SECRET_KEY is not set, verification is skipped so the app
 * behaves exactly as before. To enable, set TURNSTILE_SECRET_KEY (server) and
 * VITE_TURNSTILE_SITE_KEY (client), and render <GuestTurnstile> on the guest
 * chat (see APPLY-v3.md).
 */
export function turnstileEnabled(): boolean {
  return !!process.env.TURNSTILE_SECRET_KEY;
}

export async function verifyTurnstile(token: string | undefined, ip?: string | null): Promise<boolean> {
  const secret = process.env.TURNSTILE_SECRET_KEY;
  if (!secret) return true; // not configured → treat as pass (feature off)
  if (!token) return false;

  try {
    const body = new URLSearchParams({ secret, response: token });
    if (ip) body.set("remoteip", ip);
    const res = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body,
    });
    const data = (await res.json()) as { success?: boolean };
    return data.success === true;
  } catch {
    return false;
  }
}
