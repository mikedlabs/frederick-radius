"use client";

import { Search as SearchIcon, Navigation as NavIcon, SlidersHorizontal, X, Clock } from "lucide-react";
import { usePathname, useSearchParams, useRouter } from "next/navigation";
import BottomDrawer from "@/components/ui/BottomDrawer";
import { CATEGORY_BY_SLUG, TOP_CATEGORIES } from "@/data/categories";
import type { PlaceCardData } from "@/lib/loaders/places";
import type { LngLat } from "@/lib/geo";
import { AMENITY_GROUPS, CHIP_GLYPH } from "./constants";
import type { CivicPin, MapLineFC } from "./types";

// Preview-only demo layers (Food Trucks / Radius Points / Live Transit)
// render sample data, not real coverage. OFF in production; set
// NEXT_PUBLIC_RADIUS_DEMO_LAYERS=1 to enable locally.
const SHOW_DEMO_LAYERS = process.env.NEXT_PUBLIC_RADIUS_DEMO_LAYERS === "1";

type SetState<T> = (updater: T | ((prev: T) => T)) => void;

/**
 * Props for the in-map control deck. All state is owned by AppMap; the
 * deck is a pure presentational layer that calls back into setters. That
 * keeps the deck testable in isolation and makes the prop list the deck's
 * full contract.
 *
 * The interface is wide because the deck is wide — search + locate-me +
 * filters + category chips + civic/transit/trails toggles + amenity sub-
 * tray. Splitting further would require lifting state up further (e.g.
 * to a context), which is a bigger change than this PR is for.
 */
export type AppMapDeckProps = {
  // Search.
  q: string;
  setQ: SetState<string>;
  searchMatches: PlaceCardData[];
  pickSearch: (p: PlaceCardData) => void;

  // Locate-me.
  goNearMe: () => void;
  locating: boolean;
  userLoc: LngLat | null;

  // Layers panel toggle + the chips/tray it reveals.
  filtersOpen: boolean;
  setFiltersOpen: SetState<boolean>;
  activeCats: Set<string>;
  setActiveCats: SetState<Set<string>>;

  amenityOpen: boolean;
  setAmenityOpen: SetState<boolean>;
  amenityGroups: Set<string>;
  setAmenityGroups: SetState<Set<string>>;
  amenityCount: number;
  activeAmenityGroupCount: number;

  // Counts used by the "All" chip and the active-filters badge.
  places: { length: number };
  trustedOsmCount: number;

  // Optional layer toggles — each chip renders only if the data exists.
  civic: CivicPin[];
  showCivic: boolean;
  setShowCivic: SetState<boolean>;

  transitLines: MapLineFC;
  showTransit: boolean;
  setShowTransit: SetState<boolean>;

  trailLines: MapLineFC;
  showTrails: boolean;
  setShowTrails: SetState<boolean>;

  // Aerial photo overlay — the Frederick Radius–only moat. 100+
  // georeferenced drone shots from the user's seasonal archive
  // plotted on the map; off until the user opts in.
  showAerial: boolean;
  setShowAerial: SetState<boolean>;
  aerialCount: number;

  // Preview-only demo layers (gated by SHOW_DEMO_LAYERS).
  setDemo: SetState<null | "food-truck" | "transit" | "rewards">;
};

/**
 * The floating glass control deck pinned to the top of the map. Extracted
 * from AppMap.tsx as part of the PR series that's carving the 2,576-line
 * file into focused siblings. No behavior change: same JSX, same handlers
 * — only the prop boundary is new.
 */
