import { createFileRoute } from "@tanstack/react-router";

/**
 * Deletes stored ID + signature files N days after checkout (departure_date, or
 * created_at if none), then nulls the URLs and stamps documents_purged_at.
 *
 * Protect + schedule — two supported trigger sources:
 *   - Vercel Cron (vercel.json "crons"): invokes with GET, auto-sends
 *     `Authorization: Bearer <CRON_SECRET>`. Just set CRON_SECRET in your
 *     project's env vars — Vercel does the rest.
 *   - Any external scheduler (GitHub Action, Supabase pg_cron, Cloudflare
 *     Cron Trigger): POST with header `x-cron-secret: <CRON_SECRET>`.
 *   - optional DOC_RETENTION_DAYS (default 30)
 */
async function runPurge(request: Request): Promise<Response> {
  const secret = process.env.CRON_SECRET;
  const authHeader = request.headers.get("authorization");
  const cronHeader = request.headers.get("x-cron-secret");
  const authorized =
    !!secret && (authHeader === `Bearer ${secret}` || cronHeader === secret);
  if (!authorized) {
    return new Response("Unauthorized", { status: 401 });
  }

  const retentionDays = Number(process.env.DOC_RETENTION_DAYS ?? "30");
  const cutoff = new Date(Date.now() - retentionDays * 86_400_000);

  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

  // Candidates: not yet purged, still have at least one document.
  const { data: rows, error } = await supabaseAdmin
    .from("checkins")
    .select("id, id_document_url, signature_url, departure_date, created_at")
    .is("documents_purged_at", null)
    .or("id_document_url.not.is.null,signature_url.not.is.null")
    .limit(1000);
  if (error) return new Response(error.message, { status: 500 });

  const expired = (rows ?? []).filter((r) => {
    const basis = r.departure_date ? new Date(r.departure_date) : new Date(r.created_at);
    return basis < cutoff;
  });

  const idPaths = expired.map((r) => r.id_document_url).filter((p): p is string => !!p);
  const sigPaths = expired.map((r) => r.signature_url).filter((p): p is string => !!p);

  if (idPaths.length) await supabaseAdmin.storage.from("guest-ids").remove(idPaths);
  if (sigPaths.length) await supabaseAdmin.storage.from("guest-signatures").remove(sigPaths);

  if (expired.length) {
    await supabaseAdmin
      .from("checkins")
      .update({ id_document_url: null, signature_url: null, documents_purged_at: new Date().toISOString() })
      .in("id", expired.map((r) => r.id));
  }

  return Response.json({ ok: true, purged: expired.length, retentionDays });
}

export const Route = createFileRoute("/api/admin/purge-documents")({
  server: {
    handlers: {
      GET: ({ request }) => runPurge(request),   // Vercel Cron calls this
      POST: ({ request }) => runPurge(request),  // external schedulers call this
    },
  },
});
