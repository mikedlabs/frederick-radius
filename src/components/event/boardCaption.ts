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

/** The board's time lens (?lens=), matching EventsExplorer's TimeKey. */
export type TimeKey = "all" | "today" | "weekend" | "week";

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
  weekend: LENS_WORDS.weekend,
  week: LENS_WORDS.laterWeek,
};

/** Human label for each Eastern daypart. */
export const DAYPART_LABEL: Record<Daypart, string> = {
  morning: "Morning",
  midday: "Midday",
  evening: "Evening",
  late: "Late",
};

/**
 * The When pane's four presets, mapped ONTO the existing ?lens (+ the
 * live "on now" gate via the evening daypart for Tonight). We do NOT
 * migrate ?lens→?when: a preset writes lens + tod, and the caption reads
 * them back. "Tonight" = today's evening (the on-now window a local
 * means); the others are pure lens windows.
 */
export type WhenPresetKey = "today" | "tonight" | "weekend" | "week";

export const WHEN_PRESETS: ReadonlyArray<{
  key: WhenPresetKey;
  label: string;
  lens: TimeKey;
  tod: Daypart | null;
}> = [
  { key: "today", label: LENS_WORDS.today, lens: "today", tod: null },
  { key: "tonight", label: LENS_WORDS.tonight, lens: "today", tod: "evening" },
  { key: "weekend", label: LENS_WORDS.weekend, lens: "weekend", tod: null },
  { key: "week", label: LENS_WORDS.laterWeek, lens: "week", tod: null },
];

/**
 * Which preset (if any) the current lens+tod expresses. Tonight wins over
 * Today when the evening daypart is on; a bare lens matches its window
 * only when no daypart narrows it further (so "today + morning" is not
 * "Today", it's the compound caption).
 */
export function activeWhenPreset(args: {
  lens: TimeKey;
  tod: Daypart | null;
}): WhenPresetKey | null {
  const { lens, tod } = args;
  if (lens === "today" && tod === "evening") return "tonight";
  if (lens === "today" && tod === null) return "today";
  if (lens === "weekend" && tod === null) return "weekend";
  if (lens === "week" && tod === null) return "week";
  return null;
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
  if (args.lens === "today" && args.tod === "evening") {
    return { text: "Tonight", mono: false };
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
}): string {
  const ev = `${args.events} ${args.events === 1 ? "event" : "events"}`;
  const where =
    args.townName ??
    `${args.townCount} ${args.townCount === 1 ? "town" : "towns"}`;
  return `${ev} · ${where}`;
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
