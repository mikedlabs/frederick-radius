/**
 * Calendar feed: every event (ingested municipal + seed + live) flattened
 * to one entry per occurrence, keyed by America/New_York calendar day.
 * Capped to a month window so the grid never renders thousands of nodes.
 */
import { getIngestedSeries } from "./ingested";
import { allUpcoming } from "./events";
import { getCachedLiveEvents } from "@/lib/integrations/ical-live";

export type CalEvent = {
  id: string;
  title: string;
  startUtc: string;
  allDay: boolean;
  municipality: string;
  category: string | null;
  href: string;          // source_url, event page, or "#"
  source: "municipal" | "seed" | "live";
};

/** "YYYY-MM-DD" in America/New_York for a UTC instant. */
export function nyDayKey(iso: string): string {
  const d = new Date(iso);
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(d);
  const y = parts.find((p) => p.type === "year")!.value;
  const m = parts.find((p) => p.type === "month")!.value;
  const da = parts.find((p) => p.type === "day")!.value;
  return `${y}-${m}-${da}`;
}

/**
 * Returns events grouped by NY day for the calendar month containing
 * `monthStart` (plus a few days padding so prev/next-month cells fill).
 */
export async function getMonthEvents(
  monthStart: Date
): Promise<{ byDay: Record<string, CalEvent[]>; total: number }> {
  // Window: 7 days before the 1st to 7 after the last (covers the grid's
  // leading/trailing days from adjacent months).
  const from = new Date(monthStart.getFullYear(), monthStart.getMonth(), 1);
  from.setDate(from.getDate() - 7);
  const to = new Date(monthStart.getFullYear(), monthStart.getMonth() + 1, 0);
  to.setDate(to.getDate() + 8);
  const inWindow = (iso: string) => {
    const t = +new Date(iso);
    return t >= +from && t <= +to;
  };

  const events: CalEvent[] = [];

  // Municipal (ingested) — flatten series → occurrences
  try {
    const series = await getIngestedSeries();
    for (const s of series) {
      for (const o of s.occurrences) {
        if (!inWindow(o.startsAtUtc)) continue;
        events.push({
          id: `m:${o.sourceUid}`,
          title: s.title,
          startUtc: o.startsAtUtc,
          allDay: o.allDay,
          municipality: s.municipality,
          category: s.category,
          href: o.sourceUrl ?? "#",
          source: "municipal",
        });
      }
    }
  } catch {
    /* municipal feed optional */
  }

  // Seed events
  try {
    for (const e of allUpcoming(new Date(+from))) {
      if (!inWindow(e.starts_at)) continue;
      events.push({
        id: `s:${e.slug}`,
        title: e.title,
        startUtc: e.starts_at,
        allDay: Boolean(e.is_all_day),
        municipality: e.municipality_name ?? e.municipality,
        category: e.category_name ?? e.category,
        href: `/events/${e.slug}`,
        source: "seed",
      });
    }
  } catch {
    /* seed optional */
  }

  // Live feeds
  try {
    // Calendar is a public dynamic route, not a source-health probe. Read the
    // parsed per-source cache so opening a month cannot fan out to every
    // upstream calendar. The warm-events cron owns refreshing this boundary.
    const { events: live } = await getCachedLiveEvents(90);
    for (const e of live) {
      if (!inWindow(e.starts_at)) continue;
      events.push({
        id: `l:${e.id}`,
        title: e.title,
        startUtc: e.starts_at,
        allDay: false,
        municipality: e.municipality,
        category: e.category,
        href: "#",
        source: "live",
      });
    }
  } catch {
    /* live optional */
  }

  const byDay: Record<string, CalEvent[]> = {};
  for (const e of events) {
    const k = nyDayKey(e.startUtc);
    (byDay[k] ??= []).push(e);
  }
  for (const k of Object.keys(byDay)) {
    byDay[k].sort((a, b) => +new Date(a.startUtc) - +new Date(b.startUtc));
  }
  return { byDay, total: events.length };
}
