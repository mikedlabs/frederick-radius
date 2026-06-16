import data from "@/data/field-notes.json";
import { clientPlaceBySlug } from "@/lib/loaders/places-client";
import { MUNICIPALITY_BY_SLUG } from "@/data/municipalities";
import { verifiedLabel, fieldNotesFor } from "@/lib/loaders/fieldNotes";

/**
 * Today's Deals — the verified, day-of-week-aware specials happening TODAY,
 * pulled from the Field Notes deals (the moat). The day is read off the deal
 * text (it is written "Tuesday: ...", "Crabby Wednesday", "Taco Tuesday"),
 * matched against the Eastern weekday. Only confidence-backed, last_verified
 * deals surface, and a deal whose place is no longer in the dataset is
 * skipped. This is the single most repeatable daily reason to open the app.
 *
 * Honest by construction: a deal with no detectable day is treated as a
 * standing special and EXCLUDED from "today" (it isn't news), so the strip
 * only ever claims a special that genuinely runs today.
 */

type FNDeal = { text: string; source_url?: string; confidence?: string; last_verified?: string };
type FNEntry = { deals?: FNDeal[] };
const NOTES = data as Record<string, FNEntry>;

const DAY_IDX: Record<string, number> = {
  sun: 0, sunday: 0, mon: 1, monday: 1, tue: 2, tues: 2, tuesday: 2,
  wed: 3, weds: 3, wednesday: 3, thu: 4, thur: 4, thurs: 4, thursday: 4,
  fri: 5, friday: 5, sat: 6, saturday: 6,
};
const DAY_RE =
  /\b(sunday|monday|tuesday|wednesday|thursday|friday|saturday|tues|thurs|thur|weds|sun|mon|tue|wed|thu|fri|sat)\b/gi;

/** Weekday indices named anywhere in the deal text (empty = no day stated). */
function daysInText(t: string): Set<number> {
  const out = new Set<number>();
  for (const m of t.toLowerCase().matchAll(DAY_RE)) {
    const n = DAY_IDX[m[1]];
    if (n !== undefined) out.add(n);
  }
  return out;
}

function easternDow(now: Date): number {
  const wd = new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", weekday: "short" }).format(now);
  return { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 }[wd] ?? 0;
}

export const EASTERN_WEEKDAY = (now: Date): string =>
  new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", weekday: "long" }).format(now);

export type TodaysDeal = {
  slug: string;
  name: string;
  town?: string;
  /** True when the place is in Frederick City (municipality "frederick") —
   *  downtown deals lead the deck (the densest, most-walkable cluster). */
  downtown?: boolean;
  /** Place category — drives the happy-hour-vibe glyph (bar/brewery/winery/
   *  restaurant), so a deal never wears a retail price-tag icon. */
  category?: string;
  offer: string;
  /** The hours the deal runs ("5–9 PM", "All day"), parsed out of the offer
   *  text so the surface can show WHEN as its own distinct datum next to the
   *  place and the deal. Undefined when the text states no time. */
  hours?: string;
  /** Verified Field Notes for this place — where to park + an insider tip —
   *  so a deal card can carry the local intel, not just the offer. */
  park?: string;
  tip?: string;
  source_url?: string;
  verified: string | null;
  confidence: string;
};

/** Tidy a raw time fragment into display form: en-dash range, single space
 *  before an uppercased meridiem ("11am-8pm" → "11 AM–8 PM"). */
