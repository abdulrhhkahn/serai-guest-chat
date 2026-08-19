import { createFileRoute } from "@tanstack/react-router";
import { verifySafepayWebhook } from "@/lib/safepay.server";
import { tierFromPlanId } from "@/lib/billing";

export const Route = createFileRoute("/api/webhooks/safepay")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const raw = await request.text();
        let event: {
          token: string;
          type: string;
          notification: { reference?: string; plan_id?: string; [k: string]: unknown };
        };
        try {
          event = JSON.parse(raw);
        } catch {
          return new Response("Bad request", { status: 400 });
        }

        const signature = request.headers.get("x-safepay-signature");
        const ok = await verifySafepayWebhook(event.notification?.tracker as string ?? raw, signature);
        if (!ok) return new Response("Invalid signature", { status: 403 });

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

        // Idempotency — Safepay can redeliver.
        const { error: logError } = await supabaseAdmin
          .from("billing_events")
          .insert({ safepay_event_token: event.token, event_type: event.type, payload: event });
        if (logError) {
          if (logError.code === "23505") return new Response("Already processed", { status: 200 });
          console.error("safepay webhook log error", logError);
          return new Response("Internal error", { status: 500 });
        }

        const organizationId = event.notification?.reference;

        try {
          switch (event.type) {
            case "payment:created": {
              if (organizationId) {
                await supabaseAdmin
                  .from("subscriptions")
                  .update({ status: "active", updated_at: new Date().toISOString() })
                  .eq("safepay_subscription_reference", organizationId);
              }
              break;
            }

            // NOTE: event names below are inferred by analogy with the
            // payment:* pattern, not confirmed from Safepay docs — verify
            // against a real sandbox webhook delivery before relying on this.
            case "subscription.activated":
            case "subscription.renewed": {
              if (!organizationId) break;
              const planId = event.notification?.plan_id as string | undefined;
              const periodEnd = new Date();
              periodEnd.setDate(periodEnd.getDate() + 30);

              await supabaseAdmin.from("subscriptions").upsert(
                {
                  organization_id: organizationId,
                  safepay_subscription_reference: organizationId,
                  safepay_plan_id: planId ?? "",
                  plan_tier: planId ? tierFromPlanId(planId) : "growth",
                  status: "active",
                  amount_pkr: 0, // filled in by your own lookup if you track it; not in webhook payload
                  current_period_end: periodEnd.toISOString(),
                  updated_at: new Date().toISOString(),
                },
                { onConflict: "safepay_subscription_reference" },
              );
              break;
            }

            case "subscription.canceled":
            case "subscription.failed": {
              if (!organizationId) break;
              await supabaseAdmin
                .from("subscriptions")
                .update({
                  status: event.type === "subscription.canceled" ? "canceled" : "past_due",
                  updated_at: new Date().toISOString(),
                })
                .eq("safepay_subscription_reference", organizationId);
              break;
            }

            default:
              break;
          }

          await supabaseAdmin
            .from("billing_events")
            .update({ processed_at: new Date().toISOString() })
            .eq("safepay_event_token", event.token);

          return new Response("OK", { status: 200 });
        } catch (e) {
          console.error("safepay webhook processing error", e);
          return new Response("Processing error", { status: 500 });
        }
      },
    },
  },
});
