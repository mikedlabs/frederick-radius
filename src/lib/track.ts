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
  // Cross-surface outcomes. Only LEAD impressions reach Plausible (see the
  // gate below), so Radius can measure the public decision funnel without
  // billing and dashboard noise from every alternative card that scrolls by.
  "decision_impression",
  "decision_open",
  "decision_action",
  "decision_helpful",
  "decision_not_relevant",
  "decision_wrong",
]);

/**
 * Plausible Starter does not expose custom-property breakdowns, so a generic
 * `decision_open` cannot answer which core surface helped. Translate only the
 * three product journeys Radius is actively judging into stable goal names.
 * The categorical props are used locally for routing and are never passed to
 * Plausible.
 *
 * Install completion needs the same distinction. Copying or sharing a return
 * link is a successful Return Bridge action, but it is not an app install.
 * Native browser acceptance is counted separately from the iPhone's explicit
 * self-report because Safari provides no install-complete browser event.
 */
export function plausibleGoalName(
  event: string,
  props?: Record<string, string | number | boolean>,
  pathname?: string,
): string | null {
  if (!shouldSendToPlausible(event, props)) return null;

  if (
    event === "decision_impression" &&
    pathname === "/today" &&
    props?.surface === "today" &&
    props.position === "lead"
  ) {
    return "today_answer_view";
  }
  if (
    event === "decision_impression" &&
    pathname === "/map" &&
    props?.surface === "map" &&
    props.position === "result"
  ) {
    return "map_result_view";
  }
  if (
    event === "decision_open" &&
    pathname === "/events" &&
    props?.surface === "events"
  ) {
    return "events_detail_open";
  }
  if (event === "keep_radius_success") {
    if (props?.method === "native" || props?.method === "appinstalled") {
      return "install_complete";
    }
    if (props?.method === "manual_confirm") {
      return "install_reported_complete";
    }
  }
  return event;
}

export function shouldSendToPlausible(
  event: string,
  props?: Record<string, string | number | boolean>,
): boolean {
  if (!PLAUSIBLE_GOAL_EVENTS.has(event)) return false;
  if (
    event === "decision_impression" &&
    props?.position !== "lead" &&
    !(props?.surface === "map" && props.position === "result")
  ) {
    return false;
  }
  // A save goal means activation, not undoing a save later.
  if ((event === "save_place" || event === "save_event") && props?.on === false) return false;
  return true;
}

type PlausibleFn = ((
  name: string,
  options?: { interactive?: boolean },
) => void) & {
  q?: Array<[string, { interactive?: boolean }?]>;
};

const NON_INTERACTIVE_PLAUSIBLE_GOALS = new Set([
  // These are exposures, not deliberate interactions. They remain useful goal
  // counts but must not turn an otherwise bounced visit into an engaged visit.
  "today_answer_view",
  "map_result_view",
]);

function plausibleQueue(): PlausibleFn | null {
  if (typeof window === "undefined") return null;
  const target = window as unknown as { plausible?: PlausibleFn };
  if (target.plausible) return target.plausible;
  const queued = ((...args: [string, { interactive?: boolean }?]) => {
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
  const pathname = typeof location === "undefined" ? undefined : location.pathname;
  const goal = plausibleGoalName(event, props, pathname);
  if (goal) {
    try {
      // Starter cannot analyze custom properties. Sending only the stable goal
      // name also guarantees raw Search/Ask text can never leave through this
      // path. Anonymous misses already have their own first-party data-gap log.
      plausibleQueue()?.(
        goal,
        NON_INTERACTIVE_PLAUSIBLE_GOALS.has(goal)
          ? { interactive: false }
          : undefined,
      );
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
