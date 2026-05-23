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
