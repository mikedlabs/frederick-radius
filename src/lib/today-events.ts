import type { Event } from "@/data/events";
import { isUtilityEvent } from "@/lib/event-kind";
import { isEventEnded, isEventLiveNow, isEventToday } from "@/lib/eventWhenLabel";
import { compareForLead, isRoutineProgram } from "@/lib/events/lead-rank";
import { eventTrust } from "@/lib/trust";

export type TodayEventMoment = "Now" | "Later" | "Tonight" | "Today";

export type TodayEvent = {
  slug: string;
  title: string;
  venue: string;
  municipality: string;
  time: string;
  moment: TodayEventMoment;
  image: string | null;
  free: boolean;
};

export type TodayEventResponse = {
  events: TodayEvent[];
  partial: boolean;
};

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

/** Today is editorially stricter than the full calendar. A prime homepage
 * card needs a real venue, trustworthy timing, and a source-backed row.
 * `is_verified` means Radius manually checked the listing; an event published
 * on a recognized government or organizer calendar is independently
 * trustworthy without rewriting that field to true. */
export function isStrongTodayEvent(event: Event, now: Date): boolean {
  if (
    eventTrust(event).level !== "verified" ||
    event.status === "cancelled" ||
    event.status === "postponed"
  ) return false;
  if (!event.venue_name?.trim()) return false;
  if (!isEventToday(event.starts_at, now) || isEventEnded(event, now)) return false;
  if (isUtilityEvent(event) || isRoutineProgram(event)) return false;
  if (event.is_all_day && TIMED_TITLE_ON_ALL_DAY_RE.test(event.title)) return false;
  return true;
}

export function selectTodayEvents(pool: readonly Event[], now = new Date(), limit = 3): TodayEvent[] {
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
  for (const group of grouped.values()) group.sort((a, b) => compareForLead(a.event, b.event));

  // Lead with one genuinely different time horizon before filling remaining
  // slots. This reads as a day plan, not three interchangeable event cards.
  const ordered = (["Now", "Later", "Tonight", "Today"] as const)
    .flatMap((moment) => grouped.get(moment)?.splice(0, 1) ?? []);
  const remainder = [...grouped.values()].flat().sort((a, b) => compareForLead(a.event, b.event));

  return [...ordered, ...remainder].slice(0, limit).map(({ event, moment }) => ({
    slug: event.slug,
    title: event.title,
    venue: event.venue_name!,
    municipality: event.municipality,
    time: event.is_all_day ? "All day" : clock(event.starts_at),
    moment,
    image: event.hero_image ?? null,
    free: event.is_free,
  }));
}
