import OwnedMiniMap, { type OwnedMiniMapPin } from "@/components/map/OwnedMiniMap";

/**
 * ResultsPinMap is the numbered pin map that leads a ranked place list: the
 * picture Ask already draws above its answers (askResultPins), shared with
 * /open-now, category pages and search. Each pin carries the same number as
 * its row, so the map answers "where" before the reader scans the names.
 *
 * No "use client" here on purpose. The numbering is a pure function that
 * server pages call to number their rows, and the map itself is the client
 * OwnedMiniMap, which loads MapLibre only when the box nears the viewport.
 *
 * Honesty rules:
 *   - Only rows with real coordinates get a pin. A row without one keeps no
 *     number, and the numbers count pinned rows only, so pin 3 is always the
 *     third numbered row.
 *   - Pins are always Brick. They never encode open or closed state.
 *   - With fewer than two pins there is no map at all: one pin is a place
 *     page's job, and an empty frame says nothing.
 */

/** The most pins one results map carries. */
export const RESULTS_PIN_CAP = 9;
/** The fewest pins worth a map. Below this the map renders nothing. */
export const RESULTS_PIN_MIN = 2;

/** One row of a ranked list, in display order. */
export type ResultsPinRow = {
  slug: string;
  name: string;
  lng?: number | null;
  lat?: number | null;
};

/** A pin row from any record with a catalog point (places, by default). */
export function pinRowFor(record: {
  slug: string;
  name: string;
  geom?: { lng: number; lat: number } | null;
}): ResultsPinRow {
  return {
    slug: record.slug,
    name: record.name,
    lng: record.geom?.lng ?? null,
    lat: record.geom?.lat ?? null,
  };
}

function pointOf(row: ResultsPinRow): { lng: number; lat: number } | null {
  const { lng, lat } = row;
  if (typeof lng !== "number" || typeof lat !== "number") return null;
  if (!Number.isFinite(lng) || !Number.isFinite(lat)) return null;
  return { lng, lat };
}

/**
 * Slug to pin number for rows in display order. Rows without coordinates get
 * no number, the order of the input is kept, and numbering stops at
 * RESULTS_PIN_CAP. A repeated slug keeps its first number.
 */
export function pinNumbersFor(
  rows: readonly ResultsPinRow[],
): Map<string, number> {
  const numbers = new Map<string, number>();
  for (const row of rows) {
    if (numbers.size >= RESULTS_PIN_CAP) break;
    if (numbers.has(row.slug) || !pointOf(row)) continue;
    numbers.set(row.slug, numbers.size + 1);
  }
  return numbers;
}

/**
 * The numbers a list should print beside its rows: the same as
 * pinNumbersFor, or none at all when the map would not draw. A number with
 * no map to point at would be a dangling reference.
 */
export function mappedPinNumbers(
  rows: readonly ResultsPinRow[],
): Map<string, number> {
  const numbers = pinNumbersFor(rows);
  return numbers.size >= RESULTS_PIN_MIN ? numbers : new Map();
}

/** The pins for rows, numbered by pinNumbersFor so rows and pins agree. */
export function resultsPinsFor(
  rows: readonly ResultsPinRow[],
): OwnedMiniMapPin[] {
  const numbers = pinNumbersFor(rows);
  const pins: OwnedMiniMapPin[] = [];
  for (const row of rows) {
    const number = numbers.get(row.slug);
    const point = pointOf(row);
    if (number === undefined || !point) continue;
    // A repeated slug is pinned once, at its first row.
    numbers.delete(row.slug);
    pins.push({ ...point, label: String(number), name: row.name });
  }
  return pins;
}

/**
 * The 22px Brick disc a numbered row prints before its tile. It repeats the
 * pin's number, which the map's accessible name already reads aloud, so the
 * disc itself is hidden from assistive technology.
 */
export function PinNumber({ n }: { n: number }) {
  return (
    <span
      aria-hidden="true"
      data-pin-number={n}
      className="text-caption grid h-[22px] w-[22px] shrink-0 place-items-center rounded-full font-bold leading-none tabular-nums"
      style={{ background: "var(--app-brand)", color: "var(--app-bg)" }}
    >
      {n}
    </span>
  );
}

/**
 * The empty column a numbered list keeps for a row that has no pin, so every
 * tile in the list still lines up.
 */
export function PinNumberGutter() {
  return <span aria-hidden="true" data-pin-number="" className="w-[22px] shrink-0" />;
}

export default function ResultsPinMap({
  rows,
  name = "these places",
}: {
  /** The list's rows in display order. Only the first RESULTS_PIN_CAP
   *  rows with coordinates are pinned. */
  rows: readonly ResultsPinRow[];
  /** What the pins are, for the map's accessible name. */
  name?: string;
}) {
  const pins = resultsPinsFor(rows);
  if (pins.length < RESULTS_PIN_MIN) return null;
  // MapLibre takes its camera once, on mount. When a re-sort changes the
  // pinned set, a new key mounts a fresh map framed for the new pins, so a
  // pin never sits over the wrong street.
  const frameKey = pins.map((pin) => `${pin.label}:${pin.lng},${pin.lat}`).join("|");
  return (
    <div
      data-results-pin-map
      className="overflow-hidden rounded-[var(--app-radius-md)] border"
      style={{ borderColor: "var(--app-border)" }}
    >
      <OwnedMiniMap key={frameKey} pins={pins} name={name} />
    </div>
  );
}
