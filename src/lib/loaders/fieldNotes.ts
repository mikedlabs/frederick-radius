import RAW from "@/data/field-notes.json" with { type: "json" };
import { deepCleanStrings } from "@/lib/format/text";

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

export type FieldNotesVerificationSummary = {
  total: number;
  dated: number;
  undated: number;
  allDated: boolean;
  latest: string | null;
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

/** Flatten the display rows without manufacturing evidence for older notes. */
export function fieldNoteSources(notes: FieldNotes): FNSourced[] {
  return [
    ...(notes.happy_hour
      ? [{
          text: notes.happy_hour.schedule,
          source_url: notes.happy_hour.source_url,
          confidence: notes.happy_hour.confidence,
          last_verified: notes.happy_hour.last_verified,
        }]
      : []),
    ...(notes.deals ?? []),
    ...(notes.parking ? [notes.parking] : []),
    ...(notes.insider ?? []),
  ];
}

/** A verification date is evidence only when it is present and parseable. */
export function recordedFieldNoteVerificationDate(
  value?: string,
): string | null {
  const candidate = value?.trim();
  if (!candidate || !Number.isFinite(Date.parse(candidate))) return null;
  return candidate;
}

/**
 * Summarize row-level evidence for the card seal. `allDated` is deliberately
 * strict: a single undated fact keeps the card at SOURCED rather than letting
 * another row's newer date confer a blanket VERIFIED state.
 */
export function fieldNotesVerificationSummary(
  rows: readonly FNSourced[],
): FieldNotesVerificationSummary {
  const dates = rows
    .map((row) => recordedFieldNoteVerificationDate(row.last_verified))
    .filter((date): date is string => Boolean(date))
    .sort();
  return {
    total: rows.length,
    dated: dates.length,
    undated: rows.length - dates.length,
    allDated: rows.length > 0 && dates.length === rows.length,
    latest: dates.at(-1) ?? null,
  };
}

/** Every place with a sourced happy-hour note on file — powers /happy-hour. */
export function placesWithFieldHappyHour(): Array<{ slug: string; happy_hour: FNHappyHour }> {
  return Object.entries(NOTES)
    .filter(([, n]) => Boolean(n.happy_hour))
    .map(([slug, n]) => ({ slug, happy_hour: n.happy_hour! }));
}

/** "verified 2w ago" — same register as the business-info freshness line. */
export function verifiedLabel(iso?: string): string | null {
  const recorded = recordedFieldNoteVerificationDate(iso);
  if (!recorded) return null;
  const d = Date.now() - +new Date(recorded);
  if (!Number.isFinite(d) || d < 0) return "verified just now";
  const days = Math.floor(d / 86_400_000);
  if (days < 1) return "verified today";
  if (days < 14) return `verified ${days}d ago`;
  const weeks = Math.floor(days / 7);
  if (weeks < 9) return `verified ${weeks}w ago`;
  return `verified ${Math.floor(days / 30)}mo ago`;
}
