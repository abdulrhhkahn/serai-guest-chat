// Server-only — never import this from client code. Uses a
// Server-to-Server OAuth app (not a per-user login flow), since this is a
// backend service creating meetings on behalf of the business, not acting
// as a specific logged-in Zoom user.

let cachedToken: { value: string; expiresAt: number } | null = null;

export function zoomConfigured(): boolean {
  return !!(process.env.ZOOM_ACCOUNT_ID && process.env.ZOOM_CLIENT_ID && process.env.ZOOM_CLIENT_SECRET);
}

async function getZoomAccessToken(): Promise<string> {
  if (cachedToken && cachedToken.expiresAt > Date.now() + 30_000) return cachedToken.value;

  const accountId = process.env.ZOOM_ACCOUNT_ID!;
  const clientId = process.env.ZOOM_CLIENT_ID!;
  const clientSecret = process.env.ZOOM_CLIENT_SECRET!;
  const basic = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");

  const res = await fetch(`https://zoom.us/oauth/token?grant_type=account_credentials&account_id=${accountId}`, {
    method: "POST",
    headers: { Authorization: `Basic ${basic}` },
  });
  if (!res.ok) throw new Error(`Zoom OAuth failed: ${await res.text()}`);
  const data = (await res.json()) as { access_token: string; expires_in: number };
  cachedToken = { value: data.access_token, expiresAt: Date.now() + data.expires_in * 1000 };
  return data.access_token;
}

/**
 * Creates a scheduled Zoom meeting and returns its join link. Throws on
 * any failure — the caller (book-demo.ts) decides whether a Zoom failure
 * should block the booking entirely or just proceed without a link.
 */
export async function createZoomMeeting(opts: {
  topic: string;
  startTimeIso: string;
  durationMinutes: number;
}): Promise<{ id: string; joinUrl: string }> {
  const token = await getZoomAccessToken();
  const res = await fetch("https://api.zoom.us/v2/users/me/meetings", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      topic: opts.topic,
      type: 2, // scheduled meeting
      start_time: opts.startTimeIso,
      duration: opts.durationMinutes,
      timezone: "UTC",
      settings: {
        join_before_host: true,
        waiting_room: false,
        approval_type: 2, // no registration required
      },
    }),
  });
  if (!res.ok) throw new Error(`Zoom meeting creation failed: ${await res.text()}`);
  const data = (await res.json()) as { id: number; join_url: string };
  return { id: String(data.id), joinUrl: data.join_url };
}
