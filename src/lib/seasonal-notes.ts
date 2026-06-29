import { easternParts } from "@/lib/tz";

/**
 * Seasonal / local-rhythm notes — a small, deterministic, unit-tested table of
 * dated almanac lines for the /today masthead. Each note is either:
 *   - COMPUTABLE (e.g. First Saturday = first Saturday of the month; market
 *     season = May to October) — derived purely from the Eastern calendar, no
 *     curation, no source needed; or
 *   - CURATED (e.g. leaf-peak) — a hand-entered date window that MUST carry a
 *     real `source` (honesty rule: every claim dated and sourced, no fabrication).
 *
 * The picker returns the single highest-priority active note, so the beat never
 * stacks two lines. Pure (Date is always passed in; no Date.now, no I/O), so the
 * predicates are TZ-correct (Eastern via easternParts) and trivially testable.
 */
export type SeasonalNote = {
  /** Stable id (React key + test target + the computable-vs-curated check). */
  id: string;
  /** True when this note applies on `now` (Eastern). Pure. */
  active: (now: Date) => boolean;
  /** Lowest number wins when several are active the same day. */
  priority: number;
  /** Bold lead phrase. Brand voice, no em dashes. */
  lead: string;
  /** The rest of the line. */
  detail: string;
  /** Optional in-app link + label. */
  href?: string;
  hrefLabel?: string;
  /** REQUIRED for any CURATED (non-computable) note: a short honest attribution
   *  rendered as a quiet mono tail. Computable notes may omit it. */
  source?: string;
};

/** Notes whose claim is derived purely from the calendar (no curated dates), so
 *  they are exempt from the source-required invariant. */
export const COMPUTABLE_NOTE_IDS = new Set(["first-saturday", "market-season"]);

/** Is `now` the nth occurrence of `weekday` (0=Sun..6=Sat) in its Eastern month?
 *  Derives the occurrence from the Eastern day-of-month so it never reads
 *  server-local (UTC) time. */
function isNthWeekdayOfMonth(now: Date, weekday: number, n: number): boolean {
  const { day, weekday: wd } = easternParts(now);
  if (wd !== weekday) return false;
  return Math.floor((day - 1) / 7) + 1 === n;
}

export const SEASONAL_NOTES: SeasonalNote[] = [
  {
    // COMPUTABLE: first Saturday of every month. Downtown Frederick's galleries
    // and shops stay open late (the year-round First Saturday gallery walk).
    // Scoped to that always-true claim, NOT the warm-months street festival.
    id: "first-saturday",
    priority: 10,
    active: (now) => isNthWeekdayOfMonth(now, 6, 1),
    lead: "First Saturday is today",
    detail: "downtown galleries and shops stay open late.",
    href: "/events",
    hrefLabel: "See what's on",
    source: "Downtown Frederick Partnership",
  },
  {
    // CURATED RANGE: leaf peak on the Catoctin / Frederick Valley ridge.
    // SHIPPED DISABLED until the owner confirms the window + source string;
    // we will not ship an unverified dated claim. Flip `active` to the
    // commented range once confirmed.
    id: "foliage-peak",
    priority: 30,
    active: () => false,
    lead: "Leaf season on the ridge",
    detail: "the Catoctin and Frederick Valley overlooks are near peak.",
    href: "/category/park",
    hrefLabel: "Find a park",
    source: "NPS Catoctin Mountain Park",
  },
  {
    // COMPUTABLE: farmers-market season (May to October in Maryland). States the
    // SEASON only and links to the category. The live per-day market count is
    // OnNowBand's job, so the two never disagree.
    id: "market-season",
    priority: 40,
    active: (now) => {
      const { month } = easternParts(now);
      return month >= 5 && month <= 10;
    },
    lead: "Market season",
    detail: "county farmers markets are running through October.",
    href: "/category/market",
    hrefLabel: "All markets",
  },
];

/** The single most relevant active note for `now`, or null. Lowest priority
 *  number wins; ties break by array order. Pure. */
export function pickSeasonalNote(now: Date): SeasonalNote | null {
  let best: SeasonalNote | null = null;
  for (const note of SEASONAL_NOTES) {
    if (!note.active(now)) continue;
    if (!best || note.priority < best.priority) best = note;
  }
  return best;
}
