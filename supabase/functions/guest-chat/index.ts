// Supabase Edge Function: guest-chat
// POST { property_id: string, question: string }
// -> { answer: string, needs_staff: boolean }
//
// Fetches the property's FAQs, sends them as context to the LLM,
// and returns a concise answer. Sets needs_staff=true when the model
// isn't confident so staff can pick up the conversation.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

interface Body {
  property_id?: string;
  question?: string;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405, headers: corsHeaders });
  }

  let body: Body;
  try {
    body = await req.json();
  } catch {
    return json({ error: "Invalid JSON body" }, 400);
  }

  const propertyId = body.property_id?.trim();
  const question = body.question?.trim();
  if (!propertyId || !question) {
    return json({ error: "property_id and question are required" }, 400);
  }
  if (question.length > 1000) {
    return json({ error: "question too long" }, 400);
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const llmKey = Deno.env.get("LLM_API_KEY");

  if (!supabaseUrl || !serviceKey) {
    return json({ error: "Server not configured" }, 500);
  }

  const supabase = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false },
  });

  const [{ data: prop }, { data: faqs }] = await Promise.all([
    supabase
      .from("properties")
      .select("name,wifi_ssid,wifi_password,checkin_time,checkout_time,address")
      .eq("id", propertyId)
      .maybeSingle(),
    supabase
      .from("faqs")
      .select("question,answer,category")
      .eq("property_id", propertyId),
  ]);

  if (!prop) return json({ error: "Property not found" }, 404);

  // Graceful fallback when no LLM key is configured.
  if (!llmKey) {
    return json({
      answer: "Thanks for your message! A team member will reply shortly.",
      needs_staff: true,
      fallback: true,
    });
  }

  const contextLines = [
    `Property: ${prop.name}`,
    prop.checkin_time ? `Check-in: ${prop.checkin_time}` : "",
    prop.checkout_time ? `Check-out: ${prop.checkout_time}` : "",
    prop.wifi_ssid ? `Wifi SSID: ${prop.wifi_ssid}` : "",
    prop.wifi_password ? `Wifi password: ${prop.wifi_password}` : "",
    prop.address ? `Address: ${prop.address}` : "",
    "",
    "FAQs:",
    ...(faqs ?? []).map((f) => `Q: ${f.question}\nA: ${f.answer}`),
  ].filter(Boolean).join("\n");

  const system = `You are a warm, concise concierge for ${prop.name}. Answer using ONLY the property info and FAQs below.
If the info is insufficient to answer confidently, reply with EXACTLY the token: NEEDS_STAFF
Otherwise reply in under 3 friendly sentences, no emojis.

${contextLines}`;

  try {
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${llmKey}`,
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        temperature: 0.2,
        messages: [
          { role: "system", content: system },
          { role: "user", content: question },
        ],
      }),
    });

    if (!res.ok) {
      const errText = await res.text().catch(() => "");
      console.error("LLM error", res.status, errText);
      return json({
        answer: "Let me get a team member to help you with that.",
        needs_staff: true,
        error: true,
      });
    }

    const data = await res.json();
    const raw = (data?.choices?.[0]?.message?.content ?? "").trim();
    const needsStaff = /NEEDS_STAFF/i.test(raw) || raw.length === 0;
    const answer = needsStaff
      ? "Let me get a team member to help you with that."
      : raw;

    return json({ answer, needs_staff: needsStaff });
  } catch (e) {
    console.error("guest-chat exception", e);
    return json({
      answer: "Let me get a team member to help you with that.",
      needs_staff: true,
      error: true,
    });
  }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...corsHeaders },
  });
}
