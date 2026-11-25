import { publishedEventTime } from "./published-time";
import { eventHasEndOfDaySentinel } from "@/lib/eventWhenLabel";
import { isRangeListing } from "@/lib/eventHorizon";
import { easternDayKey, easternParts } from "@/lib/tz";
import type { EventWithMeta } from "@/lib/loaders/events";

const HOUR = 3_600_000;
const zone = "America/New_York";
const weekday = new Intl.DateTimeFormat("en-US", { timeZone: zone, weekday: "short" });
const clock = new Intl.DateTimeFormat("en-US", { timeZone: zone, hour: "numeric", minute: "2-digit" });
const zoneClock = new Intl.DateTimeFormat("en-US", { timeZone: zone, hour: "numeric", minute: "2-digit", timeZoneName: "short" });
const zoneName = (ms: number) => zoneClock.formatToParts(ms).find(part => part.type === "timeZoneName")?.value;

export type EventScheduleMark = {
  showAxis: boolean;
  hasOverlap: boolean;
  startPercent: number;
  durationPercent: number | null;
  overlaps: { startPercent: number; widthPercent: number }[];
  description: string;
  axis: [string, string];
};

type EventTiming = Pick<EventWithMeta, "starts_at" | "ends_at" | "is_all_day" | "status" | "published_time"> & { source?: string };
type TimedRow<T> = { event: T; start: number; end: number | null };

/** Compare only the occurrences actually on screen, on a shared elapsed-time
 * scale. A point is a published start without a duration. */
export function buildDaySchedule<T extends EventTiming>(events: readonly T[], today: string): Map<T, EventScheduleMark> {
  const marks = new Map<T, EventScheduleMark>();
  const rows: TimedRow<T>[] = [];
  for (const event of new Set(events)) {
    const start = Date.parse(event.starts_at);
    if (!Number.isFinite(start) || (event.status ?? "scheduled") !== "scheduled" || isRangeListing(event)) continue;
    const timing = publishedEventTime(event);
    if (timing === "date") continue;
    const end = timing === "range" ? Date.parse(event.ends_at) : null;
    if (end === null && eventHasEndOfDaySentinel(event) && easternParts(new Date(start)).hour === 0) continue;
    // Match the event facts' limit for a single published session.
    if (end !== null && end - start > 18 * HOUR) continue;
    const startDay = easternDayKey(new Date(start));
    // A short session may cross midnight, including one already in progress
    // from the previous evening. Keep its actual day and full duration.
    if (startDay !== today && !(startDay < today && end !== null && easternDayKey(new Date(end)) === today)) continue;
    rows.push({ event, start, end });
  }
  if (!rows.length) return marks;
  const first = Math.min(...rows.map(row => row.start));
  const last = Math.max(...rows.map(row => row.end ?? row.start));
  const from = Math.floor(first / HOUR) * HOUR;
  const through = Math.max(from + 2 * HOUR, Math.ceil(last / HOUR) * HOUR);
  const percent = (value: number) => 100 * (value - from) / (through - from);
  // Include the offset abbreviation when the clocks change. The two 1 AM
  // hours in fall have different positions; the missing spring hour has none.
  const format = zoneName(from - 12 * HOUR) === zoneName(through + 12 * HOUR) ? clock : zoneClock;
  const label = (ms: number) => (easternDayKey(new Date(ms)) === today ? "" : weekday.format(ms) + " ") + format.format(ms);
  const axis: [string, string] = [label(from).replace(":00", ""), label(through).replace(":00", "")];
  for (const row of rows) {
    const intersecting = rows.filter(other => other !== row && row.end !== null && other.end !== null
      && Math.max(row.start, other.start) < Math.min(row.end, other.end));
    const overlaps: EventScheduleMark["overlaps"] = [];
    const spans = intersecting.map(other => [Math.max(row.start, other.start), Math.min(row.end!, other.end!)]).sort((a, b) => a[0] - b[0]);
    const merged: number[][] = [];
    for (const span of spans) {
      const previous = merged.at(-1);
      if (previous && span[0] <= previous[1]) previous[1] = Math.max(previous[1], span[1]);
      else merged.push(span);
    }
    for (const [start, end] of merged) overlaps.push({ startPercent: percent(start), widthPercent: percent(end) - percent(start) });
    const timing = row.end === null ? `${label(row.start)}, end time not listed.` : `${label(row.start)} to ${label(row.end)}.`;
    const overlap = intersecting.length ? ` Overlaps ${intersecting.length} other displayed ${intersecting.length === 1 ? "event" : "events"}.` : "";
    marks.set(row.event, { showAxis: marks.size % 5 === 0, hasOverlap: false, startPercent: percent(row.start), durationPercent: row.end === null ? null : percent(row.end) - percent(row.start),
      description: `Frederick time. ${timing}${overlap}`, overlaps, axis });
  }
  const hasOverlap = [...marks.values()].some(mark => mark.overlaps.length > 0);
  for (const mark of marks.values()) mark.hasOverlap = hasOverlap;
  return marks;
}
