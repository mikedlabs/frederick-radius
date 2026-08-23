"use client";

import { useEffect, useMemo, useState } from "react";
import { LayoutGrid, List } from "lucide-react";
import PlaceCard from "./PlaceCard";
import SortDropdown, { type SortOption } from "@/components/ui/SortDropdown";
import FilterChip from "@/components/ui/FilterChip";
import type { PlaceCardData } from "@/lib/loaders/places";

/**
 * PlaceList — wraps a list of PlaceCards with a Grid / List toggle
 * and an A→Z / Rating / Distance / Most loved sort dropdown.
 *
 * Two browsing modes for the same data:
 *   - Grid: 2-up photo-forward tiles (visual; "I'm browsing")
 *   - List: dense single-row cards (scannable; "I'm looking for one")
 *
 * The layout choice persists in localStorage so a resident who prefers
 * scanning gets list everywhere, a visitor who likes pictures gets
 * grid everywhere. Each surface still chooses its initial default
 * (`initialLayout`) so first-load reads correctly without flicker.
 *
 * The sort choice is in-memory only (resetting per visit feels right
 * for a category/town page — the default sort is the editorial pick,
 * not something a returning user should be locked into). Default sort
 * is "score" (the server's feature_score order) so the page opens to
 * the same picks it always has; the dropdown is purely additive.
 *
 * Client component on purpose: the toggle is small + interactive,
 * and the pages that host it (/m/[town], /category/[slug]) stay
 * server components — only this island hydrates.
 */
export type PlaceSortKey = "score" | "az" | "rating" | "distance";

const SORT_OPTIONS: ReadonlyArray<SortOption<PlaceSortKey>> = [
  { key: "score", label: "Most loved", hint: "Editorial pick order (default)" },
  { key: "rating", label: "Top rated", hint: "Google rating, highest first" },
  { key: "az", label: "A→Z", hint: "Alphabetical by name" },
  { key: "distance", label: "Nearest", hint: "From the page's reference point" },
];

