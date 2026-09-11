/**
 * Event notices — the OWNER override for cancellations and postponements.
 *
 * Why this exists: when Alive @ Five was cancelled for heat (2026-07-02),
 * no machine-readable source carried the news. The organizer's iCal feed
 * has no STATUS fields, the city/county press RSS and FNP said nothing,
 * and the announcement lived only on social media. Feed detection
 * (event-status.ts title sniff, iCal STATUS) handles the organizers who
 * do publish properly; this file is the human fallback for the ones who
 * don't. The owner edits src/data/event-notices.json from a phone, commits
 * to main, and the deploy distributes the news everywhere at once:
 *
 *   - the unified event set stamps `status`, so the event drops off
 *     "What's on" (classify.ts cancelled lane) and saved-event cards
 *     show the red badge
 *   - the event detail page shows the banner + the notice's note and
 *     the organizer's announcement link
 *   - /today's "Heads up" slot leads with the headline
 *
 * Honesty rules: a notice is a sourced human claim, not a guess — it
 * carries the organizer's own announcement URL. Notices self-retire the
 * Eastern day after `expires`, so a stale "cancelled tonight" can never
 * outlive its night. Malformed rows are dropped, never thrown on: a
 * typo made in the GitHub phone editor must degrade to "no notice",
 * not take the site down. (The spec asserts the committed file is
 * clean, so a bad edit still fails `vitest` where tests run.)
 */
import noticesFile from "@/data/event-notices.json";
import { easternDayKey } from "@/lib/tz";

export type EventNoticeStatus = "cancelled" | "postponed" | "advisory";

export type EventNotice = {
  /** The event's URL slug (the path after /events/). */
  slug: string;
  /** cancelled/postponed stamp the event; advisory only adds the note. */
  status: EventNoticeStatus;
  /** One-line news for /today's Heads up ("Alive @ Five is cancelled tonight"). */
  headline: string;
  /** One sentence of detail, shown under the headline and on the event page. */
  note?: string;
  /** The organizer's own announcement — the notice's provenance. */
  source_url?: string;
  /** Last Eastern day (YYYY-MM-DD) the notice shows, inclusive. */
  expires: string;
};

const STATUSES: ReadonlySet<string> = new Set(["cancelled", "postponed", "advisory"]);
const DAY_KEY = /^\d{4}-\d{2}-\d{2}$/;

/** Keep only rows a hand edit can't have mangled. Pure; exported for tests. */
export function validateNotices(raw: unknown): EventNotice[] {
  const list = (raw as { notices?: unknown })?.notices;
  if (!Array.isArray(list)) return [];
  const out: EventNotice[] = [];
  for (const n of list) {
    if (typeof n !== "object" || n === null) continue;
    const { slug, status, headline, note, source_url, expires } = n as Record<string, unknown>;
    if (typeof slug !== "string" || slug.length === 0) continue;
    if (typeof status !== "string" || !STATUSES.has(status)) continue;
    if (typeof headline !== "string" || headline.trim().length === 0) continue;
    if (typeof expires !== "string" || !DAY_KEY.test(expires)) continue;
    out.push({
      slug,
      status: status as EventNoticeStatus,
      headline: headline.trim(),
      note: typeof note === "string" && note.trim().length > 0 ? note.trim() : undefined,
      source_url: typeof source_url === "string" && source_url.startsWith("http") ? source_url : undefined,
      expires,
    });
  }
  return out;
}

/** Expiry filter, pure for tests: a notice shows through the end of its
 *  `expires` Eastern day (en-CA day keys compare lexicographically). */
export function filterActive(notices: EventNotice[], now: Date): EventNotice[] {
  const today = easternDayKey(now);
  return notices.filter((n) => n.expires >= today);
}

/** Stamp cancelled/postponed onto matching events. Advisory notices leave
 *  status alone (the event is still on). Pure for tests. */
export function applyNotices<T extends { slug: string; status?: string }>(
  events: T[],
  notices: EventNotice[],
): T[] {
  if (notices.length === 0) return events;
  const bySlug = new Map(notices.filter((n) => n.status !== "advisory").map((n) => [n.slug, n]));
  if (bySlug.size === 0) return events;
  return events.map((e) => {
    const n = bySlug.get(e.slug);
    return n ? { ...e, status: n.status } : e;
  });
}

const ALL_NOTICES = validateNotices(noticesFile);

/** All currently-active notices, worst-first (cancelled leads). */
export function activeEventNotices(now: Date): EventNotice[] {
  const order: Record<EventNoticeStatus, number> = { cancelled: 0, postponed: 1, advisory: 2 };
  return filterActive(ALL_NOTICES, now).sort((a, b) => order[a.status] - order[b.status]);
}

/** The active notice for one event, or null. */
export function noticeForEvent(slug: string, now: Date): EventNotice | null {
  return filterActive(ALL_NOTICES, now).find((n) => n.slug === slug) ?? null;
}

/** Stamp active notices onto an event set (the unified-assembly hook). */
export function applyEventNotices<T extends { slug: string; status?: string }>(
  events: T[],
  now: Date,
): T[] {
  return applyNotices(events, filterActive(ALL_NOTICES, now));
}
