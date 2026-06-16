import data from "@/data/field-notes.json";
import { clientPlaceBySlug } from "@/lib/loaders/places-client";
import { MUNICIPALITY_BY_SLUG } from "@/data/municipalities";
import { verifiedLabel } from "@/lib/loaders/fieldNotes";

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
  offer: string;
  source_url?: string;
  verified: string | null;
  confidence: string;
};

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
      const cand: TodaysDeal = {
        slug, name: place.name, town,
        offer: (d.text || "").trim(),
        source_url: d.source_url, verified: verifiedLabel(d.last_verified), confidence: conf,
      };
      const prev = best.get(slug);
      if (!prev || OK[conf] > OK[prev.confidence]) best.set(slug, cand);
    }
  }
  return [...best.values()]
    .sort((a, b) => OK[b.confidence] - OK[a.confidence] || a.name.localeCompare(b.name))
    .slice(0, limit);
}
