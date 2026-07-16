import { buildHorizonBounds, groupByHorizon, isRangeListing } from "@/lib/eventHorizon";
import { eventDateBlock } from "@/lib/events/format";
import { isLiveMusicEvent } from "@/lib/events/live-music";
import type { Event } from "@/data/events";

/**
 * Pure prompt-context builders for "Ask Frederick" — extracted from the
 * server-only answer module so they unit-test without a network or loader.
 *
 * Born from a live failure (screenshotted on Reddit, Jul 2026): asked
 * "Music tonight", the concierge replied "I don't have today's date in the
 * data, so I can't tell you what's happening *tonight*". Two holes, both
 * closed here:
 *   1. The prompt never stated the current date/time → clockLine().
 *   2. Retrieval was keyword search only, so a time-anchored question
 *      ("tonight", "this weekend") never received today's actual events →
 *      timeAnchorOf() + eventContextLines() feed the model the same
 *      unified event set the /today page renders.
 */

/** The minimal event shape the context lines need — matches EventWithMeta
 *  structurally without importing the loader. */
export type AskEvent = {
  slug: string;
  title: string;
  starts_at: string;
  ends_at: string;
  is_all_day?: boolean;
  category?: string;
  venue_name?: string | null;
  /** Resolved venue place slug — feeds the live-music venue join. */
  venue_place_slug?: string | null;
  municipality_name?: string;
};

/**
 * "Wednesday, July 15, 2026, 1 PM" — Eastern, HOUR granularity on purpose:
 * this line lands inside the model-cache key (the full prompt is the key),
 * so minute precision would bust the answer cache sixty times an hour for
 * zero answer quality.
 */
export function clockLine(now: Date): string {
  const date = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  }).format(now);
  const hour = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    hour: "numeric",
  }).format(now);
  return `${date}, ${hour}`;
}

export type TimeAnchor = "today" | "tonight" | "tomorrow" | "weekend";

/**
 * Which real-time window a question is anchored to, or null for the
 * timeless kind ("best coffee?"). Checked most-specific first so
 * "tomorrow night" reads as tomorrow, not tonight. "tonight" is its own
 * anchor: a whole-day window capped chronologically spends the line
 * budget on afternoon programs and CHOPS the evening — the live check
 * against prod answered "Music tonight" with "karaoke is the only music
 * event" while a 7 PM show sat past the cap.
 */
export function timeAnchorOf(query: string): TimeAnchor | null {
  const q = query.toLowerCase();
  if (/\b(this weekend|weekend|saturday|sunday)\b/.test(q)) return "weekend";
  if (/\btomorrow\b/.test(q)) return "tomorrow";
  if (/\b(tonight|this evening)\b/.test(q)) return "tonight";
  if (/\b(today|this (afternoon|morning)|right now|now|happening|going on)\b/.test(q)) return "today";
  return null;
}

/** Eastern wall-clock hour (0-23) of an ISO instant. */
function easternHour(iso: string): number {
  return Number(
    new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", hour: "numeric", hourCycle: "h23" })
      .format(new Date(iso)),
  );
}

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * The events block for a time-anchored question: real listings inside the
 * asked window, one per line with clock time, venue, town, and category
 * (the category tag is what lets the model pick the MUSIC rows out of a
 * mixed evening). Empty window → an explicit "(no listed events …)" line,
 * so the model says so plainly instead of hedging about missing data.
 */
