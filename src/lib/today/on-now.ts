import { isEventLiveNow } from "@/lib/eventWhenLabel";

/**
 * "On now, near you" — the pure chip selector for the compact live strip that
 * sits between the weather hero and the "I want…" grid on /today.
 *
 * It replaces a copy-heavy seasonal band with at most three TAPPABLE chips, each
 * drawn from a signal the page already computes:
 *   1. an EVENT that is genuinely live this minute (the shared isEventLiveNow
 *      gate — never a future or ended event),
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
  /** Small mono kicker, e.g. "Live now" / "Open now" / "Market today". */
  kicker: string;
  /** The name (venue / place / market), the chip's headline. */
  title: string;
  /** Quiet supporting detail (venue, "till 7 PM", hours). Optional. */
  meta?: string;
};

/** Minimal event shape — matches EventWithMeta without coupling to it. */
export type OnNowEvent = {
  slug: string;
  title: string;
  venue_name?: string | null;
  starts_at: string;
  ends_at?: string;
  is_all_day?: boolean;
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

/** Eastern-minutes → "7 PM" / "7:30 PM"; 1440 reads as "close". */
function fmtEasternMinutes(m: number): string {
  if (m >= 1440) return "close";
  const h24 = Math.floor(m / 60);
  const mm = m % 60;
  const mer = h24 >= 12 ? "PM" : "AM";
  const h12 = h24 % 12 === 0 ? 12 : h24 % 12;
  return mm === 0 ? `${h12} ${mer}` : `${h12}:${String(mm).padStart(2, "0")} ${mer}`;
}

/** The one live event to feature: the soonest-starting event that is live this
 *  minute (isEventLiveNow rejects future, ended, and all-day rows). */
export function pickLiveEvent(events: OnNowEvent[], now: Date): OnNowEvent | null {
  const live = events
    .filter((e) => isEventLiveNow(e, now))
    .sort((a, b) => Date.parse(a.starts_at) - Date.parse(b.starts_at));
  return live[0] ?? null;
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
}): OnNowChip[] {
  const { now, events, pours, markets } = input;
  const chips: OnNowChip[] = [];

  const event = pickLiveEvent(events, now);
  if (event) {
    chips.push({
      kind: "event",
      href: `/events/${event.slug}`,
      kicker: "Live now",
      title: event.title,
      meta: event.venue_name ?? undefined,
    });
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

  const market = markets[0];
  if (market) {
    chips.push({
      kind: "market",
      href: "/category/market",
      kicker: "Market today",
      title: market.name,
      meta: market.hours,
    });
  }

  return chips;
}