function formatHours(raw: string): string {
  return raw
    .replace(/[–—]/g, "-")
    .replace(/\s*-\s*/g, "–")
    .replace(/(\d)\s*(am|pm)/gi, (_, d, mer) => `${d} ${mer.toUpperCase()}`)
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Pull the WHEN out of a free-text deal. Deals bundle the offer + day + hours
 * in one sentence ("Tuesday: $13 shrimp, 5-9 PM"); the strip header already
 * carries the day (it's today), so this surfaces just the hours as a scannable
 * datum. Handles ranges ("5-9 PM", "7 PM-1 AM", "11am-8pm", "5 PM-close"),
 * "all day", and a single anchored time ("at 6:00 PM"). Returns undefined when
 * no time is stated, so the surface shows no time chip rather than a fake one.
 */
function extractHours(text: string): string | undefined {
  const range = text.match(
    /\b\d{1,2}(?::\d{2})?\s*(?:am|pm)?\s*[-–—]\s*(?:\d{1,2}(?::\d{2})?\s*(?:am|pm)|close)\b/i,
  );
  if (range) return formatHours(range[0]);
  if (/\ball day\b/i.test(text)) return "All day";
  const at = text.match(/\b(?:at|from|starting at)\s+(\d{1,2}(?::\d{2})?\s*(?:am|pm))\b/i);
  if (at) return formatHours(at[1]);
  return undefined;
}

/** Strip a leading weekday prefix ("Tuesday: ..." -> "...") — the strip header
 *  already states the day. "Taco Tuesday" / "Crabby Wednesday" keep theirs. */
function trimDay(offer: string): string {
  const t = offer.replace(/^\s*(sun|mon|tues?|wed(?:nes)?|thur?s?|fri|sat)[a-z]*\s*[:.\-–]\s*/i, "");
  return t.charAt(0).toUpperCase() + t.slice(1);
}

/** Remove the hours from the offer text so the WHEN isn't shown twice (the
 *  time runs in its own chip). Strips ranges, "all day", and anchored times,
 *  then tidies the orphaned punctuation. Falls back to the input if stripping
 *  leaves nothing. */
function stripHours(offer: string): string {
  const out = offer
    .replace(/\b\d{1,2}(?::\d{2})?\s*(?:am|pm)?\s*[-–—]\s*(?:\d{1,2}(?::\d{2})?\s*(?:am|pm)|close)\b/gi, "")
    .replace(/\ball day\b/gi, "")
    .replace(/\b(?:at|from|starting at)\s+\d{1,2}(?::\d{2})?\s*(?:am|pm)\b/gi, "")
    .replace(/\(\s*\)/g, "")
    .replace(/\s*,\s*,/g, ",")
    .replace(/\s*,\s*\./g, ".")
    .replace(/\s{2,}/g, " ")
    .replace(/\s+([.,;)])/g, "$1")
    .replace(/[(\s,;:–-]+$/g, "")
    .replace(/^[\s,;:]+/, "")
    .trim();
  return out.length >= 4 ? out : offer.trim();
}

const OK: Record<string, number> = { high: 2, medium: 1 };

/**
 * The verified specials that run TODAY (Eastern), best one per venue, ranked
 * confidence-first then by venue name. `limit` caps the strip (default 6).
 */
export function todaysDeals(now: Date, limit = 6): TodaysDeal[] {
  const dow = easternDow(now);
  const best = new Map<string, TodaysDeal>();
  for (const [slug, entry] of Object.entries(NOTES)) {
    if (!entry.deals?.length) continue;
    const place = clientPlaceBySlug(slug);
    if (!place) continue; // folded/removed in the dedup sweep — never surface
    const town = place.municipality ? MUNICIPALITY_BY_SLUG[place.municipality]?.name : undefined;
    for (const d of entry.deals) {
      const conf = (d.confidence ?? "").toLowerCase();
      if (!OK[conf] || !d.last_verified) continue;
      const days = daysInText(d.text || "");
      if (!days.has(dow)) continue; // no-day standing specials are not "today" news
      const raw = (d.text || "").trim();
      const hours = extractHours(raw);
      const fn = fieldNotesFor(slug);
      const cand: TodaysDeal = {
        slug, name: place.name, town,
        downtown: place.municipality === "frederick",
        category: place.category,
        // The offer leads with the WHAT; the day prefix + the hours are pulled
        // out (header states the day, a chip states the time) so the headline
        // isn't a redundant restatement.
        offer: stripHours(trimDay(raw)),
        hours,
        park: fn?.parking?.text,
        tip: fn?.insider?.[0]?.text,
        source_url: d.source_url, verified: verifiedLabel(d.last_verified), confidence: conf,
      };
      const prev = best.get(slug);
      if (!prev || OK[conf] > OK[prev.confidence]) best.set(slug, cand);
    }
  }
  return [...best.values()]
    .sort(
      (a, b) =>
        // Downtown Frederick leads (the walkable core), then verification
        // confidence, then name — so the deck opens on the best downtown deals.
        Number(Boolean(b.downtown)) - Number(Boolean(a.downtown)) ||
        OK[b.confidence] - OK[a.confidence] ||
        a.name.localeCompare(b.name),
    )
    .slice(0, limit);
}
