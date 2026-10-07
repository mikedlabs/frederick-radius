/**
 * boardCaption — the pure composition logic behind the /events board's
 * masthead-dock caption (the "What · When · Where" readout + the mono
 * count line) and its scroll-collapse threshold. Extracted from the dock
 * component so every string the caption can produce, and the collapse
 * decision, is unit-testable without a DOM.
 *
 * The caption is the state readout: it always tells the truth about what
 * the board is showing, in the fewest words. Counts stay in the mono
 * support line, never the headline (VOICE.md). This is the /events twin
 * of components/map/dockCaption.ts — same grammar, different axes (the
 * board filters onto ?lens/?tod/?d/?m, not the map's camera).
 */
import type { Daypart } from "@/lib/daypart";
import type { IntentId } from "@/lib/events/intents";
import { LENS_WORDS } from "@/lib/timeLens";
import { BRAND } from "@/lib/brand";

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
 * The When pane's presets, each one ?lens window. We do NOT migrate
 * ?lens→?when: a preset writes the lens (and clears any daypart), and the
 * caption reads it back. Tonight and Tomorrow are their own windows.
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

const PRESET_BY_KEY = Object.fromEntries(
  WHEN_PRESETS.map((preset) => [preset.key, preset]),
) as Record<WhenPresetKey, WhenPreset>;

/**
 * The date chips that stay on the board. While something is still listed
 * tonight they are Today, Tonight and This weekend. Once tonight is spent the
 * row moves on to Tomorrow and This weekend, keeping Today only while today
 * still lists something, so an 11 PM visitor is never offered an empty
 * Tonight. A chosen window always stays visible so it can be turned off.
 */
export function primaryWhenPresets(args: {
  tonightListed: boolean;
  todayListed: boolean;
  active: WhenPresetKey | null;
}): WhenPreset[] {
  const keys: WhenPresetKey[] = args.tonightListed
    ? ["today", "tonight", "weekend"]
    : args.todayListed
      ? ["today", "tomorrow", "weekend"]
      : ["tomorrow", "weekend"];
  if (args.active && !keys.includes(args.active)) keys.unshift(args.active);
  return keys.map((key) => PRESET_BY_KEY[key]);
}

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
 * The When word. A picked day wins (the mono date IS the state);
 * otherwise the preset/window (Tonight is the one composed label), plus
 * any standalone daypart; "Anytime" when nothing temporal narrows it.
 */
export function whenCaption(args: {
  dayLabel: string | null;
  lens: TimeKey;
  tod: Daypart | null;
}): WhenCaption {
  if (args.dayLabel) return { text: args.dayLabel, mono: true };
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
