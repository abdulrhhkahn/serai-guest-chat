/**
 * Minimal email sender. Uses Resend if RESEND_API_KEY is set; otherwise reports
 * "not configured" so callers can dry-run. Swap the fetch for another provider
 * (Postmark/SendGrid) if you prefer — the interface stays the same.
 *
 * Env: RESEND_API_KEY, REPORT_FROM_EMAIL (e.g. "Serai <reports@yourdomain.com>").
 */
export function emailConfigured(): boolean {
  return !!(process.env.RESEND_API_KEY && process.env.REPORT_FROM_EMAIL);
}

export async function sendEmail(opts: {
  to: string[];
  subject: string;
  html: string;
  text: string;
}): Promise<{ ok: boolean; error?: string }> {
  const key = process.env.RESEND_API_KEY;
  const from = process.env.REPORT_FROM_EMAIL;
  if (!key || !from) return { ok: false, error: "email not configured" };
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from, to: opts.to, subject: opts.subject, html: opts.html, text: opts.text }),
    });
    if (!res.ok) return { ok: false, error: `email ${res.status}: ${(await res.text()).slice(0, 200)}` };
    return { ok: true };
  } catch (e) {
    return { ok: false, error: String(e) };
  }
}
