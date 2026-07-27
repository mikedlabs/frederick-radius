/**
 * Browser-safe Rhythm primitives.
 *
 * Keep this module free of place-catalog imports. RhythmField only needs the
 * packed-matrix types and time labels; the server page builds the matrix from
 * the full catalog before it crosses the React server/client boundary.
 */
export const SLOTS_PER_DAY = 96;
export const DAYS = [
  "mon",
  "tue",
  "wed",
  "thu",
  "fri",
  "sat",
  "sun",
] as const;
export const WEEK_SLOTS = SLOTS_PER_DAY * 7;

export type RhythmGroup =
  | "food"
  | "coffee"
  | "pours"
  | "shops"
  | "outdoors"
  | "wellness"
  | "services"
  | "civic"
  | "lodging";

export type RhythmPlace = {
  name: string;
  slug: string;
  group: RhythmGroup;
  town: string;
};

export type RhythmData = {
  /** One entry per place, sorted by group then name (band layout). */
  places: RhythmPlace[];
  /** Base64 of places.length * 84 bytes; bit i of a place's 672 = open in slot i. */
  masks: string;
  /** Open count per week slot across all places (for the readout + peak). */
  counts: number[];
  /** The single busiest slot of the week. */
  peak: { slot: number; count: number };
};

/** Human label for a week slot: "Wednesday · 1:15 PM". */
export function slotLabel(slot: number): string {
  const dayNames = [
    "Monday",
    "Tuesday",
    "Wednesday",
    "Thursday",
    "Friday",
    "Saturday",
    "Sunday",
  ];
  const day = dayNames[Math.floor(slot / SLOTS_PER_DAY)];
  const m = (slot % SLOTS_PER_DAY) * 15;
  const h24 = Math.floor(m / 60);
  const mm = m % 60;
  const mer = h24 >= 12 ? "PM" : "AM";
  const h12 = h24 % 12 === 0 ? 12 : h24 % 12;
  return `${day} · ${h12}:${String(mm).padStart(2, "0")} ${mer}`;
}
