"use client";

import { useEffect, useMemo, useState } from "react";
import { SlidersHorizontal } from "lucide-react";
import PlaceCard from "./PlaceCard";
import FilterChip from "@/components/ui/FilterChip";
import { haptic } from "@/lib/haptics";
// TYPE ONLY: importing the places loader at runtime drags the large
// enrichment JSON into the client bundle. Places arrive already
// decorated from the server page, exactly as RadiusBuilder does it.
import type { PlaceCardData } from "@/lib/loaders/places";
import { CATEGORY_BY_SLUG } from "@/data/categories";
import { MUNICIPALITY_BY_SLUG } from "@/data/municipalities";

/**
 * PlaceBrowser — the one way a long place list is made findable.
 *
 * The data-heavy surfaces (category pages, search) used to dump every
 * match into a single uncapped list, which is the "overwhelming" wall.
 * This wraps any decorated place list in a consistent, calm refine
 * system: sort, an Open-now toggle, a Town filter, Type facets derived
 * from the actual contents (so a choice never holds zero), a live
 * count, progressive disclosure (a page at a time, never a wall), and
 * a composed empty state. One component, applied everywhere, so the
 * flow is identical no matter where you are.
 */

type SortMode = "near" | "rated" | "az";
const SORT_KEY = "fr:browse:sort:v1";
const PAGE = 24;

const SELECT_CLS =
  "h-8 shrink-0 appearance-none rounded-full border bg-[var(--app-bg-elevated)] pl-3 pr-7 text-[12px] font-medium outline-none focus-visible:ring-2 focus-visible:ring-[var(--app-brand)]";
const CARET =
  "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%23685F50' stroke-width='2.5' stroke-linecap='round'%3E%3Cpath d='M6 9l6 6 6-6'/%3E%3C/svg%3E\")";
const selectStyle = {
  borderColor: "var(--app-border)",
  color: "var(--app-ink-2)",
  backgroundImage: CARET,
  backgroundRepeat: "no-repeat",
  backgroundPosition: "right 9px center",
} as const;

