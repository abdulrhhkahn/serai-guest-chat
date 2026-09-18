import { createFileRoute } from "@tanstack/react-router";

/**
 * One-time setup utility, not a feature used in normal operation. After
 * visiting Google's consent screen (see the URL construction instructions
 * given alongside this), Google redirects back here with a `code` query
 * param. This exchanges that code for tokens and displays the refresh
 * token in plain text so it can be copied into GOOGLE_OAUTH_REFRESH_TOKEN.
 *
 * The real gate here is Google's own login + consent screen, not
 * anything in this app — only whoever can log into the target Gmail
 * account and click "Allow" ever produces a valid `code` to exchange.
 */
export const Route = createFileRoute("/api/admin/google-oauth-callback")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const code = url.searchParams.get("code");
        const oauthError = url.searchParams.get("error");

        if (oauthError) {
          return new Response(`Google returned an error: ${oauthError}`, { status: 400 });
        }
        if (!code) {
          return new Response("Missing ?code= — this page should only be reached via Google's redirect after granting consent.", { status: 400 });
        }

        const clientId = process.env.GOOGLE_OAUTH_CLIENT_ID;
        const clientSecret = process.env.GOOGLE_OAUTH_CLIENT_SECRET;
        if (!clientId || !clientSecret) {
          return new Response("GOOGLE_OAUTH_CLIENT_ID / GOOGLE_OAUTH_CLIENT_SECRET aren't set yet — set those first, then redo the consent step.", { status: 500 });
        }

        const redirectUri = `${url.origin}/api/admin/google-oauth-callback`;

        const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: new URLSearchParams({
            code,
            client_id: clientId,
            client_secret: clientSecret,
            redirect_uri: redirectUri,
            grant_type: "authorization_code",
          }),
        });

        if (!tokenRes.ok) {
          return new Response(`Token exchange failed: ${await tokenRes.text()}`, { status: 500 });
        }

        const data = (await tokenRes.json()) as { refresh_token?: string; access_token: string };

        if (!data.refresh_token) {
          return new Response(
            "Google didn't return a refresh token this time — this usually means consent was already granted before. " +
            "Go to https://myaccount.google.com/permissions, remove access for this app, then redo the consent-screen step from the start " +
            "(the URL must include access_type=offline and prompt=consent for Google to issue a new refresh token).",
            { status: 400 },
          );
        }

        return new Response(
          `<!DOCTYPE html><html><body style="font-family: monospace; padding: 2rem; max-width: 700px;">` +
          `<h2>Copy this into GOOGLE_OAUTH_REFRESH_TOKEN</h2>` +
          `<p style="word-break: break-all; background: #f0f0f0; padding: 1rem; border-radius: 4px;">${data.refresh_token}</p>` +
          `<p>This page is only shown once per consent — if you navigate away, you'll need to redo the consent step to see it again ` +
          `(Google won't show you an existing refresh token twice, only issue a new one).</p>` +
          `</body></html>`,
          { headers: { "Content-Type": "text/html" } },
        );
      },
    },
  },
});
