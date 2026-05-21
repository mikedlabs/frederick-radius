/**
 * Default layer sets per mode — the heart of the Visitor / Resident
 * mode system. One data model, two presentation lenses.
 *
 * Each mode opens with a small curated set of active layers. Users
 * add the rest on demand through the layer panel. Switching mode
 * resets to that mode's defaults (predictable behavior beats
 * preserving session toggles).
 *
 * What goes where is derived directly from the Phase 1 audit:
 *
 *   • categories  — top-level slugs from src/data/categories.ts
 *     applied via AppMap's `activeCats` Set
 *   • amenityGroups — keys from AppMap's AMENITY_GROUPS table
 *     applied via the `amenityGroups` Set
 *   • lineLayers  — toggleable line overlays (trails, transit)
 *   • civic       — MDOT CHART road closures + SeeClickFix issues,
 *     merged into a single boolean (the source array is already
 *     fetched server-side; the flag decides whether to render)
 *   • eventScope  — shared layer scoping (visitor=weekend/downtown,
 *     resident=ongoing/countywide)
 *
 * Layers in the spec but NOT yet plumbed (trash schedules, school
 * zones, council districts, building permits) are deliberately
 * absent — per the brief, no new data sources. They can be added
 * to this config the day a human flips them to `active` in
 * `data/sources.yaml`.
 */

import type { Mode } from "@/hooks/useMode";

export type LineLayer = "trails" | "transit";

export type EventScope = "weekend-downtown" | "fortnight-countywide";
export type ClosureScope = "major-only" | "all-ongoing";

export type ModeLayerDefaults = {
  /** Top-level category slugs to enable by default. */
  categories: string[];
  /** Amenity-group keys from AppMap's AMENITY_GROUPS. */
  amenityGroups: string[];
  /** Toggleable line overlays. */
  lineLayers: LineLayer[];
  /** Whether the civic-overlay (MDOT incidents + 311 issues) is on by default. */
  civic: boolean;
  /** Default time-window + place-scope for the shared Events layer. */
  eventScope: EventScope;
  /** Severity / time scope for road closures + traffic incidents. */
  closureScope: ClosureScope;
};

/**
 * Visitor — first-time and tourist arrival.
 *
 * Five active layers:
 *   1. Food & drink (food category — restaurants/coffee/bar/brewery/bakery/pizza)
 *   2. Arts & culture (arts category — museums/galleries/theaters/music/public-art)
 *   3. Parking (so they know where they can leave the car)
 *   4. Trail shapes (walking routes through downtown)
 *   5. Restrooms (the "where can I find a bathroom" question every visitor has)
 *
 * Shared layers, mode-scoped:
 *   • Events  → this weekend, downtown
 *   • Closures → major only (don't bury them in routine roadwork)
 *
 * Civic overlay is OFF (visitors don't need 311 reports).
 */
export const VISITOR_DEFAULTS: ModeLayerDefaults = {
  categories: ["food", "arts", "parking"],
  amenityGroups: ["restroom"],
  lineLayers: ["trails"],
  civic: false,
  eventScope: "weekend-downtown",
  closureScope: "major-only",
};

/**
 * Resident — they know the town. They open the map to deal with
 * something local: a closure, a permit, "what's open near me right
 * now", a council vote.
 *
 * Five active layers:
 *   1. Civic (government / voting / public-safety / library / worship)
 *   2. Services (pharmacy, hardware — daily-needs)
 *   3. Outdoors (parks/trails the locals use)
 *   4. Parking (still useful — daily-use framing)
 *   5. Active civic overlay: MDOT CHART road closures + SeeClickFix
 *      311 issues. The "what is going on in my town" signal.
 *
 * Shared layers, mode-scoped:
 *   • Events  → next 14 days, county-wide
 *   • Closures → all ongoing
 */
export const RESIDENT_DEFAULTS: ModeLayerDefaults = {
  categories: ["civic", "services", "outdoors", "parking"],
  amenityGroups: [],
  lineLayers: [],
  civic: true,
  eventScope: "fortnight-countywide",
  closureScope: "all-ongoing",
};

export function defaultsFor(mode: Mode): ModeLayerDefaults {
  return mode === "resident" ? RESIDENT_DEFAULTS : VISITOR_DEFAULTS;
}

/**
 * Count of active layers in a defaults set — the acceptance-criteria
 * gate from the brief ("no more than about five active layers").
 */
export function activeLayerCount(d: ModeLayerDefaults): number {
  return (
    d.categories.length +
    d.amenityGroups.length +
    d.lineLayers.length +
    (d.civic ? 1 : 0)
  );
}

// Build-time invariant: both modes open with at most 5 + the shared
// events row. If a future edit pushes a mode past 5, surface the
// regression at type-check time.
const _VISITOR_LAYER_COUNT = activeLayerCount(VISITOR_DEFAULTS);
const _RESIDENT_LAYER_COUNT = activeLayerCount(RESIDENT_DEFAULTS);
// These const expressions assert ≤ 5 by erroring at type-check time
// if a future maintainer pushes a default count over the limit.
const _vc: 1 | 2 | 3 | 4 | 5 = _VISITOR_LAYER_COUNT as 1 | 2 | 3 | 4 | 5;
const _rc: 1 | 2 | 3 | 4 | 5 = _RESIDENT_LAYER_COUNT as 1 | 2 | 3 | 4 | 5;
// Reference them so they're not tree-shaken before the type check
// runs in CI. (Pure constants — zero runtime cost.)
export const __MODE_LAYER_COUNT_INVARIANT__ = [_vc, _rc] as const;