export default function PlaceBrowser({
  places,
  emptyHint = "Try a different filter, or widen the area.",
}: {
  places: PlaceCardData[];
  emptyHint?: string;
}) {
  const [sort, setSort] = useState<SortMode>("near");
  const [openOnly, setOpenOnly] = useState(false);
  const [town, setTown] = useState<string | null>(null);
  const [type, setType] = useState<string | null>(null);
  const [limit, setLimit] = useState(PAGE);

  // SSR-safe persisted sort, same pattern as RadiusBuilder.
  useEffect(() => {
    try {
      const s = localStorage.getItem(SORT_KEY);
      // eslint-disable-next-line react-hooks/set-state-in-effect -- SSR-safe: server renders the default, the stored preference is applied after mount (localStorage is unavailable during SSR)
      if (s === "near" || s === "rated" || s === "az") setSort(s);
    } catch {
      /* private mode */
    }
  }, []);
  // Every refinement returns the result to its first page, set in the
  // handler (not an effect) so there is no cascading-render hazard.
  const chooseSort = (s: SortMode) => {
    setSort(s);
    setLimit(PAGE);
    try {
      localStorage.setItem(SORT_KEY, s);
    } catch {
      /* ignore */
    }
  };
  const setOpen = (v: boolean) => {
    setOpenOnly(v);
    setLimit(PAGE);
  };
  const chooseTown = (v: string | null) => {
    setTown(v);
    setLimit(PAGE);
  };
  const chooseType = (v: string | null) => {
    setType(v);
    setLimit(PAGE);
  };

  // Facets are built from what is actually in the list, with counts,
  // so a filter never leads to an empty result by itself.
  const townFacets = useMemo(() => {
    const m = new Map<string, number>();
    for (const p of places)
      if (p.municipality) m.set(p.municipality, (m.get(p.municipality) ?? 0) + 1);
    return [...m.entries()]
      .map(([slug, count]) => ({
        slug,
        count,
        name: MUNICIPALITY_BY_SLUG[slug]?.name ?? slug,
      }))
      .sort((a, b) => b.count - a.count);
  }, [places]);

  const typeFacets = useMemo(() => {
    const m = new Map<string, number>();
    for (const p of places)
      if (p.category) m.set(p.category, (m.get(p.category) ?? 0) + 1);
    return [...m.entries()]
      .map(([slug, count]) => ({
        slug,
        count,
        name: CATEGORY_BY_SLUG[slug]?.name ?? slug,
      }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 8);
  }, [places]);

  const filtered = useMemo(() => {
    let r = places;
    if (openOnly)
      r = r.filter(
        (p) =>
          p.open_status.state === "open" ||
          p.open_status.state === "closing-soon",
      );
    if (town) r = r.filter((p) => p.municipality === town);
    if (type) r = r.filter((p) => p.category === type);
    const arr = [...r];
    if (sort === "near")
      arr.sort((a, b) => (a.distance_m ?? Infinity) - (b.distance_m ?? Infinity));
    else if (sort === "az") arr.sort((a, b) => a.name.localeCompare(b.name));
    else
      arr.sort((a, b) => {
        const ra = (a.google_rating_count ?? 0) >= 20 ? a.google_rating ?? 0 : 0;
        const rb = (b.google_rating_count ?? 0) >= 20 ? b.google_rating ?? 0 : 0;
        return rb - ra;
      });
    return arr;
  }, [places, openOnly, town, type, sort]);

  const shown = filtered.slice(0, limit);
  const hasFilters = Boolean(openOnly || town || type);
  const reset = () => {
    setOpenOnly(false);
    setTown(null);
    setType(null);
    setLimit(PAGE);
  };

  // Lean mode: a short list does not need (and is cheapened by) a
  // refine apparatus. Calm beats clever — just show the list.
  if (places.length <= 8) {
    return (
      <ul className="space-y-2">
        {places.map((p) => (
          <li key={p.slug}>
            <PlaceCard place={p} />
          </li>
        ))}
      </ul>
    );
  }

  return (
    <div className="space-y-3">
      {/* Refine bar — one calm row, wraps; never a hidden scroll. */}
      <div className="flex flex-wrap items-center gap-2">
        <select
          aria-label="Sort"
          value={sort}
          onChange={(e) => chooseSort(e.target.value as SortMode)}
          className={SELECT_CLS}
          style={selectStyle}
        >
          <option value="near">Nearest</option>
          <option value="rated">Top rated</option>
          <option value="az">A–Z</option>
        </select>

        {townFacets.length > 1 && (
          <select
            aria-label="Town"
            value={town ?? ""}
            onChange={(e) => chooseTown(e.target.value || null)}
            className={`${SELECT_CLS} max-w-[10.5rem] truncate`}
            style={selectStyle}
          >
            <option value="">All towns</option>
            {townFacets.map((t) => (
              <option key={t.slug} value={t.slug}>
                {t.name} ({t.count})
              </option>
            ))}
          </select>
        )}

        <FilterChip
          label="Open now"
          active={openOnly}
          onClick={() => setOpen(!openOnly)}
        />
      </div>

      {/* Type facets — only when the list is genuinely mixed. */}
      {typeFacets.length > 1 && (
        <div className="flex flex-wrap gap-1.5">
          <FilterChip label="All" active={!type} onClick={() => chooseType(null)} />
          {typeFacets.map((t) => (
            <FilterChip
              key={t.slug}
              label={t.name}
              count={t.count}
              active={type === t.slug}
              onClick={() => chooseType(type === t.slug ? null : t.slug)}
            />
          ))}
        </div>
      )}

      {/* Live count + a one-tap escape from any dead-end filter. */}
      <p className="flex items-center gap-2 text-[12px]" style={{ color: "var(--app-ink-3)" }}>
        <span className="tabular-nums">
          {filtered.length === places.length
            ? `${places.length} place${places.length === 1 ? "" : "s"}`
            : `${filtered.length} of ${places.length}`}
        </span>
        {hasFilters && (
          <button
            type="button"
            onClick={() => {
              haptic("light");
              reset();
            }}
            className="font-medium underline underline-offset-2"
            style={{ color: "var(--app-brand)" }}
          >
            Clear filters
          </button>
        )}
      </p>

      {filtered.length === 0 ? (
        <div className="flex flex-col items-center gap-2 rounded-[var(--app-radius-md)] bg-[var(--app-bg-sunken)] px-4 py-10 text-center">
          <span
            aria-hidden
            className="grid h-11 w-11 place-items-center rounded-full"
            style={{
              background: "color-mix(in srgb, var(--app-brand) 12%, transparent)",
              color: "var(--app-brand)",
            }}
          >
            <SlidersHorizontal className="h-5 w-5" strokeWidth={1.9} aria-hidden />
          </span>
          <p className="font-serif text-[16px] font-semibold" style={{ color: "var(--app-ink)" }}>
            Nothing matches those filters
          </p>
          <p className="max-w-xs text-[13px]" style={{ color: "var(--app-ink-3)" }}>
            {emptyHint}
          </p>
          {hasFilters && (
            <button
              type="button"
              onClick={() => {
                haptic("light");
                reset();
              }}
              className="mt-1 rounded-full px-4 py-2 text-[13px] font-semibold text-white"
              style={{ background: "var(--app-brand)" }}
            >
              Clear filters
            </button>
          )}
        </div>
      ) : (
        <>
          <ul className="space-y-2">
            {shown.map((p) => (
              <li key={p.slug}>
                <PlaceCard place={p} />
              </li>
            ))}
          </ul>
          {limit < filtered.length && (
            <button
              type="button"
              onClick={() => {
                haptic("light");
                setLimit((l) => l + PAGE * 2);
              }}
              className="tactile tactile-interactive w-full rounded-[var(--app-radius-md)] bg-[var(--app-bg-elevated)] py-3 text-[13px] font-semibold tracking-tight"
              style={{ color: "var(--app-ink)" }}
            >
              Show {Math.min(PAGE * 2, filtered.length - limit)} more
              <span className="ml-1 tabular-nums" style={{ color: "var(--app-ink-3)" }}>
                · {filtered.length - limit} left
              </span>
            </button>
          )}
        </>
      )}
    </div>
  );
}
