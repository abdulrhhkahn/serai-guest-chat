// Pure helpers (no imports) so the autonomy logic is unit-testable without the
// LLM, the database, or any server context.

export type Level = "suggest" | "approve" | "auto";

/**
 * Parse the concierge model's response. Expected shape is minified JSON
 * {"answer": "...", "category": "..."}, possibly wrapped in ```json fences. If
 * it isn't valid JSON, treat the whole text as the answer with category "other".
 */
export function parseModelAnswer(text: string): { answer: string; category: string } {
  const trimmed = (text ?? "").trim();
  let answer = trimmed;
  let category = "other";
  try {
    const cleaned = trimmed.replace(/^```(?:json)?/i, "").replace(/```$/, "").trim();
    const parsed = JSON.parse(cleaned) as { answer?: unknown; category?: unknown };
    if (typeof parsed.answer === "string" && parsed.answer.trim()) answer = parsed.answer.trim();
    if (typeof parsed.category === "string" && parsed.category.trim()) category = parsed.category.trim();
  } catch {
    /* not JSON — keep whole text as answer, category stays "other" */
  }
  return { answer, category };
}

/** True when the model signalled it couldn't answer confidently. */
export function isUncertain(answer: string): boolean {
  return /team member to help/i.test(answer);
}

/**
 * Resolve the autonomy level for a topic: an explicit per-category rule wins;
 * otherwise the property default. An uncertain answer is always forced to
 * "approve" so a low-confidence reply never auto-sends to a guest.
 */
export function resolveAutonomyLevel(opts: {
  category: string;
  uncertain: boolean;
  rules: Map<string, Level> | Record<string, Level>;
  defaultLevel: Level;
}): Level {
  if (opts.uncertain) return "approve";
  const key = opts.category.toLowerCase();
  const rule =
    opts.rules instanceof Map
      ? opts.rules.get(key)
      : opts.rules[key as keyof typeof opts.rules];
  return (rule as Level) ?? opts.defaultLevel;
}
