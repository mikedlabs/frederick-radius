"use client";

import { useMemo, useState } from "react";
import {
  ArrowUpDown,
  ChevronDown,
  Search,
  SlidersHorizontal,
  Star,
  X,
} from "lucide-react";
import {
  ALL_BEERS,
  BEER_SNAPSHOT_MONTH,
  STYLE_FAMILIES,
  type StyleFamily,
  type BeerWithBrewery,
} from "@/data/beers";
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
import BottomDrawer from "@/components/ui/BottomDrawer";
import type { BreweryPhotoMap } from "@/components/beer/BreweryPhoto";

/**
 * The Frederick Beer Index — the /beer page's real tool. The hero is the
 * beer-color mosaic (BeerMosaic): every pour a tile in its own color, the wall
 * sorted light to dark. Family + strength chips, search, and sort drive it;
 * tapping a tile opens the beer. One colorful catalog, no abstract chart and no
 * endless row list (the two things the owner asked to be rid of).
 *
 * All client state; the query engine (lib/beer/beer-index) and the color map
 * (lib/beer/beer-color) are pure + tested. The surrounding controls use the
 * Warm Civic paper, Ink, and beer-specific Ochre roles.
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
  const [expanded, setExpanded] = useState(false);
  const [filtersOpen, setFiltersOpen] = useState(false);

  const results = useMemo(() => queryBeers(filter, sort), [filter, sort]);
  const active = !isEmptyBeerFilter(filter);

  // The mosaic is a taste of the color wall, not the whole 174-deep scroll —
  // capped so the sections below (breweries, taproom events, the map) stay
  // reachable without a marathon (owner ask). One tap opens the full wall;
  // a narrow filter that already fits shows everything with no button.
  const COLLAPSED_COUNT = 10;
  const capped = !expanded && results.length > COLLAPSED_COUNT;
  const shown = capped ? results.slice(0, COLLAPSED_COUNT) : results;

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
  const activeFilterCount =
    filter.families.length +
    (activeBand ? 1 : 0) +
    (filter.minRating != null ? 1 : 0) +
    (filter.flagshipOnly ? 1 : 0);
  const sortLabel = SORTS.find((option) => option.key === sort)?.label ?? "Mosaic";

  return (
    <section id="beer-index" className="scroll-mt-20 text-[var(--app-ink)]">
      <div className="flex items-end justify-between gap-3 px-0.5">
        <div>
          <p className="font-mono text-[10px] font-bold uppercase tracking-[0.16em] text-[var(--app-amber-text)]">{BEER_SNAPSHOT_MONTH} signature beer snapshot</p>
          <h2 className="mt-1 font-serif text-[22px] leading-tight tracking-[-0.02em]">
            Frederick County beer index
          </h2>
        </div>
        <span role="status" aria-live="polite" aria-atomic="true" className="shrink-0 pb-1 font-mono text-[11px] tabular-nums text-[var(--app-ink-3)]">
          {capped
            ? `Showing ${shown.length} of ${results.length}`
            : active
              ? `${results.length} ${results.length === 1 ? "match" : "matches"}`
              : `${results.length} beers`}
        </span>
      </div>

      {/* Search stays visible. Lower-frequency taste, strength, and sort
          controls live in one drawer so the catalog opens on the beers rather
          than four rows of controls. Active choices remain visible as a count
          and the current sort label. */}
      <div className="mt-3 flex items-center gap-2">
        <div
          className="flex min-h-11 min-w-0 flex-1 items-center gap-2 rounded-full border px-4"
          style={{ borderColor: "var(--app-border-strong)", background: "var(--app-bg-elevated-solid)" }}
        >
          <Search className="h-4 w-4 shrink-0" style={{ color: "var(--app-brand-press)" }} strokeWidth={2.2} aria-hidden />
          <input
            type="search"
            value={filter.q}
            onChange={(e) => patch({ q: e.target.value })}
            placeholder={`Search ${ALL_BEERS.length} beers, breweries, or flavors`}
            aria-label="Search the beer index"
            // self-stretch so the whole 44px pill is the tap target, not a
            // dead-band sandwich around a 20px input line.
            className="min-w-0 flex-1 self-stretch bg-transparent text-[14px] outline-none placeholder:text-[var(--app-ink-3)]"
            style={{ color: "var(--app-ink)" }}
          />
          {filter.q && (
            <button type="button" onClick={() => patch({ q: "" })} aria-label="Clear search" className="tap-44" style={{ color: "var(--app-ink-3)" }}>
              <X className="h-4 w-4" strokeWidth={2.4} aria-hidden />
            </button>
          )}
        </div>
        <button
          type="button"
          onClick={() => setFiltersOpen(true)}
          aria-label={activeFilterCount > 0 ? `Filters, ${activeFilterCount} active` : "Filter and sort beers"}
          className="tap-44 inline-flex min-h-11 shrink-0 items-center gap-1.5 rounded-full border px-3 text-[12px] font-semibold"
          style={{ borderColor: "var(--app-border-strong)", background: "var(--app-bg-elevated-solid)", color: "var(--app-ink)" }}
        >
          <SlidersHorizontal className="h-4 w-4" strokeWidth={2.2} aria-hidden />
          Filters{activeFilterCount > 0 ? ` ${activeFilterCount}` : ""}
        </button>
      </div>
      <div className="mt-2 flex min-h-6 items-center justify-between gap-3 px-1 font-mono text-[10px] tabular-nums" style={{ color: "var(--app-ink-3)" }}>
        <span>Sorted: {sortLabel}</span>
        {active ? (
          <button type="button" onClick={clearAll} className="tap-44-y inline-flex items-center gap-1 font-sans text-[11px] font-semibold" style={{ color: "var(--app-brand-press)" }}>
            <X className="h-3.5 w-3.5" strokeWidth={2.4} aria-hidden />
            Clear filters
          </button>
        ) : null}
      </div>

      <BottomDrawer
        open={filtersOpen}
        onOpenChange={setFiltersOpen}
        title="Filter and sort beers"
        subtitle={`${results.length} ${results.length === 1 ? "beer matches" : "beers match"} these choices.`}
      >
        <div className="space-y-6 px-4 py-5">
          <fieldset>
            <legend className="font-serif text-[18px] font-semibold" style={{ color: "var(--app-ink)" }}>Taste</legend>
            <div className="mt-3 flex flex-wrap gap-2">
              {STYLE_FAMILIES.map((fam) => {
                const on = filter.families.includes(fam.key);
                return (
                  <button
                    key={fam.key}
                    type="button"
                    onClick={() => toggleFamily(fam.key)}
                    aria-pressed={on}
                    className="inline-flex min-h-11 items-center gap-1.5 rounded-full border px-3 text-[12px] font-semibold transition"
                    style={{
                      borderColor: on ? fam.deep : "var(--app-border)",
                      background: on ? fam.deep : "var(--app-bg-elevated-solid)",
                      color: on ? "var(--app-on-brand)" : "var(--app-ink)",
                    }}
                  >
                    <span aria-hidden className="h-2 w-2 rounded-full" style={{ background: on ? "currentColor" : fam.base }} />
                    {fam.label}
                    <span className="font-mono text-[10px] tabular-nums opacity-75">{FAMILY_COUNTS.get(fam.key) ?? 0}</span>
                  </button>
                );
              })}
            </div>
          </fieldset>

          <fieldset>
            <legend className="font-serif text-[18px] font-semibold" style={{ color: "var(--app-ink)" }}>Strength and type</legend>
            <div className="mt-3 flex flex-wrap gap-2">
              {FIELD_ABV_BANDS.map((band) => {
                const on = activeBand?.key === band.key;
                return (
                  <button
                    key={band.key}
                    type="button"
                    onClick={() => toggleBand(band)}
                    aria-pressed={on}
                    className="min-h-11 rounded-full border px-3 text-[12px] font-semibold"
                    style={{
                      borderColor: on ? "var(--app-brand-press)" : "var(--app-border)",
                      background: on ? "var(--app-brand-press)" : "var(--app-bg-elevated-solid)",
                      color: on ? "var(--app-on-brand)" : "var(--app-ink)",
                    }}
                  >
                    {band.label}
                  </button>
                );
              })}
              <button
                type="button"
                onClick={() => patch({ minRating: filter.minRating === 4 ? null : 4 })}
                aria-pressed={filter.minRating === 4}
                className="inline-flex min-h-11 items-center gap-1 rounded-full border px-3 text-[12px] font-semibold"
                style={{
                  borderColor: filter.minRating === 4 ? "var(--app-brand-press)" : "var(--app-border)",
                  background: filter.minRating === 4 ? "var(--app-brand-press)" : "var(--app-bg-elevated-solid)",
                  color: filter.minRating === 4 ? "var(--app-on-brand)" : "var(--app-ink)",
                }}
              >
                <Star className="h-3.5 w-3.5" fill="currentColor" aria-hidden />
                Rated 4.0+
              </button>
              <button
                type="button"
                onClick={() => patch({ flagshipOnly: !filter.flagshipOnly })}
                aria-pressed={filter.flagshipOnly}
                className="min-h-11 rounded-full border px-3 text-[12px] font-semibold"
                style={{
                  borderColor: filter.flagshipOnly ? "var(--app-brand-press)" : "var(--app-border)",
                  background: filter.flagshipOnly ? "var(--app-brand-press)" : "var(--app-bg-elevated-solid)",
                  color: filter.flagshipOnly ? "var(--app-on-brand)" : "var(--app-ink)",
                }}
              >
                Flagships
              </button>
            </div>
          </fieldset>

          <fieldset>
            <legend className="flex items-center gap-2 font-serif text-[18px] font-semibold" style={{ color: "var(--app-ink)" }}>
              <ArrowUpDown className="h-4 w-4" aria-hidden />
              Sort
            </legend>
            <div className="mt-3 grid grid-cols-2 gap-2">
              {SORTS.map((option) => (
                <button
                  key={option.key}
                  type="button"
                  onClick={() => setSort(option.key)}
                  aria-pressed={sort === option.key}
                  aria-label={option.key === "rating" ? "Sort by Untappd rating" : undefined}
                  className="min-h-11 rounded-[var(--app-radius-sm)] border px-3 text-left text-[12px] font-semibold"
                  style={{
                    borderColor: sort === option.key ? "var(--app-brand-press)" : "var(--app-border)",
                    background: sort === option.key ? "var(--app-brand-tint-8)" : "var(--app-bg-elevated-solid)",
                    color: "var(--app-ink)",
                  }}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </fieldset>

          <div className="sticky bottom-0 -mx-4 flex items-center gap-2 border-t px-4 pt-4" style={{ borderColor: "var(--app-border)", background: "var(--app-bg-elevated)" }}>
            {activeFilterCount > 0 ? (
              <button type="button" onClick={clearAll} className="tap-44 min-h-11 px-3 text-[12px] font-semibold" style={{ color: "var(--app-ink-2)" }}>
                Clear
              </button>
            ) : null}
            <button
              type="button"
              onClick={() => setFiltersOpen(false)}
              className="min-h-11 flex-1 rounded-full px-4 text-[13px] font-semibold"
              style={{ background: "var(--app-brand-press)", color: "var(--app-on-brand)" }}
            >
              Show {results.length} {results.length === 1 ? "beer" : "beers"}
            </button>
          </div>
        </div>
      </BottomDrawer>

      {/* The mosaic — every beer a tile in its own color. Capped by default so
          the wall reads as a taste, not an endless scroll; the fade + button
          reveal the rest inline. */}
      <div id="beer-index-results" className="relative mt-4">
        <BeerMosaic beers={shown} onOpen={setOpenBeer} />
        {capped && (
          <div
            aria-hidden
            className="pointer-events-none absolute inset-x-0 bottom-0 h-20 bg-gradient-to-t from-[var(--app-bg)] to-transparent"
          />
        )}
      </div>
      {results.length > COLLAPSED_COUNT && (
        <div className="mt-3 flex justify-center">
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            aria-expanded={expanded}
            aria-controls="beer-index-results"
            className="inline-flex min-h-11 items-center gap-1.5 rounded-full border bg-[var(--app-bg-elevated-solid)] px-5 text-[13px] font-semibold text-[var(--app-ink)] transition active:scale-[0.97]"
            style={{ borderColor: "var(--app-control-border)" }}
          >
            {expanded ? "Show fewer" : `Show all ${results.length}`}
            <ChevronDown
              className={`h-4 w-4 transition-transform ${expanded ? "rotate-180" : ""}`}
              strokeWidth={2.4}
              aria-hidden
            />
          </button>
        </div>
      )}

      <BeerSheet
        beer={openBeer}
        photo={openBeer ? photos[openBeer.brewerySlug] ?? null : null}
        onClose={() => setOpenBeer(null)}
      />
    </section>
  );
}
