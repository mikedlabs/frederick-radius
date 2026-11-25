import { eventCardVisual } from "@/components/event/eventVisuals";
import { isUtilityEvent } from "@/lib/event-kind";
import { isRangeListing, RANGE_LISTING_MS, type HorizonBounds } from "@/lib/eventHorizon";
import {
  eventHasTrustworthyEnd, isDateOnlyEventAnchor, isEventEnded, isEventLiveNow,
} from "@/lib/eventWhenLabel";
import type { EventWithMeta } from "@/lib/loaders/events";
import { easternDayKey, easternParts, easternWallToUtcISO } from "@/lib/tz";
import { hasRecommendationAttendance } from "./attendance";
import { isPublicEvent } from "./classify";
import { rankRecommendations } from "./lead-rank";
import { hasUsableTonightOccurrence, type TonightEvent } from "./tonight-occurrence";

export type EventHighlights = {
  tonight: EventWithMeta[];
  weekend: EventWithMeta[];
  /** The Tonight pick can stand for both windows without repeating its card. */
  weekendIncludesTonight: boolean;
};

type WindowBounds = Pick<HorizonBounds, "now" | "weekendStart" | "weekendEnd">;

export function boardEveningStart(now: Date): number {
  const { year, month, day } = easternParts(now);
  // On the Events board, Tonight starts at 6 PM Frederick time. An earlier
  // program still belongs here when its published session continues past 6.
  return Date.parse(easternWallToUtcISO(year, month, day, 18, 0));
}

/** A published start is enough for a future show. Once it has started, only
 * a credible end supports recommending the session as still catchable. */
export function eventMatchesTonight(event: TonightEvent, now: Date, from = boardEveningStart(now)): boolean {
  const start = Date.parse(event.starts_at);
  if (!Number.isFinite(start) || event.is_all_day || easternDayKey(new Date(start)) !== easternDayKey(now) ||
      isDateOnlyEventAnchor(event) || isRangeListing(event)) return false;
  if (!eventHasTrustworthyEnd(event)) return start >= from && start > now.getTime();
  return hasUsableTonightOccurrence(event) && Date.parse(event.ends_at) > Math.max(now.getTime(), from) &&
    (start > now.getTime() || isEventLiveNow(event, now));
}

/** Use the board's Friday 5 PM–Monday midnight Eastern interval. A dated
 * Saturday/Sunday listing can be useful without a clock. A Friday date alone
 * cannot establish that it runs Friday evening. */
export function eventMatchesHighlightWeekend(event: TonightEvent, bounds: WindowBounds): boolean {
  const start = Date.parse(event.starts_at);
  const now = new Date(bounds.now);
  if (!Number.isFinite(start) || start >= bounds.weekendEnd || isRangeListing(event) || isEventEnded(event, now)) return false;
  if (event.is_all_day || isDateOnlyEventAnchor(event)) {
    const end = Date.parse(event.ends_at);
    if (end - start > RANGE_LISTING_MS && end > bounds.weekendEnd) return false;
    const startDay = new Date(start);
    const { year, month, day, weekday } = easternParts(startDay);
    if (weekday !== 5) return start >= bounds.weekendStart;
    // A Friday-only date supplies no evening hours. A published all-day span
    // continuing beyond Saturday midnight does establish a weekend date.
    return Boolean(event.is_all_day) && easternDayKey(startDay) === easternDayKey(new Date(bounds.weekendStart)) &&
      end > Date.parse(easternWallToUtcISO(year, month, day + 1, 0, 0));
  }
  if (!eventHasTrustworthyEnd(event)) return start >= bounds.weekendStart && start > bounds.now;
  if (start < bounds.weekendStart && !hasUsableTonightOccurrence(event)) return false;
  return Date.parse(event.ends_at) > Math.max(bounds.now, bounds.weekendStart) &&
    (start > bounds.now || isEventLiveNow(event, now));
}

/** Use the same free-to-display artwork and exact venue photographs as the
 * board. An arbitrary publisher URL or a held photo proxy earns no priority. */
function highlightVisualRank(event: EventWithMeta): number {
  const visual = eventCardVisual(event, { venuePhotos: "free-reviewed" });
  return visual?.presentation === "photo" ? 0 : visual ? 1 : 2;
}

/** Compare only real occurrences from one snapshot, before the normal
 * per-horizon preview and series folding can discard the evening show. */
export function selectEventHighlights(
  events: readonly EventWithMeta[],
  bounds: WindowBounds,
  featured?: ReadonlySet<string>,
): EventHighlights {
  const now = new Date(bounds.now);
  const from = boardEveningStart(now);
  const tonightCandidates: EventWithMeta[] = [];
  const weekendCandidates: EventWithMeta[] = [];
  const identities = new Set<string>();
  const media = new Map<EventWithMeta, number>();
  for (const event of events) {
    const inEvening = eventMatchesTonight(event, now, from);
    const inWeekend = eventMatchesHighlightWeekend(event, bounds);
    if ((!inEvening && !inWeekend) || !hasRecommendationAttendance(event) ||
        !isPublicEvent(event) || isUtilityEvent(event)) continue;
    const id = event.slug + "@" + Date.parse(event.starts_at);
    if (identities.has(id)) continue;
    identities.add(id);
    media.set(event, highlightVisualRank(event));
    if (inEvening) tonightCandidates.push(event);
    if (inWeekend) weekendCandidates.push(event);
  }
  const visualRank = (event: EventWithMeta) => media.get(event)!;
  // Source arbitration uses canonical slugs. Break exact ranking ties the
  // same way even when a refresh returns the same archive in a new order.
  const bySlug = (a: EventWithMeta, b: EventWithMeta) => a.slug.localeCompare(b.slug);
  const tonight = rankRecommendations(tonightCandidates.sort(bySlug), { featured, visualRank, limit: 1 }).slice(0, 1);
  const weekendIncludesTonight = tonight.length > 0 && weekendCandidates.includes(tonight[0]);
  const remaining = weekendCandidates.filter((event) => event !== tonight[0]);
  const weekend = rankRecommendations(remaining.sort(bySlug), { featured, visualRank, limit: 2, previouslySelected: tonight }).slice(0, 2);
  return { tonight, weekend, weekendIncludesTonight };
}
