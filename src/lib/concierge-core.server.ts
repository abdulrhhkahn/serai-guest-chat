import { generateText } from "ai";
import { parseModelAnswer, isUncertain, resolveAutonomyLevel, type Level } from "@/lib/autonomy";

/**
 * Shared classify-and-answer used by both the web concierge and the Twilio
 * inbound webhook. Returns the drafted answer, its topic, and the autonomy
 * level that applies (per-category override → property default). It does NOT
 * write anything — the caller decides to send vs. escalate.
 */
export async function classifyAndAnswer(opts: {
  supabaseAdmin: any;
  propertyId: string;
  question: string;
}): Promise<{ answer: string; category: string; level: Level }> {
  const { supabaseAdmin, propertyId, question } = opts;

  const [{ data: faqs }, { data: prop }, { data: rules }] = await Promise.all([
    supabaseAdmin.from("faqs").select("question,answer,category").eq("property_id", propertyId),
    supabaseAdmin
      .from("properties")
      .select("name,wifi_ssid,wifi_password,checkin_time,checkout_time,address,welcome_message,default_autonomy")
      .eq("id", propertyId)
      .maybeSingle(),
    supabaseAdmin.from("category_autonomy").select("category,level").eq("property_id", propertyId),
  ]);

  const defaultLevel: Level = (prop?.default_autonomy as Level) ?? "auto";
  const ruleMap = new Map<string, Level>(
    (rules ?? []).map((r: { category: string; level: string }) => [r.category.toLowerCase(), r.level as Level]),
  );
  const categories = Array.from(
    new Set((faqs ?? []).map((f: { category: string | null }) => f.category).filter((c: string | null): c is string => !!c)),
  );

  const apiKey = process.env.LOVABLE_API_KEY;
  if (!apiKey) {
    return { answer: "Let me get a team member to help.", category: "other", level: "approve" };
  }

  const { createLovableAiGatewayProvider } = await import("@/lib/ai-gateway.server");
  const model = createLovableAiGatewayProvider(apiKey)("google/gemini-2.5-flash");

  const context = [
    prop ? `Property: ${prop.name}` : "",
    prop?.checkin_time ? `Check-in: ${prop.checkin_time}` : "",
    prop?.checkout_time ? `Check-out: ${prop.checkout_time}` : "",
    prop?.wifi_ssid ? `Wifi SSID: ${prop.wifi_ssid}` : "",
    prop?.wifi_password ? `Wifi password: ${prop.wifi_password}` : "",
    prop?.address ? `Address: ${prop.address}` : "",
    "", "FAQs:",
    ...(faqs ?? []).map((f: { category: string | null; question: string; answer: string }) =>
      `[${f.category ?? "General"}] Q: ${f.question}\nA: ${f.answer}`),
  ].filter(Boolean).join("\n");

  const catList = categories.length ? categories.join(", ") : "(none)";
  const { text } = await generateText({
    model,
    system:
      `You are a warm, concise concierge for ${prop?.name ?? "this hotel"}. Answer using ONLY the property info and FAQs below. ` +
      `If you don't have enough info, set "answer" to exactly "Let me get a team member to help." ` +
      `Also classify the question into ONE category from this list: [${catList}] — or "other" if none fit. ` +
      `Reply with ONLY minified JSON, no code fences: {"answer":"...","category":"..."}. Keep the answer under 3 sentences, friendly, no emojis.\n\n${context}`,
    prompt: question,
  });

  const { answer, category } = parseModelAnswer(text);

  const level: Level = resolveAutonomyLevel({
    category,
    uncertain: isUncertain(answer),
    rules: ruleMap,
    defaultLevel,
  });
  return { answer, category, level };
}
