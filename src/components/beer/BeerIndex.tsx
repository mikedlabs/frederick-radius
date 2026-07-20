"use client";

import { useMemo, useState } from "react";
import { Search, Star, X, ArrowUpDown } from "lucide-react";
import { ALL_BEERS, FAMILY_BY_KEY, type StyleFamily, type BeerWithBrewery } from "@/data/beers";
import {
  EMPTY_BEER_FILTER,
  isEmptyBeerFilter,
  queryBeers,
  type BeerFilter,
  type BeerSort,
} from "@/lib/beer/beer-index";
import { FIELD_ABV_BANDS, type FlavorInsight } from "@/lib/beer/flavor-field";
import FlavorField from "@/components/beer/FlavorField";
import BeerSheet from "@/components/beer/BeerSheet";
import type { BreweryPhotoMap } from "@/components/beer/BreweryPhoto";

/**
 * The Frederick Beer Index — the /beer page's real tool, now led by the Flavor
 * Field chart. The chart IS the family/ABV filter (its rows and bands replaced
 * the old facet chip rows); this component owns the shared BeerFilter and
 * renders the chart + the pour list beneath it, so the two never disagree.
 *
 * All client state; the query engine (lib/beer/beer-index) and the chart layout
 * (lib/beer/flavor-field) are pure + tested. Palette matches the /beer ground
 * (#f5eee2 / #281e14 / #85501f); each beer wears its style family's viz color.
 */

const SORTS: { key: BeerSort; label: string }[] = [
  { key: "rating", label: "Top rated" },
  { key: "abv-desc", label: "Strongest" },
  { key: "abv-asc", label: "Lightest" },
  { key: "name", label: "A–Z" },
];

function ratingTone(rating: number | null): { bg: string; fg: string } {
  // fg colors clear WCAG AA (4.5:1) for small text on their own bg.
  if (rating == null) return { bg: "#ece3d2", fg: "#6b5a45" };
  if (rating >= 4.0) return { bg: "#382517", fg: "#f7d98a" }; // top shelf: dark w/ gold
  if (rating >= 3.7) return { bg: "#e7d9bf", fg: "#4f3211" };
  return { bg: "#ece3d2", fg: "#5e3a15" };
}

