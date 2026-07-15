import { buildHorizonBounds, groupByHorizon } from "@/lib/eventHorizon";
import { eventDateBlock } from "@/lib/events/format";
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

  let picked: AskEvent[];
  let label: string;
  if (anchor === "weekend") {
    // On Fri/Sat/Sun the weekend window already contains today, but the
    // "today" bucket claims those events first — so a Saturday "this
    // weekend?" must include both buckets (live too: a street festival
    // running right now IS this weekend's answer).
    picked = [...of("live"), ...of("today"), ...of("weekend")];
    label = "THIS WEEKEND";
  } else if (anchor === "tomorrow") {
    const start = bounds.next24;
    const end = start + DAY_MS;
    picked = events.filter((e) => {
      const t = Date.parse(e.starts_at);
      return Number.isFinite(t) && t >= start && t < end;
    });
    label = "TOMORROW";
  } else if (anchor === "tonight") {
    // Evening only: what's still ahead (or running) from late afternoon on.
    // All-day listings stay — a festival's last hours are a real "tonight".
    picked = [...of("live"), ...of("today")].filter(
      (e) => e.is_all_day || easternHour(e.starts_at) >= 16,
    );
    label = "TONIGHT";
  } else {
    picked = [...of("live"), ...of("today")];
    label = "TODAY (including tonight)";
  }

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
    return `- ${time} — ${e.title}${e.venue_name ? ` @ ${e.venue_name}` : ""}${town ? ` (${town})` : ""}${e.category ? ` [${e.category}]` : ""}`;
  });
  return { block: `EVENTS ${label}, from the live Frederick calendar:\n${lines.join("\n")}\n`, picked };
}

/**
 * Order a picked-events window by relevance to the question for the SOURCE
 * cards (the model sees the whole block; the UI shows only ~3 cards, and
 * "Music tonight" must not lead with tai chi). Token overlap against
 * title + category + venue; chronological order breaks ties (sort is
 * stable, and the input is already date-sorted).
 */
export function rankForSources(picked: AskEvent[], query: string): AskEvent[] {
  const tokens = query
    .toLowerCase()
    .split(/[^a-z]+/)
    .filter((t) => t.length > 3);
  if (tokens.length === 0) return picked;
  const score = (e: AskEvent) => {
    const hay = `${e.title} ${e.category ?? ""} ${e.venue_name ?? ""}`.toLowerCase();
    return tokens.reduce((n, t) => n + (hay.includes(t) ? 1 : 0), 0);
  };
  return [...picked].sort((a, b) => score(b) - score(a));
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
