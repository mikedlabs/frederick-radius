import RAW from "@/data/field-notes.json" with { type: "json" };
import { deepCleanStrings } from "@/lib/format/text";
import { recordedDayTimeZone } from "@/lib/trust";

/**
 * Field Notes — source-linked local notes with row-level trust evidence.
 *
 * The stuff a real local guide knows and websites bury: happy hours,
 * parking, deals, insider tips — each agent-extracted from a public source,
 * then reviewed against that source when a verification date is recorded.
 * Older rows may have a source URL without a recorded verification date; the
 * loader preserves that distinction so the UI never upgrades the whole card
 * from one dated row.
 *
 * This committed JSON is the published, request-time tier (mirrors
 * places-hours-refresh.json). The DB table + extractor + verifier + cron +
 * /admin review are the staging pipeline that materializes into it. It is
 * the verified successor to the legacy flat `business-info.json` happy_hour
 * string — surfaces prefer Field Notes when present.
 */
export type FNConfidence = "high" | "medium" | "low";

export type FNHappyHour = {
  schedule: string;
  details?: string;
  source_url?: string;
  confidence?: FNConfidence;
  last_verified?: string;
};
export type FNSourced = {
  text: string;
  source_url?: string;
  confidence?: FNConfidence;
  last_verified?: string;
};
export type FieldNotes = {
  happy_hour?: FNHappyHour;
  parking?: FNSourced;
  insider?: FNSourced[];
  deals?: FNSourced[];
};

// Boundary cleaning, never render-time: field-notes.json is hand-authored, so
// it bypasses cleanFeedText and the ESLint JSXText em-dash guard that protect
// feed/JSX copy. deepCleanStrings (shared with the business-info loader)
// normalizes every string on read — em dash -> ", ", en dash -> "-",
// entities/tags stripped — so a curated note can't leak an em dash to a user.
const NOTES = deepCleanStrings(RAW as Record<string, FieldNotes>);

export function fieldNotesFor(slug: string): FieldNotes | null {
  return NOTES[slug] ?? null;
}

export function hasFieldNotes(slug: string): boolean {
  const n = NOTES[slug];
  return Boolean(n && (n.happy_hour || n.parking || n.insider?.length || n.deals?.length));
}

/** A verification date is evidence only when it is present and parseable. */
export function recordedFieldNoteVerificationDate(
  value?: string,
): string | null {
  const candidate = value?.trim();
  if (!candidate || !Number.isFinite(Date.parse(candidate))) return null;
  return candidate;
}

/** Every place with a sourced happy-hour note on file — powers /happy-hour. */
export function placesWithFieldHappyHour(): Array<{ slug: string; happy_hour: FNHappyHour }> {
  return Object.entries(NOTES)
    .filter(([, n]) => Boolean(n.happy_hour))
    .map(([slug, n]) => ({ slug, happy_hour: n.happy_hour! }));
}

/**
 * A source check counts as "verified" for this many days. Past it the row
 * prints the month it was last checked instead, because a specials board
 * read in June says nothing reliable about November.
 */
export const FIELD_NOTE_CHECK_WINDOW_DAYS = 60;

export type FieldNoteCheck = {
  /** "verified 2w ago" inside the window, "last checked Jun 2026" past it. */
  label: string;
  /** True only while the recorded check is inside the window. */
  current: boolean;
};

/**
 * How far ahead of the clock a recorded check may sit and still count. A
 * date-only value parses as UTC midnight and the author may be in another
 * zone, so a check made today can read up to a day ahead.
 */
const FUTURE_CHECK_SKEW_MS = 2 * 86_400_000;

/**
 * The one reading of a row's recorded check date. Surfaces that draw a
 * verified badge must gate it on `current`, never on the label being present.
 * A date more than two days ahead of the clock is a typo, not a check, so it
 * reads as unrecorded. `nowMs` is injectable so the output is deterministic in
 * tests.
 */
export function fieldNoteCheck(
  iso?: string,
  nowMs: number = Date.now(),
): FieldNoteCheck | null {
  const recorded = recordedFieldNoteVerificationDate(iso);
  if (!recorded) return null;
  const checkedAt = +new Date(recorded);
  const d = nowMs - checkedAt;
  if (!Number.isFinite(d) || d < -FUTURE_CHECK_SKEW_MS) return null;
  if (d < 0) return { label: "verified just now", current: true };
  const days = Math.floor(d / 86_400_000);
  if (days > FIELD_NOTE_CHECK_WINDOW_DAYS) {
    const month = new Date(checkedAt).toLocaleDateString("en-US", {
      month: "short",
      year: "numeric",
      timeZone: recordedDayTimeZone(recorded),
    });
    return { label: `last checked ${month}`, current: false };
  }
  if (days < 1) return { label: "verified today", current: true };
  if (days < 14) return { label: `verified ${days}d ago`, current: true };
  return { label: `verified ${Math.floor(days / 7)}w ago`, current: true };
}

/**
 * "verified 2w ago" inside the check window, "last checked Jun 2026" past
 * it. The same register as the business-info freshness line.
 */
export function verifiedLabel(
  iso?: string,
  nowMs: number = Date.now(),
): string | null {
  return fieldNoteCheck(iso, nowMs)?.label ?? null;
}
