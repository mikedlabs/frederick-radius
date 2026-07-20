"use client";

import { Star } from "lucide-react";
import type { BeerWithBrewery } from "@/data/beers";
import { beerColor } from "@/lib/beer/beer-color";

/**
 * The beer-color mosaic — every pour is a paint-swatch tile: a band in the
 * beer's own color (pale pilsner gold through near-black imperial stout) over
 * a cream label. Laid out as a wall you scan and tap. This replaced the
 * ridgeline "flavor field" as the page's hero: concrete (the real color of the
 * beer), not an abstract chart, and the label sits on a controlled ground so
 * every beer reads at WCAG AA regardless of its color.
 *
 * Presentation only — BeerIndex owns the filter/sort and passes the beers in
 * order (a family-interleaved "mosaic" by default for a vibrant spread).
 */
function ratingChip(rating: number): { bg: string; fg: string } {
  if (rating >= 4.0) return { bg: "#382517", fg: "#f7d98a" };
  if (rating >= 3.7) return { bg: "#e7d9bf", fg: "#4f3211" };
  return { bg: "#ece3d2", fg: "#5e3a15" };
}

export default function BeerMosaic({
  beers,
  onOpen,
}: {
  beers: BeerWithBrewery[];
  onOpen: (b: BeerWithBrewery) => void;
}) {
  if (beers.length === 0) {
    return (
      <div className="rounded-[14px] border border-black/12 bg-[#faf5ea] px-4 py-10 text-center">
        <p className="font-serif text-[18px] font-semibold text-[#281e14]">No beers match those filters.</p>
        <p className="mt-1 text-[13px] text-black/55">Drop a filter to widen the search.</p>
      </div>
    );
  }

  return (
    <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3">
      {beers.map((b) => {
        const color = beerColor(b.style, b.family);
        const chip = b.rating != null ? ratingChip(b.rating) : null;
        return (
          <li key={`${b.brewerySlug}::${b.name}`}>
            <button
              type="button"
              onClick={() => onOpen(b)}
              className="flex h-full w-full flex-col overflow-hidden rounded-[12px] border border-black/10 bg-[#faf5ea] text-left transition active:scale-[0.98]"
            >
              {/* The swatch — a pure band of the beer's real color. */}
              <span className="relative block w-full" style={{ height: 52, background: color }} aria-hidden>
                {chip && (
                  <span
                    className="absolute right-1.5 top-1.5 rounded-full px-1.5 py-0.5 font-mono text-[10px] font-bold tabular-nums"
                    style={{ background: chip.bg, color: chip.fg }}
                  >
                    {b.rating!.toFixed(2)}
                  </span>
                )}
              </span>
              {/* Label on cream — guaranteed contrast. */}
              <span className="flex flex-1 flex-col gap-1 p-2.5">
                <span className="flex items-start gap-1">
                  {b.flagship && <Star className="mt-[3px] h-2.5 w-2.5 shrink-0 text-[#c7841f]" strokeWidth={2} fill="currentColor" aria-label="Flagship" />}
                  <span className="font-serif text-[14px] font-semibold leading-tight text-[#281e14] line-clamp-2">{b.name}</span>
                </span>
                <span className="mt-auto truncate font-mono text-[9.5px] uppercase tracking-[0.06em] text-[#6b5a45]">
                  {b.style}
                  {b.abv != null && ` · ${b.abv.toFixed(1)}%`}
                </span>
              </span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}
