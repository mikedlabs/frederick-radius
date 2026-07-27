import { clientPlaces } from "@/lib/loaders/places-client";
import {
  DAYS,
  SLOTS_PER_DAY,
  WEEK_SLOTS,
  type RhythmData,
  type RhythmGroup,
  type RhythmPlace,
} from "@/lib/rhythm-shared";

export { SLOTS_PER_DAY, WEEK_SLOTS, slotLabel } from "@/lib/rhythm-shared";
export type {
  RhythmData,
  RhythmGroup,
  RhythmPlace,
} from "@/lib/rhythm-shared";

/**
 * The Rhythm — the county's business hours as a scrubbable week.
 *
 * Most people never see the patterns sitting in plain sight inside 1,200
 * sets of posted hours: Monday is the county's real day off, the taprooms
 * snap open at noon in near-unison, Wednesday lunch beats Saturday night.
 * This module turns the hours table into a compact, client-shippable
 * matrix so a canvas can render every place as one light and let a finger
 * scrub the whole week.
 *
 * Resolution: 15 minutes → 96 slots/day → 672 slots/week (Mon..Sun).
 * Each place packs its week into 84 bytes (672 bits); the full county is
 * ~100 KB before base64 - fine for a dedicated page, and the client does
 * a single bit-test per dot per frame.
 *
 * Pure derivation from the client dataset (no live fetch): posted hours
 * are static data, and the page says exactly what it is - posted hours,
 * not a promise the lights are on.
 */

/** Visual grouping for the light-field: one hue per group, dots sorted so
 *  a group reads as a band and its wake/sleep wave is visible. */
const GROUP_BY_CATEGORY: Record<string, RhythmGroup> = {
  restaurant: "food", pizza: "food", bakery: "food", "ice-cream": "food", "food-truck": "food", market: "food",
  coffee: "coffee",
  bar: "pours", brewery: "pours", winery: "pours", distillery: "pours",
  shopping: "shops", antiques: "shops", "book-store": "shops", gallery: "shops",
  park: "outdoors", trail: "outdoors", playground: "outdoors", golf: "outdoors", agritourism: "outdoors",
  wellness: "wellness", yoga: "wellness", gym: "wellness",
  civic: "civic", museum: "civic", library: "civic", theater: "civic", worship: "civic",
  lodging: "lodging",
};

export function groupForCategory(category: string): RhythmGroup {
  return GROUP_BY_CATEGORY[category] ?? "services";
}

function minutesOf(hhmm: string): number {
  const [h, m] = hhmm.split(":").map(Number);
  return (Number.isFinite(h) ? h : 0) * 60 + (Number.isFinite(m) ? m : 0);
}

type Windows = Partial<Record<(typeof DAYS)[number], Array<{ open: string; close: string }>>>;

/**
 * Mark a place's open slots into `mask` (84 bytes). An all-day window
 * (00:00-00:00 or open==close) lights the whole day; a close at or before
 * the open wraps past midnight INTO THE NEXT DAY's early slots, so the
 * 2 AM bars keep Friday night's lights burning into Saturday's first row.
 */
export function packWeek(hours: Windows): Uint8Array {
  const mask = new Uint8Array(WEEK_SLOTS / 8);
  const set = (slot: number) => {
    const s = ((slot % WEEK_SLOTS) + WEEK_SLOTS) % WEEK_SLOTS;
    mask[s >> 3] |= 1 << (s & 7);
  };
  DAYS.forEach((day, di) => {
    for (const w of hours[day] ?? []) {
      const o = minutesOf(w.open);
      const cRaw = minutesOf(w.close);
      const allDay = o === cRaw; // 24h listings publish open == close
      const c = allDay ? o + 1440 : cRaw <= o ? cRaw + 1440 : cRaw;
      for (let m = o; m < c; m += 15) set(di * SLOTS_PER_DAY + Math.floor(m / 15));
    }
  });
  return mask;
}

export function isOpenAt(masks: Uint8Array, placeIndex: number, slot: number): boolean {
  // Per-place strides are byte-aligned (672/8 = 84), so index math stays simple.
  const byte = placeIndex * (WEEK_SLOTS / 8) + (slot >> 3);
  return (masks[byte] & (1 << (slot & 7))) !== 0;
}

let cache: RhythmData | null = null;

/** Build (and memoize) the county rhythm from the client dataset. */
export function getRhythmData(): RhythmData {
  if (cache) return cache;
  const pool = clientPlaces().filter(
    (p) => p.hours && p.is_operational === "operational",
  );
  const places: RhythmPlace[] = [];
  const masksArr: Uint8Array[] = [];
  const sorted = [...pool].sort((a, b) => {
    const ga = groupForCategory(a.category);
    const gb = groupForCategory(b.category);
    return ga === gb ? a.name.localeCompare(b.name) : ga.localeCompare(gb);
  });
  for (const p of sorted) {
    places.push({ name: p.name, slug: p.slug, group: groupForCategory(p.category), town: p.municipality });
    masksArr.push(packWeek(p.hours as Windows));
  }
  const bytesPer = WEEK_SLOTS / 8;
  const all = new Uint8Array(places.length * bytesPer);
  masksArr.forEach((m, i) => all.set(m, i * bytesPer));

  const counts = new Array<number>(WEEK_SLOTS).fill(0);
  for (let i = 0; i < places.length; i++) {
    for (let s = 0; s < WEEK_SLOTS; s++) {
      if (isOpenAt(all, i, s)) counts[s]++;
    }
  }
  let peak = { slot: 0, count: 0 };
  counts.forEach((c, s) => {
    if (c > peak.count) peak = { slot: s, count: c };
  });

  cache = { places, masks: Buffer.from(all).toString("base64"), counts, peak };
  return cache;
}
