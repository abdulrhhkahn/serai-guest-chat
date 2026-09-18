import { randomUUID } from "node:crypto";

// Server-only — never import this from client code.
//
// Personal Gmail path: no Workspace, no service account, no
// domain-wide delegation. Instead, a one-time manual OAuth consent
// (see /api/admin/google-oauth-callback) produces a refresh token that
// gets stored as GOOGLE_OAUTH_REFRESH_TOKEN — from then on, this
// exchanges that refresh token for a fresh access token on every call,
// acting as whichever Google account did that one-time consent. Meetings
// land on that account's own primary calendar, not an impersonated one.

let cachedToken: { value: string; expiresAt: number } | null = null;

export function googleMeetConfigured(): boolean {
  return !!(
    process.env.GOOGLE_OAUTH_CLIENT_ID &&
    process.env.GOOGLE_OAUTH_CLIENT_SECRET &&
    process.env.GOOGLE_OAUTH_REFRESH_TOKEN
  );
}

async function getAccessToken(): Promise<string> {
  if (cachedToken && cachedToken.expiresAt > Date.now() + 30_000) return cachedToken.value;

  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      client_id: process.env.GOOGLE_OAUTH_CLIENT_ID!,
      client_secret: process.env.GOOGLE_OAUTH_CLIENT_SECRET!,
      refresh_token: process.env.GOOGLE_OAUTH_REFRESH_TOKEN!,
    }),
  });
  if (!res.ok) throw new Error(`Google token refresh failed: ${await res.text()}`);
  const data = (await res.json()) as { access_token: string; expires_in: number };
  cachedToken = { value: data.access_token, expiresAt: Date.now() + data.expires_in * 1000 };
  return data.access_token;
}

/**
 * Creates a calendar event with an attached Google Meet link and
 * returns the join URL. Throws on any failure — the caller (book-demo.ts)
 * decides whether a Meet failure should block the booking entirely or
 * just proceed without a link.
 */
export async function createGoogleMeet(opts: {
  summary: string;
  startTimeIso: string;
  durationMinutes: number;
  attendeeEmail: string;
}): Promise<{ eventId: string; joinUrl: string }> {
  const token = await getAccessToken();
  const start = new Date(opts.startTimeIso);
  const end = new Date(start.getTime() + opts.durationMinutes * 60_000);
  const requestId = randomUUID();

  const res = await fetch(
    "https://www.googleapis.com/calendar/v3/calendars/primary/events?conferenceDataVersion=1&sendUpdates=all",
    {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        summary: opts.summary,
        start: { dateTime: start.toISOString() },
        end: { dateTime: end.toISOString() },
        attendees: [{ email: opts.attendeeEmail }],
        conferenceData: {
          createRequest: {
            requestId,
            conferenceSolutionKey: { type: "hangoutsMeet" },
          },
        },
      }),
    },
  );
  if (!res.ok) throw new Error(`Google Calendar event creation failed: ${await res.text()}`);
  const data = (await res.json()) as {
    id: string;
    conferenceData?: { entryPoints?: { entryPointType: string; uri: string }[] };
  };
  const meetEntry = data.conferenceData?.entryPoints?.find((e) => e.entryPointType === "video");
  if (!meetEntry) throw new Error("Google Calendar event created but no Meet link was returned");
  return { eventId: data.id, joinUrl: meetEntry.uri };
}
