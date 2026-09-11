import data from "@/data/field-notes.json";
import { clientPlaceBySlug } from "@/lib/loaders/places-client";
import { MUNICIPALITY_BY_SLUG } from "@/data/municipalities";
import { verifiedLabel, fieldNotesFor } from "@/lib/loaders/fieldNotes";
import type { DealRow } from "@/lib/deals/dealRow";

export {
  dealHoursForDay,
  dealOfferForDay,
  type DealRow,
} from "@/lib/deals/dealRow";

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

export type WeekdayIndex = 0 | 1 | 2 | 3 | 4 | 5 | 6;

const DAY_IDX: Record<string, WeekdayIndex> = {
  sun: 0, sunday: 0, sundays: 0,
  mon: 1, monday: 1, mondays: 1,
  tue: 2, tues: 2, tuesday: 2, tuesdays: 2,
  wed: 3, weds: 3, wednesday: 3, wednesdays: 3,
  thu: 4, thur: 4, thurs: 4, thursday: 4, thursdays: 4,
  fri: 5, friday: 5, fridays: 5,
  sat: 6, saturday: 6, saturdays: 6,
};
// Longest-first keeps a plural token together instead of letting the shorter
// singular alternative stop at its internal word boundary.
const DAY_TOKEN_SOURCE = Object.keys(DAY_IDX)
  .sort((a, b) => b.length - a.length)
  .join("|");
const DAY_RE = new RegExp(String.raw`\b(${DAY_TOKEN_SOURCE})\b`, "gi");
const DAY_RANGE_RE = new RegExp(
  String.raw`\b(${DAY_TOKEN_SOURCE})\b\s*(?:[-–—]|\b(?:to|through|thru)\b)\s*\b(${DAY_TOKEN_SOURCE})\b`,
  "gi",
);

function dayIndex(token: string): WeekdayIndex | undefined {
  return DAY_IDX[token.toLowerCase()];
}

/** Expand Tue–Fri as Tue/Wed/Thu/Fri. Wraparound ranges such as Fri–Mon are
 * supported too, with a hard seven-day bound so malformed input cannot loop. */
function expandDayRange(start: WeekdayIndex, end: WeekdayIndex): WeekdayIndex[] {
  const days: WeekdayIndex[] = [start];
  let current = start;
  for (let i = 0; i < 6 && current !== end; i++) {
    current = ((current + 1) % 7) as WeekdayIndex;
    days.push(current);
  }
  return days;
}

type DayMention = {
  start: number;
  end: number;
  days: Set<WeekdayIndex>;
};

/**
 * Find the scheduling mentions in source order. A range is one mention, while
 * adjacent list items ("Tuesday, Wednesday, and Thursday") are merged into one
 * shared schedule group. Day names separated by actual offer copy remain
 * separate, which lets the per-day view isolate Monkey Lala's three specials.
 */
function dayMentions(text: string): DayMention[] {
  const ranges: DayMention[] = [];
  for (const match of text.matchAll(new RegExp(DAY_RANGE_RE.source, "gi"))) {
    const start = dayIndex(match[1]);
    const end = dayIndex(match[2]);
    if (start === undefined || end === undefined || match.index === undefined) continue;
    ranges.push({
      start: match.index,
      end: match.index + match[0].length,
      days: new Set(expandDayRange(start, end)),
    });
  }

  const atoms: DayMention[] = [...ranges];
  for (const match of text.matchAll(new RegExp(DAY_RE.source, "gi"))) {
    if (match.index === undefined) continue;
    const start = match.index;
    const end = start + match[0].length;
    if (ranges.some((range) => start >= range.start && end <= range.end)) continue;
    const day = dayIndex(match[1]);
    if (day === undefined) continue;
    atoms.push({ start, end, days: new Set([day]) });
  }
  atoms.sort((a, b) => a.start - b.start);

  const mentions: DayMention[] = [];
  for (const atom of atoms) {
    const previous = mentions.at(-1);
    if (
      previous &&
      /^\s*(?:,\s*)?(?:(?:and|&)\s*)?$/i.test(text.slice(previous.end, atom.start))
    ) {
      for (const day of atom.days) previous.days.add(day);
      previous.end = atom.end;
    } else {
      mentions.push({
        start: atom.start,
        end: atom.end,
        days: new Set(atom.days),
      });
    }
  }
  return mentions;
}

/** Weekday indices named anywhere in the deal text (empty = no day stated).
 * Plural weekday names and inclusive ranges are normalized at this boundary so
 * every downstream count, filter, and "today" claim uses the same truth. */
