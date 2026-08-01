/**
 * track — fire a Plausible custom event AND a first-party per-member event.
 *
 * Plausible receives only a small allowlist of stable event names, never search
 * text, answer text, or anything that identifies a person. On top of that,
 * track() ALSO fire-and-forgets the event to /api/track, where
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

/**
 * Starter-plan measurement stays deliberately small. Native pageviews answer
 * where people arrive; these goals answer whether Radius helped. Everything
 * else still reaches the private per-member beta log below, but does not spend
 * another billable Plausible event or distort bounce rate.
 */
export const PLAUSIBLE_GOAL_EVENTS = new Set([
  "find_open",
  "search_pick",
  "search_map",
  "search_empty",
  "ask_open",
  "ask_submit",
  "ask_answer",
  "ask_empty",
  "map_pin",
  "pulse_item_open",
  "compass_tool_open",
  "save_place",
  "save_event",
  "calendar_add",
  "push_optin",
  "keep_radius_offer",
  "keep_radius_success",
  "keep_radius_dismiss",
  "pwa_launch",
  "report_submit",
  "feedback_send",
  "share_today",
]);

export function shouldSendToPlausible(
  event: string,
  props?: Record<string, string | number | boolean>,
): boolean {
  if (!PLAUSIBLE_GOAL_EVENTS.has(event)) return false;
  // A save goal means activation, not undoing a save later.
  if ((event === "save_place" || event === "save_event") && props?.on === false) return false;
  return true;
}

type PlausibleFn = ((name: string) => void) & {
  q?: string[][];
};

function plausibleQueue(): PlausibleFn | null {
  if (typeof window === "undefined") return null;
  const target = window as unknown as { plausible?: PlausibleFn };
  if (target.plausible) return target.plausible;
  const queued = ((...args: [string]) => {
    (queued.q = queued.q || []).push(args);
  }) as PlausibleFn;
  target.plausible = queued;
  return queued;
}

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
  if (shouldSendToPlausible(event, props)) {
    try {
      // Starter cannot analyze custom properties. Sending only the stable goal
      // name also guarantees raw Search/Ask text can never leave through this
      // path. Anonymous misses already have their own first-party data-gap log.
      plausibleQueue()?.(event);
    } catch {
      /* ignore — analytics is best-effort */
    }
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
