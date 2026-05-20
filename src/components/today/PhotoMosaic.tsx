import Link from "next/link";
import { rankPlaces, type PlaceCardData } from "@/lib/loaders/places";

/**
 * "Looks like Frederick" — a six-tile photographic grid of real
 * places. The point is visual presence: a wall of recognizable
 * storefronts, parks, and stages that anchors the page in the
 * actual place. Each tile is a tap target to the place detail; no
 * captions over the photos so the imagery does the talking.
 *
 * Selection is deterministic per day (rotating by date) so a
 * repeat visit feels curated, not random. Only places with a
 * Google photo qualify — anything else would render an empty box.
 *
 * Pass `places` to scope the mosaic to a town or category (so a
 * `/m/middletown` page shows Middletown photos, a `/category/coffee`
 * page shows coffee photos). Default: countywide ranked pool.
 */
function pickPhotos(count: number, dayIdx: number, pool: PlaceCardData[]) {
  const withPhotos = pool.filter((p) => p.google_photo_url);
  if (withPhotos.length === 0) return [];
  // Rotate the start cursor by day so the wall is *different*
  // photos from visit to visit, but stable within a day.
  const start = ((dayIdx % withPhotos.length) + withPhotos.length) % withPhotos.length;
  return Array.from({ length: count }, (_, i) => withPhotos[(start + i * 17) % withPhotos.length]);
}

export default function PhotoMosaic({
  places,
  count = 6,
}: {
  /** Optional pre-filtered pool. Default: countywide ranked list. */
  places?: PlaceCardData[];
  /** Tile count. Default 6 — a clean 3×2 grid. */
  count?: number;
} = {}) {
  const pool = places ?? rankPlaces({ limit: 800 });
  const dayIdx = Math.floor(Date.now() / 86_400_000);
  const tiles = pickPhotos(count, dayIdx, pool);
  if (tiles.length === 0) return null;
  return (
    <div className="grid grid-cols-3 gap-2">
      {tiles.map((p) => (
        <Link
          key={p.slug}
          href={`/places/${p.slug}`}
          aria-label={p.name}
          className="tactile tactile-interactive group relative aspect-square overflow-hidden rounded-[var(--app-radius-md)] bg-[var(--app-bg-sunken)]"
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={p.google_photo_url}
            alt=""
            loading="lazy"
            className="h-full w-full object-cover transition-transform duration-500 ease-out group-hover:scale-105"
          />
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/35 via-transparent to-transparent opacity-0 transition-opacity duration-300 group-hover:opacity-100"
          />
          <div
            aria-hidden
            className="pointer-events-none absolute inset-x-2 bottom-2 truncate text-[10px] font-semibold text-white opacity-0 transition-opacity duration-300 group-hover:opacity-100"
            style={{ textShadow: "0 1px 2px rgba(0,0,0,0.6)" }}
          >
            {p.name}
          </div>
        </Link>
      ))}
    </div>
  );
}
