import { isEventLiveNow } from "@/lib/eventWhenLabel";
import { compareForLead, eventLeadTier } from "@/lib/events/lead-rank";

/**
 * "On now, near you" — the pure chip selector for the compact live strip that
 * sits between the weather hero and the "I want…" grid on /today.
 *
 * It replaces a copy-heavy seasonal band with at most three TAPPABLE chips, each
 * drawn from a signal the page already computes:
 *   1. an EVENT worth heading out for: a DRAW that is genuinely live this
 *      minute (the shared isEventLiveNow gate plus the same draw/utility/
 *      routine tiers WhatsOn ranks by — a civic meeting or a standing library
 *      program never headlines the strip), or, when no draw is live, the next
 *      draw starting within the hour-and-a-half with an honest "Starts in
 *      N min" kicker,
 *   2. a PLACE open now with something on (a verified happy hour pouring right
 *      now, the same live-window signal HappyHourWallet / OnNowBand ride),
 *   3. a MARKET actually open today (markets-today, a real market, not a
 *      "season is running" blurb).
 *
 * Honesty is the hard rule: a slot with nothing drops its chip, and if nothing
 * qualifies the caller renders nothing (empty array → no box). Pure (all inputs
 * passed in, no Date.now / no I/O) so the selection + self-hide behaviour is
 * unit-tested without the loaders or the network.
 */

export type OnNowKind = "event" | "place" | "market";

export type OnNowChip = {
  kind: OnNowKind;
  href: string;
  /** Small mono kicker, e.g. "Live now" / "Starts in 20 min" / "Open now". */
  kicker: string;
  /** The name (venue / place / market), the chip's headline. */
  title: string;
  /** Quiet supporting detail (venue, "till 7 PM", hours). Optional. */
  meta?: string;
  /** True only when the thing is happening THIS MINUTE — the renderer keys
   *  the pulsing live dot on this, so a "Starts in N min" chip never pulses. */
  live?: boolean;
};

/** Minimal event shape — matches EventWithMeta without coupling to it.
 *  category + hero_image feed the shared lead tiers (draw vs routine vs
 *  utility), so the strip and the What's-On rail agree on what headlines. */
export type OnNowEvent = {
  slug: string;
  title: string;
  venue_name?: string | null;
  starts_at: string;
  ends_at?: string;
  is_all_day?: boolean;
  category?: string;
  hero_image?: string | null;
};

/** A happy hour pouring RIGHT NOW, already resolved to its place + window by the
 *  caller (which owns the loaders). endsAt is Eastern minutes; 1440 = close. */
export type OnNowPour = {
  slug: string;
  name: string;
  endsAt: number;
  lastCall: boolean;
};

/** A farmers market open TODAY (markets-today already filtered to the weekday). */
export type OnNowMarket = {
  name: string;
  hours?: string;
};

export type MarketTiming = "now" | "later" | "earlier" | "today";

type MarketWindow = { start: number; end: number };

/** Parse a published market range into Eastern minutes. */
export function marketWindowMinutes(hours?: string): MarketWindow | null {
  if (!hours) return null;
  const normalized = hours
    .replace(/\bnoon\b/gi, "12pm")
    .replace(/\bmidnight\b/gi, "12am")
    .replace(/a\.\s*m\./gi, "am")
    .replace(/p\.\s*m\./gi, "pm");
  const range = normalized.match(
    /(\d{1,2})(?::(\d{2}))?\s*(am|pm)?\s*(?:-|\u2013|\u2014|to)\s*(\d{1,2})(?::(\d{2}))?\s*(am|pm)?/i,
  );
  if (!range || (!range[3] && !range[6])) return null;

  const toMinutes = (hourText: string, minuteText: string | undefined, meridiem: string): number | null => {
    const hour = Number(hourText);
    const minute = minuteText ? Number(minuteText) : 0;
    if (!Number.isFinite(hour) || hour < 1 || hour > 12 || minute < 0 || minute > 59) return null;
    const hour24 = meridiem.toLowerCase() === "pm" ? (hour % 12) + 12 : hour % 12;
    return hour24 * 60 + minute;
  };

  const endMeridiem = range[6] ?? range[3];
  const startMeridiem = range[3] ?? endMeridiem;
  if (!startMeridiem || !endMeridiem) return null;
  let start = toMinutes(range[1], range[2], startMeridiem);
  const end = toMinutes(range[4], range[5], endMeridiem);
  // Published market hours often omit the first suffix ("11-1 PM"). If
  // copying the end suffix would put the start after the end, the range crosses
  // noon and the missing start suffix is AM.
  if (start != null && end != null && !range[3] && endMeridiem.toLowerCase() === "pm" && start >= end) {
    start = toMinutes(range[1], range[2], "am");
  }
  if (start == null || end == null || end <= start) return null;
  return { start, end };
}

