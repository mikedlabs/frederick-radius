"use client";

import { Search as SearchIcon, Navigation as NavIcon } from "lucide-react";
import type { SearchResult } from "@/lib/search/index";
import type { LngLat } from "@/lib/geo";

type SetState<T> = (updater: T | ((prev: T) => T)) => void;

/**
 * AppMapDeck — the search bar, and now ONLY the search bar.
 *
 * This used to be the whole accreted control surface: search + locate +
 * the Layers pill/badge + the active-filters chip strip + the Layers
 * drawer (places by type, lenses, overlays, the amenity sub-tray).
 * Everything except search moved into the map dock (MapDock.tsx) — one
 * card above the nav whose collapsed face is the What · When · Where
 * caption. Search stays at the top edge because search FINDS; the dock
 * FILTERS.
 *
 * The locate icon renders only when `goNearMe` is passed — dock-less
 * embeds (SavedList's map) keep it; /map's home for locate is the
 * dock's Where pane ("Find me"), so browse passes nothing here.
 */
export type AppMapDeckProps = {
  q: string;
  setQ: SetState<string>;
  searchMatches: SearchResult[];
  pickSearch: (r: SearchResult) => void;

  /** Locate-me in the bar — dock-less surfaces only. */
  goNearMe?: () => void;
  locating?: boolean;
  userLoc?: LngLat | null;
};

export default function AppMapDeck({
  q,
  setQ,
  searchMatches,
  pickSearch,
  goNearMe,
  locating = false,
  userLoc = null,
}: AppMapDeckProps) {
  return (
    <div className="pointer-events-none absolute inset-x-0 top-0 z-[var(--z-sticky)] px-2.5 pt-2.5 sm:px-3 sm:pt-3">
      <div className="pointer-events-auto mx-auto w-full max-w-[680px]">
        {/* Outer positioning context: the results dropdown is a SIBLING of
            the pill (not a child), so the pill's overflow-hidden — which it
            needs to clip the input's rounded corners — can't clip the
            dropdown that drops below it. */}
        <div className="relative">
          <div
            className="flex w-full items-center overflow-hidden rounded-full border backdrop-blur"
            style={{
              borderColor: "var(--app-border)",
              background: "color-mix(in srgb, var(--app-bg-elevated) 88%, transparent)",
              boxShadow: "var(--app-shadow-2)",
            }}
          >
            <SearchIcon
              aria-hidden
              className="ml-3.5 h-4 w-4 shrink-0"
              strokeWidth={2.25}
              style={{ color: "var(--app-ink-3)" }}
            />
            <input
              type="search"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Find coffee, a trail, a town"
              aria-label="Search this map"
              className="min-w-0 flex-1 bg-transparent px-2.5 py-3 text-sm outline-none"
              style={{ color: "var(--app-ink)" }}
            />
            {goNearMe && (
              <button
                type="button"
                onClick={goNearMe}
                aria-label="Find places near me"
                aria-busy={locating || undefined}
                title={locating ? "Locating…" : "Find places near me"}
                className="mr-1 inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full transition active:scale-[0.92]"
                style={{
                  color: userLoc ? "var(--app-brand)" : "var(--app-ink-2)",
                  background: userLoc
                    ? "color-mix(in srgb, var(--app-brand) 12%, transparent)"
                    : "transparent",
                }}
              >
                <NavIcon
                  className="h-4 w-4"
                  strokeWidth={userLoc ? 2.5 : 2}
                  fill={userLoc ? "currentColor" : "none"}
                  aria-hidden
                />
              </button>
            )}
          </div>
          {searchMatches.length > 0 && (
            <ul
              className="absolute inset-x-0 top-full z-[var(--z-dropdown)] mt-1.5 overflow-hidden rounded-[var(--app-radius-md)] border backdrop-blur"
              style={{
                borderColor: "var(--app-border)",
                background: "color-mix(in srgb, var(--app-bg-elevated) 92%, transparent)",
                boxShadow: "var(--app-shadow-3)",
              }}
            >
              {searchMatches.map((r) => {
                // Type-tinted dot so a town, event, or layer reads as a
                // different thing from a place at a glance.
                const dot =
                  r.type === "event" ? "var(--app-brand, #B5462B)"
                  : r.type === "municipality" ? "var(--app-cool, #5C8AA8)"
                  : r.type === "action" ? "var(--app-brand, #B5462B)"
                  : "var(--app-ink-3, #7A828C)";
                return (
                  <li key={r.id}>
                    <button
                      type="button"
                      onClick={() => pickSearch(r)}
                      className="flex w-full items-center gap-2.5 px-3.5 py-2.5 text-left transition hover:bg-[var(--app-bg-sunken)]"
                    >
                      <span aria-hidden className="h-2 w-2 shrink-0 rounded-full" style={{ background: dot }} />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium" style={{ color: "var(--app-ink)" }}>
                          {r.title}
                        </span>
                        <span className="block truncate text-[11px]" style={{ color: "var(--app-ink-3)" }}>
                          {r.subtitle}
                        </span>
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