export default function PlaceList({
  places,
  initialLayout = "grid",
  emptyMessage,
  facetTags,
  pageSize = 24,
}: {
  places: PlaceCardData[];
  initialLayout?: "grid" | "list";
  emptyMessage?: string;
  /** Optional tag filter chips (slug + label). Toggling narrows the list to
   *  places carrying ALL selected tags. Surfaces shadow data (dog-friendly,
   *  outdoor, kid-friendly, …) as a real filter instead of buried metadata. */
  facetTags?: { slug: string; name: string }[];
  /** Initial and incremental result count. Keeping large categories paged
   *  prevents one expand action from loading every paid photo in the set. */
  pageSize?: number;
}) {
  const [layout, setLayout] = useState<"grid" | "list">(initialLayout);
  const [sort, setSort] = useState<PlaceSortKey>("score");
  const [activeFacets, setActiveFacets] = useState<ReadonlySet<string>>(new Set());
  const safePageSize = Math.max(1, Math.min(48, Math.floor(pageSize)));
  const [visibleCount, setVisibleCount] = useState(safePageSize);
  const [mounted, setMounted] = useState(false);

  // Sort the incoming places per the user's choice. "score" is the
  // identity sort (server already provides feature_score order); the
  // others are computed here so the rest of the pipeline stays
  // server-only.
  const sortedPlaces = useMemo(() => {
    if (sort === "score") return places;
    const copy = [...places];
    switch (sort) {
      case "az":
        copy.sort((a, b) =>
          a.name.localeCompare(b.name, undefined, { sensitivity: "base" }),
        );
        break;
      case "rating":
        copy.sort((a, b) => {
          const ra = a.google_rating ?? -1;
          const rb = b.google_rating ?? -1;
          if (ra !== rb) return rb - ra;
          // Tie-break by review count so a 4.8 with 500 reviews ranks
          // above a 4.8 with 3 reviews.
          return (b.google_rating_count ?? 0) - (a.google_rating_count ?? 0);
        });
        break;
      case "distance":
        copy.sort(
          (a, b) =>
            (a.distance_m ?? Infinity) - (b.distance_m ?? Infinity),
        );
        break;
    }
    return copy;
  }, [places, sort]);

  // Facet filtering: AND across selected tags (dog-friendly + outdoor = both).
  const filteredPlaces = useMemo(() => {
    if (activeFacets.size === 0) return sortedPlaces;
    return sortedPlaces.filter((p) => {
      const t = new Set(p.tags ?? []);
      for (const f of activeFacets) if (!t.has(f)) return false;
      return true;
    });
  }, [sortedPlaces, activeFacets]);
  const visiblePlaces = filteredPlaces.slice(0, visibleCount);

  // Filter out the "distance" option when no place has a distance_m
  // value — otherwise the dropdown would offer a sort that produces
  // the input order. Some pages (sitemap-driven category pages with
  // no origin) genuinely don't have distances and shouldn't show the
  // affordance. Computed BEFORE the empty-list early return so the
  // hook order stays stable across renders (rules-of-hooks).
  const sortOptions = useMemo(
    () =>
      places.some((p) => typeof p.distance_m === "number")
        ? SORT_OPTIONS
        : SORT_OPTIONS.filter((o) => o.key !== "distance"),
    [places],
  );

  // Read saved preference on mount. If absent, keep the page's
  // initialLayout (a city page defaults to grid, a category page
  // to list — the existing behavior is preserved).
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- canonical post-mount hydration of a localStorage preference; SSR can't read localStorage
    setMounted(true);
    try {
      const saved = window.localStorage.getItem(STORAGE_KEY);
      if (saved === "grid" || saved === "list") setLayout(saved);
    } catch {
      /* localStorage unavailable; stick with initial */
    }
  }, []);

  function setAndStore(next: "grid" | "list") {
    setLayout(next);
    try {
      window.localStorage.setItem(STORAGE_KEY, next);
    } catch {
      /* ignore */
    }
  }

  if (places.length === 0) {
    return emptyMessage ? (
      <p
        className="rounded-[var(--app-radius-md)] border border-dashed px-4 py-6 text-center text-sm"
        style={{
          borderColor: "var(--app-border)",
          color: "var(--app-ink-3)",
        }}
      >
        {emptyMessage}
      </p>
    ) : null;
  }

  function toggleFacet(slug: string) {
    setActiveFacets((prev) => {
      const next = new Set(prev);
      if (next.has(slug)) next.delete(slug);
      else next.add(slug);
      return next;
    });
  }

  return (
    <div className="space-y-2.5">
      {facetTags && facetTags.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {facetTags.map((f) => (
            <FilterChip
              key={f.slug}
              label={f.name}
              active={activeFacets.has(f.slug)}
              onClick={() => toggleFacet(f.slug)}
            />
          ))}
        </div>
      )}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-[11px]" style={{ color: "var(--app-ink-3)" }}>
          {filteredPlaces.length} {filteredPlaces.length === 1 ? "place" : "places"}
          {activeFacets.size > 0 ? ` of ${places.length}` : ""}
        </p>
        <div className="ml-auto flex items-center gap-2">
          <SortDropdown
            options={sortOptions}
            value={sort}
            onChange={setSort}
          />
          {/* Layout toggle. Hydration-safe: until mounted we render the
              initialLayout state, so the SSR pass and first client pass
              agree. Once mounted we resolve to any saved preference. */}
          <div
          className="inline-flex rounded-full border bg-[var(--app-bg-elevated)] p-0.5"
          style={{ borderColor: "var(--app-border)" }}
          role="radiogroup"
          aria-label="Layout"
        >
          <button
            type="button"
            onClick={() => setAndStore("grid")}
            role="radio"
            aria-checked={layout === "grid"}
            aria-label="Grid"
            title="Grid"
            className="tap-44 grid h-11 w-11 place-items-center rounded-full transition-colors"
            style={{
              background:
                layout === "grid"
                  ? "color-mix(in srgb, var(--app-brand) 16%, transparent)"
                  : "transparent",
              color:
                layout === "grid"
                  ? "var(--app-brand)"
                  : "var(--app-ink-3)",
            }}
          >
            <LayoutGrid className="h-3.5 w-3.5" strokeWidth={2.25} aria-hidden />
          </button>
          <button
            type="button"
            onClick={() => setAndStore("list")}
            role="radio"
            aria-checked={layout === "list"}
            aria-label="List"
            title="List"
            className="tap-44 grid h-11 w-11 place-items-center rounded-full transition-colors"
            style={{
              background:
                layout === "list"
                  ? "color-mix(in srgb, var(--app-brand) 16%, transparent)"
                  : "transparent",
              color:
                layout === "list"
                  ? "var(--app-brand)"
                  : "var(--app-ink-3)",
            }}
          >
            <List className="h-3.5 w-3.5" strokeWidth={2.25} aria-hidden />
          </button>
          </div>
        </div>
      </div>

      {filteredPlaces.length === 0 ? (
        // Honest empty state: facets narrowed the set to nothing. Without this
        // the grid/list below render blank under a "0 of N" count.
        <p
          className="rounded-[var(--app-radius-md)] border border-dashed px-4 py-6 text-center text-sm"
          style={{ borderColor: "var(--app-border)", color: "var(--app-ink-3)" }}
        >
          No places match those filters. Tap a filter again to widen the list.
        </p>
      ) : layout === "grid" ? (
        <div className="grid grid-cols-2 gap-2.5 md:grid-cols-3">
          {visiblePlaces.map((p) => (
            <PlaceCard key={p.slug} place={p} variant="grid" />
          ))}
        </div>
      ) : (
        <ul className="space-y-2" aria-busy={!mounted ? "true" : undefined}>
          {visiblePlaces.map((p) => (
            <li key={p.slug}>
              {/* compact=true drops the second metadata row (status +
                  rating + price) so the row reads tighter — list mode
                  is for scanning, not full-card detail. */}
              <PlaceCard place={p} variant="row" compact />
            </li>
          ))}
        </ul>
      )}
      {visibleCount < filteredPlaces.length && (
        <button
          type="button"
          onClick={() => setVisibleCount((count) => count + safePageSize)}
          className="tap-44 flex min-h-11 w-full items-center justify-center rounded-[var(--app-radius-sm)] border px-4 text-[12px] font-semibold transition-colors hover:bg-[var(--app-bg-sunken)]"
          style={{ borderColor: "var(--app-border)", color: "var(--app-brand-press)" }}
        >
          Show {Math.min(safePageSize, filteredPlaces.length - visibleCount)} more
        </button>
      )}
    </div>
  );
}

const STORAGE_KEY = "fr.places-layout";
