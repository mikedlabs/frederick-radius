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
 *
 * BeerIndex owns how many tiles are passed in. Keeping that decision in one
 * place prevents a second, conflicting "Show all" control inside the mosaic.
 */
function ratingChip(rating: number): { bg: string; fg: string } {
  if (rating >= 4.0) return { bg: "var(--app-ink)", fg: "var(--app-amber)" };
  if (rating >= 3.7) return { bg: "var(--app-bg-sunken)", fg: "var(--app-ink)" };
  return { bg: "var(--app-paper-2)", fg: "var(--app-amber-text)" };
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
      <div className="rounded-[var(--app-radius-lg)] border bg-[var(--app-bg-elevated-solid)] px-4 py-10 text-center" style={{ borderColor: "var(--app-border)" }}>
        <p className="font-serif text-[18px] text-[var(--app-ink)]">No beers match those filters.</p>
        <p className="mt-1 text-[13px] text-[var(--app-ink-3)]">Drop a filter to widen the search.</p>
      </div>
    );
  }

  return (
    <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        {beers.map((b) => {
          const color = beerColor(b.style, b.family);
          const chip = b.rating != null ? ratingChip(b.rating) : null;
          const label = [
            b.name,
            b.breweryName,
            b.style,
            b.abv != null ? `${b.abv.toFixed(1)} percent ABV` : null,
            b.rating != null ? `Untappd rating ${b.rating.toFixed(2)} out of 5` : null,
            b.flagship ? "flagship beer" : null,
          ].filter(Boolean).join(", ");
          return (
            <li key={`${b.brewerySlug}::${b.name}`}>
              <button
                type="button"
                onClick={() => onOpen(b)}
                aria-label={label}
                className="flex h-full w-full flex-col overflow-hidden rounded-[var(--app-radius-md)] border bg-[var(--app-bg-elevated-solid)] text-left transition active:scale-[0.98]"
                style={{ borderColor: "var(--app-border)" }}
              >
                {/* The swatch — a pure band of the beer's real color. */}
                <span className="relative block w-full" style={{ height: 40, background: color }} aria-hidden>
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
                <span className="flex flex-1 flex-col gap-0.5 p-2">
                  <span className="flex items-start gap-1">
                    {b.flagship && <Star className="mt-[3px] h-2.5 w-2.5 shrink-0 text-[var(--app-amber-text)]" strokeWidth={2} fill="currentColor" aria-label="Flagship" />}
                    <span className="line-clamp-1 font-sans text-[13.5px] font-semibold leading-tight text-[var(--app-ink)]">{b.name}</span>
                  </span>
                  <span className="mt-auto flex flex-col">
                    <span className="truncate text-[11px] font-semibold text-[var(--app-amber-text)]">{b.breweryName}</span>
                    <span className="truncate font-mono text-[9.5px] uppercase tracking-[0.06em] text-[var(--app-ink-3)]">
                      {b.style}
                      {b.abv != null && ` · ${b.abv.toFixed(1)}%`}
                    </span>
                  </span>
                </span>
              </button>
            </li>
          );
        })}
      </ul>
  );
}
