/**
 * Visibility lane for a hydrated event.
 *
 * Product decision (2026-10-08): Today hides campus + notice. Those rows
 * stay available under civic. This module is the flag plus a pure helper;
 * page UI is not edited here.
 */

export type EventScope = "public" | "campus" | "notice";

const CAMPUS_RE =
  /\bintramurals?\b|\bbus\s+trip\b|\bstudent\s+trips?\b|\btrip\s+to\b/i;

const NOTICE_RE =
  /\bnoon\s+dismissal\b|\bdismissal\s+for\s+students\b|\bno\s+school\b|\bmembership\s+photos?\b/i;

export function classifyEventScope(event: {
  title?: string | null;
  source?: string | null;
}): EventScope {
  const title = event.title ?? "";
  if (NOTICE_RE.test(title)) return "notice";
  if (event.source === "mount-st-marys" && CAMPUS_RE.test(title)) return "campus";
  return "public";
}

/** Today hides campus and notice; civic surfaces may still show them. */
export function eventHiddenFromToday(scope: EventScope): boolean {
  return scope === "campus" || scope === "notice";
}
