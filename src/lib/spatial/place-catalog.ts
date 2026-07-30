/**
 * The deploy-time public place catalog reduced to the fields required by the
 * PostGIS mirror. This module is server/script only because Node's crypto
 * implementation is used to create a deterministic catalog checksum.
 */
import { createHash } from "node:crypto";
import CLIENT_PLACES_RAW from "@/data/places-client.json" with { type: "json" };

type RawSpatialPlace = {
  slug?: unknown;
  name?: unknown;
  category?: unknown;
  municipality?: unknown;
  address?: unknown;
  city?: unknown;
  state?: unknown;
  postal_code?: unknown;
  source?: unknown;
  geom?: {
    lng?: unknown;
    lat?: unknown;
  };
};

export type SpatialCatalogPlace = {
  slug: string;
  name: string;
  category: string;
  municipality: string | null;
  address: string | null;
  city: string | null;
  state: string | null;
  postalCode: string | null;
  source: string;
  lng: number;
  lat: number;
};

export type SpatialCatalogSnapshot = {
  key: "public-place-catalog";
  hash: string;
  count: number;
  places: readonly SpatialCatalogPlace[];
};

function optionalText(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function requiredText(value: unknown, field: string, index: number): string {
  const text = optionalText(value);
  if (!text) {
    throw new Error(`places-client.json row ${index} has no valid ${field}.`);
  }
  return text;
}

export function hashSpatialPlaces(
  places: readonly Pick<SpatialCatalogPlace, "slug" | "lng" | "lat">[],
): string {
  const canonical = [...places]
    .sort((a, b) => a.slug.localeCompare(b.slug))
    .map((place) => [place.slug, place.lng, place.lat]);
  return createHash("sha256").update(JSON.stringify(canonical)).digest("hex");
}

function buildSnapshot(): SpatialCatalogSnapshot {
  const seen = new Set<string>();
  const places = (CLIENT_PLACES_RAW as RawSpatialPlace[]).map((raw, index) => {
    const slug = requiredText(raw.slug, "slug", index);
    if (seen.has(slug)) {
      throw new Error(`places-client.json contains duplicate slug "${slug}".`);
    }
    seen.add(slug);

    const lng = raw.geom?.lng;
    const lat = raw.geom?.lat;
    if (
      typeof lng !== "number" ||
      typeof lat !== "number" ||
      !Number.isFinite(lng) ||
      !Number.isFinite(lat) ||
      lng < -180 ||
      lng > 180 ||
      lat < -90 ||
      lat > 90
    ) {
      throw new Error(
        `places-client.json row "${slug}" has invalid longitude/latitude.`,
      );
    }

    return {
      slug,
      name: requiredText(raw.name, "name", index),
      category: requiredText(raw.category, "category", index),
      municipality: optionalText(raw.municipality),
      address: optionalText(raw.address),
      city: optionalText(raw.city),
      state: optionalText(raw.state),
      postalCode: optionalText(raw.postal_code),
      source: optionalText(raw.source) ?? "spatial-mirror",
      lng,
      lat,
    };
  });

  places.sort((a, b) => a.slug.localeCompare(b.slug));
  return {
    key: "public-place-catalog",
    hash: hashSpatialPlaces(places),
    count: places.length,
    places,
  };
}

let cachedSnapshot: SpatialCatalogSnapshot | undefined;

export function spatialCatalogSnapshot(): SpatialCatalogSnapshot {
  cachedSnapshot ??= buildSnapshot();
  return cachedSnapshot;
}
