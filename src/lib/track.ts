/**
 * track — fire a Plausible custom event AND a first-party per-member event.
 *
 * Plausible stays exactly as it was: cookieless, privacy-first, event NAMES and
 * small string/number props only, never anything that identifies a person. On
 * top of that, track() ALSO fire-and-forgets the same event to /api/track, where
 * the server attributes it to the signed httpOnly `fr_member` cookie (an NFC
 * member) and drops it when there is no member or the member opted out. That
 * first-party post is what lets the owner see per-card activity, which cookieless
 * Plausible cannot. The first-party post is SKIPPED when the visitor set the
 * client opt-out marker. Analytics must never throw into product code, so every
 * failure is swallowed.
 *
 * Usage: track("map_pin", { category: "coffee" })
 */
import {
  ANALYTICS_OPTOUT_COOKIE,
  ANALYTICS_OPTOUT_STORAGE_KEY,
} from "@/lib/nfc-constants";

function firstPartyOptedOut(): boolean {
  try {
    if (
      typeof localStorage !== "undefined" &&
      localStorage.getItem(ANALYTICS_OPTOUT_STORAGE_KEY) === "1"
    ) {
      return true;
    }
  } catch {
    /* storage disabled — fall through to the cookie */
  }
  if (typeof document !== "undefined") {
    return new RegExp(`(?:^|;\\s*)${ANALYTICS_OPTOUT_COOKIE}=1`).test(document.cookie);
  }
  return false;
}

/**
 * Fire-and-forget the first-party event to /api/track. The server attributes it
 * to the signed member cookie and drops it when there is no member or the member
 * opted out. Best-effort: any failure is swallowed. Skipped entirely when the
 * client opt-out marker is set.
 */
function postFirstParty(
  event: string,
  props?: Record<string, string | number | boolean>,
): void {
  if (firstPartyOptedOut()) return;
  try {
    const payload: Record<string, unknown> = { event };
    if (typeof location !== "undefined") payload.path = location.pathname;
    if (props) payload.props = props;
    const body = JSON.stringify(payload);

    if (typeof navigator !== "undefined" && typeof navigator.sendBeacon === "function") {
      const blob = new Blob([body], { type: "application/json" });
      if (navigator.sendBeacon("/api/track", blob)) return;
    }
    void fetch("/api/track", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body,
      keepalive: true,
      credentials: "same-origin",
    }).catch(() => {});
  } catch {
    /* ignore — analytics is best-effort */
  }
}

export function track(
  event: string,
  props?: Record<string, string | number | boolean>,
): void {
  if (typeof window === "undefined") return;
  try {
    const plausible = (
      window as unknown as {
        plausible?: (name: string, opts?: { props?: Record<string, unknown> }) => void;
      }
    ).plausible;
    plausible?.(event, props ? { props } : undefined);
  } catch {
    /* ignore — analytics is best-effort */
  }
  // Additionally log to the first-party per-member event log (opt-out honored).
  postFirstParty(event, props);
}

/**
 * Log an event to the first-party per-member log ONLY — never to Plausible.
 *
 * Use this for high-frequency signals like route-change page views: Plausible's
 * own script already counts page views natively, so firing a `page_view` custom
 * event through track() would both double-count in Plausible AND change every
 * visitor's Plausible stream. This path touches only /api/track, where the
 * server drops it unless a signed member cookie is present and not opted out.
 */
export function logActivity(
  event: string,
  props?: Record<string, string | number | boolean>,
): void {
  if (typeof window === "undefined") return;
  postFirstParty(event, props);
}