/**
 * The end of a market's published range ("3pm - 6pm", "9:30am-1pm") as
 * Eastern minutes, or null when the full range is not parseable.
 * The weekday filter alone let a 3-6pm market sit under a pulsing ON NOW
 * header at 9:47 PM (fresh-eyes audit, Jul 2026); this is the missing
 * clock half of that gate.
 */
export function marketEndMinutes(hours?: string): number | null {
  return marketWindowMinutes(hours)?.end ?? null;
}

/** The current Eastern wall-clock time as minutes since midnight.
 *  (easternParts in lib/tz deliberately omits minutes - don't reach for it.) */
function easternMinutesOfDay(d: Date): number {
  const p = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", {
      timeZone: "America/New_York",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    })
      .formatToParts(d)
      .map((x) => [x.type, x.value]),
  ) as Record<string, string>;
  return Number(p.hour) * 60 + Number(p.minute);
}

/** Classify a market using both ends of its published range. */
export function marketTimingAt(hours: string | undefined, now: Date): MarketTiming {
  const window = marketWindowMinutes(hours);
  if (!window) return "today";
  const current = easternMinutesOfDay(now);
  if (current < window.start) return "later";
  if (current >= window.end) return "earlier";
  return "now";
}

/** Choose a truthful masthead for the current-utility band. */
export function todayUtilityBandLabel(input: {
  currentCount: number;
  laterCount: number;
  todayCount: number;
}): "Available now" | "Later today" | "For today" | null {
  if (input.currentCount > 0) return "Available now";
  if (input.laterCount > 0) return "Later today";
  if (input.todayCount > 0) return "For today";
  return null;
}

/** Keep every count attached to the thing it counts. A mixed utility band may
 * contain happy hours, specials, markets, and parking; "13 later today" loses
 * the decision value the individual counts already carry. */
export function itemizedTodayUtilitySummary(input: {
  current: readonly string[];
  later: readonly string[];
  today: readonly string[];
}): string {
  if (input.current.length > 0) {
    return [...input.current, ...input.later].join(" · ");
  }
  return (input.later.length > 0 ? input.later : input.today).join(" · ");
}

/** Eastern-minutes → "7 PM" / "7:30 PM"; 1440 reads as "close". */
function fmtEasternMinutes(m: number): string {
  if (m >= 1440) return "close";
  const h24 = Math.floor(m / 60);
  const mm = m % 60;
  const mer = h24 >= 12 ? "PM" : "AM";
  const h12 = h24 % 12 === 0 ? 12 : h24 % 12;
  return mm === 0 ? `${h12} ${mer}` : `${h12}:${String(mm).padStart(2, "0")} ${mer}`;
}

/** The one live event to feature: the best DRAW that is live this minute.
 *  isEventLiveNow rejects future, ended, and all-day rows; the lead tier
 *  rejects civic/utility business and routine standing programs (the 11 AM
 *  audit render headlined a DCFS office-hours row as "LIVE NOW"), and
 *  compareForLead ranks what's left exactly the way the What's-On rail does. */
