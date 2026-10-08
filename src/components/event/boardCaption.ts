/**
 * boardCaption — the pure composition logic behind the /events board's
 * masthead-dock caption (the "What · When · Where" readout + the mono
 * count line), the week ribbon's selection, the one answer sentence under
 * the ribbon, and the dock's scroll-collapse threshold. Extracted from the
 * components so every string the board can produce, and every lens-to-day
 * mapping, is unit-testable without a DOM.
 *
 * The caption is the state readout: it always tells the truth about what
 * the board is showing, in the fewest words. Counts stay in supporting
 * text (the screen-reader count line and the answer sentence), never a
 * heading (VOICE.md). This is the /events twin of
 * components/map/dockCaption.ts — same grammar, different axes (the board
 * filters onto ?lens/?tod/?d/?m, not the map's camera).
 */
import type { Daypart } from "@/lib/daypart";
import type { IntentId } from "@/lib/events/intents";
import { LENS_WORDS } from "@/lib/timeLens";
import { BRAND } from "@/lib/brand";
import {
  NIGHT_END_HOUR,
  NIGHT_START_HOUR,
  tomorrowDayKey,
  type Horizon,
} from "@/lib/eventHorizon";
import { easternDayKey, easternParts } from "@/lib/tz";

/** The board's time lens (?lens=), matching EventsExplorer's TimeKey.
 *  "tonight" is one token (4 PM to 4 AM, lib/eventHorizon), not Today plus a
 *  daypart, so it carries one removal chip and survives the 9 PM boundary. */
export type TimeKey = "all" | "today" | "tonight" | "tomorrow" | "weekend" | "week";

export const TIME_KEYS: readonly TimeKey[] = [
  "all", "today", "tonight", "tomorrow", "weekend", "week",
];

/**
 * Read ?lens (and the legacy ?tod) into the board's time state. The old
 * Tonight chip wrote lens=today&tod=evening; those shared links must keep
 * opening Tonight as one filter rather than as two the person never chose.
 */
export function parseTimeParams(args: {
  lens: string | null;
  tod: Daypart | null;
  fallback: TimeKey;
}): { time: TimeKey; tod: Daypart | null } {
  const lens = TIME_KEYS.includes(args.lens as TimeKey) ? (args.lens as TimeKey) : null;
  if (lens === "today" && args.tod === "evening") return { time: "tonight", tod: null };
  return { time: lens ?? args.fallback, tod: args.tod };
}

/**
 * Per-intent accent for the caption ink + the What-pane chip dots. Event
 * intents carry no color of their own (lib/events/intents.ts is a pure
 * taxonomy), so the board owns this small palette. Values are on-brand
 * hues distinct enough that a shelf of intent chips reads by color; each
 * is dark enough that mixing 82% toward ink (for caption text) or filling
 * a chip with white text stays AA. Keyed by IntentId so it can never
 * drift from the taxonomy.
 */
export const EVENT_INTENT_COLOR: Record<IntentId, string> = {
  music: BRAND.colors.plum,
  arts: BRAND.colors.plum,
  food: BRAND.colors.brick,
  family: BRAND.colors.ridge,
  sports: BRAND.colors.creek,
  outdoors: BRAND.colors.forest,
  community: BRAND.colors.ridge,
  civic: BRAND.colors.mutedInk,
};

/** Human label for each time lens. "all" has no label (it's "Anytime").
 *  Words come from the ONE shared dictionary (lib/timeLens.ts) so the
 *  board and the map dock can never drift (UX-03). */
export const LENS_LABEL: Record<Exclude<TimeKey, "all">, string> = {
  today: LENS_WORDS.today,
  tonight: LENS_WORDS.tonight,
  tomorrow: LENS_WORDS.tomorrow,
  weekend: LENS_WORDS.weekend,
  week: LENS_WORDS.laterWeek,
};

/** Lower-case phrase for "Show more …" links under a time window. */
const SHOW_MORE_PHRASE: Record<Exclude<TimeKey, "all">, string> = {
  today: "today",
  tonight: "tonight",
  tomorrow: "tomorrow",
  weekend: "this weekend",
  week: "this week",
};