export function daysInText(text: string): Set<WeekdayIndex> {
  const out = new Set<WeekdayIndex>();
  for (const mention of dayMentions(text)) {
    for (const day of mention.days) out.add(day);
  }
  return out;
}

/**
 * Does this text actually describe an OFFER (a price, a discount, a special) —
 * versus a venue description or an activity that merely names a weekday? "Today's
 * briefing" is verified SPECIALS, so a row that reads "Live music Thursday" or
 * "Football-season bar" is fodder for Events, not a deal, and is dropped here so
 * every row genuinely answers "what's the deal".
 */
const OFFER_RE =
  /\$\s*\d|\d\s*%|%\s*off|\bhalf\b|1\/2|\boff\b|\bfree\b|\bspecials?\b|\bdeals?\b|\bbogo\b|\b2[\s-]?for\b|\bdiscount\b|\bayce\b|all[-\s]?you[-\s]?can[-\s]?eat|happy\s*hour|prix[\s-]?fixe|bottomless/i;
function readsAsOffer(t: string): boolean {
  return OFFER_RE.test(t);
}

const MONEY_RE = /\$\s*\d|\d\s*%/i;
const STRONG_VALUE_RE =
  /\b(?:\d{1,3}\s*%\s*off|half[-\s]?(?:off|price)|bogo|buy\s+one\s+get\s+one|discount(?:ed)?|all[-\s]?you[-\s]?can[-\s]?eat|ayce|bottomless|happy\s*hour|kids?\s+eat\s+for)\b|\$\s*\d+(?:\.\d{1,2})?\s*off\b/i;
const DAY_PREFIX_RE = new RegExp(
  String.raw`^\s*(?:${DAY_TOKEN_SOURCE})\b`,
  "i",
);
const DEAL_FOOD_RE =
  /\b(?:appetizers?|beer|bottles?|burgers?|cocktails?|crabs?|drafts?|drinks?|entrees?|food|margaritas?|meals?|oysters?|pasta|pizza|ribs?|shrimp|tacos?|wings?|wine)\b/i;
const FREE_VALUE_RE =
  /\b(?:get|receive|your\s+next|treat(?:s|ed)?\s+you\s+to)\b.{0,45}\bfree\b|\bfree\s+(?:appetizer|beer|cocktail|dessert|drink|entree|food|ice\s*cream|meal|pizza|taco|wine)\b/i;

/**
 * A usable deal must contain a concrete customer benefit, not merely a price,
 * an event, normal menu availability, or a membership perk. Field Notes uses
 * one broad `deals` bucket, so this boundary is deliberately stricter than the
 * ingestion label. It keeps the Deals page from turning into another directory.
 */
export function isActionableDeal(text: string): boolean {
  const t = text.trim();
  if (!t || /\b(?:members?\s+only|wine\s+club\s+members?|club\s+membership)\b/i.test(t)) {
    return false;
  }
  if (STRONG_VALUE_RE.test(t)) return true;
  if (!/\b(?:winner|prize|lawn\s+games?|no\s+cover)\b/i.test(t) && FREE_VALUE_RE.test(t)) {
    return true;
  }
  if (/\b(?:winner|prize|lawn\s+games?|no\s+cover)\b/i.test(t)) return false;

  // A named weekday plus a real price is a conventional daily special. A
  // price mentioned later in an ordinary tour/menu description is not.
  if (DAY_PREFIX_RE.test(t) && MONEY_RE.test(t)) return true;
  const titleClause = t.split(":")[0]?.trim() ?? "";
  if (
    titleClause.length <= 40 &&
    daysInText(titleClause).size > 0 &&
    MONEY_RE.test(t)
  ) {
    return true;
  }

  // "Pizza Night: $10..." and "Tuesday taco specials" are useful even when
  // their source does not use the words discount/off.
  if (/\b(?:specials?|deal|night)\b/i.test(t) && DEAL_FOOD_RE.test(t)) {
    return MONEY_RE.test(t) || DAY_PREFIX_RE.test(t) || /\b(?:every|weekly)\b/i.test(t);
  }
  return false;
}

/**
 * Isolate TODAY's part of a multi-day deal. Many deals bundle a week of
 * specials in one string ("...Tuesday $4 pints; Wednesday crab discount;
 * Thursday $1 oysters"); showing the whole thing buries today's offer and can
 * surface another day's price. When the text names two-plus weekdays, split it
 * into clauses and keep only the ones naming today. Single-day / no-day text is
 * returned whole. Falls back to the full text if today can't be isolated.
 */
