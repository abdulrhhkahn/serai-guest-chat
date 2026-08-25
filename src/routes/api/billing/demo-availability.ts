import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@supabase/supabase-js";

/**
 * Backs the "book a demo" slot picker. Deliberately returns ONLY the
 * scheduled_at timestamps that are already taken — never names, emails,
 * or any other lead detail — since plan_interest_leads' own RLS
 * correctly restricts full reads to site admins only, and any staff
 * member booking a demo still needs to see which slots are free.
 *
 * POST body: { from, to } — ISO timestamps bounding the visible window.
 */
export const Route = createFileRoute("/api/billing/demo-availability")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const authHeader = request.headers.get("Authorization");
        if (!authHeader) return new Response("Unauthorized", { status: 401 });

        const asUser = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_PUBLISHABLE_KEY!, {
          global: { headers: { Authorization: authHeader } },
          auth: { persistSession: false, autoRefreshToken: false },
        });
        const { data: userData, error: userErr } = await asUser.auth.getUser();
        if (userErr || !userData.user) return new Response("Unauthorized", { status: 401 });

        let body: { from?: string; to?: string };
        try {
          body = await request.json();
        } catch {
          return new Response("Bad request", { status: 400 });
        }
        const from = String(body.from ?? "");
        const to = String(body.to ?? "");
        if (!from || !to) return new Response("Missing from/to", { status: 400 });

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { data, error } = await supabaseAdmin
          .from("plan_interest_leads")
          .select("scheduled_at")
          .not("scheduled_at", "is", null)
          .gte("scheduled_at", from)
          .lte("scheduled_at", to);
        if (error) return new Response(error.message, { status: 500 });

        return Response.json({ taken: (data ?? []).map((r) => r.scheduled_at) });
      },
    },
  },
});