/** The quiet expansion link under a window: "Show more this weekend". */
export function showMoreLabel(args: {
  lens: TimeKey;
  dayLabel?: string | null;
  groupLabel?: string | null;
}): string {
  if (args.dayLabel) return `Show more on ${args.dayLabel}`;
  if (args.lens !== "all") return `Show more ${SHOW_MORE_PHRASE[args.lens]}`;
  if (args.groupLabel) return `Show more ${args.groupLabel.toLowerCase()}`;
  return "Show more";
}

/** Human label for each Eastern daypart. */
export const DAYPART_LABEL: Record<Daypart, string> = {
  morning: "Morning",
  midday: "Midday",
  evening: "Evening",
  late: "Late",
};

/**
 * The board's named ?lens windows. We do NOT migrate ?lens→?when: a window
 * is written as the lens and the caption reads it back. Tonight and
 * Tomorrow are their own windows. None of them is a chip any more: the week
 * ribbon is the board's one date control, and ribbonSelection() maps each
 * lens onto its days so shared links keep opening the same answer.
 */
export type WhenPresetKey = Exclude<TimeKey, "all">;

export type WhenPreset = {
  key: WhenPresetKey;
  label: string;
  lens: TimeKey;
  tod: Daypart | null;
};

export const WHEN_PRESETS: ReadonlyArray<WhenPreset> = [
  { key: "today", label: LENS_WORDS.today, lens: "today", tod: null },
  { key: "tonight", label: LENS_WORDS.tonight, lens: "tonight", tod: null },
  { key: "tomorrow", label: LENS_WORDS.tomorrow, lens: "tomorrow", tod: null },
  { key: "weekend", label: LENS_WORDS.weekend, lens: "weekend", tod: null },
  { key: "week", label: LENS_WORDS.laterWeek, lens: "week", tod: null },
];

/**
 * Which preset (if any) the current lens+tod expresses. A bare lens matches
 * its window only when no daypart narrows it further (so "today + morning"
 * is not "Today", it's the compound caption).
 */
export function activeWhenPreset(args: {
  lens: TimeKey;
  tod: Daypart | null;
}): WhenPresetKey | null {
  const { lens, tod } = args;
  if (lens === "all" || tod !== null) return null;
  return lens;
}

const WD = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;

/**
 * A picked Eastern day key (YYYY-MM-DD) as the mono caption reads it:
 * "2026-07-08" → "Wed 8". Weekday comes from the calendar date itself
 * (UTC math on the bare date, no timezone), so it's deterministic and
 * matches the day the user tapped on the ribbon.
 */
export function formatDayLabel(dayKey: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dayKey);
  if (!m) return dayKey;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  const wd = new Date(Date.UTC(y, mo - 1, d)).getUTCDay();
  return `${WD[wd]} ${d}`;
}

export type WhatCaption = {
  /** The headline words: "Everything", "Music", "Free · Music". */
  text: string;
  /** Whether any What filter is active (drives the ink color choice). */
  active: boolean;
};

/**
 * The What word. Active "good for" toggles lead (they prefix the intent),
 * then the most specific type: civic reads "Notices", a chosen sub wins
 * over its intent, else the intent label. Nothing active rests on
 * "Everything". The inked color is the component's call (intent hue when
 * an intent is on), so this stays a pure string composer.
 */
export function whatCaption(args: {
  goods: string[];
  intentLabel?: string | null;
  subLabel?: string | null;
  civic?: boolean;
}): WhatCaption {
  const bits = [...args.goods];
  if (args.civic) bits.push("Notices");
  else if (args.subLabel) bits.push(args.subLabel);
  else if (args.intentLabel) bits.push(args.intentLabel);
  if (bits.length === 0) return { text: "Everything", active: false };
  return { text: bits.join(" · "), active: true };
}

export type WhenCaption = {
  text: string;
  /** Render in the mono face (a picked calendar day). */
  mono: boolean;
};

