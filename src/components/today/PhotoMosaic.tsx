import Link from "next/link";
import Image from "next/image";
import { rankPlaces, type PlaceCardData } from "@/lib/loaders/places";
import { PAPER_CREAM_BLUR } from "@/lib/blur-placeholder";

/**
 * "Looks like Frederick" — a six-tile photographic grid of real
 * places. The point is visual presence: a wall of recognizable
 * storefronts, parks, and stages that anchors the page in the
 * actual place. Each tile is a tap target to the place detail; no
 * captions over the photos so the imagery does the talking.
 *
 * Selection is deterministic per day (rotating by date) so a
 * repeat visit feels curated, not random. Only places with a Google
 * photo AND a photogenic category qualify — a parking deck or a
 * county-permits office would technically have a photo but is not
 * what "Looks like Frederick" should show.
 *
 * Pass `places` to scope the mosaic to a town or category (so a
 * `/m/middletown` page shows Middletown photos, a `/category/coffee`
 * page shows coffee photos). Default: countywide ranked pool.
 */

// Visual-feed whitelist. Per the design audits: PhotoMosaic was
// surfacing parking decks, driving schools, and county offices —
// destroying the curated feel. Only show categories someone would
// want a photo of.
const PHOTOGENIC_CATEGORIES: ReadonlySet<string> = new Set([
  "restaurant", "bar", "brewery", "coffee", "bakery", "pizza",
  "park", "trail", "outdoors", "playground",
  "museum", "gallery", "theater", "music", "public-art",
  "market", "lodging", "family",
]);

function pickPhotos(count: number, dayIdx: number, pool: PlaceCardData[]) {
  const withPhotos = pool.filter(
    (p) => p.google_photo_url && PHOTOGENIC_CATEGORIES.has(p.category),
  );
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
  // Daily rotation seed. Server component, no hydration risk — the
  // request-scoped impurity is the feature: "today's six photos".
  // eslint-disable-next-line react-hooks/purity
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
          {p.google_photo_url && (
            <Image
              src={p.google_photo_url}
              alt={p.name}
              fill
              sizes="(max-width: 720px) 33vw, 240px"
              placeholder="blur"
              blurDataURL={PAPER_CREAM_BLUR}
              className="object-cover transition-transform duration-500 ease-out group-hover:scale-105"
            />
          )}
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
