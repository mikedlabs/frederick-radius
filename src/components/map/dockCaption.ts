/**
 * dockCaption — the pure composition logic behind the map dock's
 * collapsed face (the "What · When · Where" caption + the mono count
 * line). Extracted from the dock component so every string the caption
 * can produce is unit-testable without a DOM.
 *
 * The caption is the state readout: it must always tell the truth about
 * what the map is showing, in the fewest words. Counts stay in the mono
 * support line, never the headline (VOICE.md).
 */
import { LENS_WORDS } from "@/lib/timeLens";

export type TimeMode = "now" | "tonight" | "weekend" | "all";

/** The When pane's event-window presets. Labels are honest about the
 *  actual window each param draws: ?t=all is a 7-day horizon, so it
 *  reads "This week", not "today". Words come from the ONE shared
 *  dictionary (lib/timeLens.ts) so the map and the events board can
 *  never drift (UX-03). */
export const TIME_WINDOWS: ReadonlyArray<{ key: TimeMode; label: string }> = [
  { key: "now", label: LENS_WORDS.now },
  { key: "tonight", label: LENS_WORDS.tonight },
  { key: "weekend", label: LENS_WORDS.weekend },
  { key: "all", label: LENS_WORDS.week },
];

export const TIME_WINDOW_LABEL: Record<TimeMode, string> = Object.fromEntries(
  TIME_WINDOWS.map((w) => [w.key, w.label]),
) as Record<TimeMode, string>;

/**
 * The time-aware default event window when the URL doesn't pin one
 * (?t= absent): the nearest window that actually has events. Evening
 * with shows on → "Tonight"; a quiet Tuesday morning → the week. Same
 * rule BrowseMapClient has always used to pick which pins draw — the
 * caption names the window the map is genuinely showing.
 */
export function defaultTimeMode(
  counts: Partial<Record<TimeMode, number>>,
): TimeMode {
  if ((counts.now ?? 0) > 0) return "now";
  if ((counts.tonight ?? 0) > 0) return "tonight";
  if ((counts.weekend ?? 0) > 0) return "weekend";
  return "all";
}

/** A 6..24 float hour as a person reads it: 18.5 → "6:30 PM". */
export function formatHourLabel(hour: number): string {
  const hh = Math.floor(hour) % 24;
  const m = Math.round((hour - Math.floor(hour)) * 60);
  const ap = hh < 12 ? "AM" : "PM";
  const h12 = hh % 12 === 0 ? 12 : hh % 12;
  return `${h12}:${m < 10 ? "0" : ""}${m} ${ap}`;
}

export type WhatCaption = {
  /** The headline words: "Everything", "Eat & drink", "Saved · Pizza". */
  main: string;
  /** The quiet layers suffix: "+ Trails", "+ 3 layers". Undefined when
   *  no overlay layers are on. */
  plus?: string;
};

/**
 * The What word. Shows the most specific place filter — the sub when
 * one is chosen (its intent color still says the family), else the
 * intent — with any active lens (Saved / Field notes) leading, and the
 * overlay-layer count as a mono suffix.
 */
export function whatCaption(args: {
  lensLabels?: string[];
  intentLabel?: string;
  subLabel?: string;
  layerCount: number;
  /** When exactly one layer is on, name it instead of counting it. */
  singleLayerLabel?: string;
}): WhatCaption {
  const bits = [...(args.lensLabels ?? [])];
  if (args.subLabel) bits.push(args.subLabel);
  else if (args.intentLabel) bits.push(args.intentLabel);
  const main = bits.length ? bits.join(" · ") : "Everything";
  let plus: string | undefined;
  if (args.layerCount === 1 && args.singleLayerLabel) plus = `+ ${args.singleLayerLabel}`;
  else if (args.layerCount > 0) plus = `+ ${args.layerCount} layers`;
  return { main, plus };
}

export type LayersCaption = {
  /** The lead label: "Base map", "Trails", "Aerial photos". */
  main: string;
  /** The quiet mono tally suffix when more than one is on: "+2". */
  plus?: string;
  /** Whether any layer/lens is on (drives the inked gold caption color). */
  active: boolean;
};

