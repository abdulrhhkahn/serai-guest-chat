import { createFileRoute } from "@tanstack/react-router";

/**
 * Second, independent factor for /admin-customers — deliberately does NOT
 * touch Supabase auth or any user table. Set PLATFORM_ADMIN_PASSPHRASE as a
 * server env var; this route only confirms the submitted value matches.
 * The client stores the raw value in sessionStorage and re-sends it as the
 * x-admin-gate header on every /api/admin/customers call, so the real
 * enforcement is server-side on that route too, not just this check.
 */
export const Route = createFileRoute("/api/admin/verify-passphrase")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const secret = process.env.PLATFORM_ADMIN_PASSPHRASE;
        if (!secret) return new Response("Not configured", { status: 500 });

        let body: { passphrase?: string };
        try {
          body = await request.json();
        } catch {
          return new Response("Bad request", { status: 400 });
        }
        if (body.passphrase !== secret) return new Response("Unauthorized", { status: 401 });
        return Response.json({ ok: true });
      },
    },
  },
});