function todayClause(raw: string, dow: number): string {
  if (daysInText(raw).size < 2) return raw;
  const parts = raw.split(/;|\.\s+/).map((s) => s.trim()).filter(Boolean);
  const partDays = parts.map((part) => daysInText(part));
  const explicit = partDays
    .map((days, index) => ({ days, index }))
    .filter(({ days }) => days.size > 0);
  const selected = explicit.filter(({ days }) => days.has(dow as WeekdayIndex));
  if (selected.length === 0) return raw;

  const included = new Set<number>();
  // Preserve a source preamble that introduces the whole schedule.
  const firstExplicit = explicit[0]?.index ?? 0;
  for (let index = 0; index < firstExplicit; index++) included.add(index);

  for (const { index } of selected) {
    included.add(index);
    // Terms and elaboration without their own weekday belong to the explicit
    // clause immediately before them. Stop as soon as another weekday starts.
    for (let next = index + 1; next < parts.length; next++) {
      if (partDays[next].size > 0) break;
      included.add(next);
    }
  }

  const relevant = parts.filter((_, index) => included.has(index));
  const joined = relevant.length ? relevant.join("; ") : raw;
  const colon = joined.indexOf(":");
  if (colon > 0) {
    const prefix = joined.slice(0, colon);
    const scheduledOffer = joined.slice(colon + 1).trim();
    // Source notes sometimes introduce a week of specials before the first
    // colon ("Shares Avery's nightly specials: Tuesday ..."). That venue
    // context is useful in the complete source text, but it should not become
    // the headline for every selected day.
    if (
      !daysInText(prefix).has(dow as WeekdayIndex) &&
      daysInText(scheduledOffer).has(dow as WeekdayIndex)
    ) {
      return scheduledOffer;
    }
  }
  return joined;
}

/**
 * Drop trade-only clauses (a staff / industry / employee discount) so the
 * headline figure is a deal the PUBLIC can use, not a perk for restaurant
 * workers. Customer-facing discounts (military, student, etc.) stay. Falls back
 * to the input if stripping would gut it.
 */
function publicOffer(text: string): string {
  const parts = text.split(/;|\.\s+/).map((s) => s.trim()).filter(Boolean);
  const kept = parts
    .filter((p) => !/\b(staff|industry|employees?)\b/i.test(p))
    .map((p) => p.replace(/[\s,;:]+$/g, "").trim())
    .filter(Boolean);
  const out = kept.join("; ").trim();
  return out.length >= 4 ? out : "";
}

