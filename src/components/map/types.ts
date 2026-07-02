/**
 * Map-surface types shared across the AppMap shell, the popups, and
 * (eventually) any pin / deck modules carved off the orchestration
 * file. Extracted from AppMap.tsx to keep that file readable and to
 * let downstream files import a type without pulling in the whole
 * 2,500-line component.
 *
 * Nothing here changes at runtime — these are interfaces only.
 */
import type { Place } from "@/data/places";
import type { PlaceCardData } from "@/lib/loaders/places";
import type { OsmPlace } from "@/lib/integrations/overpass";

/** Minimal GeoJSON line FeatureCollection (decoupled from the feeds). */
export type MapLineFC = {
  type: "FeatureCollection";
  features: Array<{
    type: "Feature";
    geometry: unknown;
    properties: Record<string, unknown>;
  }>;
};

export const EMPTY_LINE_FC: MapLineFC = {
  type: "FeatureCollection",
  features: [],
};

export type CivicPin = {
  kind: "traffic" | "issue";
  lng: number;
  lat: number;
  label: string;
};

/**
 * Compact shape we render as an event pin on the map. Server-fetched on
 * /map/page.tsx from allUpcoming() and filtered to the next 48 hours so
 * the layer reads as "what's happening soon" instead of "all events
 * ever." Hero image is rendered as a circular photo bubble; if absent
 * we fall back to a category-colored badge with a calendar glyph.
 */
export type EventPin = {
  slug: string;
  title: string;
  starts_at: string;
  ends_at?: string;
  venue_name: string;
  lng: number;
  lat: number;
  category: string;
  category_color?: string;
  hero_image?: string;
};

/** Map selection union. Discriminated by `_kind`. */
export type SelectedOsm = OsmPlace & { _kind: "osm" };
export type SelectedPlace = Place & { _kind: "place" };
export type Selected = SelectedOsm | SelectedPlace | null;


/**
 * MapPinPlace — the fields a curated place needs ON THE MAP, and nothing else.
 *
 * /map used to inline ~1,700 FULL decorated records into the RSC payload
 * (measured live: 3.65MB HTML, 3.58MB of it one flight script, ~596KB br on
 * the wire, re-parsed on the main thread every visit). Pins + filters + the
 * dedupe index only touch the fields below (~15% of a full record); the
 * PlaceSheet is the sole full-data consumer and hydrates on demand from the
 * cached /api/places/by-slugs route. PlaceCardData satisfies this type
 * structurally, so callers that already hold full records (SavedList, radius
 * mode) pass them unchanged.
 *
 * If AppMap starts reading a new place field, add it HERE and to slimPlace in
 * map/page.tsx — TypeScript will catch the read, the payload check won't.
 */
export type MapPinPlace = Pick<
  PlaceCardData,
  | "slug"
  | "name"
  | "category"
  | "subcategories"
  | "geom"
  | "open_status"
  | "is_verified"
  | "field_notes"
  | "deal_hook"
  | "source"
  | "municipality"
  // Read by cuisinesOf via the cuisine sub-intent matchers (IntentMatchable).
  | "short_blurb"
  | "primary_type"
> &
  // OPTIONAL on pins (payload audit 2026-07-02): slimPlace stops shipping
  // these ~107 KB — their only map read is AppMap's DedupeRecord, where the
  // isSamePlace id-equality branch can never fire against OSM records (the
  // OSM side never has a Google id). Full PlaceCardData records (SavedList,
  // radius) still carry them and still satisfy this type.
  Partial<Pick<PlaceCardData, "google_place_id" | "feature_score">> & {
    distance_m?: number;
  };
