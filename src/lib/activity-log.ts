import { supabase } from "@/integrations/supabase/client";

/**
 * Logs one staff action against their own property. Best-effort — if it
 * fails (e.g. no staff_profiles row for some edge-case account), it's
 * swallowed rather than surfaced as an error, since a logging failure
 * should never block the actual action that triggered it.
 */
export async function logActivity(actionType: string, detail?: string) {
  try {
    const { data: u } = await supabase.auth.getUser();
    if (!u.user) return;
    const { data: prof } = await supabase.from("staff_profiles").select("property_id").eq("id", u.user.id).maybeSingle();
    if (!prof?.property_id) return;
    await supabase.from("staff_activity_log").insert({
      staff_id: u.user.id,
      property_id: prof.property_id,
      action_type: actionType,
      detail: detail ?? null,
    });
  } catch {
    /* best-effort */
  }
}
