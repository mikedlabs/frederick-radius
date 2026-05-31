/**
 * weekend-picks.ts
 *
 * Cached loader behind /weekend — "What's on this weekend," the visitor's
 * second job. The brief's framing: not the civic firehose, the curated
 * few worth planning around. So this strips civic business and ranks the
 * weekend's events by a "draw" score — how much a visitor would regret
 * missing it — to pick the headliner and order the day.
 *
 * Built on the curated eventsWeekend() set so the page always renders
 * without live feeds. A later pass can merge the live feeds (Ticketmaster
 * / Bandsintown / iCal) the /events page already pulls.
 *
 * Cached by Eastern day key (the weekend window only changes once a day),
 * tagged "weekend-picks" + "events" so an events refresh flips it.
 */
import { unstable_cache } from "next/cache";
import { eventsWeekend, isCivicEvent, type EventWithMeta } from "@/lib/loaders/events";
import { easternDayKey } from "@/lib/worth-a-look";

export type WeekendDay = "fri" | "sat" | "sun";

/** Eastern weekday → our three weekend buckets (anything else → sat as a
 *  safe default; the window only ever yields Fri/Sat/Sun). */
export function weekendDayOf(e: Pick<EventWithMeta, "starts_at">): WeekendDay {
  const wd = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    weekday: "short",
  }).format(new Date(e.starts_at));
  if (wd === "Fri") return "fri";
  if (wd === "Sun") return "sun";
  return "sat";
}

/**
 * Categories that read as a real visitor draw, weighted. A festival or a
 * concert is something you plan a weekend around; a generic listing is
 * not. Unlisted categories get a neutral floor so nothing is buried for
 * lacking a weight.
 */
const DRAW_BY_CATEGORY: Record<string, number> = {
  festival: 1.0, music: 0.9, market: 0.85, arts: 0.8, theater: 0.8,
  family: 0.75, food: 0.75, gallery: 0.7, museum: 0.65, outdoors: 0.6,
};

/**
 * "Can't-miss" draw score (0–1+). Blends the signals a curated weekend
 * lead should reflect: category pull, a hero photo (festival-grade
 * listings have art), free admission (accessible to anyone visiting),
 * audience breadth, and a recurring-marquee bump (First Saturday, Alive
 * @ Five and friends recur — that's a signal of an anchor event, not
 * noise). Cancelled/postponed events sink so they never headline.
 */
export function eventDrawScore(e: EventWithMeta): number {
  if (e.status === "cancelled" || e.status === "postponed") return 0;
  let s = DRAW_BY_CATEGORY[e.category] ?? 0.5;
  if (e.hero_image) s += 0.25;
  if (e.is_free) s += 0.1;
  if ((e.audience?.length ?? 0) >= 2) s += 0.05;
  if (e.is_recurring) s += 0.1; // anchor/marquee series
  return s;
}

export type WeekendData = {
  /** The single can't-miss headliner (highest draw), or null if empty. */
  lead: EventWithMeta | null;
  /** Everything (incl. the lead), time-sorted, grouped by day. */
  byDay: Record<WeekendDay, EventWithMeta[]>;
  /** Per-day counts for the day tabs. */
  counts: Record<WeekendDay, number>;
  total: number;
};

export const getWeekendData = unstable_cache(
  async (_dayKey: string): Promise<WeekendData> => {
    void _dayKey; // cache key only; window is derived from real "now"
    const all = eventsWeekend(new Date()).filter((e) => !isCivicEvent(e));

    const byDay: Record<WeekendDay, EventWithMeta[]> = { fri: [], sat: [], sun: [] };
    for (const e of all) byDay[weekendDayOf(e)].push(e);

    // Lead = highest draw across the whole weekend; ties break to the
    // earlier start so the headliner is also the soonest big thing.
    const lead =
      all.length === 0
        ? null
        : [...all].sort((a, b) => {
            const d = eventDrawScore(b) - eventDrawScore(a);
            return d !== 0 ? d : +new Date(a.starts_at) - +new Date(b.starts_at);
          })[0];

    return {
      lead,
      byDay,
      counts: { fri: byDay.fri.length, sat: byDay.sat.length, sun: byDay.sun.length },
      total: all.length,
    };
  },
  ["weekend-picks", process.env.VERCEL_GIT_COMMIT_SHA ?? "dev"],
  { revalidate: 3600, tags: ["weekend-picks", "events"] },
);

/** Today's Eastern day key — the weekend cache bucket. */
export function weekendDayKey(now: Date = new Date()): string {
  return easternDayKey(now);
}
