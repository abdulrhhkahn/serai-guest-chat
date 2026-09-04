import { supabase } from "@/integrations/supabase/client";
import { ensureGuestSession } from "@/lib/guest-session";

/**
 * Finds the guest's existing conversation for this property (same
 * localStorage key the chat page itself uses, so an order placed from
 * the menu lands in the SAME conversation a guest sees if they later
 * open the actual chat — not a separate, orphaned thread), or creates
 * one if none exists yet.
 *
 * Deliberately a standalone function rather than extracted from
 * stay.$slug.tsx's own ensureConversation — that one is tied to that
 * component's React state, and duplicating the logic here is lower-risk
 * than refactoring already-working, tested chat code to share it.
 */
export async function ensureGuestConversation(propertyId: string, guestName?: string): Promise<string> {
  const existing = typeof localStorage !== "undefined" ? localStorage.getItem(`serai-conv-${propertyId}`) : null;
  if (existing) return existing;

  const session = await ensureGuestSession();
  const linkedCheckin = typeof localStorage !== "undefined" ? localStorage.getItem(`serai-checkin-${propertyId}`) : null;
  const { data, error } = await supabase
    .from("conversations")
    .insert({
      property_id: propertyId,
      guest_name: guestName || null,
      guest_user_id: session.user.id,
      checkin_id: linkedCheckin,
      status: "open",
      last_message_at: new Date().toISOString(),
    })
    .select("id")
    .single();
  if (error) throw error;

  if (typeof localStorage !== "undefined") localStorage.setItem(`serai-conv-${propertyId}`, data.id);
  return data.id;
}
