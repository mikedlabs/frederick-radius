import RAW from "@/data/field-notes.json" with { type: "json" };
import { deepCleanStrings } from "@/lib/format/text";
import { parseHappyHour, type HHWindow } from "@/lib/happyHour";
import { checkedLabel } from "@/lib/trust-language";

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

/**
 * "Checked Jun 15": the recorded check date in the trust-language format, so
 * a Field Notes row, a deal card and the place page's trust line date a check
 * the same way. Null when no parseable date was recorded.
 */
export function verifiedLabel(iso?: string, now: number = Date.now()): string | null {
  const recorded = recordedFieldNoteVerificationDate(iso);
  if (!recorded) return null;
  return checkedLabel(recorded, now);
}

/**
 * Structured happy-hour windows, parsed once at the loader boundary from the
 * reviewed schedule ("Mon-Fri 4-6:30pm"). A schedule the parser cannot read
 * ("Tue, Wed & Thu specials") yields no window, so no surface can claim the
 * happy hour is on. Surfaces read these windows; they never parse the text.
 */
const HAPPY_HOUR_WINDOWS: ReadonlyMap<string, readonly HHWindow[]> = new Map(
  Object.entries(NOTES)
    .map(([slug, notes]) => [slug, parseHappyHour(notes.happy_hour?.schedule ?? "")] as const)
    .filter(([, windows]) => windows.length > 0),
);

export function happyHourWindowsFor(slug: string): readonly HHWindow[] {
  return HAPPY_HOUR_WINDOWS.get(slug) ?? [];
}

const EASTERN_DAY_MINUTE = new Intl.DateTimeFormat("en-US", {
  timeZone: "America/New_York",
  weekday: "short",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});
const WEEKDAY_INDEX: Readonly<Record<string, number>> = {
  Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6,
};

/**
 * True only when one of the place's structured happy-hour windows covers
 * `now` on the Frederick clock. No window means no claim.
 */
export function happyHourOnAt(slug: string, now: Date): boolean {
  const windows = HAPPY_HOUR_WINDOWS.get(slug);
  if (!windows) return false;
  const parts = Object.fromEntries(
    EASTERN_DAY_MINUTE.formatToParts(now).map((part) => [part.type, part.value]),
  );
  const day = WEEKDAY_INDEX[parts.weekday ?? ""];
  if (day === undefined) return false;
  const minute = (Number(parts.hour) % 24) * 60 + Number(parts.minute);
  return windows.some(
    (window) => window.days.includes(day) && minute >= window.start && minute < window.end,
  );
}