export default function BeerIndex({ photos = {} }: { photos?: BreweryPhotoMap }) {
  const [filter, setFilter] = useState<BeerFilter>(EMPTY_BEER_FILTER);
  const [sort, setSort] = useState<BeerSort>("rating");
  const [limit, setLimit] = useState(40);
  const [openBeer, setOpenBeer] = useState<BeerWithBrewery | null>(null);

  const results = useMemo(() => queryBeers(filter, sort), [filter, sort]);
  const active = !isEmptyBeerFilter(filter);
  const shown = results.slice(0, limit);

  const toggleFamily = (key: StyleFamily) => {
    setLimit(40);
    setFilter((f) => ({
      ...f,
      families: f.families.includes(key) ? f.families.filter((k) => k !== key) : [...f.families, key],
    }));
  };
  const activeBand = FIELD_ABV_BANDS.find((b) => b.min === filter.minAbv && b.max === filter.maxAbv);
  const toggleBand = (band: (typeof FIELD_ABV_BANDS)[number]) => {
    setLimit(40);
    setFilter((f) =>
      activeBand?.key === band.key
        ? { ...f, minAbv: null, maxAbv: null }
        : { ...f, minAbv: band.min, maxAbv: band.max },
    );
  };
  const patch = (p: Partial<BeerFilter>) => {
    setLimit(40);
    setFilter((f) => ({ ...f, ...p }));
  };
  const applyInsight = (insight: FlavorInsight) => {
    setLimit(40);
    setFilter((f) => ({
      ...f,
      families: insight.apply.families ?? [],
      minAbv: insight.apply.minAbv ?? null,
      maxAbv: insight.apply.maxAbv ?? null,
    }));
  };
  const clearAll = () => { setFilter(EMPTY_BEER_FILTER); setLimit(40); };

  return (
    <section id="beer-index" className="scroll-mt-20 text-[#281e14]">
      {/* Zone 2 — the Flavor Field IS the family/ABV filter control. */}
      <FlavorField
        families={filter.families}
        activeBandKey={activeBand?.key ?? null}
        onToggleFamily={toggleFamily}
        onToggleBand={toggleBand}
        onApplyInsight={applyInsight}
        onClear={clearAll}
        active={active}
      />

      {/* Zone 3 — the pour list the chart just filtered. */}
      <div className="mt-7">
        <div className="flex items-end justify-between gap-3 px-0.5">
          <p className="font-mono text-[10px] font-bold uppercase tracking-[0.16em] text-[#85501f]">The pour list</p>
          <span className="shrink-0 font-mono text-[11px] tabular-nums text-[#6b5a45]">
            {results.length} of {ALL_BEERS.length}
          </span>
        </div>

        {/* Search + sort */}
        <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-center">
          <div className="flex flex-1 items-center gap-2 rounded-full border border-black/15 bg-[#faf5ea] px-4 py-2.5">
            <Search className="h-4 w-4 shrink-0 text-[#85501f]" strokeWidth={2.2} aria-hidden />
            <input
              type="search"
              value={filter.q}
              onChange={(e) => patch({ q: e.target.value })}
              placeholder={`Search ${ALL_BEERS.length} beers, breweries, or flavors`}
              aria-label="Search the beer index"
              className="min-w-0 flex-1 bg-transparent text-[14px] text-[#281e14] outline-none placeholder:text-black/40"
            />
            {filter.q && (
              <button type="button" onClick={() => patch({ q: "" })} aria-label="Clear search" className="tap-44 text-black/45">
                <X className="h-4 w-4" strokeWidth={2.4} aria-hidden />
              </button>
            )}
          </div>
          <div className="flex items-center gap-1.5 overflow-x-auto pb-0.5 [scrollbar-width:none]">
            <ArrowUpDown className="h-3.5 w-3.5 shrink-0 text-black/40" strokeWidth={2} aria-hidden />
            {SORTS.map((s) => (
              <button
                key={s.key}
                type="button"
                onClick={() => setSort(s.key)}
                aria-pressed={sort === s.key}
                className={`min-h-9 shrink-0 rounded-full px-3 text-[12px] font-semibold transition ${
                  sort === s.key ? "bg-[#382517] text-[#fffaf2]" : "border border-black/15 bg-[#faf5ea] text-black/62"
                }`}
              >
                {s.label}
              </button>
            ))}
          </div>
        </div>

        {/* Rating + flagship (family + ABV now live in the chart above) */}
        <div className="mt-2 flex flex-wrap items-center gap-1.5">
          <button
            type="button"
            onClick={() => patch({ minRating: filter.minRating === 4.0 ? null : 4.0 })}
            aria-pressed={filter.minRating === 4.0}
            className={`inline-flex min-h-9 items-center gap-1 rounded-full px-3 text-[12px] font-semibold transition ${
              filter.minRating === 4.0 ? "bg-[#382517] text-[#f7d98a]" : "border border-black/15 bg-[#faf5ea] text-black/62"
            }`}
          >
            <Star className="h-3 w-3" strokeWidth={2.4} fill="currentColor" aria-hidden />
            4.0+ rated
          </button>
          <button
            type="button"
            onClick={() => patch({ flagshipOnly: !filter.flagshipOnly })}
            aria-pressed={filter.flagshipOnly}
            className={`min-h-9 rounded-full px-3 text-[12px] font-semibold transition ${
              filter.flagshipOnly ? "bg-[#382517] text-[#fffaf2]" : "border border-black/15 bg-[#faf5ea] text-black/62"
            }`}
          >
            Flagships
          </button>
          {active && (
            <button
              type="button"
              onClick={clearAll}
              className="inline-flex min-h-9 items-center gap-1 px-2 text-[12px] font-semibold text-[#a33a1e]"
            >
              <X className="h-3.5 w-3.5" strokeWidth={2.4} aria-hidden />
              Clear
            </button>
          )}
        </div>

        {/* Results */}
        {shown.length > 0 ? (
          <ul className="mt-4 overflow-hidden rounded-[14px] border border-black/12 bg-[#faf5ea]">
            {shown.map((b) => {
              const fam = FAMILY_BY_KEY[b.family];
              const tone = ratingTone(b.rating);
              return (
                <li key={`${b.brewerySlug}::${b.name}`} className="border-b border-black/8 last:border-b-0">
                  <button
                    type="button"
                    onClick={() => setOpenBeer(b)}
                    className="flex w-full items-center gap-3 px-3 py-3 text-left transition hover:bg-[#f2e9d8]"
                  >
                    <span
                      className="grid h-11 w-11 shrink-0 place-items-center rounded-[10px] font-mono text-[13px] font-bold tabular-nums"
                      style={{ background: tone.bg, color: tone.fg }}
                      aria-label={b.rating != null ? `Untappd rating ${b.rating.toFixed(2)}` : "Unrated"}
                    >
                      {b.rating != null ? b.rating.toFixed(2) : "NR"}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-1.5">
                        <span className="truncate font-serif text-[16px] font-semibold leading-tight text-[#281e14]">{b.name}</span>
                        {b.flagship && <Star className="h-3 w-3 shrink-0 text-[#c7841f]" strokeWidth={2} fill="currentColor" aria-label="Flagship" />}
                      </span>
                      <span className="mt-0.5 flex items-center gap-1.5 font-mono text-[10.5px] uppercase tracking-[0.04em] text-black/55">
                        <span aria-hidden className="h-1.5 w-1.5 rounded-full" style={{ background: fam.base }} />
                        <span className="truncate">{b.style}</span>
                        {b.abv != null && <span className="shrink-0">· {b.abv.toFixed(1)}%</span>}
                      </span>
                      <span className="mt-1 line-clamp-1 text-[12.5px] leading-snug text-black/62">{b.notes}</span>
                    </span>
                    <span className="shrink-0 text-right">
                      <span className="block max-w-[7.5rem] truncate text-[11.5px] font-semibold text-[#5e3a15]">{b.breweryName}</span>
                      <span className="mt-0.5 block font-mono text-[9px] uppercase tracking-[0.1em] text-[#85501f]">Details ›</span>
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        ) : (
          <div className="mt-4 rounded-[14px] border border-black/12 bg-[#faf5ea] px-4 py-10 text-center">
            <p className="font-serif text-[18px] font-semibold text-[#281e14]">No beers match those filters.</p>
            <p className="mt-1 text-[13px] text-black/55">Drop a filter to widen the search.</p>
          </div>
        )}

        {results.length > shown.length && (
          <button
            type="button"
            onClick={() => setLimit((n) => n + 40)}
            className="mt-3 flex min-h-11 w-full items-center justify-center rounded-full border border-black/15 bg-[#faf5ea] text-[13px] font-semibold text-[#5e3a15] transition hover:bg-[#f2e9d8]"
          >
            Show {Math.min(40, results.length - shown.length)} more of {results.length}
          </button>
        )}
      </div>

      <BeerSheet
        beer={openBeer}
        photo={openBeer ? photos[openBeer.brewerySlug] ?? null : null}
        onClose={() => setOpenBeer(null)}
      />
    </section>
  );
}
