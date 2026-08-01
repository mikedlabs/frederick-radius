/**
 * PWA display-mode + platform helpers — shared by the install prompt and the
 * push/notifications surfaces. The load-bearing fact: iOS Web Push (16.4+)
 * only works when the site is installed to the Home Screen and runs in
 * standalone display mode. In a normal browser tab the Push/Notification APIs
 * may be present but cannot complete the Home Screen permission flow.
 */

/** Running as an installed PWA (standalone), not in a browser tab. */
export function isStandalone(): boolean {
  if (typeof window === "undefined") return false;
  if (window.matchMedia?.("(display-mode: standalone)").matches) return true;
  const nav = window.navigator as Navigator & { standalone?: boolean };
  return Boolean(nav.standalone);
}

/**
 * Identifies iPhone, iPad, iPod, and iPadOS devices that present a
 * desktop-style Macintosh user agent. Keeping this pure makes the small but
 * important browser distinction testable without a DOM.
 */
export function isIosDevice(userAgent: string, maxTouchPoints = 0): boolean {
  return /iPad|iPhone|iPod/.test(userAgent)
    || (/Macintosh/.test(userAgent) && maxTouchPoints > 1);
}

/** Any iOS device, including iPadOS in desktop-identification mode. */
export function isIos(): boolean {
  if (typeof window === "undefined") return false;
  return isIosDevice(window.navigator.userAgent, window.navigator.maxTouchPoints);
}

/**
 * Safari is the reliable iOS path to Add to Home Screen. Facebook, Instagram,
 * Chrome, and other embedded browsers may expose different controls.
 */
export function isIosSafariUserAgent(userAgent: string): boolean {
  const isSafari = /Version\/[\d.]+.*Safari\//.test(userAgent);
  const isAnotherBrowser =
    /CriOS|FxiOS|EdgiOS|OPiOS|DuckDuckGo|GSA|FBAN|FBAV|Instagram/i.test(userAgent);
  return isSafari && !isAnotherBrowser;
}

export function isIosSafari(): boolean {
  if (typeof window === "undefined") return false;
  return isIosSafariUserAgent(window.navigator.userAgent);
}

/** Keep acquisition UI away from focused work and persistent mobile action docks. */
export function isInstallPromptSuppressedPath(pathname: string): boolean {
  return pathname === "/map"
    || pathname.startsWith("/ask")
    || /^\/(places|events)\/[^/]+$/.test(pathname);
}
