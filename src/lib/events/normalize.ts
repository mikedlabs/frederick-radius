/**
 * Event normalization helpers.
 *
 * The cleanup the feeds need before they are stored or rendered, built
 * on the shared text sanitizers in `@/lib/format/text`. These run at the
 * data boundaries (`liveToCardEvent` for live iCal, `loadUpcoming` for
 * the municipal DB), never in render components.
 *
 * Pure and isomorphic: no network, no DOM. The clock is injected through
 * the ISO strings the callers pass, so tests advance time without
 * mocking globals.
 */

import { cleanFeedText } from "@/lib/format/text";
import type { EventWithMeta } from "@/lib/loaders/events";

const ET = "America/New_York";

const normLoose = (s: string): string =>
  (s || "").toLowerCase().replace(/[^a-z0-9]+/g, "");

/**
 * Organization tokens that mark the left side of an "Organization-Event"
 * title as a presenter rather than part of the event name. Kept to
 * civic and cultural org words so a normal hyphenated title is not
 * mistaken for a presenter line.
 */
const ORG_TOKENS =
  /\b(council|partnership|society|association|foundation|center|centre|museum|library|arts|celebrate|department|commission|committee|productions|orchestra|chorus|ensemble|theatre|theater|alliance|coalition|guild|club|league|chamber|rotary|lions|elks)\b/i;

/**
 * Split an "Organization-Event Name" title into a presenter and a clean
 * title. Splits on the first hyphen only, and only when the left side
 * reads as an organization (contains an org token, is reasonably short,
 * and leaves a non-trivial title on the right). Otherwise the whole
 * string is the title with no presenter.
 */
export function splitPresenter(raw: string): { presenter?: string; title: string } {
  const s = raw.trim();
  const m = /^(.{3,60}?)\s*-\s*(.+)$/.exec(s);
  if (m) {
    const left = m[1].trim();
    const right = m[2].trim();
    const leftWords = left.split(/\s+/).length;
    if (ORG_TOKENS.test(left) && leftWords <= 7 && right.length >= 3) {
      return { presenter: left, title: right };
    }
  }
  return { title: s };
}

/**
 * Clean a single title string: decode and strip via cleanFeedText, put a
 * space where a feed mashed two words with a hyphen ("Council-Workshop"
 * becomes "Council Workshop"), and strip a trailing year the event date
 * already implies. The hyphen rule only fires before an uppercase letter
 * or a digit, so real compounds like "co-op", "pop-up", and "drive-in"
 * keep their hyphen.
 */
export function cleanTitle(raw: string, opts: { year?: number } = {}): string {
  let t = cleanFeedText(raw);
  t = t.replace(/([A-Za-z])-(?=[A-Z0-9])/g, "$1 ");
  // Strip a trailing 4-digit year, but not when a preposition precedes
  // it ("...patients in 2025" keeps the year, "Octoberfest 2026" drops
  // it). When a year is provided, only strip that exact year.
  t = t.replace(
    /\s+(?:[-,]\s*)?((?:19|20)\d{2})$/,
    (full, yr: string, offset: number, str: string) => {
      const before = str.slice(0, offset).trim().toLowerCase();
      if (/\b(in|of|for|since|to|until|thru|through)$/.test(before)) return full;
      if (opts.year && Number(yr) !== opts.year) return full;
      return "";
    },
  );
  return t.replace(/\s+/g, " ").trim();
}

/**
 * Decode, split presenter, and clean the title in one pass. The single
 * entry the data boundaries call. `year` lets the year-strip act only on
 * the event's own year.
 */
export function normalizeTitle(
  raw: string,
  opts: { year?: number } = {},
): { presenter?: string; title: string } {
  const decoded = cleanFeedText(raw || "");
  const { presenter, title } = splitPresenter(decoded);
  return {
    presenter: presenter ? cleanTitle(presenter) : undefined,
    title: cleanTitle(title, opts),
  };
}

/**
 * Labels that some calendar feeds dump as raw metadata into the event
 * DESCRIPTION body — e.g. "Event date: Jun 9  Event Time: 6 PM  Location:
 * City Hall". That is data, not a reason to go, and it leaked onto cards,
 * the detail body, and OG blurbs (the audit's luncheon hero). The strip
 * lives HERE, at the data boundary, so every surface reads the same clean
 * text — never a render-time patch on one component.
 */
// Metadata labels whose whole "Label: value" is DATA to drop (a date, a
// time, an address, a price — never a reason to go).
const META_LABELS =
  "event\\s+date|event\\s+time|date|time|location|venue|cost|admission|price|tickets?|when|where";
// Content labels that merely PREFIX the real description ("Description: …").
// The label is dropped but its value — the actual prose — is kept.
const CONTENT_LABELS = "description|details|about|summary|info|overview";
// Either kind, for boundary detection (a metadata value ends at the next
// label of EITHER kind — so "Event Time: 7 PM Description: …" stops the time
// value at "Description:").
const ANY_LABEL = `${META_LABELS}|${CONTENT_LABELS}`;
// A leading META "Label: value" whose value runs up to the NEXT label — a
// member of a metadata CHAIN. Only chain members are stripped, so ordinary
// prose (which never chains "Label: … Label: …") is never eaten.
const META_CHAIN_SEGMENT = new RegExp(
  `^\\s*(?:${META_LABELS})\\s*:\\s*.*?(?=\\s(?:${ANY_LABEL})\\s*:)`,
  "i",
);
// A bare "Label: shortvalue" with no sentence prose — the tail of a chain.
const META_LONE = new RegExp(`^\\s*(?:${META_LABELS})\\s*:\\s*[^.!?]{0,60}$`, "i");
// A leading content label to drop while keeping its value.
const CONTENT_PREFIX = new RegExp(`^\\s*(?:${CONTENT_LABELS})\\s*:\\s*`, "i");

