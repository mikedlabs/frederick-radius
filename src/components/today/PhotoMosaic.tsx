import Link from "next/link";
import Image from "next/image";
// eslint-disable-next-line no-restricted-imports -- SERVER component (no "use client"): loader imports render server-side and never enter the client bundle
import { rankPlaces, type PlaceCardData } from "@/lib/loaders/places";
import { PAPER_CREAM_BLUR } from "@/lib/blur-placeholder";
import { proxyPhotoAtWidth } from "@/lib/format/img";
import { PHOTOGENIC_CATEGORIES } from "@/lib/photogenic";

/**
 * "Looks like Frederick" — a six-tile photographic grid of real
 * places. The point is visual presence: a wall of recognizable
 * storefronts, parks, and stages that anchors the page in the
 * actual place. Each tile is a tap target to the place detail. The
 * name caption reveals on hover where a pointer exists, and stays on
 * where hover never fires (touch) so nobody taps a tile blind.
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

// Visual-feed whitelist now lives in @/lib/photogenic (shared with the
// FunnelFlow topic grid) so the two never drift apart.

export function pickPhotos(count: number, dayIdx: number, pool: PlaceCardData[]) {
  const withPhotos = pool.filter(
    (p) => p.google_photo_url && PHOTOGENIC_CATEGORIES.has(p.category),
  );
  const n = withPhotos.length;
  if (n === 0) return [];
  // Never repeat a place: cap to what's actually available (a sparse pool —
  // e.g. a category after eligibility filtering — must show FEWER tiles, not
  // the same photo six times — the "Looks like Family → Spinners ×6" bug).
  // Rotate the start by day for visit-to-visit variety, then walk
  // sequentially so every tile is a DISTINCT place.
  const take = Math.min(count, n);
  const start = ((dayIdx % n) + n) % n;
  return Array.from({ length: take }, (_, i) => withPhotos[(start + i) % n]);
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
              // A mosaic tile paints at most ~240px, and `unoptimized` (the
              // proxy is an opaque route Next cannot resize) makes the sizes
              // hint inert — so each of the six tiles was fetching the full
              // w=800 hero on every visit against a no-store route. Same
              // missed-adopter narrowing as DaypartNeeds and PlaceCard.
              src={proxyPhotoAtWidth(p.google_photo_url, 240)}
              alt=""
              unoptimized={p.google_photo_url.startsWith("/api/place-photo")}
              fill
              sizes="(max-width: 720px) 33vw, 240px"
              placeholder="blur"
              blurDataURL={PAPER_CREAM_BLUR}
              className="object-cover transition-transform duration-500 ease-out group-hover:scale-105"
            />
          )}
          {/* Name scrim: hover-reveal on pointer devices, ALWAYS on where
              hover never fires (touch) — otherwise phone users tap six
              anonymous tiles blind, with the name living only in the
              aria-label. */}
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/35 via-transparent to-transparent opacity-0 transition-opacity duration-300 group-hover:opacity-100 [@media(hover:none)]:opacity-100"
          />
          <div
            aria-hidden
            className="pointer-events-none absolute inset-x-2 bottom-2 truncate text-[10px] font-semibold text-white opacity-0 transition-opacity duration-300 group-hover:opacity-100 [@media(hover:none)]:opacity-100"
            style={{ textShadow: "0 1px 2px rgba(0,0,0,0.6)" }}
          >
            {p.name}
          </div>
        </Link>
      ))}
    </div>
  );
}
