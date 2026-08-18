import { supabase } from "@/integrations/supabase/client";
import type { Session } from "@supabase/supabase-js";

/**
 * Ensures the guest has a Supabase session. Guests never log in, so we use
 * Anonymous Sign-in: the first call creates a persistent anonymous user whose
 * JWT (role `authenticated`, is_anonymous=true) scopes their conversation and
 * messages via RLS. The session is persisted in localStorage by supabase-js,
 * so a refresh or return visit on the same device restores the same identity
 * and therefore the same chat history.
 *
 * PREREQUISITE: enable "Anonymous sign-ins" in the Supabase dashboard
 * (Authentication → Sign In / Providers).
 */
let inflight: Promise<Session> | null = null;

export function ensureGuestSession(): Promise<Session> {
  if (inflight) return inflight;
  inflight = (async () => {
    const { data } = await supabase.auth.getSession();
    if (data.session) return data.session;
    const { data: signed, error } = await supabase.auth.signInAnonymously();
    if (error || !signed.session) {
      inflight = null;
      throw error ?? new Error("Could not start guest session");
    }
    return signed.session;
  })();
  return inflight;
}
