import type { Event } from "@/data/events";
import type { EventCardVisual } from "@/components/event/eventVisuals";
import { isUtilityEvent } from "@/lib/event-kind";
import { eventHasTrustworthyEnd, isEventEnded, isEventLiveNow, isEventToday } from "@/lib/eventWhenLabel";
import { isRoutineProgram, rankRecommendations } from "@/lib/events/lead-rank";
import type { SourceConfidence } from "@/lib/provenance";
import { eventDecisionVerification } from "@/lib/events/decision-verification";
import { eventAttendanceLabel, hasRecommendationAttendance } from "@/lib/events/attendance";

export type TodayEventCandidate = Event & { confidence: SourceConfidence };

export type TodayEventMoment = "Now" | "Later" | "Tonight" | "Today";

export type TodayEvent = {
  slug: string;
  title: string;
  presenter?: string;
  venue: string;
  municipality: string;
  time: string;
  /** Published end clock when supplied; no inferred duration. */
  endTime?: string;
  /** Publisher admission wording; omitted when unknown. */
  price?: string;
  moment: TodayEventMoment;
  image: string | null;
  /** Approved visual for this exact event; absent in older cached responses. */
  visual?: EventCardVisual;
  free: boolean;
};

export type TodayEventResponse = {
  events: TodayEvent[];
  partial: boolean;
};

/**
 * The Today page is a briefing, not the complete calendar. Its count must
 * describe the picks actually shown in the briefing so it can never be read
 * as the total returned by unifiedEvents (the Events board owns that total).
 */
export function todayEventPicksMeta({
  todayPicks,
  tonightPicks,
  degraded,
  scopeLabel = "Countywide",
}: {
  todayPicks: number;
  tonightPicks: number;
  degraded: boolean;
  scopeLabel?: string;
}): string | undefined {
  if (todayPicks <= 0) {
    return degraded ? "Partial calendar coverage" : undefined;
  }
  const pickLabel = (count: number) =>
    `${count} event ${count === 1 ? "pick" : "picks"}`;
  return `${pickLabel(todayPicks)} today${
    tonightPicks > 0 ? ` · ${pickLabel(tonightPicks)} tonight` : ""
  } · ${scopeLabel.trim() || "Countywide"}${degraded ? " · Partial coverage" : ""}`;
}

export function shouldRenderTodayEventSection({
  degraded,
  featurePromoted,
  programCount,
  earlierCount,
}: {
  degraded: boolean;
  featurePromoted: boolean;
  programCount: number;
  earlierCount: number;
}): boolean {
  return !(
    degraded &&
    !featurePromoted &&
    programCount === 0 &&
    earlierCount === 0
  );
}

const TIMED_TITLE_ON_ALL_DAY_RE = /\b(?:night|evening|after\s+dark|happy\s+hour|trivia|bingo)\b/i;

function easternHour(date: Date): number {
  return Number(new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    hour: "2-digit",
    hour12: false,
  }).format(date));
}

function clock(iso: string): string {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(iso));
}

function momentFor(event: Event, now: Date): TodayEventMoment {
  if (isEventLiveNow(event, now)) return "Now";
  if (event.is_all_day) return "Today";
  return easternHour(new Date(event.starts_at)) >= 17 ? "Tonight" : "Later";
}

/** Prime picks need a recently checked source and a usable attendance path.
 * Publisher identity alone is not freshness. Named venues remain useful even
 * with approximate coordinates: this brief makes no proximity promise. */
export function isStrongTodayEvent(event: TodayEventCandidate, now: Date): boolean {
  if (
    !eventDecisionVerification(event, now).sourceVerified ||
    event.status === "cancelled" ||
    event.status === "postponed"
  ) return false;
  if (!hasRecommendationAttendance(event)) return false;
  if (!isEventToday(event.starts_at, now) || isEventEnded(event, now)) return false;
  if (isUtilityEvent(event) || isRoutineProgram(event)) return false;
  if (event.is_all_day && TIMED_TITLE_ON_ALL_DAY_RE.test(event.title)) return false;
  return true;
}

export function selectTodayEvents(
  pool: readonly TodayEventCandidate[], now = new Date(), limit = 3,
  resolveLeadVisual?: (event: TodayEventCandidate) => EventCardVisual | null,
): TodayEvent[] {
  const candidates = pool
    .filter((event) => isStrongTodayEvent(event, now))
    .map((event) => ({ event, moment: momentFor(event, now) }));

  const grouped = new Map<TodayEventMoment, typeof candidates>([
    ["Now", []],
    ["Later", []],
    ["Tonight", []],
    ["Today", []],
  ]);
  for (const candidate of candidates) grouped.get(candidate.moment)?.push(candidate);
  for (const [moment, group] of grouped) {
    const byEvent = new Map(group.map((candidate) => [candidate.event, candidate]));
    grouped.set(moment, rankRecommendations(group.map(({ event }) => event), { limit })
      .map((event) => byEvent.get(event)!));
  }

  // Lead with one genuinely different time horizon before filling remaining
  // slots. This reads as a day plan, not three interchangeable event cards.
  const ordered = (["Now", "Later", "Tonight", "Today"] as const)
    .flatMap((moment) => grouped.get(moment)?.splice(0, 1) ?? []);
  const leftover = [...grouped.values()].flat();
  const byEvent = new Map(leftover.map((candidate) => [candidate.event, candidate]));
  const remainder = rankRecommendations(leftover.map(({ event }) => event), {
    limit: Math.max(0, limit - ordered.length),
    previouslySelected: ordered.map(({ event }) => event),
  }).map((event) => byEvent.get(event)!);

  return [...ordered, ...remainder].slice(0, Math.max(0, limit)).map(({ event, moment }) => {
    let visual: EventCardVisual | null = null;
    // Resolve only the bounded selected records before reducing their facts.
    // A missing visual never borrows another event image or changes ranking.
    if (resolveLeadVisual) {
      try { visual = resolveLeadVisual(event); } catch { /* Keep factual recovery usable. */ }
    }
    return {
      slug: event.slug,
      title: event.title,
      ...(typeof event.presenter === "string" && event.presenter.trim() ? { presenter: event.presenter } : {}),
      venue: eventAttendanceLabel(event),
      municipality: event.municipality,
      time: event.is_all_day ? "All day" : clock(event.starts_at),
      ...(!event.is_all_day && eventHasTrustworthyEnd(event) && event.ends_at ? { endTime: clock(event.ends_at) } : {}),
      ...(event.price_text?.trim() ? { price: event.price_text.trim() } : {}),
      moment,
      image: event.hero_image ?? null,
      free: event.is_free,
      ...(visual ? { visual } : {}),
    };
  });
}
