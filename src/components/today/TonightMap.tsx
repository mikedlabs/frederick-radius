import OwnedMiniMap, { type OwnedMiniMapPin } from "@/components/map/OwnedMiniMap";
import {
  eventHasPreciseDisplayLocation,
  type GeoConfidence,
} from "@/lib/events/geo-confidence";
import type { LngLat } from "@/lib/geo";

/**
 * TonightMap: the picture over Today's day program. Each precisely located
 * row gets a numbered Brick pin, and the row below carries the same number,
 * so "where" is answered before anyone reads a venue name.
 *
 * The map itself is client-only: OwnedMiniMap mounts MapLibre after the box
 * nears the viewport. This module deliberately has no "use client" directive,
 * because the server-rendered program rows read the same numbering helper
 * (`tonightMapPlan`) and a client module's exports cannot be called on the
 * server. Rendering it from a server component is the normal case.
 *
 * Honesty rules:
 * - Pins only for rows that pass `eventHasPreciseDisplayLocation`. An event
 *   that sits on a town or feed centroid is listed without a pin, because a
 *   pin claims a door.
 * - Numbers follow row order among the pinned rows (1..n), never the row's
 *   overall position, so a row without a pin never leaves a gap.
 * - A map needs at least two pins. One pin is a place map, not a program
 *   map, and zero pins must never draw an empty frame.
 *
 * Phones (below 1024px) get a column-width 176px map of the rows they show.
 * From 1024px a second, 300px map framed for a 480px column leads the wider
 * events column. Exactly one instance is displayed at a time (lg:hidden and
 * hidden lg:block), and OwnedMiniMap only mounts MapLibre for a box that
 * intersects the viewport, so the hidden instance never creates a canvas.
 */

/** The most rows the map reads, in display order. */
export const TONIGHT_MAP_MAX_ROWS = 5;
/** Fewer pins than this renders nothing. */
export const TONIGHT_MAP_MIN_PINS = 2;
/** The wide (1024px and up) map's box height and the column it is framed for. */
export const TONIGHT_MAP_WIDE_HEIGHT_PX = 300;
export const TONIGHT_MAP_WIDE_FIT_WIDTH_PX = 480;

/** One visible program row, in display order. */
export type TonightMapRow = {
  /** Stable row identity, shared with the rendered row. */
  key: string;
  /** Event title, read aloud in the map's accessible name. */
  name: string;
  geom?: LngLat | null;
  geo_confidence?: GeoConfidence;
};

export type TonightMapPlan = {
  /** Row key to its pin number ("1".."n") for every pinned row. */
  numbers: ReadonlyMap<string, string>;
  /** Pins for the rows a phone shows; drawn only when `compact` is true. */
  compactPins: OwnedMiniMapPin[];
  /** Pins for every row the wide layout shows; drawn only when `wide` is true. */
  widePins: OwnedMiniMapPin[];
  /** The phone map renders (at least two pinned rows in the phone's rows). */
  compact: boolean;
  /** The wide map renders (at least two pinned rows in all shown rows). */
  wide: boolean;
};

/**
 * Number the precisely located rows in display order and decide which maps
 * render. `compactCount` is how many of the rows are visible below 1024px;
 * the wide layout shows all of them (up to TONIGHT_MAP_MAX_ROWS).
 */
export function tonightMapPlan(
  rows: readonly TonightMapRow[],
  compactCount: number = rows.length,
): TonightMapPlan {
  const shown = rows.slice(0, TONIGHT_MAP_MAX_ROWS);
  const numbers = new Map<string, string>();
  const widePins: OwnedMiniMapPin[] = [];
  const compactPins: OwnedMiniMapPin[] = [];
  shown.forEach((row, index) => {
    if (!eventHasPreciseDisplayLocation(row)) return;
    const label = String(widePins.length + 1);
    numbers.set(row.key, label);
    const pin = { lng: row.geom.lng, lat: row.geom.lat, label, name: row.name };
    widePins.push(pin);
    if (index < compactCount) compactPins.push(pin);
  });
  const wide = widePins.length >= TONIGHT_MAP_MIN_PINS;
  const compact = compactPins.length >= TONIGHT_MAP_MIN_PINS;
  return {
    numbers: wide ? numbers : new Map(),
    compactPins,
    widePins,
    compact,
    wide,
  };
}

export default function TonightMap({
  rows,
  compactCount,
  name,
}: {
  /** The visible program rows in display order. Only the first five count. */
  rows: readonly TonightMapRow[];
  /** How many of `rows` a phone shows (defaults to all of them). */
  compactCount?: number;
  /** What the pins are, for the accessible name ("tonight's events"). */
  name: string;
}) {
  const plan = tonightMapPlan(rows, compactCount);
  if (!plan.compact && !plan.wide) return null;
  const frame =
    "overflow-hidden rounded-[var(--app-radius-md)] border border-[color:var(--app-border)]";
  return (
    <>
      {plan.compact ? (
        <div data-today-tonight-map="compact" className={`${frame} lg:hidden`}>
          <OwnedMiniMap pins={plan.compactPins} name={name} />
        </div>
      ) : null}
      {plan.wide ? (
        <div data-today-tonight-map="wide" className={`${frame} hidden lg:block`}>
          <OwnedMiniMap
            pins={plan.widePins}
            name={name}
            heightPx={TONIGHT_MAP_WIDE_HEIGHT_PX}
            fitWidthPx={TONIGHT_MAP_WIDE_FIT_WIDTH_PX}
          />
        </div>
      ) : null}
    </>
  );
}
