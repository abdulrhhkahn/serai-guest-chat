import { createFileRoute } from "@tanstack/react-router";
import { generateText } from "ai";

/**
 * POST body: { imageBase64: string, mimeType: string }
 *
 * Classifies document TYPE only — deliberately instructed not to
 * transcribe any name, number, or other detail from the document, since
 * that information should never round-trip through a response body or
 * a log line for something this sensitive. This is a real, added
 * third-party touchpoint for a guest's ID photo (it goes to Google via
 * the Lovable AI gateway, same provider the concierge already uses) —
 * worth being aware of given how sensitive this category of document
 * is, even though it's the only practical way to actually check
 * document *type* rather than just file format.
 */
export const Route = createFileRoute("/api/checkin/verify-document")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        let body: { imageBase64?: string; mimeType?: string };
        try {
          body = await request.json();
        } catch {
          return new Response("Bad request", { status: 400 });
        }
        const { imageBase64, mimeType } = body;
        if (!imageBase64 || !mimeType) {
          return new Response("Missing image", { status: 400 });
        }
        if (!mimeType.startsWith("image/")) {
          return Response.json({ valid: false, reason: "That file isn't an image — please upload a photo of your ID." });
        }

        const apiKey = process.env.LOVABLE_API_KEY;
        if (!apiKey) {
          // No AI configured — fail open rather than block every check-in
          // on a missing env var. Format-only validation still applies
          // client-side (accept="image/*").
          return Response.json({ valid: true, documentType: "unverified" });
        }

        try {
          const { createLovableAiGatewayProvider } = await import("@/lib/ai-gateway.server");
          const model = createLovableAiGatewayProvider(apiKey)("google/gemini-2.5-flash");

          const { text } = await generateText({
            model,
            system:
              "You classify photos of identity documents. Look at the image and decide whether it shows a " +
              "government-issued ID card, driver's license, or passport. Do NOT transcribe, describe, or repeat " +
              "any name, number, date, or other detail printed on the document — only classify its type. " +
              'Reply with ONLY minified JSON, no code fences: {"type":"id_card"|"license"|"passport"|"other","confident":true|false}.',
            messages: [
              {
                role: "user",
                content: [
                  { type: "image", image: `data:${mimeType};base64,${imageBase64}` },
                  { type: "text", text: "Classify this document." },
                ],
              },
            ],
          });

          const match = text.match(/\{[\s\S]*\}/);
          const parsed = match ? JSON.parse(match[0]) : { type: "other", confident: false };
          const validTypes = ["id_card", "license", "passport"];
          const valid = validTypes.includes(parsed.type) && parsed.confident !== false;

          return Response.json({
            valid,
            documentType: valid ? parsed.type : undefined,
            reason: valid ? undefined : "We couldn't confirm this is a government ID, driver's license, or passport — please upload a clear photo of one of those.",
          });
        } catch (e) {
          console.error("Document verification failed", e);
          // Fail open on a provider error — an outage shouldn't block
          // every guest from checking in.
          return Response.json({ valid: true, documentType: "unverified" });
        }
      },
    },
  },
});
