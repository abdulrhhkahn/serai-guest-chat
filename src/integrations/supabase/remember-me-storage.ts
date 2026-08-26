/**
 * Supabase's client always persists sessions the same way (we had it
 * hard-set to localStorage) — there's no per-sign-in "remember me" knob.
 * This wraps localStorage/sessionStorage and picks between them based on
 * a small preference flag, itself always kept in localStorage so it
 * survives regardless of which mode is active.
 *
 * Default (no flag set, or set to anything other than "false") matches
 * the app's original behavior exactly: persistent, localStorage-backed
 * sessions — this only changes anything for someone who explicitly
 * unchecks Remember Me at sign-in.
 */
const REMEMBER_ME_KEY = "sb-remember-me";

function isRememberMeOn(): boolean {
  if (typeof window === "undefined") return true;
  return localStorage.getItem(REMEMBER_ME_KEY) !== "false";
}

export function setRememberMePreference(remember: boolean) {
  if (typeof window === "undefined") return;
  localStorage.setItem(REMEMBER_ME_KEY, remember ? "true" : "false");
}

export const rememberMeAwareStorage = {
  getItem(key: string) {
    if (typeof window === "undefined") return null;
    return isRememberMeOn() ? localStorage.getItem(key) : sessionStorage.getItem(key);
  },
  setItem(key: string, value: string) {
    if (typeof window === "undefined") return;
    if (isRememberMeOn()) {
      localStorage.setItem(key, value);
    } else {
      sessionStorage.setItem(key, value);
    }
  },
  removeItem(key: string) {
    if (typeof window === "undefined") return;
    localStorage.removeItem(key);
    sessionStorage.removeItem(key);
  },
};
