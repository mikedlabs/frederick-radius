import RAW from "@/data/public-art.json" with { type: "json" };
import { isInFrederickCounty } from "@/components/map/constants";

/**
 * Public art layer (data brief 6.5).
 *
 * The signature overlay: structured public-art data no other product
 * has. This is the read path. Entries live in src/data/public-art.json
 * (owner and Frederick Arts Council curated); this module types them,
 * drops anything unplaceable or removed, and converts to the GeoJSON the
 * map overlay and the cache-headered endpoint serve.
 *
 * Honest by construction: a piece with no real coordinates, or one
 * marked removed, never reaches the map. The layer is empty until the
 * pieces are seeded, and renders nothing rather than a placeholder.
 */

export type PublicArtPiece = {
  id: string;
  title: string;
  artist: string;
  /** Year installed, when known. */
  year?: number;
  lat: number;
  lng: number;
  /** Hosted image of the piece, credited via photo_credit. */
  photo_url?: string;
  photo_credit?: string;
  /** The trail or commission page this piece is documented on. */
  source_url?: string;
  status: "active" | "removed";
};

type RawFile = { pieces?: unknown };

/** All active, placeable pieces. Pure and synchronous. */
export function getPublicArt(): PublicArtPiece[] {
  const pieces = (RAW as RawFile).pieces;
  if (!Array.isArray(pieces)) return [];
  const out: PublicArtPiece[] = [];
  for (const p of pieces as PublicArtPiece[]) {
    if (!p?.id || !p.title || p.status === "removed") continue;
    const lat = Number(p.lat);
    const lng = Number(p.lng);
    // A piece must sit at real coordinates inside the county to render.
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue;
    if (!isInFrederickCounty(lng, lat)) continue;
    out.push({ ...p, lat, lng });
  }
  return out;
}

export type PublicArtFeatureCollection = {
  type: "FeatureCollection";
  features: Array<{
    type: "Feature";
    geometry: { type: "Point"; coordinates: [number, number] };
    properties: Omit<PublicArtPiece, "lat" | "lng">;
  }>;
};

/** GeoJSON for the map overlay and the static endpoint. */
export function publicArtGeoJSON(): PublicArtFeatureCollection {
  return {
    type: "FeatureCollection",
    features: getPublicArt().map((p) => {
      const { lat, lng, ...properties } = p;
      return {
        type: "Feature" as const,
        geometry: { type: "Point" as const, coordinates: [lng, lat] as [number, number] },
        properties,
      };
    }),
  };
}
