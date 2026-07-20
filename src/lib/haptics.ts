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

type Pattern = "light" | "medium" | "heavy" | "success" | "warning" | "error";

const PATTERNS: Record<Pattern, number | number[]> = {
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

function iosSwitchTap(): void {
  if (typeof document === "undefined") return;
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
}

export function haptic(pattern: Pattern = "light"): void {
  if (typeof navigator === "undefined") return;
  const nav = navigator as Navigator & {
    vibrate?: (p: number | number[]) => boolean;
  };
  // Real Vibration API (Android and friends): honor the short pattern.
  if (typeof nav.vibrate === "function") {
    try {
      nav.vibrate(PATTERNS[pattern]);
    } catch {
      // ignore — some browsers throw if called too rapidly
    }
    return;
  }
  // iOS: a single system tap via the switch bridge. The pattern shape can't
  // survive here (one tap is all the Taptic Engine gives us this way), but a
  // real confirmation beats none.
  if (isIOS()) {
    try {
      iosSwitchTap();
    } catch {
      // ignore — defensive; the bridge must never break a tap handler
    }
  }
}
