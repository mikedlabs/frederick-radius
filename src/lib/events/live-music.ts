/**
 * Live music tonight — the wedge answer the existing intents miss.
 *
 * Both intent systems answer live music as a PLACE ("where are the stages")
 * via the `music` category / the /nearby?c=music door. Nobody answers the
 * actual question a person carries on a Friday night: who is ON STAGE tonight?
 * That is an EVENT answer, and it's the one thing Google structurally can't do
 * well — most Frederick live music is brewery/winery/bar lineups that
 * Ticketmaster (ticketed only) and Bandsintown (artist-scoped) never see, but
 * the venue iCal/Squarespace feeds in src/data/live-music-venues.ts do.
 *
 * Honesty ceiling: we render only REAL dated shows in the tonight window, with
 * the feed's own start time. We never assert a genre, a quality, or that a
 * stage "has music" without a confirmed event — a venue with no show tonight
 * simply does not appear.
 */
import type { EventWithMeta } from "@/lib/loaders/events";
import { LIVE_MUSIC_VENUE_SLUGS } from "@/data/live-music-venues";
import { easternParts, easternWallToUtcISO } from "@/lib/tz";

/** Titles that are clearly NOT a show, even at a verified music venue.
 *  Breweries/taprooms host yoga, trivia, bingo, paint nights, and run
 *  clubs on the same calendars as their bands; the venue join alone
 *  admitted all of them ("Yoga in the Taproom" listed under "Live music
 *  tonight" in the Jul-8 audit). The chip asserts who is ON STAGE, so a
 *  non-music title is excluded from the venue-join path. The explicit
 *  music/concert category path is untouched — a classified show keeps
 *  its word over this heuristic. */
const NON_MUSIC_TITLE =
  /\b(yoga|trivia|bingo|paint(?:ing)?|run\s+club|book\s+club|comedy|fitness|zumba|cardio|exercise|pilates|barre|workout|poses|learn\s+to)\b/i;

/** Shared with the venue-feed INGEST boundaries (squarespace-live,
 *  venueEvents' category fallback), which used to blanket-stamp every
 *  item on a music venue's calendar as category "music" — the upstream
 *  version of the same any-event-at-a-music-venue join. One list, every
 *  seam. */
export function isNonMusicTitle(title: string): boolean {
  return NON_MUSIC_TITLE.test(title);
}

/**
 * Is this a live-music event? Two honest signals:
 *  - it's classified music/concert (curated seeds, Ticketmaster music, BIT), OR
 *  - it's hosted by a VERIFIED live-music venue (the breweries/wineries/bars
 *    that stage most of Frederick's music but are categorized by what they
 *    sell, so their shows inherit the venue's sell-category, not "music")
 *    AND its title doesn't say it's something else entirely (yoga, trivia).
 * The venue join is what catches the shows the category alone drops; the
 * title gate is what keeps it a MUSIC-intent join, not an any-event join.
 */
export function isLiveMusicEvent(
  e: Pick<EventWithMeta, "category" | "venue_place_slug" | "title">,
): boolean {
  if (e.category === "music" || e.category === "concert") return true;
  if (e.venue_place_slug == null || !LIVE_MUSIC_VENUE_SLUGS.has(e.venue_place_slug)) return false;
  return !NON_MUSIC_TITLE.test(e.title ?? "");
}

/**
 * The "tonight" window in Eastern wall time: today 17:00 -> tomorrow 02:30,
 * clamped to now so a late visit never lists shows that already started. The
 * /today "Tonight" slice calls this too, so the two surfaces can never drift.
 */
export function tonightWindow(now: Date): { startMs: number; endMs: number } {
  const et = easternParts(now);
  // A UTC instant `offsetDays` from today at the given Eastern wall time.
  const dayAt = (offsetDays: number, hour: number, minute: number): number => {
    const walked = new Date(Date.UTC(et.year, et.month - 1, et.day + offsetDays, 12));
    return Date.parse(
      easternWallToUtcISO(
        walked.getUTCFullYear(),
        walked.getUTCMonth() + 1,
        walked.getUTCDate(),
        hour,
        minute,
      ),
    );
  };
  return {
    startMs: Math.max(now.getTime(), dayAt(0, 17, 0)),
    endMs: dayAt(1, 2, 30),
  };
}

/**
 * Upcoming live-music shows AFTER tonight's window, out to `days` days ahead
 * — the "what music is coming up in the next few weeks?" horizon a reader
 * asked for directly (Reddit, 2026-07-17). Same honesty ceiling as tonight:
 * only real dated shows, the feed's own times, soonest first. Callers group
 * by day for the ledger.
 */
export function liveMusicAhead(
  pool: EventWithMeta[],
  now: Date,
  days = 28,
): EventWithMeta[] {
  const { endMs } = tonightWindow(now);
  const horizonMs = endMs + days * 86_400_000;
  return pool
    .filter((e) => {
      const ms = Date.parse(e.starts_at);
      return Number.isFinite(ms) && ms > endMs && ms <= horizonMs && isLiveMusicEvent(e);
    })
    .sort((a, b) => Date.parse(a.starts_at) - Date.parse(b.starts_at));
}

/** Live-music shows on stage tonight, soonest first. Empty when nothing's on
 *  — the honest empty state is owned by the surfaces that render this. */
export function liveMusicTonight(pool: EventWithMeta[], now: Date): EventWithMeta[] {
  const { startMs, endMs } = tonightWindow(now);
  return pool
    .filter((e) => {
      const ms = Date.parse(e.starts_at);
      return Number.isFinite(ms) && ms >= startMs && ms <= endMs && isLiveMusicEvent(e);
    })
    .sort((a, b) => Date.parse(a.starts_at) - Date.parse(b.starts_at));
}
