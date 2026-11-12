/** The calendar uses the same bounded canonical archive as the Events list. */
import { loadEventArchiveSnapshot, type EventArchiveSourceHealth } from "./todayEventSnapshot";
import { easternParts, easternWallToUtcISO } from "@/lib/tz";
import { classifyEvent, isPublicEvent } from "@/lib/events/classify";

export type CalEvent = {
  id: string;
  title: string;
  startUtc: string;
  allDay: boolean;
  municipality: string;
  category: string | null;
  href: string;
  source: "archive";
};

/** "YYYY-MM-DD" in America/New_York for a UTC instant. */
export function nyDayKey(iso: string): string {
  const { year, month, day } = easternParts(new Date(iso));
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

/**
 * `monthStart` carries the requested year/month in UTC. The database window
 * includes the grid's adjacent-month cells; source health uses the real clock.
 * No calendar visit can cold-fill an upstream publisher cache.
 */
export async function getMonthEvents(
  monthStart: Date,
  now = new Date(),
): Promise<{ byDay: Record<string, CalEvent[]>; total: number; sourceHealth: EventArchiveSourceHealth }> {
  const year = monthStart.getUTCFullYear();
  const month = monthStart.getUTCMonth();
  const fromDay = new Date(Date.UTC(year, month, 1 - 7, 12));
  const toDay = new Date(Date.UTC(year, month + 1, 1 + 7, 12));
  const midnight = (date: Date) => new Date(easternWallToUtcISO(
    date.getUTCFullYear(), date.getUTCMonth() + 1, date.getUTCDate(), 0, 0,
  ));
  const from = midnight(fromDay);
  const to = midnight(toDay);
  const snapshot = await loadEventArchiveSnapshot(now, {
    windowStart: from,
    // Count calendar days at noon UTC so DST does not shorten a month window.
    horizonDays: (toDay.getTime() - fromDay.getTime()) / 86_400_000,
    cache: true,
  });
  const byDay: Record<string, CalEvent[]> = {};
  let total = 0;
  for (const event of snapshot.unified) {
    const lane = classifyEvent(event);
    // The monthly calendar also carries the civic/reminder lanes retained by
    // the archive writer. Private bookings and non-events remain withheld.
    if (!isPublicEvent(event) && lane !== "civic_meeting" && lane !== "town_reminder") continue;
    const start = Date.parse(event.starts_at);
    if (event.status === "cancelled" || event.status === "postponed" ||
        !Number.isFinite(start) || start < from.getTime() || start >= to.getTime()) continue;
    const row: CalEvent = {
      id: event.slug,
      title: event.title,
      startUtc: event.starts_at,
      allDay: Boolean(event.is_all_day),
      municipality: event.municipality_name ?? event.municipality,
      category: event.category_name ?? event.category,
      href: `/events/${event.slug}`,
      source: "archive",
    };
    (byDay[nyDayKey(row.startUtc)] ??= []).push(row);
    total += 1;
  }
  for (const rows of Object.values(byDay)) {
    rows.sort((a, b) => Date.parse(a.startUtc) - Date.parse(b.startUtc));
  }
  return { byDay, total, sourceHealth: snapshot.sourceHealth };
}
