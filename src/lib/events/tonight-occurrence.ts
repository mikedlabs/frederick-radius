import type { Event } from "@/data/events";
import { isRangeListing } from "@/lib/eventHorizon";

export const EVENT_EVENING_START_HOUR = 16;
export const MAX_ORDINARY_TONIGHT_EVENT_DURATION_MS = 8 * 3_600_000;
const MAX_NAMED_DAY_EVENT_DURATION_MS = 18 * 3_600_000;
const LONG_DAY_EVENT_EVIDENCE_RE =
  /\b(?:festivals?|(?:county|state) fairs?|carnivals?|parades?|(?:heritage|railroad|community) days?|arts? walks?|conferences?(?! rooms?\b)|conventions?|expos?)\b/i;
// A description can identify a festival whose proper name omits the type
// (e.g. In the Streets). A room name or passing mention of an expo cannot.
const DESCRIBED_DAY_EVENT_RE =
  /\b(?:one[- ]day|day[- ]?long|all[- ]day)\s+(?:(?:street|county|state|heritage|railroad|community|arts?|book|film|food|music)\s+)?(?:festivals?|fairs?|carnivals?|parades?|walks?|conferences?(?! rooms?\b)|conventions?|expos?)\b/i;

export type TonightEvent = Pick<Event, "starts_at" | "ends_at" | "is_all_day"> &
  Partial<Pick<Event, "title" | "description" | "category">>;

/**
 * A long clock range is not automatically bad data. Frederick's flagship
 * one-day festivals can honestly run for ten hours, while an ordinary feed
 * row spanning breakfast through bedtime is usually a schedule container,
 * not a specific occurrence. Keep ordinary events tightly bounded and allow
 * longer one-day rows only when their own title/category/description says
 * they are a named day event. All-day and multi-day range rows never pass.
 */
export function hasUsableTonightOccurrence(event: TonightEvent): boolean {
  const start = new Date(event.starts_at);
  const end = new Date(event.ends_at);
  if (!Number.isFinite(start.getTime()) || !Number.isFinite(end.getTime())) return false;
  if (event.is_all_day || isRangeListing(event)) return false;

  const duration = end.getTime() - start.getTime();
  if (duration <= 0 || duration > MAX_NAMED_DAY_EVENT_DURATION_MS) return false;
  if (duration <= MAX_ORDINARY_TONIGHT_EVENT_DURATION_MS) return true;

  return LONG_DAY_EVENT_EVIDENCE_RE.test(event.title ?? "") ||
    LONG_DAY_EVENT_EVIDENCE_RE.test(event.category ?? "") ||
    DESCRIBED_DAY_EVENT_RE.test(event.description ?? "");
}