/**
 * The When word. A picked day wins over a window (the mono date IS the
 * state); otherwise the window (Tonight is the one composed label). A
 * daypart composes with either, because the ribbon picks the day and the
 * Filters sheet picks the time of day. "Anytime" when nothing temporal
 * narrows it.
 */
export function whenCaption(args: {
  dayLabel: string | null;
  lens: TimeKey;
  tod: Daypart | null;
}): WhenCaption {
  if (args.dayLabel) {
    return {
      text: args.tod ? `${args.dayLabel} · ${DAYPART_LABEL[args.tod]}` : args.dayLabel,
      mono: true,
    };
  }
  const bits: string[] = [];
  if (args.lens !== "all") bits.push(LENS_LABEL[args.lens]);
  if (args.tod) bits.push(DAYPART_LABEL[args.tod]);
  return { text: bits.length ? bits.join(" · ") : LENS_WORDS.anytime, mono: false };
}

/**
 * The mono support line under the caption. Counts are evidence, not the
 * headline (VOICE.md): how many events match, and where — the picked
 * town, or the true count of towns with events across the county (never a
 * hardcoded number).
 */
export function countLine(args: {
  events: number;
  townName: string | null;
  townCount: number;
  /** False when the board has only a partial/degraded collection in memory. */
  complete?: boolean;
}): string {
  // "Event listings" names what this number actually counts. A recurring
  // series can contribute several dated rows, so this must not read like a
  // count of unique real-world happenings. Partial collections say so
  // directly instead of mixing "N loaded" with larger horizon totals.
  const ev = `${args.events} ${args.events === 1 ? "event listing" : "event listings"}${args.complete === false ? " shown" : ""}`;
  const where =
    args.townName ??
    `${args.townCount} ${args.townCount === 1 ? "town" : "towns"}`;
  return `${ev} · ${where}${args.complete === false ? " · partial results" : ""}`;
}

// ── The week ribbon: the board's one date control ──────────────────────────

/** The Eastern calendar date `offset` days after `now`'s, as YYYY-MM-DD.
 *  Anchored at 16:00 UTC (noon Eastern) so DST and month ends never roll
 *  the day over. */
function easternKeyForOffset(now: Date, offset: number): string {
  const p = easternParts(now);
  return easternDayKey(new Date(Date.UTC(p.year, p.month - 1, p.day + offset, 16)));
}

/** The seven Eastern day keys the week ribbon shows, today first. */
export function weekDayKeys(nowISO: string): string[] {
  const now = new Date(nowISO);
  if (!Number.isFinite(now.getTime())) return [];
  return Array.from({ length: 7 }, (_, offset) => easternKeyForOffset(now, offset));
}

/**
 * The Eastern days a weekend window [start, end) touches, in order. The
 * board's weekend runs from Friday 5 PM to Monday midnight, so this is
 * Friday, Saturday and Sunday.
 */
export function weekendDayKeys(startISO: string, endISO: string): string[] {
  const start = Date.parse(startISO);
  const end = Date.parse(endISO);
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return [];
  const last = easternDayKey(new Date(end - 1));
  const keys: string[] = [];
  for (let offset = 0; offset < 7; offset += 1) {
    const key = easternKeyForOffset(new Date(start), offset);
    if (key > last) break;
    keys.push(key);
  }
  return keys;
}

/** The month the ribbon's numerals belong to: "October", or "October and
 *  November" when the seven days cross a month end. */
export function ribbonMonthCaption(dayKeys: readonly string[]): string {
  const months: string[] = [];
  for (const key of dayKeys) {
    const month = new Intl.DateTimeFormat("en-US", {
      timeZone: "America/New_York",
      month: "long",
    }).format(new Date(`${key}T16:00:00Z`));
    if (!months.includes(month)) months.push(month);
  }
  return months.join(" and ");
}

export type RibbonSelection = {
  /** Day keys drawn inside the selection outline, in day order. */
  days: string[];
  /** The one day a cell press stands for (its aria-pressed), or null. */
  pressedDay: string | null;
  /** The weekend window is the selection ("This weekend" is pressed). */
  weekend: boolean;
};