/**
 * Clean an event description for display: decode + strip HTML/entities
 * (cleanFeedText), then remove a LEADING run of dumped "Label: value"
 * metadata. Deliberately conservative — it removes only chained metadata
 * segments, and drops a final bare label only when it's the tail of a chain
 * it already stripped, so a standalone one-line "Time: …" that might be a
 * real description is left untouched. A trailing "Description:" content
 * label (the real feeds put the prose behind one) loses its label, never
 * its value. Whitespace is collapsed. Pure; the caller caps any length.
 */
export function cleanDescription(raw: string | null | undefined): string {
  let d = cleanFeedText(raw ?? "");
  const original = d;
  let prev = "";
  while (d !== prev) {
    prev = d;
    d = d.replace(META_CHAIN_SEGMENT, "").trim();
  }
  // Only drop a trailing bare label when we actually stripped a chain, so a
  // standalone "Time: A Musical Journey" is never mistaken for metadata.
  if (d !== original && META_LONE.test(d)) d = "";
  // Drop a leading "Description:/Details:/…" label, keeping the prose behind
  // it (the format real feeds use: "Event Time: 7 PM Description: <prose>").
  d = d.replace(CONTENT_PREFIX, "");
  return d.replace(/\s+/g, " ").trim();
}

/**
 * A venue name must be an actual place — not a description/metadata dump a
 * feed leaked into its LOCATION field ("Description: Did you know…?"). Returns
 * the cleaned name, or null when the value carries a metadata/content label or
 * a question mark, so the caller drops it (or falls back to a default venue).
 * Shares the label vocabulary with cleanDescription.
 */
export function cleanVenueName(raw: string | null | undefined): string | null {
  const v = cleanFeedText(raw ?? "").trim();
  if (!v) return null;
  if (new RegExp(`\\b(?:${ANY_LABEL})\\s*:`, "i").test(v) || v.includes("?")) {
    return null;
  }
  return v;
}

/**
 * Collapse key for recurring events. Title plus venue plus municipality,
 * with no date component, so a daily or weekly series collapses to ONE
 * entry rather than one per weekday. Mirrors the municipal loader's
 * series key, which already collapses correctly.
 */
export function recurrenceKey(input: {
  title: string;
  venue?: string | null;
  municipality?: string | null;
}): string {
  return [
    normLoose(input.title),
    normLoose(input.venue ?? ""),
    normLoose(input.municipality ?? ""),
  ].join("|");
}

function kebab(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

function etYmd(iso: string): string {
  // en-CA formats as YYYY-MM-DD, which is exactly the slug date form.
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: ET,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(iso));
  return parts;
}

export function etYear(iso: string): number {
  return Number(
    new Intl.DateTimeFormat("en-US", { timeZone: ET, year: "numeric" }).format(
      new Date(iso),
    ),
  );
}

/**
 * Clean, shareable slug: kebab(presenter + title) + "-" + YYYY-MM-DD,
 * date in Eastern. No "live-" prefix, no mashed address, no timestamp.
 * The kebab is capped so a long title does not produce a monster slug.
 * Collision handling (a numeric suffix) is the caller's job, since only
 * the caller knows the full set of slugs in play.
 */
export function cleanEventSlug(input: {
  presenter?: string;
  title: string;
  startsAt: string;
}): string {
  const name = [input.presenter, input.title].filter(Boolean).join(" ");
  let base = kebab(name);
  if (base.length > 60) {
    base = base.slice(0, 60).replace(/-[^-]*$/, "");
  }
  return `${base}-${etYmd(input.startsAt)}`;
}

/**
 * Collapse recurring events in a flat list to one card each. Groups by
 * recurrenceKey, keeps the soonest occurrence (the list arrives sorted by
 * start, so the first seen per key is the soonest), and marks the kept
 * card recurring with a short date-count note. This is the fix for live
 * feeds that emit every occurrence as its own row, so a tasting room that
 * is "open" ten days no longer fills the list with ten identical cards.
 */
export function collapseRecurringEvents(events: EventWithMeta[]): EventWithMeta[] {
  const indexByKey = new Map<string, number>();
  const countByKey = new Map<string, number>();
  const out: EventWithMeta[] = [];
  for (const e of events) {
    const key = recurrenceKey({
      title: e.title,
      venue: e.venue_name,
      municipality: e.municipality,
    });
    const seen = indexByKey.get(key);
    if (seen === undefined) {
      indexByKey.set(key, out.length);
      countByKey.set(key, 1);
      out.push(e);
    } else {
      countByKey.set(key, (countByKey.get(key) ?? 1) + 1);
    }
  }
  // Stamp recurrence note on collapsed groups.
  for (const [key, idx] of indexByKey) {
    const count = countByKey.get(key) ?? 1;
    if (count > 1) {
      out[idx] = {
        ...out[idx],
        is_recurring: true,
        recurrence_text:
          out[idx].recurrence_text ??
          (count >= 5 ? "Runs most days" : `${count} upcoming dates`),
      };
    }
  }
  return out;
}