export default function AppMapDeck({
  q,
  setQ,
  searchMatches,
  pickSearch,
  goNearMe,
  locating,
  userLoc,
  filtersOpen,
  setFiltersOpen,
  activeCats,
  setActiveCats,
  amenityOpen,
  setAmenityOpen,
  amenityGroups,
  setAmenityGroups,
  amenityCount,
  activeAmenityGroupCount,
  places,
  trustedOsmCount,
  civic,
  showCivic,
  setShowCivic,
  transitLines,
  showTransit,
  setShowTransit,
  trailLines,
  showTrails,
  setShowTrails,
  showAerial,
  setShowAerial,
  aerialCount,
  setDemo,
}: AppMapDeckProps) {
  // Open-now state lives in the URL (?open=now), not in client state —
  // the server filters the place pool, so the deck just reads the
  // param to render the active-filters chip and a clear link. Building
  // a "strip ?open" href client-side keeps the chip's X consistent
  // with how /browse interprets the URL.
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const router = useRouter();
  const openNow = searchParams?.get("open") === "now";
  const clearOpenHref = (() => {
    if (!searchParams) return pathname ?? "/browse";
    const next = new URLSearchParams(searchParams.toString());
    next.delete("open");
    const qs = next.toString();
    return qs ? `${pathname}?${qs}` : (pathname ?? "/browse");
  })();
  return (
    <div className="pointer-events-none absolute inset-x-0 top-0 z-30 px-2.5 pt-2.5 sm:px-3 sm:pt-3">
      <div className="pointer-events-auto mx-auto flex w-full max-w-[680px] flex-col gap-2">
        {/* The Visitor / Resident mode-switch pill used to sit here
            on the map deck. Removed pre-launch — the map surface
            doesn't actually change behavior between visitor and
            resident voice, so the pill read as confusing UI noise.
            Mode still lives on /now (AdaptiveGreeting + ModeLead +
            PrimaryActionCard) where it genuinely shapes copy, and
            in /settings as an explicit preference. */}
        {/* Unified search deck: a single rounded-pill bar with the
            search input filling the row and two icon-only buttons
            tucked into the bar's right side. The previous three
            floating pills (Search · Near me · Layers) read as
            disconnected controls; this one container reads as one
            tool. Locate-me lives at the search bar's right edge so
            users find it where Apple Maps users expect it. Layers
            is a separate small pill so the active-count badge still
            has room to surface. */}
        <div className="flex items-center gap-2">
          <div
            className="relative flex flex-1 items-center overflow-hidden rounded-full border backdrop-blur"
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
              placeholder="Search the map"
              aria-label="Search the map"
              className="min-w-0 flex-1 bg-transparent px-2.5 py-2.5 text-sm outline-none"
              style={{ color: "var(--app-ink)" }}
            />
            {/* Locate-me icon button — sits at the search bar's
                right edge. Brand-tinted when the user has shared
                their location, neutral otherwise. Tap target keeps
                the iOS minimum (44pt) via the parent height. */}
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
            {searchMatches.length > 0 && (
              <ul
                className="absolute inset-x-0 top-full z-30 mt-1.5 overflow-hidden rounded-[var(--app-radius-md)] border backdrop-blur"
                style={{
                  borderColor: "var(--app-border)",
                  background: "color-mix(in srgb, var(--app-bg-elevated) 92%, transparent)",
                  boxShadow: "var(--app-shadow-3)",
                }}
              >
                {searchMatches.map((p) => {
                  const cat = CATEGORY_BY_SLUG[p.category];
                  return (
                    <li key={p.slug}>
                      <button
                        type="button"
                        onClick={() => pickSearch(p)}
                        className="flex w-full items-center gap-2.5 px-3.5 py-2.5 text-left transition hover:bg-[var(--app-bg-sunken)]"
                      >
                        <span aria-hidden className="h-2 w-2 shrink-0 rounded-full" style={{ background: cat?.color ?? "#A8462C" }} />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-medium" style={{ color: "var(--app-ink)" }}>
                            {p.name}
                          </span>
                          <span className="block truncate text-[11px]" style={{ color: "var(--app-ink-3)" }}>
                            {cat?.name ?? p.category}{p.address ? ` · ${p.address}` : ""}
                          </span>
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
          <button
            type="button"
            onClick={() => setFiltersOpen((v) => !v)}
            aria-pressed={filtersOpen}
            aria-expanded={filtersOpen}
            aria-label="Layers"
            className="inline-flex shrink-0 items-center gap-1.5 rounded-full border px-3.5 py-2.5 text-sm font-semibold backdrop-blur transition active:scale-[0.96]"
            style={{
              borderColor: filtersOpen || activeCats.size > 0 || activeAmenityGroupCount > 0 ? "var(--app-brand)" : "var(--app-border)",
              color: filtersOpen || activeCats.size > 0 || activeAmenityGroupCount > 0 ? "var(--app-brand)" : "var(--app-ink-2)",
              background: "color-mix(in srgb, var(--app-bg-elevated) 88%, transparent)",
              boxShadow: "var(--app-shadow-2)",
            }}
          >
            <SlidersHorizontal className="h-3.5 w-3.5" strokeWidth={2.25} aria-hidden />
            <span className="hidden sm:inline">Layers</span>
            {activeCats.size + activeAmenityGroupCount > 0 && (
              <span
                className="inline-flex min-w-[16px] items-center justify-center rounded-full bg-[var(--app-brand)] px-1 text-[10px] font-bold tabular-nums text-white"
              >
                {activeCats.size + activeAmenityGroupCount}
              </span>
            )}
          </button>
        </div>

        {/* Active-filters strip — chips for every category currently
            ON, each tappable to remove. Sits directly under the
            search bar so the user can see WHAT's filtering the map
            without opening the drawer. Renders only when something
            is filtered; on a clean map this row is hidden so the
            deck stays minimal. Includes the overlays (Roads &
            alerts, Transit, Trails) and Amenities group too — every
            active layer surfaces here. */}
        {(activeCats.size > 0 ||
          activeAmenityGroupCount > 0 ||
          showCivic ||
          showTransit ||
          showTrails ||
          showAerial ||
          openNow) && (
          <ul
            className="-mx-1 flex items-center gap-1.5 overflow-x-auto px-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
            aria-label="Active filters"
          >
            {[...activeCats].map((slug) => {
              const cat = CATEGORY_BY_SLUG[slug];
              if (!cat) return null;
              return (
                <li key={`f-${slug}`} className="shrink-0">
                  <button
                    type="button"
                    onClick={() =>
                      setActiveCats((prev) => {
                        const next = new Set(prev);
                        next.delete(slug);
                        return next;
                      })
                    }
                    aria-label={`Remove ${cat.name} filter`}
                    className="inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-semibold backdrop-blur transition active:scale-[0.96]"
                    style={{
                      background: cat.color,
                      color: "white",
                      boxShadow: "var(--app-shadow-1)",
                    }}
                  >
                    {cat.name}
                    <X className="h-2.5 w-2.5" strokeWidth={2.5} aria-hidden />
                  </button>
                </li>
              );
            })}
            {activeAmenityGroupCount > 0 && (
              <li className="shrink-0">
                <button
                  type="button"
                  onClick={() => setAmenityGroups(new Set())}
                  aria-label="Clear all amenity filters"
                  className="inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-semibold backdrop-blur transition active:scale-[0.96]"
                  style={{
                    background: "var(--app-cool)",
                    color: "white",
                    boxShadow: "var(--app-shadow-1)",
                  }}
                >
                  Amenities · {activeAmenityGroupCount}
                  <X className="h-2.5 w-2.5" strokeWidth={2.5} aria-hidden />
                </button>
              </li>
            )}
            {showCivic && (
              <li className="shrink-0">
                <button
                  type="button"
                  onClick={() => setShowCivic(false)}
                  aria-label="Hide roads & alerts"
                  className="inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-semibold backdrop-blur transition active:scale-[0.96]"
                  style={{
                    background: "var(--app-warning)",
                    color: "white",
                    boxShadow: "var(--app-shadow-1)",
                  }}
                >
                  Roads &amp; alerts
                  <X className="h-2.5 w-2.5" strokeWidth={2.5} aria-hidden />
                </button>
              </li>
            )}
            {showTransit && (
              <li className="shrink-0">
                <button
                  type="button"
                  onClick={() => setShowTransit(false)}
                  aria-label="Hide transit"
                  className="inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-semibold backdrop-blur transition active:scale-[0.96]"
                  style={{
                    background: "var(--app-cool)",
                    color: "white",
                    boxShadow: "var(--app-shadow-1)",
                  }}
                >
                  Transit
                  <X className="h-2.5 w-2.5" strokeWidth={2.5} aria-hidden />
                </button>
              </li>
            )}
            {showTrails && (
              <li className="shrink-0">
                <button
                  type="button"
                  onClick={() => setShowTrails(false)}
                  aria-label="Hide trails"
                  className="inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-semibold backdrop-blur transition active:scale-[0.96]"
                  style={{
                    background: "var(--app-positive)",
                    color: "white",
                    boxShadow: "var(--app-shadow-1)",
                  }}
                >
                  Trails
                  <X className="h-2.5 w-2.5" strokeWidth={2.5} aria-hidden />
                </button>
              </li>
            )}
            {showAerial && (
              <li className="shrink-0">
                <button
                  type="button"
                  onClick={() => setShowAerial(false)}
                  aria-label="Hide aerial photos"
                  className="inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-semibold backdrop-blur transition active:scale-[0.96]"
                  style={{
                    background: "var(--app-accent)",
                    color: "white",
                    boxShadow: "var(--app-shadow-1)",
                  }}
                >
                  Aerial photos
                  <X className="h-2.5 w-2.5" strokeWidth={2.5} aria-hidden />
                </button>
              </li>
            )}
            {openNow && (
              <li className="shrink-0">
                <button
                  type="button"
                  onClick={() => router.push(clearOpenHref)}
                  aria-label="Show all places (not just open)"
                  className="inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-semibold backdrop-blur transition active:scale-[0.96]"
                  style={{
                    background: "var(--app-positive)",
                    color: "white",
                    boxShadow: "var(--app-shadow-1)",
                  }}
                >
                  <Clock className="h-2.5 w-2.5" strokeWidth={2.5} aria-hidden />
                  Open now
                  <X className="h-2.5 w-2.5" strokeWidth={2.5} aria-hidden />
                </button>
              </li>
            )}
            {/* Clear-all escape hatch — only worth the row when there
                are multiple filters to clear. */}
            {activeCats.size + activeAmenityGroupCount + (showCivic ? 1 : 0) + (showTransit ? 1 : 0) + (showTrails ? 1 : 0) + (showAerial ? 1 : 0) + (openNow ? 1 : 0) > 1 && (
              <li className="shrink-0">
                <button
                  type="button"
                  onClick={() => {
                    setActiveCats(new Set());
                    setAmenityGroups(new Set());
                    setShowCivic(false);
                    setShowTransit(false);
                    setShowTrails(false);
                    setShowAerial(false);
                    if (openNow) router.push(clearOpenHref);
                  }}
                  className="inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[11px] font-semibold backdrop-blur transition active:scale-[0.96]"
                  style={{
                    borderColor: "var(--app-border)",
                    background: "color-mix(in srgb, var(--app-bg-elevated) 88%, transparent)",
                    color: "var(--app-ink-2)",
                  }}
                >
                  Clear all
                </button>
              </li>
            )}
          </ul>
        )}
      </div>
      {/* Layers drawer — slides up from the bottom (Vaul). On mobile
          this reads as the native map app pattern; on desktop the
          drawer caps at 90vh and still feels like a focused tool tray.
          Owned state stays in AppMap.tsx so deep-links and intent
          chips can open it programmatically. */}
      <BottomDrawer
        open={filtersOpen}
        onOpenChange={setFiltersOpen}
        title="Layers"
        subtitle="Choose what to show on the map"
      >
        <div className="space-y-4 px-4 pt-3">
        {/* CATEGORIES section — places by type. Was mixed in one flat
            wrap with the overlays; pulling them into a labeled
            cluster reads as "what kind of place" vs the OVERLAYS
            cluster's "what infrastructure to show." */}
        <section className="space-y-2">
          <h3 className="eyebrow px-1" style={{ color: "var(--app-ink-3)" }}>
            Categories
          </h3>
          <ul className="flex flex-wrap items-center gap-2 py-0.5">
          <li>
            <button
              type="button"
              onClick={() => setActiveCats(new Set())}
              aria-pressed={activeCats.size === 0}
              className="inline-flex items-center gap-1.5 rounded-full px-3.5 py-2 text-xs font-semibold transition active:scale-[0.96]"
              style={{
                background: activeCats.size === 0 ? "var(--app-brand)" : "var(--app-bg-elevated)",
                color: activeCats.size === 0 ? "white" : "var(--app-ink-2)",
                border: `1px solid ${activeCats.size === 0 ? "var(--app-brand)" : "var(--app-border)"}`,
                boxShadow: activeCats.size === 0 ? "var(--app-shadow-2)" : "var(--app-shadow-1)",
              }}
            >
              All · {(places.length + trustedOsmCount).toLocaleString()}
            </button>
          </li>
          <li>
            <button
              type="button"
              onClick={() =>
                setActiveCats((prev) => {
                  const next = new Set(prev);
                  if (next.has("coffee")) next.delete("coffee");
                  else next.add("coffee");
                  return next;
                })
              }
              aria-pressed={activeCats.has("coffee")}
              className="inline-flex items-center gap-1.5 rounded-full px-3.5 py-2 text-xs font-semibold transition active:scale-[0.96]"
              style={{
                background: activeCats.has("coffee") ? "#8B5A2B" : "var(--app-bg-elevated)",
                color: activeCats.has("coffee") ? "white" : "var(--app-ink-2)",
                border: `1px solid ${activeCats.has("coffee") ? "#8B5A2B" : "var(--app-border)"}`,
                boxShadow: activeCats.has("coffee") ? "var(--app-shadow-2)" : "var(--app-shadow-1)",
              }}
              title="Just coffee — cafes, roasters, espresso bars"
            >
              <span aria-hidden style={{ fontSize: 13, lineHeight: 1 }}>{"☕"}</span>
              Coffee
            </button>
          </li>
          <li>
            <button
              type="button"
              onClick={() =>
                setActiveCats((prev) => {
                  const next = new Set(prev);
                  if (next.has("worship")) next.delete("worship");
                  else next.add("worship");
                  return next;
                })
              }
              aria-pressed={activeCats.has("worship")}
              className="inline-flex items-center gap-1.5 rounded-full px-3.5 py-2 text-xs font-semibold transition active:scale-[0.96]"
              style={{
                background: activeCats.has("worship") ? "#5B3A8F" : "var(--app-bg-elevated)",
                color: activeCats.has("worship") ? "white" : "var(--app-ink-2)",
                border: `1px solid ${activeCats.has("worship") ? "#5B3A8F" : "var(--app-border)"}`,
                boxShadow: activeCats.has("worship") ? "var(--app-shadow-2)" : "var(--app-shadow-1)",
              }}
              title="Churches, temples, and houses of worship"
            >
              <span aria-hidden style={{ fontSize: 13, lineHeight: 1 }}>{"⛪"}</span>
              Churches
            </button>
          </li>
          {TOP_CATEGORIES.map((c) => {
            const active = activeCats.has(c.slug);
            return (
              <li key={c.slug}>
                <button
                  type="button"
                  onClick={() => {
                    setActiveCats((prev) => {
                      const next = new Set(prev);
                      if (next.has(c.slug)) next.delete(c.slug);
                      else next.add(c.slug);
                      return next;
                    });
                  }}
                  aria-pressed={active}
                  className="inline-flex items-center gap-1.5 rounded-full px-3.5 py-2 text-xs font-semibold transition active:scale-[0.96]"
                  style={{
                    background: active ? c.color : "var(--app-bg-elevated)",
                    color: active ? "white" : "var(--app-ink-2)",
                    border: `1px solid ${active ? c.color : "var(--app-border)"}`,
                    boxShadow: active ? "var(--app-shadow-2)" : "var(--app-shadow-1)",
                  }}
                >
                  <span aria-hidden style={{ fontSize: 13, lineHeight: 1, color: active ? "rgba(255,255,255,0.92)" : c.color }}>
                    {CHIP_GLYPH[c.slug] ?? "●"}
                  </span>
                  {c.name}
                </button>
              </li>
            );
          })}
          </ul>
        </section>

        {/* OVERLAYS section — infrastructure / situation layers. Each
            renders only if the underlying data exists, so the section
            only appears when there's something to toggle. */}
        {(amenityCount > 0 || civic.length > 0 || transitLines.features.length > 0 || trailLines.features.length > 0) && (
          <section className="space-y-2">
            <h3 className="eyebrow px-1" style={{ color: "var(--app-ink-3)" }}>
              Overlays
            </h3>
            <ul className="flex flex-wrap items-center gap-2 py-0.5">
          {amenityCount > 0 && (
            <li>
              <button
                type="button"
                onClick={() => setAmenityOpen((v) => !v)}
                aria-pressed={amenityOpen || activeAmenityGroupCount > 0}
                aria-expanded={amenityOpen}
                className="inline-flex items-center gap-1.5 rounded-full px-3.5 py-2 text-xs font-semibold transition active:scale-[0.96]"
                style={{
                  background: activeAmenityGroupCount > 0 ? "var(--app-cool)" : "var(--app-bg-elevated)",
                  color: activeAmenityGroupCount > 0 ? "white" : "var(--app-ink-2)",
                  border: `1px solid ${activeAmenityGroupCount > 0 || amenityOpen ? "var(--app-cool)" : "var(--app-border)"}`,
                  boxShadow: activeAmenityGroupCount > 0 ? "var(--app-shadow-2)" : "var(--app-shadow-1)",
                }}
                title="Amenities — restrooms, Wi-Fi, EV charging, bike parking, picnic, playgrounds, water, trash, AED"
              >
                <span aria-hidden style={{ fontSize: 13, lineHeight: 1 }}>{CHIP_GLYPH.amenities}</span>
                Amenities
                {activeAmenityGroupCount > 0 && ` · ${activeAmenityGroupCount}`}
                <span aria-hidden style={{ fontSize: 9, opacity: 0.7 }}>{amenityOpen ? "▲" : "▼"}</span>
              </button>
            </li>
          )}
          {civic.length > 0 && (
            <li>
              <button
                type="button"
                onClick={() => setShowCivic((v) => !v)}
                aria-pressed={showCivic}
                className="inline-flex items-center gap-1.5 rounded-full px-3.5 py-2 text-xs font-semibold transition active:scale-[0.96]"
                style={{
                  background: showCivic ? "var(--app-warning)" : "var(--app-bg-elevated)",
                  color: showCivic ? "white" : "var(--app-ink-2)",
                  border: `1px solid ${showCivic ? "var(--app-warning)" : "var(--app-border)"}`,
                  boxShadow: showCivic ? "var(--app-shadow-2)" : "var(--app-shadow-1)",
                }}
                title="Live traffic incidents and county-published issue reports (311)"
              >
                <span
                  aria-hidden
                  className="inline-block h-2 w-2 rounded-full"
                  style={{ background: showCivic ? "white" : "var(--app-warning)" }}
                />
                Roads &amp; alerts
              </button>
            </li>
          )}
          {transitLines.features.length > 0 && (
            <li>
              <button
                type="button"
                onClick={() => setShowTransit((v) => !v)}
                aria-pressed={showTransit}
                className="inline-flex items-center gap-1.5 rounded-full px-3.5 py-2 text-xs font-semibold transition active:scale-[0.96]"
                style={{
                  background: showTransit ? "var(--app-cool)" : "var(--app-bg-elevated)",
                  color: showTransit ? "white" : "var(--app-ink-2)",
                  border: `1px solid ${showTransit ? "var(--app-cool)" : "var(--app-border)"}`,
                  boxShadow: showTransit ? "var(--app-shadow-2)" : "var(--app-shadow-1)",
                }}
                title="TransIT bus routes"
              >
                <span aria-hidden className="inline-block h-2 w-2 rounded-full" style={{ background: showTransit ? "white" : "var(--app-cool)" }} />
                Transit · {transitLines.features.length}
              </button>
            </li>
          )}
          {trailLines.features.length > 0 && (
            <li>
              <button
                type="button"
                onClick={() => setShowTrails((v) => !v)}
                aria-pressed={showTrails}
                className="inline-flex items-center gap-1.5 rounded-full px-3.5 py-2 text-xs font-semibold transition active:scale-[0.96]"
                style={{
                  background: showTrails ? "var(--app-positive)" : "var(--app-bg-elevated)",
                  color: showTrails ? "white" : "var(--app-ink-2)",
                  border: `1px solid ${showTrails ? "var(--app-positive)" : "var(--app-border)"}`,
                  boxShadow: showTrails ? "var(--app-shadow-2)" : "var(--app-shadow-1)",
                }}
                title="County trails"
              >
                <span aria-hidden className="inline-block h-2 w-2 rounded-full" style={{ background: showTrails ? "white" : "var(--app-positive)" }} />
                Trails · {trailLines.features.length}
              </button>
            </li>
          )}
          {aerialCount > 0 && (
            <li>
              <button
                type="button"
                onClick={() => setShowAerial((v) => !v)}
                aria-pressed={showAerial}
                className="inline-flex items-center gap-1.5 rounded-full px-3.5 py-2 text-xs font-semibold transition active:scale-[0.96]"
                style={{
                  background: showAerial ? "var(--app-accent)" : "var(--app-bg-elevated)",
                  color: showAerial ? "white" : "var(--app-ink-2)",
                  border: `1px solid ${showAerial ? "var(--app-accent)" : "var(--app-border)"}`,
                  boxShadow: showAerial ? "var(--app-shadow-2)" : "var(--app-shadow-1)",
                }}
                title="Drone photos from the Frederick Radius seasonal archive — each pin marks where a shot was taken"
              >
                <span aria-hidden className="inline-block h-2 w-2 rounded-full" style={{ background: showAerial ? "white" : "var(--app-accent)" }} />
                Aerial photos · {aerialCount}
              </button>
            </li>
          )}
            </ul>
          </section>
        )}

        {/* Preview-only demo layers — OFF in production (gated by
            NEXT_PUBLIC_RADIUS_DEMO_LAYERS=1). Rendered as its own
            "Coming soon" cluster so the demo chips don't visually
            ride in the live Categories/Overlays rows. */}
        {SHOW_DEMO_LAYERS && (
          <section className="space-y-2">
            <h3 className="eyebrow px-1" style={{ color: "var(--app-ink-3)" }}>
              Coming soon
            </h3>
            <ul className="flex flex-wrap items-center gap-2 py-0.5">
              {[
                { key: "food-truck" as const, glyph: "\u{1F69A}", label: "Food Trucks" },
                { key: "rewards" as const, glyph: "\u{2B50}", label: "Radius Points" },
                { key: "transit" as const, glyph: "\u{1F68C}", label: "Live Transit" },
              ].map((d) => (
                <li key={d.key}>
                  <button
                    type="button"
                    onClick={() => setDemo(d.key)}
                    className="inline-flex items-center gap-1.5 rounded-full px-3 py-2 text-xs font-semibold transition active:scale-[0.96]"
                    style={{
                      background: "var(--app-bg-elevated)",
                      color: "var(--app-ink-3)",
                      border: "1px dashed var(--app-border)",
                    }}
                  >
                    <span aria-hidden style={{ fontSize: 13, lineHeight: 1 }}>{d.glyph}</span>
                    {d.label}
                    <span
                      className="rounded-full px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider"
                      style={{ background: "var(--app-accent)", color: "white" }}
                    >
                      Soon
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </section>
        )}

        {/* Amenities sub-tray — toggled by the Amenities chip,
            nested inside the same glass filter panel. */}
        {amenityOpen && (
          <div className="mt-2 border-t pt-2" style={{ borderColor: "var(--app-border)" }}>
          <ul className="flex flex-wrap items-center gap-2 py-0.5">
            {AMENITY_GROUPS.map((g) => {
              const on = amenityGroups.has(g.key);
              return (
                <li key={g.key}>
                  <button
                    type="button"
                    onClick={() =>
                      setAmenityGroups((prev) => {
                        const next = new Set(prev);
                        if (next.has(g.key)) next.delete(g.key);
                        else next.add(g.key);
                        return next;
                      })
                    }
                    aria-pressed={on}
                    className="inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium transition active:scale-[0.96]"
                    style={{
                      background: on ? "var(--app-cool)" : "var(--app-bg-elevated)",
                      color: on ? "white" : "var(--app-ink-2)",
                      border: `1px solid ${on ? "var(--app-cool)" : "var(--app-border)"}`,
                      boxShadow: on ? "var(--app-shadow-1)" : "none",
                    }}
                  >
                    <span aria-hidden style={{ fontSize: 12, lineHeight: 1 }}>{g.glyph}</span>
                    {g.label}
                  </button>
                </li>
              );
            })}
            {activeAmenityGroupCount > 0 && (
              <li>
                <button
                  type="button"
                  onClick={() => setAmenityGroups(new Set())}
                  className="inline-flex items-center rounded-full px-3 py-1.5 text-xs font-medium transition active:scale-[0.96]"
                  style={{ background: "transparent", color: "var(--app-ink-3)", border: "1px solid var(--app-border)" }}
                >
                  Clear
                </button>
              </li>
            )}
          </ul>
            <p className="px-1 pt-1 text-[10px]" style={{ color: "var(--app-ink-3)" }}>
              Pick what you need — it appears on the map and folds into your Radius results.
            </p>
          </div>
        )}
        </div>
      </BottomDrawer>
    </div>
  );
}
