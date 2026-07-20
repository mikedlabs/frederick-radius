"use client";

import { useMemo, useState } from "react";
import { Search, Star, X, ArrowUpDown } from "lucide-react";
import { ALL_BEERS, STYLE_FAMILIES, type StyleFamily, type BeerWithBrewery } from "@/data/beers";
import {
  EMPTY_BEER_FILTER,
  isEmptyBeerFilter,
  queryBeers,
  type BeerFilter,
  type BeerSort,
} from "@/lib/beer/beer-index";
import { FIELD_ABV_BANDS } from "@/lib/beer/flavor-field";
import BeerMosaic from "@/components/beer/BeerMosaic";
import BeerSheet from "@/components/beer/BeerSheet";
import type { BreweryPhotoMap } from "@/components/beer/BreweryPhoto";

/**
 * The Frederick Beer Index — the /beer page's real tool. The hero is the
 * beer-color mosaic (BeerMosaic): every pour a tile in its own color, the wall
 * sorted light to dark. Family + strength chips, search, and sort drive it;
 * tapping a tile opens the beer. One colorful catalog, no abstract chart and no
 * endless row list (the two things the owner asked to be rid of).
 *
 * All client state; the query engine (lib/beer/beer-index) and the color map
 * (lib/beer/beer-color) are pure + tested. Palette matches the /beer ground
 * (#f5eee2 / #281e14 / #85501f).
 */

const SORTS: { key: BeerSort; label: string }[] = [
  { key: "mix", label: "Mosaic" },
  { key: "color", label: "By color" },
  { key: "rating", label: "Top rated" },
  { key: "abv-desc", label: "Strongest" },
  { key: "abv-asc", label: "Lightest" },
  { key: "name", label: "A–Z" },
];

const FAMILY_COUNTS = new Map<StyleFamily, number>();
for (const b of ALL_BEERS) FAMILY_COUNTS.set(b.family, (FAMILY_COUNTS.get(b.family) ?? 0) + 1);

export default function BeerIndex({ photos = {} }: { photos?: BreweryPhotoMap }) {
  const [filter, setFilter] = useState<BeerFilter>(EMPTY_BEER_FILTER);
  const [sort, setSort] = useState<BeerSort>("mix");
  const [openBeer, setOpenBeer] = useState<BeerWithBrewery | null>(null);

  const results = useMemo(() => queryBeers(filter, sort), [filter, sort]);
  const active = !isEmptyBeerFilter(filter);

  const toggleFamily = (key: StyleFamily) =>
    setFilter((f) => ({
      ...f,
      families: f.families.includes(key) ? f.families.filter((k) => k !== key) : [...f.families, key],
    }));
  const activeBand = FIELD_ABV_BANDS.find((b) => b.min === filter.minAbv && b.max === filter.maxAbv);
  const toggleBand = (band: (typeof FIELD_ABV_BANDS)[number]) =>
    setFilter((f) =>
      activeBand?.key === band.key
        ? { ...f, minAbv: null, maxAbv: null }
        : { ...f, minAbv: band.min, maxAbv: band.max },
    );
  const patch = (p: Partial<BeerFilter>) => setFilter((f) => ({ ...f, ...p }));
  const clearAll = () => setFilter(EMPTY_BEER_FILTER);

  return (
    <section id="beer-index" className="scroll-mt-20 text-[#281e14]">
      <div className="flex items-end justify-between gap-3 px-0.5">
        <div>
          <p className="font-mono text-[10px] font-bold uppercase tracking-[0.16em] text-[#85501f]">Every pour, by color</p>
          <h2 className="mt-1 font-serif text-[22px] font-semibold leading-tight tracking-[-0.02em]">
            The county in a glass
          </h2>
        </div>
        <span className="shrink-0 pb-1 font-mono text-[11px] tabular-nums text-[#6b5a45]">
          {results.length} of {ALL_BEERS.length}
        </span>
      </div>

      {/* Family filter — colored chips, one per style family. */}
      <div className="mt-3 flex gap-1.5 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {STYLE_FAMILIES.map((fam) => {
          const on = filter.families.includes(fam.key);
          return (
            <button
              key={fam.key}
              type="button"
              onClick={() => toggleFamily(fam.key)}
              aria-pressed={on}
              className="inline-flex min-h-9 shrink-0 items-center gap-1.5 rounded-full px-3 text-[12px] font-semibold transition"
              style={
                on
                  ? { background: fam.deep, color: "#fffaf2" }
                  : { border: "1px solid rgba(0,0,0,0.15)", background: "#faf5ea", color: "#4a3a28" }
              }
            >
              <span aria-hidden className="h-2 w-2 rounded-full" style={{ background: on ? "#fffaf2" : fam.base }} />
              {fam.label}
              <span className="font-mono text-[10px] tabular-nums" style={{ color: on ? "#f0e6d0" : "#4a3a28" }}>{FAMILY_COUNTS.get(fam.key) ?? 0}</span>
            </button>
          );
        })}
      </div>

      {/* Search + sort */}
      <div className="mt-2 flex flex-col gap-2 sm:flex-row sm:items-center">
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
        <div className="flex items-center gap-1.5 overflow-x-auto pb-0.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
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

      {/* Strength + rating + flagship */}
      <div className="mt-2 flex flex-wrap items-center gap-1.5">
        {FIELD_ABV_BANDS.map((b) => {
          const on = activeBand?.key === b.key;
          return (
            <button
              key={b.key}
              type="button"
              onClick={() => toggleBand(b)}
              aria-pressed={on}
              className={`min-h-9 rounded-full px-3 text-[12px] font-semibold transition ${
                on ? "bg-[#5e3a15] text-[#fffaf2]" : "border border-black/15 bg-[#faf5ea] text-black/62"
              }`}
            >
              {b.label}
            </button>
          );
        })}
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

      {/* The mosaic — every beer a tile in its own color. */}
      <div className="mt-4">
        <BeerMosaic beers={results} onOpen={setOpenBeer} />
      </div>

      <BeerSheet
        beer={openBeer}
        photo={openBeer ? photos[openBeer.brewerySlug] ?? null : null}
        onClose={() => setOpenBeer(null)}
      />
    </section>
  );
}
