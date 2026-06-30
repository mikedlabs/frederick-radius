/**
 * PWA display-mode + platform helpers — shared by the install prompt and the
 * push/notifications surfaces. The load-bearing fact: iOS Safari Web Push
 * (iOS 16.4+) only works when the site is INSTALLED to the Home Screen and
 * runs in standalone display mode. In a normal Safari tab the Push/Notification
 * APIs are present but no-op, so every push surface must gate on these.
 */

/** Running as an installed PWA (standalone), not in a browser tab. */
export function isStandalone(): boolean {
  if (typeof window === "undefined") return false;
  if (window.matchMedia?.("(display-mode: standalone)").matches) return true;
  const nav = window.navigator as Navigator & { standalone?: boolean };
  return Boolean(nav.standalone);
}

/** Any iOS device (iPhone/iPad/iPod). */
export function isIos(): boolean {
  if (typeof window === "undefined") return false;
  return /iPad|iPhone|iPod/.test(window.navigator.userAgent);
}

/** iOS Safari specifically — the only iOS browser with Add to Home Screen
 *  (iOS Chrome/Firefox/Edge can't install a PWA, so the instructions differ). */
export function isIosSafari(): boolean {
  if (!isIos()) return false;
  return !/CriOS|FxiOS|EdgiOS|OPiOS|mercury/i.test(window.navigator.userAgent);
}
