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

/**
 * Is this a live-music event? Two honest signals:
 *  - it's classified music/concert (curated seeds, Ticketmaster music, BIT), OR
 *  - it's hosted by a VERIFIED live-music venue (the breweries/wineries/bars
 *    that stage most of Frederick's music but are categorized by what they
 *    sell, so their shows inherit the venue's sell-category, not "music").
 * The venue join is what catches the shows the category alone drops.
 */
export function isLiveMusicEvent(
  e: Pick<EventWithMeta, "category" | "venue_place_slug">,
): boolean {
  if (e.category === "music" || e.category === "concert") return true;
  return e.venue_place_slug != null && LIVE_MUSIC_VENUE_SLUGS.has(e.venue_place_slug);
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