function easternDow(now: Date): WeekdayIndex {
  const wd = new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", weekday: "short" }).format(now);
  const days: Record<string, WeekdayIndex> = {
    Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6,
  };
  return days[wd] ?? 0;
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
  /** The venue's real (proxied, key-safe) Google photo, for the rich card
   *  face. Undefined when none — the surface draws a designed plate instead. */
  photo?: string;
  offer: string;
  /** Short essence headline distilled from the offer at the boundary ("Nightly
   *  AYCE Crabs special") — what the wallet lip prints. The full text stays in
   *  `offer` for the raised card. */
  headline: string;
  /** Terms qualifier lifted from a parenthetical in the offer ("Eat-in only"),
   *  shown as part of the mono lip fact next to the hours. */
  terms?: string;
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
export function extractHours(text: string): string | undefined {
  const range = text.match(
    /\b\d{1,2}(?::\d{2})?\s*(?:am|pm)?\s*[-–—]\s*(?:\d{1,2}(?::\d{2})?\s*(?:am|pm)|close)\b/i,
  );
  if (range) return formatHours(range[0]);
  if (/\ball day\b/i.test(text)) return "All day";
  if (/\b(?:at|from|starting at)\s+open\b/i.test(text)) return "At open";
  const at = text.match(/\b(?:at|from|starting at)\s+(\d{1,2}(?::\d{2})?\s*(?:am|pm))\b/i);
  if (at) return formatHours(at[1]);
  return undefined;
}

function clauseStartBefore(text: string, index: number): number {
  const before = text.slice(0, index);
  const semicolon = before.lastIndexOf(";");
  const sentence = before.lastIndexOf(". ");
  return Math.max(semicolon + 1, sentence >= 0 ? sentence + 2 : 0);
}

function clauseEndAfter(text: string, index: number): number {
  const tail = text.slice(index);
  const match = /;|\.(?=\s|$)/.exec(tail);
  return match?.index === undefined ? text.length : index + match.index;
}

/**
 * Resolve the time attached to one weekday instead of assigning the first time
 * in a compound source string to every day. The scan is source-preserving: it
 * narrows only the context used to identify the label.
 */
export function extractHoursForDay(text: string, day: number): string | undefined {
  const mentions = dayMentions(text);
  for (let index = 0; index < mentions.length; index++) {
    const mention = mentions[index];
    if (!mention.days.has(day as WeekdayIndex)) continue;

    const hardEnd = clauseEndAfter(text, mention.end);
    const nextMention = mentions[index + 1];
    const end = nextMention && nextMention.start < hardEnd
      ? nextMention.start
      : hardEnd;
    const after = extractHours(text.slice(mention.start, end));
    if (after) return after;

    // Some sources put timing before the day ("all day on Wednesdays"). Only
    // inspect that prefix when no other weekday group occupies the same clause,
    // otherwise an earlier group's time could leak onto this one.
    const hardStart = clauseStartBefore(text, mention.start);
    const previousMention = mentions[index - 1];
    if (!previousMention || previousMention.end <= hardStart) {
      const before = extractHours(text.slice(hardStart, mention.end));
      if (before) return before;
    }
  }
  return extractHours(todayClause(text, day));
}

/** Strip a leading weekday marker ("Tuesday: ...", "Thursday all day: ...",
 *  "Thursday Oyster Thursday ..." -> "Oyster Thursday ...") — the strip header
 *  already states the day, so a leading repeat is noise. Handles a trailing
 *  "all day" between the weekday and its separator, and a bare weekday followed
 *  by more text (no separator). A mid-phrase "Taco Tuesday" keeps its day. */
function trimDay(offer: string): string {
  const t = offer.replace(new RegExp(
    String.raw`^\s*(?:${DAY_TOKEN_SOURCE})\b(?:\s+all\s+day)?(?:\s*[:.\-–]\s*|\s+)`,
    "i",
  ), "");
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
    .replace(/\b(?:at|from|starting at)\s+open\b/gi, "")
    .replace(/\(\s*\)/g, "")
    .replace(/\s*,\s*,/g, ",")
    .replace(/\s*,\s*;/g, ";")
    .replace(/\s*,\s*\./g, ".")
    .replace(/\s{2,}/g, " ")
    .replace(/\s+([.,;)])/g, "$1")
    .replace(/[(\s,;:–-]+$/g, "")
    .replace(/^[\s,;:]+/, "")
    .trim();
  return out.length >= 4 ? out : offer.trim();
}

/**
 * Strip TRAILING provenance / source notes from a deal string so they never
 * render as user copy. Field Notes deals sometimes carry an inline sourcing
 * aside ("... (stated on the official bar page)", "... (this is their stated
 * Wednesday special)") or even a TRUNCATED one with an unclosed paren
 * ("... (officially announced"). Those sit directly under the "verified" label
 * and undercut it, so they come off at the boundary. Only end-anchored
 * parentheticals are removed (a legit mid-phrase "(all IPAs)" is kept), both
 * balanced and dangling-open, then orphaned trailing punctuation is tidied.
 * A sentence period after the note ("...(stated on the official bar page).")
 * counts as end-anchored too — most Field Notes deals end with one, and the
 * first cut of this fix missed them, so the notes kept rendering (Jul-8
 * audit).
 */
export function stripProvenance(s: string): string {
  let out = s.trim();
  for (let i = 0; i < 4; i++) {
    const next = out
      .replace(/\s*\([^()]*\)[\s.]*$/, "") // trailing balanced "(...)", incl. a sentence period after it
      .replace(/\s*\([^()]*$/, "") // trailing UNCLOSED "(..." (truncated note)
      .trim();
    if (next === out) break;
    out = next;
  }
  return out.replace(/[\s,;:–-]+$/g, "").trim();
}

/* ── Headline distillation — the wallet lip is ~2 short lines, but Field
   Notes offers are field-report sentences ("Nightly AYCE Crabs special
   Tuesday, Wednesday, and Thursday: all-you-can-eat soup & salad bar…").
   Distill at the boundary, not render time: strip embedded day-lists and
   parentheticals (a terms-y one becomes the lip fact), then keep the first
   essence clause — so the lip reads "Nightly AYCE Crabs special", never a
   mid-thought ellipsis (Jul-9 mobile audit). The FULL offer still ships in
   `offer` for the raised card body. */

/** One weekday token, any common spelling ("tue", "tues", "tuesdays"…). */
const DAY_WORD =
  "(?:sun(?:days?)?|mon(?:days?)?|tues?(?:days?)?|wed(?:nesdays?|s)?|thur?s?(?:days?)?|fri(?:days?)?|sat(?:urdays?)?)";
/** A RUN of two-plus weekday names ("Tuesday, Wednesday, and Thursday",
 *  "Tue-Fri"), optionally led by a scheduling word. The deck header already
 *  states the day, so an embedded day-list is noise in a headline. A single
 *  mid-phrase day ("Taco Tuesday", "Crabby Wednesday") is a brand name and
 *  stays. */
const DAY_SEP = String.raw`(?:\s*,\s*(?:and\s+|&\s*)?|\s+(?:and|&)\s+|\s*[-–—]\s*|\s+(?:through|thru|to)\s+)`;
const DAY_LIST_RE = new RegExp(
  String.raw`(?:\b(?:every|each|on|served)\s+)?\b${DAY_WORD}(?:${DAY_SEP}${DAY_WORD}\b)+`,
  "gi",
);
/** "every Thursday (night)" — scheduling, not identity; out of the headline. */
const EVERY_DAY_RE = new RegExp(
  String.raw`\b(?:every|each)\s+${DAY_WORD}(?:\s+(?:night|evening|morning|afternoon)s?)?\b`,
  "gi",
);
/** Parenthetical qualifiers worth surfacing as the lip fact ("eat-in only"). */
const TERMS_RE =
  /\b(only|dine[-\s]?in|eat[-\s]?in|cash|carry[-\s]?out|to[-\s]?go|21\+|per\s+(?:person|table)|no\s+sharing|while\s+supplies)\b/i;

/** Punctuation tidy-up after a mid-string removal: collapse doubled spaces,
 *  orphaned commas before other punctuation, dangling separators, and a
 *  trailing sentence period (the lip is a label, not a sentence). */
function tidyClause(s: string): string {
  return s
    .replace(/\s{2,}/g, " ")
    .replace(/\s+([.,;:)])/g, "$1")
    .replace(/,\s*([;.,])/g, "$1")
    .replace(/:\s*([;.])/g, "$1")
    .replace(/[\s,;:–-]+$/g, "")
    .replace(/^[\s,;:]+/, "")
    .replace(/\.$/, "")
    .trim();
}

/** The last natural cut point (comma / "and" / "with" / "plus") whose prefix
 *  still fits the lip — a distillation, never a mid-word ellipsis. */
function bestCut(s: string): string | null {
  let best: string | null = null;
  const re = /,|\s(?:and|with|plus)\s/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(s))) {
    const prefix = s.slice(0, m.index);
    if (prefix.length >= 10 && prefix.length <= 56) best = prefix;
    if (m.index > 56) break;
  }
  return best;
}