const NO_SELECTION: RibbonSelection = { days: [], pressedDay: null, weekend: false };

/**
 * How the board's time state reads on the week ribbon. Shared links keep
 * their meaning: ?d= selects its day, ?lens=today and ?lens=tonight select
 * today's cell, ?lens=tomorrow selects the local tomorrow (the coming
 * daytime, so 1 AM still reads as the night before), and ?lens=weekend
 * outlines the weekend's days with "This weekend" pressed. ?lens=all, and the
 * rolling seven-day ?lens=week, select no single cell; the answer sentence
 * names those.
 */
export function ribbonSelection(args: {
  lens: TimeKey;
  day: string | null;
  nowISO: string;
  weekendDays: readonly string[];
}): RibbonSelection {
  if (args.day) return { days: [args.day], pressedDay: args.day, weekend: false };
  const now = new Date(args.nowISO);
  if (!Number.isFinite(now.getTime())) return NO_SELECTION;
  switch (args.lens) {
    case "today":
    case "tonight": {
      const key = easternDayKey(now);
      return { days: [key], pressedDay: key, weekend: false };
    }
    case "tomorrow": {
      const key = tomorrowDayKey(now);
      return { days: [key], pressedDay: key, weekend: false };
    }
    case "weekend":
      return { days: [...args.weekendDays], pressedDay: null, weekend: true };
    default:
      return NO_SELECTION;
  }
}

// ── The answer sentence under the ribbon ───────────────────────────────────

/** Appended when a live calendar did not answer. The inline "Why" button
 *  beside it opens the explanation. */
export const PARTIAL_SENTENCE =
  "Some calendars did not load, so this list may be missing events.";

/** From 4 PM until 4 AM Eastern the rest of the day is "tonight". */
export function isEveningHour(nowISO: string): boolean {
  const now = new Date(nowISO);
  if (!Number.isFinite(now.getTime())) return false;
  const hour = easternParts(now).hour;
  return hour >= NIGHT_START_HOUR || hour < NIGHT_END_HOUR;
}

/** "2026-10-10" as "Saturday, October 10". */
function longDayLabel(dayKey: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dayKey)) return dayKey;
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    weekday: "long",
    month: "long",
    day: "numeric",
  }).format(new Date(`${dayKey}T16:00:00Z`));
}

type AnswerSubject = {
  /** The selection as an object of "for": "tonight", "Saturday, October 10". */
  name: string;
  /** The selection's events as a noun phrase: "tonight's events". */
  events: string;
  /** The window is already under way, so an empty one says "Nothing else". */
  underway: boolean;
};

function answerSubject(args: {
  lens: TimeKey;
  day: string | null;
  nowISO: string;
  weekendIsNow: boolean;
}): AnswerSubject | null {
  if (args.day) {
    const [todayKey, tomorrowKey] = weekDayKeys(args.nowISO);
    if (args.day === todayKey) return { name: "today", events: "today's events", underway: true };
    if (args.day === tomorrowKey) {
      return { name: "tomorrow", events: "tomorrow's events", underway: false };
    }
    const label = longDayLabel(args.day);
    return { name: label, events: `the events on ${label}`, underway: false };
  }
  switch (args.lens) {
    case "today":
      return { name: "today", events: "today's events", underway: true };
    case "tonight":
      return { name: "tonight", events: "tonight's events", underway: true };
    case "tomorrow":
      return { name: "tomorrow", events: "tomorrow's events", underway: false };
    case "weekend":
      return {
        name: "this weekend",
        events: "this weekend's events",
        underway: args.weekendIsNow,
      };
    case "week":
      return {
        name: "the next seven days",
        events: "the events in the next seven days",
        underway: true,
      };
    default:
      return null;
  }
}