export function pickLiveEvent(events: OnNowEvent[], now: Date): OnNowEvent | null {
  const live = events
    .filter((e) => isEventLiveNow(e, now) && eventLeadTier(e) === 0)
    .sort(compareForLead);
  return live[0] ?? null;
}

/** How far ahead the "Starts in N min" fallback may look. Past ~an hour and a
 *  half a countdown kicker stops being a "head out now" signal. */
export const NEXT_DRAW_WINDOW_MIN = 90;

/** When no draw is live: the next DRAW starting within the window, with the
 *  real minutes until it starts (never 0 — a start this instant reads as 1).
 *  All-day rows have no clock to count down to, so they never qualify. */
export function pickNextDraw(
  events: OnNowEvent[],
  now: Date,
  windowMin: number = NEXT_DRAW_WINDOW_MIN,
): { event: OnNowEvent; startsInMin: number } | null {
  const t = now.getTime();
  const next = events
    .filter((e) => {
      if (e.is_all_day) return false;
      if (eventLeadTier(e) !== 0) return false;
      const start = Date.parse(e.starts_at);
      return Number.isFinite(start) && start > t && start - t <= windowMin * 60_000;
    })
    .sort((a, b) => Date.parse(a.starts_at) - Date.parse(b.starts_at))[0];
  if (!next) return null;
  return {
    event: next,
    startsInMin: Math.max(1, Math.ceil((Date.parse(next.starts_at) - t) / 60_000)),
  };
}

/** The one open-now place to feature: last call first (most urgent), else the
 *  pour ending soonest. Callers pass only pours whose window includes now. */
export function pickLivePour(pours: OnNowPour[]): OnNowPour | null {
  if (pours.length === 0) return null;
  return [...pours].sort(
    (a, b) => Number(b.lastCall) - Number(a.lastCall) || a.endsAt - b.endsAt,
  )[0];
}

/**
 * Assemble the strip: at most one chip per kind, in reading order
 * event → place → market. Returns [] when nothing is genuinely on now, which is
 * the caller's signal to render nothing at all.
 */
export function selectOnNowChips(input: {
  now: Date;
  events: OnNowEvent[];
  pours: OnNowPour[];
  markets: OnNowMarket[];
  /** Event slug already featured elsewhere on Today. The strip skips it and
   *  uses the next useful live item instead. */
  excludeEventSlug?: string | null;
}): OnNowChip[] {
  const { now, events, pours, markets, excludeEventSlug } = input;
  const chips: OnNowChip[] = [];

  const eventPool = excludeEventSlug ? events.filter((e) => e.slug !== excludeEventSlug) : events;
  const event = pickLiveEvent(eventPool, now);
  if (event) {
    chips.push({
      kind: "event",
      href: `/events/${event.slug}`,
      kicker: "Live now",
      title: event.title,
      meta: event.venue_name ?? undefined,
      live: true,
    });
  } else {
    // No draw is live — fall back honestly to the next one starting soon,
    // with a countdown kicker instead of a "live" claim (and never a utility
    // or routine-program filler).
    const next = pickNextDraw(eventPool, now);
    if (next) {
      chips.push({
        kind: "event",
        href: `/events/${next.event.slug}`,
        kicker: `Starts in ${next.startsInMin} min`,
        title: next.event.title,
        meta: next.event.venue_name ?? undefined,
      });
    }
  }

  const pour = pickLivePour(pours);
  if (pour) {
    chips.push({
      kind: "place",
      href: `/places/${pour.slug}`,
      kicker: pour.lastCall ? "Last call" : "Open now",
      title: pour.name,
      meta: pour.endsAt >= 1440 ? "till close" : `till ${fmtEasternMinutes(pour.endsAt)}`,
    });
  }

  // A weekday match is not a live signal. The full published range must
  // include the current Eastern time before the market enters this strip.
  const market = markets.find((m) => marketTimingAt(m.hours, now) === "now");
  if (market) {
    chips.push({
      kind: "market",
      href: "/category/market",
      kicker: "Open now",
      title: market.name,
      meta: market.hours,
    });
  }

  return chips;
}
