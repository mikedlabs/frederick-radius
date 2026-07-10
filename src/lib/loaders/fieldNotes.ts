import RAW from "@/data/field-notes.json" with { type: "json" };
import { deepCleanStrings } from "@/lib/format/text";

/**
 * Field Notes — the VERIFIED local-intelligence layer (the moat).
 *
 * The stuff a real local guide knows and websites bury: happy hours,
 * parking, deals, insider tips — each agent-extracted from a public source,
 * then ADVERSARIALLY VERIFIED against that source (a wrong happy hour is
 * worse than none). Every field carries the honesty trinity: source_url +
 * confidence + last_verified, shown to the user.
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

/** Every place with a VERIFIED happy hour on file — powers /happy-hour. */
export function placesWithFieldHappyHour(): Array<{ slug: string; happy_hour: FNHappyHour }> {
  return Object.entries(NOTES)
    .filter(([, n]) => Boolean(n.happy_hour))
    .map(([slug, n]) => ({ slug, happy_hour: n.happy_hour! }));
}

/** "verified 2w ago" — same register as the business-info freshness line. */
export function verifiedLabel(iso?: string): string | null {
  if (!iso) return null;
  const d = Date.now() - +new Date(iso);
  if (!Number.isFinite(d) || d < 0) return "verified just now";
  const days = Math.floor(d / 86_400_000);
  if (days < 1) return "verified today";
  if (days < 14) return `verified ${days}d ago`;
  const weeks = Math.floor(days / 7);
  if (weeks < 9) return `verified ${weeks}w ago`;
  return `verified ${Math.floor(days / 30)}mo ago`;
}
