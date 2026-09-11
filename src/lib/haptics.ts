/**
 * Tiny haptic feedback helper. Call `haptic("light")` anywhere; it picks the
 * right physical-feedback path for the device without every call site having
 * to know how.
 *
 * Two paths:
 *  - Android / anything with the Vibration API → `navigator.vibrate`, which
 *    honors the real short pattern below.
 *  - iOS Safari has no Vibration API at all, so `navigator.vibrate` is
 *    undefined and, until now, every haptic() call across ~47 surfaces was a
 *    silent no-op on the iPhone most locals actually hold. iOS 17.4+ does
 *    drive the Taptic Engine when an `<input type="checkbox" switch>` is
 *    toggled inside a user gesture, so we keep one hidden switch and click it.
 *    It is a single system tap, not a pattern language, but it turns the
 *    whole tactile layer from dead to alive on iOS.
 *
 * Patterns intentionally short — premium apps use sub-20ms taps.
 */

export type HapticPattern =
  | "light"
  | "medium"
  | "heavy"
  | "success"
  | "warning"
  | "error";

export type PhoneFeedbackSupport = "vibration" | "ios-tap" | "none";

export const PHONE_FEEDBACK_STORAGE_KEY = "fr-phone-feedback";
export const PHONE_FEEDBACK_CHANGE_EVENT = "fr:phone-feedback-change";

const PATTERNS: Record<HapticPattern, number | number[]> = {
  light: 8,
  medium: 14,
  heavy: 22,
  success: [10, 60, 10],
  warning: [12, 40, 12],
  error: [22, 50, 22],
};

// One reused hidden switch — created lazily on the first iOS tap so it never
// exists during SSR and never churns the DOM.
let iosSwitch: HTMLInputElement | null = null;
// If localStorage is blocked, the current page still has to honor an explicit
// opt-out. A recognized stored value takes precedence when storage works.
let volatileFeedbackPreference: boolean | null = null;

function isIOS(): boolean {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent || "";
  if (/iP(hone|od|ad)/.test(ua)) return true;
  // iPadOS 13+ reports a desktop Safari UA; touch points disambiguate it from
  // a real Mac.
  return (
    (navigator.platform === "MacIntel" || /Macintosh/.test(ua)) &&
    typeof navigator.maxTouchPoints === "number" &&
    navigator.maxTouchPoints > 1
  );
}

function supportsIosSwitchTap(): boolean {
  if (!isIOS()) return false;
  const ua = navigator.userAgent || "";
  const version =
    ua.match(/\bOS (\d+)_(\d+)/) ??
    ua.match(/\bVersion\/(\d+)\.(\d+)/);
  if (!version) return false;
  const major = Number(version[1]);
  const minor = Number(version[2]);
  return major > 17 || (major === 17 && minor >= 4);
}

/**
 * Device-local preference. Existing users keep the feedback they already had;
 * writing "off" is the only thing that silences it. Storage failures are
 * intentionally fail-open so a privacy mode or full storage bucket never
 * breaks the interaction that called haptic().
 */
export function isPhoneFeedbackEnabled(): boolean {
  if (typeof window === "undefined") return true;
  try {
    const stored = window.localStorage.getItem(PHONE_FEEDBACK_STORAGE_KEY);
    if (stored === "off") return false;
    if (stored === "on") return true;
  } catch {
    // Fall through to the in-memory preference for this page.
  }
  return volatileFeedbackPreference ?? true;
}

export function setPhoneFeedbackEnabled(enabled: boolean): void {
  if (typeof window === "undefined") return;
  volatileFeedbackPreference = enabled;
  try {
    window.localStorage.setItem(
      PHONE_FEEDBACK_STORAGE_KEY,
      enabled ? "on" : "off",
    );
  } catch {
    // Keep the live setting usable even when storage is unavailable.
  }
  window.dispatchEvent(
    new CustomEvent(PHONE_FEEDBACK_CHANGE_EVENT, {
      detail: { enabled },
    }),
  );
}

export function phoneFeedbackSupport(): PhoneFeedbackSupport {
  if (typeof navigator === "undefined") return "none";
  const nav = navigator as Navigator & {
    vibrate?: (p: number | number[]) => boolean;
  };
  if (typeof nav.vibrate === "function") return "vibration";
  return supportsIosSwitchTap() ? "ios-tap" : "none";
}

function iosSwitchTap(): boolean {
  if (typeof document === "undefined") return false;
  if (!iosSwitch) {
    const el = document.createElement("input");
    el.type = "checkbox";
    // The `switch` attribute is what arms the Taptic tap on iOS 17.4+.
    el.setAttribute("switch", "");
    // Out of the a11y tree and tab order; off-screen but NOT display:none, or
    // the click event won't dispatch.
    el.setAttribute("aria-hidden", "true");
    el.tabIndex = -1;
    el.style.cssText =
      "position:fixed;top:0;left:0;width:1px;height:1px;opacity:0;pointer-events:none;";
    document.body.appendChild(el);
    iosSwitch = el;
  }
  // Toggling by click inside the active user gesture is what fires the tap.
  iosSwitch.click();
  return true;
}

export function haptic(pattern: HapticPattern = "light"): boolean {
  if (
    typeof navigator === "undefined" ||
    !isPhoneFeedbackEnabled()
  ) {
    return false;
  }
  const nav = navigator as Navigator & {
    vibrate?: (p: number | number[]) => boolean;
    userActivation?: { isActive?: boolean };
  };
  // Real Vibration API (Android and friends): honor the short pattern.
  if (typeof nav.vibrate === "function") {
    try {
      return nav.vibrate(PATTERNS[pattern]) !== false;
    } catch {
      // ignore — some browsers throw if called too rapidly
      return false;
    }
  }
  // iOS: a single system tap via the switch bridge. The pattern shape can't
  // survive here, and WebKit only permits it inside the active user gesture.
  // Scheduled cues therefore remain visual-only instead of pretending a
  // delayed physical tap was delivered.
  if (supportsIosSwitchTap() && nav.userActivation?.isActive === true) {
    try {
      return iosSwitchTap();
    } catch {
      // ignore — defensive; the bridge must never break a tap handler
      return false;
    }
  }
  return false;
}