export function eventContextLines(
  events: AskEvent[],
  anchor: TimeAnchor,
  now: Date,
  query = "",
  cap = 16,
): { block: string; picked: AskEvent[] } {
  const bounds = buildHorizonBounds(now);
  const groups = groupByHorizon(events, bounds);
  const of = (key: string) => groups.find((g) => g.key === key)?.events ?? [];

  // In-progress date-RANGE listings: a feed flattens a weekly residency
  // ("Freddie Long at Pistarro's, through Aug 19") into one noon-anchored
  // row, and the horizon logic honestly shelves it under "Coming up" while
  // it runs — which made a band literally playing in Frederick today
  // invisible to "Music tonight" (owner catch, Jul 2026). For the ask,
  // a running range IS part of today's answer; its line prints the honest
  // "through Aug 19" instead of a fake clock time.
  const runningRanges = events.filter((e) => {
    if (!isRangeListing(e)) return false;
    const s = Date.parse(e.starts_at);
    const end = Date.parse(e.ends_at);
    return Number.isFinite(s) && Number.isFinite(end) && s <= bounds.now && end >= bounds.now;
  });

  let picked: AskEvent[];
  let label: string;
  if (anchor === "weekend") {
    // On Fri/Sat/Sun the weekend window already contains today, but the
    // "today" bucket claims those events first — so a Saturday "this
    // weekend?" must include both buckets (live too: a street festival
    // running right now IS this weekend's answer).
    picked = [...of("live"), ...of("today"), ...of("weekend"), ...runningRanges];
    label = "THIS WEEKEND";
  } else if (anchor === "tomorrow") {
    const start = bounds.next24;
    const end = start + DAY_MS;
    picked = [
      ...events.filter((e) => {
        const t = Date.parse(e.starts_at);
        return Number.isFinite(t) && t >= start && t < end;
      }),
      // A residency running "through Aug 19" spans tomorrow too.
      ...runningRanges.filter((e) => Date.parse(e.ends_at) >= end),
    ];
    label = "TOMORROW";
  } else if (anchor === "tonight") {
    // Evening only: what's still ahead from late afternoon on. LIVE rows
    // are exempt from the hour gate — a show that started at 3 and is
    // still going IS tonight's answer. All-day listings stay too.
    picked = [
      ...of("live"),
      ...of("today").filter((e) => e.is_all_day || easternHour(e.starts_at) >= 16),
      ...runningRanges,
    ];
    label = "TONIGHT";
  } else {
    picked = [...of("live"), ...of("today"), ...runningRanges];
    label = "TODAY (including tonight)";
  }

  // Belt-and-braces dedupe: the window buckets are disjoint by
  // construction, but one duplicated line would read as a glitch.
  const seen = new Set<string>();
  picked = picked.filter((e) => {
    const key = `${e.slug}|${e.starts_at}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  // The cap exists to bound tokens, but a CHRONOLOGICAL cap silently drops
  // the late rows — twice now the 7 PM music sat past it while the model
  // told users an earlier karaoke was "the only music tonight". Rank by
  // query relevance BEFORE capping (so the asked-about rows always survive),
  // then restore clock order for the block the model reads.
  if (picked.length > cap) {
    picked = rankForSources(picked, query)
      .slice(0, cap)
      .sort((a, b) => Date.parse(a.starts_at) - Date.parse(b.starts_at));
  }
  if (picked.length === 0) {
    return { block: `EVENTS ${label}: (no listed events in this window)\n`, picked };
  }
  const lines = picked.map((e) => {
    // eventDateBlock is typed against the full Event record but only reads
    // starts_at / ends_at / is_all_day — the fields AskEvent carries.
    const time = eventDateBlock(e as unknown as Event).time;
    const town = e.municipality_name?.trim();
    // Venue-joined shows inherit the venue's sell-category ("restaurant"),
    // which would hide the music from the model — tag them honestly.
    const tag = isMusic(e) ? "live music" : e.category;
    return `- ${time} — ${e.title}${e.venue_name ? ` @ ${e.venue_name}` : ""}${town ? ` (${town})` : ""}${tag ? ` [${tag}]` : ""}`;
  });
  return { block: `EVENTS ${label}, from the live Frederick calendar:\n${lines.join("\n")}\n`, picked };
}

/** isLiveMusicEvent's param type requires a definite category string;
 *  AskEvent's is optional — bridge once here. */
function isMusic(e: AskEvent): boolean {
  return isLiveMusicEvent({
    category: e.category ?? "",
    venue_place_slug: e.venue_place_slug ?? undefined,
    title: e.title,
  });
}

/** Words that appear in (nearly) every Frederick event and carry zero
 *  ranking signal — "bands playing in frederick today" must not score
 *  every row 1 for "frederick" and collapse back to chronological. */
const STOP_TOKENS = new Set([
  "frederick", "county", "maryland", "downtown",
  "today", "tonight", "tomorrow", "weekend", "evening", "morning", "afternoon", "now",
  "there", "here", "anywhere", "around", "going", "happening", "what", "whats", "anything",
]);

/** What everyday words mean in category terms: "bands playing" is the
 *  music category even though no title contains the word "bands". */
const CATEGORY_HINTS: Record<string, string[]> = {
  music: ["music", "band", "bands", "concert", "concerts", "gig", "gigs", "dj", "karaoke", "song", "songs", "jam"],
  theater: ["theater", "theatre", "play", "plays", "performance", "comedy", "improv"],
  market: ["market", "markets", "farmers"],
  "food-drink": ["food", "eat", "dinner", "lunch", "truck", "tasting"],
  family: ["kids", "kid", "family", "children", "child", "toddler"],
  sports: ["game", "games", "sports", "keys", "baseball"],
};

/**
 * Order a picked-events window by relevance to the question — used both for
 * the SOURCE cards (the UI shows only ~3) and to decide which rows survive
 * the block cap. Category hints outweigh raw token overlap (+3 vs +1 per
 * hit) so "bands tonight" beats a title that merely contains a stray word;
 * chronological order breaks ties (stable sort over date-sorted input).
 */
export function rankForSources(picked: AskEvent[], query: string): AskEvent[] {
  const tokens = query
    .toLowerCase()
    .split(/[^a-z]+/)
    .filter((t) => t.length > 1 && !STOP_TOKENS.has(t));
  if (tokens.length === 0) return picked;
  const hinted = new Set(
    Object.entries(CATEGORY_HINTS)
      .filter(([, words]) => words.some((w) => tokens.includes(w)))
      .map(([cat]) => cat),
  );
  // Music gets the REAL classifier, not a slug guess: isLiveMusicEvent also
  // joins verified music venues (most Frederick music is brewery/bar lineups
  // whose events inherit the venue's sell-category, never "music") and
  // excludes yoga-at-the-taproom titles.
  const musicHinted = CATEGORY_HINTS.music.some((w) => tokens.includes(w));
  const score = (e: AskEvent) => {
    const hay = `${e.title} ${e.category ?? ""} ${e.venue_name ?? ""}`.toLowerCase();
    const text = tokens.reduce((n, t) => n + (t.length > 3 && hay.includes(t) ? 1 : 0), 0);
    const catBoost =
      (musicHinted && isMusic(e)) || (e.category && hinted.has(e.category)) ? 3 : 0;
    return text + catBoost;
  };
  return [...picked].sort((a, b) => score(b) - score(a));
}

/**
 * Keep only the source cards the ANSWER actually cites. The raw search hits
 * are fuzzy-match noise ("Keeney and Basford Funeral Homes" rendered under
 * "anything fun tomorrow night" — ask audit, Jul 2026), and the cards are
 * the answer's trust anchors: a card should be a citation, not a search
 * dump. Civic/department cards always stay (they're authoritative links the
 * model is told to cite). If the answer names none of the rest, the top two
 * survive as "related" so the UI never renders an answer with zero doors.
 */
export function filterCitedSources<S extends { name: string; category: string }>(
  sources: S[],
  answer: string | null,
): S[] {
  if (!answer) return sources;
  const answerToks = new Set(answer.toLowerCase().split(/[^a-z0-9]+/));
  const cited = (name: string) => {
    const toks = name.toLowerCase().split(/[^a-z0-9]+/).filter((t) => t.length > 2);
    if (toks.length === 0) return false;
    const hits = toks.filter((t) => answerToks.has(t)).length;
    return hits / toks.length >= 0.6;
  };
  const civic = sources.filter((s) => s.category === "civic");
  const rest = sources.filter((s) => s.category !== "civic");
  const kept = rest.filter((s) => cited(s.name));
  return [...civic, ...(kept.length > 0 ? kept : rest.slice(0, 2))];
}

/**
 * Belt-and-braces markdown strip for MODEL prose. The system prompt bans
 * markdown, but Haiku still italicizes for emphasis under pressure — and
 * the Ask surfaces render plain text, so *tonight* reached users with
 * literal asterisks (the Reddit screenshot). Emphasis, code ticks, and
 * [text](url) collapse to their text; nothing else is touched.
 */
export function stripInlineMarkdown(s: string): string {
  return s
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/\*([^*\n]{1,120})\*/g, "$1")
    .replace(/__([^_]+)__/g, "$1")
    .replace(/`+([^`\n]+)`+/g, "$1")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1");
}
