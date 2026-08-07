import { createFileRoute } from "@tanstack/react-router";

// Temporary one-shot helper to provision the demo staff login.
export const Route = createFileRoute("/api/public/seed-demo-staff")({
  server: {
    handlers: {
      POST: async () => {
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { error } = await supabaseAdmin.auth.admin.createUser({
          email: "demo@serai.test",
          password: "demo1234",
          email_confirm: true,
          user_metadata: { full_name: "Demo Staff" },
        });
        return Response.json({ ok: !error, error: error?.message ?? null });
      },
    },
  },
});