/** Where the default board goes once nothing is left today. */
function nextHorizonPhrase(horizon: Horizon, weekendIsNow: boolean): string | null {
  if (horizon === "week") return weekendIsNow ? "next week" : "the rest of the week";
  if (horizon === "weekend") return weekendIsNow ? "the rest of the weekend" : "this weekend";
  if (horizon === "later") return "what is coming up";
  return null;
}

/**
 * The one sentence under the week ribbon that answers "what is on" for the
 * current selection, in complete words. Counts may appear here and only
 * here, and only when the board holds the complete collection; a partial or
 * still-loading board describes the selection without a number. Returns null
 * when there is nothing honest to say (an empty board that is still
 * loading, whose empty state already speaks).
 *
 *   all, today still listed   "Tonight's events are listed first, and later days follow."
 *   all, today spent          "Nothing else is listed for tonight, so here is the rest of the week."
 *   tonight, rolled forward   "Nothing else is listed for tonight, so here is tomorrow evening."
 *   weekend, counted          "23 events are listed for this weekend."
 *   weekend, uncounted        "These are this weekend's events."
 *   a picked day, empty       "Nothing is listed for Saturday, October 10."
 */
export function boardAnswer(args: {
  lens: TimeKey;
  day: string | null;
  nowISO: string;
  /** Rows the selection lists. */
  count: number;
  /** The board holds the complete collection, so the count is true. */
  countKnown: boolean;
  /** A What, Where, daypart or search filter also narrows the board. */
  narrowed: boolean;
  /** Tonight was empty, so the board rolled forward to tomorrow evening. */
  rolledForward?: boolean;
  /** The default list's first horizon, or null when it lists nothing. Only
   *  the grouped default list passes this; other displays get no sentence
   *  without a selection. */
  firstHorizon?: Horizon | null;
  weekendIsNow?: boolean;
}): string | null {
  const weekendIsNow = args.weekendIsNow ?? false;
  const match = args.narrowed ? "that matches your filters " : "";

  if (args.rolledForward) {
    return `Nothing else ${match}is listed for tonight, so here is tomorrow evening.`;
  }

  if (args.lens === "all" && !args.day) {
    if (!args.firstHorizon) return null;
    const rest = isEveningHour(args.nowISO) ? "tonight" : "today";
    if (args.firstHorizon === "live" || args.firstHorizon === "today") {
      const lead = rest === "tonight" ? "Tonight" : "Today";
      return `${lead}'s events are listed first, and later days follow.`;
    }
    const next = nextHorizonPhrase(args.firstHorizon, weekendIsNow);
    return next ? `Nothing else ${match}is listed for ${rest}, so here is ${next}.` : null;
  }

  const subject = answerSubject({
    lens: args.lens,
    day: args.day,
    nowISO: args.nowISO,
    weekendIsNow,
  });
  if (!subject) return null;

  if (args.count <= 0) {
    if (!args.countKnown) return null;
    return `Nothing ${subject.underway ? "else " : ""}${match}is listed for ${subject.name}.`;
  }
  if (args.countKnown) {
    const n = args.count;
    const noun = args.narrowed
      ? n === 1
        ? "event that matches your filters is"
        : "events that match your filters are"
      : n === 1
        ? "event is"
        : "events are";
    return `${n} ${noun} listed for ${subject.name}.`;
  }
  return args.narrowed
    ? `These are ${subject.events} that match your filters.`
    : `These are ${subject.events}.`;
}

/**
 * Whether the collapsing nameplate should be folded away at scroll
 * position `y`. Position-based with a dead zone (hysteresis): it folds
 * once the reader is past `downThreshold`, and only springs back when
 * they return near the top (`topThreshold`) — so a small scroll jiggle in
 * the middle of the list never flickers the masthead. Between the two it
 * holds whatever it was.
 */
export function nextMastheadCollapsed(
  y: number,
  collapsed: boolean,
  opts?: { downThreshold?: number; topThreshold?: number },
): boolean {
  const down = opts?.downThreshold ?? 56;
  const top = opts?.topThreshold ?? 8;
  if (y <= top) return false;
  if (y >= down) return true;
  return collapsed;
}
