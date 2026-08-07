/**
 * Guest-facing notifications.
 *
 * Uses the Web Notifications API through the PWA service worker registration so
 * notifications also surface when the guest has the tab backgrounded or the
 * installed PWA closed to the home screen.
 */

export type NotifyPermission = "default" | "granted" | "denied" | "unsupported";

export function notificationSupport(): NotifyPermission {
  if (typeof window === "undefined" || !("Notification" in window)) return "unsupported";
  return Notification.permission as NotifyPermission;
}

export async function requestNotifyPermission(): Promise<NotifyPermission> {
  if (notificationSupport() === "unsupported") return "unsupported";
  const result = await Notification.requestPermission();
  return result as NotifyPermission;
}

export async function notifyGuest(title: string, body: string, tag: string) {
  if (notificationSupport() !== "granted") return;
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
