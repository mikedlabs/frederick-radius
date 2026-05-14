/**
 * Hood College event feed.
 * hood.edu publishes a public Trumba calendar; we read its iCal export.
 * If the URL changes, set HOOD_CALENDAR_URL in env to override.
 */

export type HoodEvent = {
  id: string;
  title: string;
  description: string;
  starts_at: string;
  ends_at: string;
  location: string;
  url: string;
};

const HOOD_DEFAULT_URL =
  "https://www.trumba.com/calendars/hood-college-events.ics";

type ICalDateLike = Date | string | { toISOString: () => string };

function toIso(d: ICalDateLike): string {
  if (typeof d === "string") return d;
  if (d instanceof Date) return d.toISOString();
  return new Date(d.toISOString()).toISOString();
}

export async function getHoodEvents(): Promise<HoodEvent[]> {
  const url = process.env.HOOD_CALENDAR_URL ?? HOOD_DEFAULT_URL;
  try {
    const ical = await import("node-ical");
    const parsed = await ical.async.fromURL(url);
    const events: HoodEvent[] = [];
    const now = new Date();
    const horizon = new Date(now);
    horizon.setDate(horizon.getDate() + 60);
    for (const value of Object.values(parsed)) {
      const item = value as {
        type?: string;
        summary?: string;
        description?: string;
        start?: ICalDateLike;
        end?: ICalDateLike;
        location?: string;
        uid?: string;
        url?: string;
      };
      if (item.type !== "VEVENT" || !item.start) continue;
      const start = new Date(toIso(item.start));
      const end = item.end ? new Date(toIso(item.end)) : new Date(start.getTime() + 2 * 60 * 60 * 1000);
      if (start < now || start > horizon) continue;
      events.push({
        id: item.uid ?? `${item.summary}-${start.toISOString()}`,
        title: (item.summary ?? "").trim() || "Hood College event",
        description: (item.description ?? "").trim(),
        starts_at: start.toISOString(),
        ends_at: end.toISOString(),
        location: (item.location ?? "Hood College, Frederick, MD").trim(),
        url: item.url ?? "https://www.hood.edu/calendar",
      });
    }
    return events.sort((a, b) => +new Date(a.starts_at) - +new Date(b.starts_at)).slice(0, 12);
  } catch {
    return [];
  }
}
