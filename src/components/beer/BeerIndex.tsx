"use client";

import { useMemo, useState } from "react";
import { Search, Star, X, ArrowUpDown } from "lucide-react";
import { ALL_BEERS, STYLE_FAMILIES, FAMILY_BY_KEY, type StyleFamily } from "@/data/beers";
import {
  EMPTY_BEER_FILTER,
  isEmptyBeerFilter,
  queryBeers,
  familyFacetCounts,
  type BeerFilter,
  type BeerSort,
} from "@/lib/beer/beer-index";

/**
 * The Frederick Beer Index — the /beer page's real tool. Every one of the
 * county's 174 signature pours in one filterable, sortable board: filter by
 * style family (live facet counts), ABV band, Untappd rating, and free text;
 * sort by rating, strength, or name. The magazine sections above are for
 * browsing; this is for answering "the highest-rated stouts under 7%."
 *
 * All client state; the query engine (lib/beer/beer-index) is pure + tested.
 * Palette matches the /beer page's warm ground (#f5eee2 / #281e14 / #85501f);
 * each beer wears its style family's data-viz color.
 */

const SORTS: { key: BeerSort; label: string }[] = [
  { key: "rating", label: "Top rated" },
  { key: "abv-desc", label: "Strongest" },
  { key: "abv-asc", label: "Lightest" },
  { key: "name", label: "A–Z" },
];

/** ABV bands a drinker actually thinks in. */
const ABV_BANDS: { key: string; label: string; min: number | null; max: number | null }[] = [
  { key: "session", label: "Under 5%", min: null, max: 4.99 },
  { key: "standard", label: "5 to 7%", min: 5, max: 7 },
  { key: "strong", label: "7% and up", min: 7, max: null },
];

function ratingTone(rating: number | null): { bg: string; fg: string } {
  // fg colors clear WCAG AA (4.5:1) for small text on their own bg — the NR /
  // low-rating chips can surface under filters even if the top-rated default
  // view shows none (UX gate, 2026-07).
  if (rating == null) return { bg: "#ece3d2", fg: "#6b5a45" };
  if (rating >= 4.0) return { bg: "#382517", fg: "#f7d98a" }; // top shelf: dark w/ gold
  if (rating >= 3.7) return { bg: "#e7d9bf", fg: "#4f3211" };
  return { bg: "#ece3d2", fg: "#5e3a15" };
}

export default function BeerIndex() {
  const [filter, setFilter] = useState<BeerFilter>(EMPTY_BEER_FILTER);
  const [sort, setSort] = useState<BeerSort>("rating");
  const [limit, setLimit] = useState(40);

  const results = useMemo(() => queryBeers(filter, sort), [filter, sort]);
  const facets = useMemo(() => familyFacetCounts(filter), [filter]);
  const active = !isEmptyBeerFilter(filter);
  const shown = results.slice(0, limit);

  const toggleFamily = (key: StyleFamily) => {
    setLimit(40);
    setFilter((f) => ({
      ...f,
      families: f.families.includes(key) ? f.families.filter((k) => k !== key) : [...f.families, key],
    }));
  };
  const activeBand = ABV_BANDS.find((b) => b.min === filter.minAbv && b.max === filter.maxAbv);
  const toggleBand = (band: (typeof ABV_BANDS)[number]) => {
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

  return (
    <section id="beer-index" className="scroll-mt-20 text-[#281e14]">
      <header className="px-0.5">
        <p className="font-mono text-[10px] font-bold uppercase tracking-[0.16em] text-[#85501f]">The index</p>
        <div className="mt-1 flex items-end justify-between gap-3">
          <h2 className="font-serif text-[28px] font-semibold leading-none tracking-[-0.03em] sm:text-[34px]">
            Every pour in the county
          </h2>
          <span className="shrink-0 pb-1 font-mono text-[11px] tabular-nums text-black/55">
            {results.length} of {ALL_BEERS.length}
          </span>
        </div>
      </header>

      {/* Search + sort */}
      <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:items-center">
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

      {/* Style family facets */}
      <div className="mt-3 flex gap-1.5 overflow-x-auto pb-1 [scrollbar-width:none]">
        {STYLE_FAMILIES.map((fam) => {
          const count = facets[fam.key] ?? 0;
          const on = filter.families.includes(fam.key);
          const disabled = count === 0 && !on;
          return (
            <button
              key={fam.key}
              type="button"
              onClick={() => toggleFamily(fam.key)}
              aria-pressed={on}
              disabled={disabled}
              className={`flex min-h-9 shrink-0 items-center gap-1.5 rounded-full border px-3 text-[12px] font-semibold transition ${
                on ? "border-transparent text-white" : "border-black/15 bg-[#faf5ea] text-black/70"
              } ${disabled ? "opacity-35" : ""}`}
              style={on ? { background: fam.deep } : undefined}
            >
              <span aria-hidden className="h-2 w-2 shrink-0 rounded-full" style={{ background: on ? "rgba(255,255,255,0.85)" : fam.base }} />
              {fam.label}
              <span className={`font-mono text-[10px] tabular-nums ${on ? "text-white/85" : "text-black/70"}`}>{count}</span>
            </button>
          );
        })}
      </div>

      {/* ABV bands + rating + flagship */}
      <div className="mt-2 flex flex-wrap items-center gap-1.5">
        {ABV_BANDS.map((band) => (
          <button
            key={band.key}
            type="button"
            onClick={() => toggleBand(band)}
            aria-pressed={activeBand?.key === band.key}
            className={`min-h-9 rounded-full px-3 text-[12px] font-semibold transition ${
              activeBand?.key === band.key ? "bg-[#5e3a15] text-[#fffaf2]" : "border border-black/15 bg-[#faf5ea] text-black/62"
            }`}
          >
            {band.label}
          </button>
        ))}
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
            onClick={() => { setFilter(EMPTY_BEER_FILTER); setLimit(40); }}
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
            const href = b.untappd ?? `/places/${b.brewerySlug}`;
            const external = Boolean(b.untappd);
            return (
              <li key={`${b.brewerySlug}::${b.name}`} className="border-b border-black/8 last:border-b-0">
                <a
                  href={href}
                  {...(external ? { target: "_blank", rel: "noopener noreferrer" } : {})}
                  className="flex items-center gap-3 px-3 py-3 transition hover:bg-[#f2e9d8]"
                >
                  {/* rating chip */}
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
                    {external && <span className="mt-0.5 block font-mono text-[9px] uppercase tracking-[0.1em] text-[#85501f]">Untappd ↗</span>}
                  </span>
                </a>
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
    </section>
  );
}
