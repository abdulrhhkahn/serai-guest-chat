/**
 * Guest-facing notifications.
 *
 * Uses the Web Notifications API through the PWA service worker registration so
 * notifications also surface when the guest has the tab backgrounded or the
 * installed PWA closed to the home screen.
 */

export type NotifyPermission = "default" | "granted" | "denied" | "unsupported";

/** Per-device opt-in per notification kind. */
export type NotifyPrefs = { ai: boolean; staff: boolean; resolved: boolean };
export type NotifyKind = keyof NotifyPrefs;

const PREFS_KEY = "serai-notify-prefs";
const DEFAULT_PREFS: NotifyPrefs = { ai: true, staff: true, resolved: true };

export function loadNotifyPrefs(): NotifyPrefs {
  if (typeof localStorage === "undefined") return DEFAULT_PREFS;
  try {
    const raw = JSON.parse(localStorage.getItem(PREFS_KEY) || "null");
    if (!raw || typeof raw !== "object") return DEFAULT_PREFS;
    return {
      ai: raw.ai !== false,
      staff: raw.staff !== false,
      resolved: raw.resolved !== false,
    };
  } catch {
    return DEFAULT_PREFS;
  }
}

export function saveNotifyPrefs(prefs: NotifyPrefs) {
  if (typeof localStorage === "undefined") return;
  localStorage.setItem(PREFS_KEY, JSON.stringify(prefs));
}

export function notificationSupport(): NotifyPermission {
  if (typeof window === "undefined" || !("Notification" in window)) return "unsupported";
  return Notification.permission as NotifyPermission;
}

export async function requestNotifyPermission(): Promise<NotifyPermission> {
  if (notificationSupport() === "unsupported") return "unsupported";
  const result = await Notification.requestPermission();
  return result as NotifyPermission;
}

export async function notifyGuest(title: string, body: string, tag: string, kind?: NotifyKind) {
  if (notificationSupport() !== "granted") return;
  if (kind && !loadNotifyPrefs()[kind]) return;
  const options: NotificationOptions = {
    body,
    tag,
    icon: "/pwa-192x192.png",
    badge: "/pwa-192x192.png",
  };
  try {
    if ("serviceWorker" in navigator) {
      const reg = await navigator.serviceWorker.getRegistration();
      if (reg) {
        await reg.showNotification(title, options);
        return;
      }
    }
    new Notification(title, options);
  } catch {
    /* notification failed — the in-app status pill still updates */
  }
}