/**
 * The Layers word — the caption's fourth cell. Reads "Base map" until a
 * map drape or a Yours lens is on, then the first one's name, with a mono
 * "+N" tally when several are lit. The label set is passed in already
 * ordered (drapes first, then lenses) so the lead word is stable.
 */
export function layersCaption(labels: string[]): LayersCaption {
  if (labels.length === 0) return { main: "Base map", active: false };
  if (labels.length === 1) return { main: labels[0], active: true };
  return { main: labels[0], plus: `+${labels.length - 1}`, active: true };
}

export type WhenTone = "quiet" | "open" | "window" | "scrub";

export type WhenCaption = {
  text: string;
  /** Render in the mono face (a scrubbed clock time). */
  mono: boolean;
  tone: WhenTone;
};

/**
 * The When word. A scrubbed hour wins (the mono clock IS the state);
 * otherwise "Open now" and/or the active event window; "All day" when
 * nothing temporal narrows the view.
 */
export function whenCaption(args: {
  scrubHour: number | null;
  openNow: boolean;
  /** ?deals=today active — the caption is the readout, so it must name it. */
  dealsOn?: boolean;
  timeMode: TimeMode;
}): WhenCaption {
  if (args.scrubHour != null) {
    return { text: formatHourLabel(args.scrubHour), mono: true, tone: "scrub" };
  }
  const bits: string[] = [];
  if (args.openNow) bits.push("Open now");
  if (args.dealsOn) bits.push("Deals");
  if (args.timeMode !== "all") bits.push(TIME_WINDOW_LABEL[args.timeMode]);
  if (bits.length === 0) return { text: "All day", mono: false, tone: "quiet" };
  return {
    text: bits.join(" · "),
    mono: false,
    tone: args.openNow ? "open" : "window",
  };
}

/**
 * The living mono support line under the caption. Counts are evidence,
 * not the headline: what's drawn, and — when it's true right now — how
 * many of those places close within the hour (open_status
 * "closing-soon" is exactly the ≤60-minute window). The closing clause
 * is suppressed while scrubbing: closing counts are live truth, and the
 * scrubbed map isn't showing "now".
 *
 * The line ellipsizes on one row, so every word must earn its width at
 * 390px: no "on the map" filler (everything here is on the map), and a
 * zero event count is silence, not a segment — otherwise "0 events"
 * spends the pixels that the closing-soon fact (the one actionable
 * clause) needs to survive. A scrubbed hour keeps its events segment
 * even at zero, because "0 events at 6:30 PM" IS the finding.
 */
export function countLine(args: {
  places: number;
  events: number;
  closingSoon: number;
  scrubHour: number | null;
}): string {
  const bits = [
    `${args.places.toLocaleString("en-US")} ${args.places === 1 ? "place" : "places"}`,
  ];
  if (args.events > 0 || args.scrubHour != null) {
    const at = args.scrubHour != null ? ` at ${formatHourLabel(args.scrubHour)}` : "";
    bits.push(`${args.events} ${args.events === 1 ? "event" : "events"}${at}`);
  }
  if (args.scrubHour == null && args.closingSoon > 0) {
    bits.push(`${args.closingSoon} ${args.closingSoon === 1 ? "closes" : "close"} within the hour`);
  }
  return bits.join(" · ");
}

/**
 * Whether the dock shows the single × (anything to clear). The
 * time-aware DEFAULT window is not dirt — only an explicit ?t= is.
 * A moved camera isn't dirt either (Where clears only when the user
 * chose a town / near me from the pane).
 */
export function dockDirty(args: {
  intentActive: boolean;
  openNow: boolean;
  /** ?deals=today active (2026-07-17 map deals view). */
  dealsOn?: boolean;
  timeModeExplicit: boolean;
  scrubActive: boolean;
  lensActive: boolean;
  layerCount: number;
  whereAway: boolean;
}): boolean {
  return (
    args.intentActive ||
    args.openNow ||
    Boolean(args.dealsOn) ||
    args.timeModeExplicit ||
    args.scrubActive ||
    args.lensActive ||
    args.layerCount > 0 ||
    args.whereAway
  );
}