/**
 * Source notes often append service language to an otherwise useful offer
 * ("crab specials served..." or "$10 off wine throughout the restaurant").
 * That context belongs in the full offer, not in Today's scan-first headline.
 * Only trim at an explicit phrase boundary and keep the complete source text
 * in `offer`, so this never invents or silently changes a deal.
 */
function compactServiceTail(s: string): string {
  const cut = s.search(/\s+(?:served|available|offered|throughout|starting|beginning)\b/i);
  if (cut < 10) return s;
  const prefix = tidyClause(s.slice(0, cut));
  return prefix.length >= 10 && prefix.length <= 56 ? prefix : s;
}

export type DistilledOffer = {
  /** Short essence headline for the card lip ("Nightly AYCE Crabs special"). */
  headline: string;
  /** Terms qualifier lifted from a parenthetical ("Eat-in only"), for the lip
   *  fact next to the hours. Undefined when the offer states none. */
  terms?: string;
};

/** Distill a cleaned offer (post trimDay/stripHours) into a lip headline plus
 *  an optional terms fact. Pure; exported for the spec. */
export function distillOffer(offer: string): DistilledOffer {
  let terms: string | undefined;
  // Lift parentheticals out of the headline; a short terms-y one ("eat-in
  // only") becomes the lip fact instead of vanishing.
  let t = offer.replace(/\s*\(([^()]*)\)/g, (_, inner: string) => {
    const s = inner.trim();
    if (!terms && s.length <= 24 && TERMS_RE.test(s)) {
      terms = s.charAt(0).toUpperCase() + s.slice(1);
    }
    return " ";
  });
  // The deck header already states the day: embedded day-lists and "every
  // Thursday" scheduling come out of the headline (the full offer keeps them).
  t = tidyClause(t.replace(DAY_LIST_RE, " ").replace(EVERY_DAY_RE, " "));
  // Essence = the first clause; a colon that introduces elaboration cuts there.
  let head = t.split(/;|\.\s+/)[0] ?? "";
  const colon = head.indexOf(":");
  if (colon >= 8) head = head.slice(0, colon);
  if (head.length > 48) head = compactServiceTail(head);
  if (head.length > 48) head = bestCut(head) ?? head;
  head = tidyClause(head);
  // Stripping gutted it (a day-only offer text) — fall back to the raw clause.
  if (head.length < 4) head = tidyClause(offer.split(/;|\.\s+/)[0] ?? offer);
  return { headline: head, terms };
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
      // Clean the source text of trailing provenance notes BEFORE any parsing,
      // so a note that names a weekday can't pollute the day-gating either.
      const raw = stripProvenance((d.text || "").trim());
      const days = daysInText(raw);
      if (!days.has(dow)) continue; // no-day standing specials are not "today" news
      // Narrow a multi-day string to today's clause, then keep it only if it
      // actually reads as an offer — so a row never shows another day's price or
      // a non-deal ("Live music Thursday") in a list titled "verified specials".
      const today = publicOffer(todayClause(raw, dow));
      if (!readsAsOffer(today) || !isActionableDeal(today)) continue;
      const hours = extractHoursForDay(raw, dow);
      const fn = fieldNotesFor(slug);
      // The offer leads with the WHAT; the day prefix + the hours are pulled
      // out (header states the day, a chip states the time) so the headline
      // isn't a redundant restatement.
      const offer = stripHours(trimDay(today));
      const distilled = distillOffer(offer);
      const cand: TodaysDeal = {
        slug, name: place.name, town,
        downtown: place.municipality === "frederick",
        category: place.category,
        photo: place.google_photo_url,
        offer,
        headline: distilled.headline,
        terms: distilled.terms,
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

/**
 * EVERY verified deal on file, shaped for the /deals browser. Unlike
 * todaysDeals (best-one-per-venue, today-only), this keeps each deal as its
 * own row so the almanac can show every day's specials across the week. Same
 * honesty gate: only confidence-backed, last_verified deals whose place is
 * still in the dataset. Sorted downtown-first, then confidence, then name.
 */
export function allDeals(): DealRow[] {
  const rows: DealRow[] = [];
  for (const [slug, entry] of Object.entries(NOTES)) {
    if (!entry.deals?.length) continue;
    const place = clientPlaceBySlug(slug);
    if (!place) continue; // folded/removed in the dedup sweep — never surface
    const town = place.municipality ? MUNICIPALITY_BY_SLUG[place.municipality]?.name : undefined;
    for (const d of entry.deals) {
      const conf = (d.confidence ?? "").toLowerCase();
      if (!OK[conf] || !d.last_verified) continue;
      const raw = publicOffer(stripProvenance((d.text || "").trim()));
      if (!readsAsOffer(raw) || !isActionableDeal(raw)) continue;
      const days = [...daysInText(raw)].sort((a, b) => a - b);
      const offer = stripHours(trimDay(raw));
      const distilled = distillOffer(offer);
      const offerByDay: Partial<Record<number, string>> = {};
      const hoursByDay: Partial<Record<number, string>> = {};
      for (const day of days) {
        const relevant = publicOffer(todayClause(raw, day));
        offerByDay[day] = stripHours(trimDay(relevant || raw));
        const dayHours = extractHoursForDay(raw, day);
        if (dayHours) hoursByDay[day] = dayHours;
      }
      const dayHourValues = days.map((day) => hoursByDay[day]);
      const sharedHours =
        days.length === 0
          ? extractHours(raw)
          : new Set(dayHourValues).size === 1
            ? dayHourValues[0]
            : undefined;
      rows.push({
        slug,
        name: place.name,
        town,
        category: place.category,
        photo: place.google_photo_url,
        offer,
        headline: distilled.headline,
        terms: distilled.terms,
        fullOffer: raw,
        offerByDay: days.length > 0 ? offerByDay : undefined,
        hoursByDay:
          Object.keys(hoursByDay).length > 0 ? hoursByDay : undefined,
        hours: sharedHours,
        days,
        source_url: d.source_url,
        verified: verifiedLabel(d.last_verified),
        confidence: conf,
      });
    }
  }
  return rows.sort(
    (a, b) =>
      OK[b.confidence] - OK[a.confidence] || a.name.localeCompare(b.name),
  );
}
