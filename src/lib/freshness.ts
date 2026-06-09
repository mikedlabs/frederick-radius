import { easternDayKey } from "@/lib/tz";

/**
 * Stale-render detection for live surfaces (/today's "Right now").
 *
 * The June-9 external review caught /today presenting a two-day-old
 * "Sunday, June 7 · Right now" as the current state — a cached shell
 * (service worker or CDN) served long after its render. The server can't
 * prevent that; only the CLIENT can notice that the page it's holding was
 * rendered on a different day. These pure helpers power that check.
 *
 * Day-granular on purpose: comparing hours would flag every ISR window
 * (revalidate=300) and nag constantly. A different EASTERN calendar day is
 * unambiguous: the page is lying about "today."
 */
export function isStaleRender(renderedAtIso: string, now: Date = new Date()): boolean {
  const t = Date.parse(renderedAtIso);
  // Fail open: a malformed timestamp must never produce a false alarm.
  if (!Number.isFinite(t)) return false;
  return easternDayKey(new Date(t)) !== easternDayKey(now);
}

/** "Sunday, June 7" — the honest label for when the page was rendered. */
export function renderedDayLabel(renderedAtIso: string): string {
  const t = Date.parse(renderedAtIso);
  if (!Number.isFinite(t)) return "an earlier day";
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    weekday: "long",
    month: "long",
    day: "numeric",
  }).format(new Date(t));
}
