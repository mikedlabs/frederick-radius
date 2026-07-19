/**
 * betaPulse — the "Frederick, right now" proof line for the /beta launch cover.
 *
 * The beta page's whole pitch is "a LIVING field guide," so the page should
 * prove it with real county data instead of asserting it. This gathers a small,
 * high-signal set of genuinely-live facts, every one timeout-guarded and
 * fail-soft: a field that can't resolve is simply omitted (the band shows what's
 * true right now, never a fabricated number). Server-only; streamed into the
 * page under a Suspense boundary so the access gate paints instantly.
 */
import CLIENT_PLACES from "@/data/places-client.json" with { type: "json" };
import { MUNICIPALITIES } from "@/data/municipalities";
import { assembleUnifiedEvents } from "@/lib/loaders/unifiedEvents";
import { openNowHighlights } from "@/lib/loaders/places";
import { getKeysScoreToday, type KeysScore } from "@/lib/integrations/keysScore";
import { getFrederickStockings } from "@/lib/integrations/dnrTrout";
import { isEventToday, isEventEnded } from "@/lib/eventWhenLabel";

export type BetaPulse = {
  places: number;
  towns: number;
  eventsToday: number | null;
  /** The first three of today's events (soonest first) so the contents
   *  row can show the calendar itself, not just count it. Null exactly
   *  when eventsToday is null (the same timed fetch produces both). */
  eventsSample: { title: string; startsAt: string; venue: string | null }[] | null;
  /** County-wide open-right-now: the shared countOpenNow population, plus
   *  a few real names so the proof strip can say who, not just how many. */
  openNow: { count: number; names: string[] } | null;
  keys: KeysScore | null;
  troutThisWeek: boolean;
};

function withTimeout<T>(p: Promise<T>, ms: number, fallback: T): Promise<T> {
  let t: ReturnType<typeof setTimeout>;
  const timeout = new Promise<T>((resolve) => {
    t = setTimeout(() => resolve(fallback), ms);
  });
  return Promise.race([Promise.resolve(p).catch(() => fallback), timeout]).finally(() => clearTimeout(t));
}

export async function getBetaPulse(now: Date = new Date()): Promise<BetaPulse> {
  const places = Array.isArray(CLIENT_PLACES) ? CLIENT_PLACES.length : 0;
  const towns = MUNICIPALITIES.length;

  // Synchronous CPU work over the decorated pipeline — fail-soft like the
  // network facts: a throw means the strip omits the open-now line, never
  // a fabricated number.
  let openNow: BetaPulse["openNow"] = null;
  try {
    openNow = openNowHighlights(3, now);
  } catch {
    openNow = null;
  }

  const [events, keys, trout] = await Promise.all([
    // Canonical unified set (cached), windowed to today and not-yet-ended.
    withTimeout(
      assembleUnifiedEvents(now).then(({ publicEvents }) => {
        const today = publicEvents
          .filter((e) => isEventToday(e.starts_at, now) && !isEventEnded(e, now))
          .sort((a, b) => Date.parse(a.starts_at) - Date.parse(b.starts_at));
        return {
          count: today.length,
          sample: today.slice(0, 3).map((e) => ({
            title: e.title,
            startsAt: e.starts_at,
            venue: e.venue_name && e.venue_name.trim() ? e.venue_name : null,
          })),
        };
      }),
      3000,
      null as { count: number; sample: { title: string; startsAt: string; venue: string | null }[] } | null,
    ),
    withTimeout(getKeysScoreToday(now), 2500, null as KeysScore | null),
    withTimeout(getFrederickStockings(7).then((s) => s.length > 0), 2500, false),
  ]);

  return {
    places,
    towns,
    eventsToday: events?.count ?? null,
    eventsSample: events?.sample ?? null,
    openNow,
    keys,
    troutThisWeek: trout,
  };
}
