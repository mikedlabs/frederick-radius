"use client";

import { useEffect, useMemo, useState } from "react";
import { Footprints, Bike, Car, MapPin, LayoutGrid, Rows3, ChevronDown, Navigation, ArrowDownAZ } from "lucide-react";
import PlaceCard from "@/components/place/PlaceCard";
import SectionHeading from "@/components/ui/SectionHeading";
import FilterChip from "@/components/ui/FilterChip";
// TYPE ONLY: importing the loader at runtime drags the ~12MB
// places-enrichment.json into the client bundle. Places arrive
// already decorated from radius/page; only the radius-relative
// distance is computed here.
import type { PlaceCardData } from "@/lib/loaders/places";
import { CATEGORY_BY_SLUG } from "@/data/categories";
import { cuisineFacets, cuisinesOf } from "@/lib/cuisine";
import { MUNICIPALITIES } from "@/data/municipalities";
import { minutesToMeters, haversineMeters, type TravelMode, formatDistance } from "@/lib/geo";

// Center options: ALL 12 municipalities (Frederick first = default) +
// a couple of landmark points. A dropdown, not a hidden horizontal
// scroll — every choice is reachable and obvious. Municipalities come
// straight from the canonical data so the county is fully covered.
type Preset = {
  slug: string;
  label: string;
  lng: number;
  lat: number;
  kind: "muni" | "poi";
};
const MUNI_PRESETS: Preset[] = MUNICIPALITIES.map((m) => ({
  slug: `m-${m.slug}`,
  label: m.name,
  lng: m.centroid.lng,
  lat: m.centroid.lat,
  kind: "muni",
}));
const POI_PRESETS: Preset[] = [
  { slug: "carroll-creek", label: "Carroll Creek", lng: -77.4109, lat: 39.4137, kind: "poi" },
  { slug: "catoctin", label: "Catoctin trailhead", lng: -77.4505, lat: 39.6361, kind: "poi" },
];
const PRESETS: Preset[] = [...MUNI_PRESETS, ...POI_PRESETS];

const MODES: { mode: TravelMode; label: string; icon: typeof Footprints }[] = [
  { mode: "walk", label: "Walk", icon: Footprints },
  { mode: "bike", label: "Bike", icon: Bike },
  { mode: "drive", label: "Drive", icon: Car },
];

/**
 * Group every in-radius place by its TOP-LEVEL taxonomy category, so
 * nothing is invisible. The old 3 hardcoded buckets (eat/do/practical)
 * silently dropped ~9 of 12 top categories — that is why the namesake
 * tool "wasn't showing everything." This derives the group from the
 * real category tree (child → parent → top), with a "More" catch-all
 * so a place can never fall through. The sum of group counts always
 * equals the inside total — that invariant is the completeness proof.
 */
function groupKeyFor(category: string): string {
  const def = CATEGORY_BY_SLUG[category];
  if (!def) return "more";
  return def.parent ?? def.slug;
}
function groupLabel(key: string): string {
  return CATEGORY_BY_SLUG[key]?.name ?? "More";
}
function groupOrder(key: string): number {
  return CATEGORY_BY_SLUG[key]?.display_order ?? 9_000;
}

type ViewMode = "grid" | "list";
const VIEW_KEY = "fr:radius:view:v1";
type SortMode = "near" | "az";
const SORT_KEY = "fr:radius:sort:v1";
// How many to show before "Show all" expands a section in place. No
// data is hidden now — everything inside is one tap away. Distance-
// sorted, so the initial slice is always "the nearest few".
const PEEK: Record<ViewMode, number> = { grid: 8, list: 10 };
const FOOD_GROUP = "food";

export default function RadiusBuilder({ places }: { places: PlaceCardData[] }) {
  const [presetIdx, setPresetIdx] = useState(0);
  const [mode, setMode] = useState<TravelMode>("walk");
  const [minutes, setMinutes] = useState(10);
  // Default renders on the server; the stored preference is applied
  // after mount (same SSR-safe pattern the app uses elsewhere). A brief
  // default-then-preferred settle is acceptable for a view toggle.
  const [view, setView] = useState<ViewMode>("grid");
  useEffect(() => {
    try {
      const saved = localStorage.getItem(VIEW_KEY);
      // eslint-disable-next-line react-hooks/set-state-in-effect -- SSR-safe: server renders the default, the stored preference is applied after mount (localStorage is unavailable during SSR)
      if (saved === "grid" || saved === "list") setView(saved);
    } catch {
      // localStorage unavailable (private mode, etc.) — keep default
    }
  }, []);
  const chooseView = (v: ViewMode) => {
    setView(v);
    try {
      localStorage.setItem(VIEW_KEY, v);
    } catch {
      // non-fatal
    }
  };
  // Sort within each group: "near" (distance, the default — inside is
  // already distance-sorted) or "az" (alphabetical). Same SSR-safe
  // localStorage settle as the view toggle.
  const [sort, setSort] = useState<SortMode>("near");
  useEffect(() => {
    try {
      const saved = localStorage.getItem(SORT_KEY);
      // eslint-disable-next-line react-hooks/set-state-in-effect -- SSR-safe: server renders the default, the stored preference is applied after mount (localStorage is unavailable during SSR)
      if (saved === "near" || saved === "az") setSort(saved);
    } catch {
      // localStorage unavailable (private mode, etc.) — keep default
    }
  }, []);
  const chooseSort = (s: SortMode) => {
    setSort(s);
    try {
      localStorage.setItem(SORT_KEY, s);
    } catch {
      // non-fatal
    }
  };
  // Cuisine filter (food group only) + which groups are expanded.
  const [cuisine, setCuisine] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const toggleExpand = (key: string) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  const center = PRESETS[presetIdx];
  const meters = minutesToMeters(mode, minutes);

  const inside = useMemo(() => {
    return places
      .map((p) => ({ ...p, distance_m: haversineMeters({ lng: center.lng, lat: center.lat }, p.geom) }))
      .filter((p) => (p.distance_m ?? Infinity) <= meters)
      .sort((a, b) => (a.distance_m ?? Infinity) - (b.distance_m ?? Infinity));
  }, [places, center.lng, center.lat, meters]);

  // Complete, taxonomy-driven grouping: every in-radius place lands in
  // exactly one group, ordered by the category tree. Σ group counts ===
  // inside.length (the completeness invariant).
  const groups = useMemo(() => {
    const byKey = new Map<string, PlaceCardData[]>();
    for (const p of inside) {
      const k = groupKeyFor(p.category);
      const arr = byKey.get(k);
      if (arr) arr.push(p);
      else byKey.set(k, [p]);
    }
    return [...byKey.entries()]
      .map(([key, items]) => ({
        key,
        label: groupLabel(key),
        // "near" keeps inside's distance order; "az" sorts by name.
        items:
          sort === "az"
            ? [...items].sort((a, b) =>
                a.name.localeCompare(b.name, "en", { sensitivity: "base" }),
              )
            : items,
      }))
      .sort((a, b) => {
        const d = groupOrder(a.key) - groupOrder(b.key);
        return d !== 0 ? d : b.items.length - a.items.length;
      });
  }, [inside, sort]);

  // Cuisine facets from the food group's actual contents, so the chip
  // row only ever offers cuisines that are genuinely nearby.
  const foodItems = useMemo(
    () => groups.find((g) => g.key === FOOD_GROUP)?.items ?? [],
    [groups],
  );
  const facets = useMemo(() => cuisineFacets(foodItems), [foodItems]);
  // A cuisine that is no longer present (radius changed) self-clears.
  const activeCuisine =
    cuisine && facets.some((f) => f.slug === cuisine) ? cuisine : null;

  const farthest = inside[inside.length - 1]?.distance_m ?? 0;

  return (
    <div className="space-y-5">
      <section className="space-y-3 rounded-[var(--app-radius-lg)] border bg-[var(--app-bg-elevated)] p-3.5 shadow-[var(--app-shadow-1)]"
               style={{ borderColor: "var(--app-border)" }}>
        {/* Center — a dropdown with every municipality + landmarks.
            Obvious, fully reachable, no hidden horizontal scroll. */}
        <div className="flex items-center gap-2.5">
          <span
            aria-hidden
            className="grid h-8 w-8 shrink-0 place-items-center rounded-full"
            style={{ background: "color-mix(in srgb, var(--app-brand) 14%, transparent)", color: "var(--app-brand)" }}
          >
            <MapPin className="h-4 w-4" strokeWidth={2} aria-hidden />
          </span>
          <div className="relative min-w-0 flex-1">
            <label htmlFor="center-select" className="sr-only">Center point</label>
            <select
              id="center-select"
              value={presetIdx}
              onChange={(e) => setPresetIdx(Number(e.target.value))}
              className="w-full appearance-none rounded-[var(--app-radius-md)] border bg-[var(--app-bg-sunken)] py-2 pl-3 pr-9 text-[14px] font-semibold outline-none focus-visible:ring-2 focus-visible:ring-[var(--app-brand)]"
              style={{ borderColor: "var(--app-border)", color: "var(--app-ink)" }}
            >
              <optgroup label="Municipalities">
                {PRESETS.map((p, i) =>
                  p.kind === "muni" ? (
                    <option key={p.slug} value={i}>{p.label}</option>
                  ) : null,
                )}
              </optgroup>
              <optgroup label="Landmarks">
                {PRESETS.map((p, i) =>
                  p.kind === "poi" ? (
                    <option key={p.slug} value={i}>{p.label}</option>
                  ) : null,
                )}
              </optgroup>
            </select>
            <ChevronDown
              className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2"
              strokeWidth={2.25}
              style={{ color: "var(--app-ink-3)" }}
              aria-hidden
            />
          </div>
        </div>

        {/* Mode + distance read as one instrument. */}
        <div
          role="group"
          aria-label="Travel mode"
          className="grid grid-cols-3 rounded-[var(--app-radius-md)] border p-0.5"
          style={{ borderColor: "var(--app-border)", background: "var(--app-bg-sunken)" }}
        >
          {MODES.map(({ mode: m, label, icon: Icon }) => {
            const active = m === mode;
            return (
              <button
                key={m}
                type="button"
                onClick={() => setMode(m)}
                aria-pressed={active}
                className="flex items-center justify-center gap-1.5 rounded-[calc(var(--app-radius-md)-3px)] py-1.5 text-[13px] font-semibold transition-colors"
                style={{
                  background: active ? "var(--app-brand)" : "transparent",
                  color: active ? "#fff" : "var(--app-ink-2)",
                }}
              >
                <Icon className="h-4 w-4" strokeWidth={2} aria-hidden />
                {label}
              </button>
            );
          })}
        </div>

        <div>
          <div className="flex items-baseline justify-between gap-2">
            <label htmlFor="minutes-slider" className="text-[11px] font-medium uppercase tracking-[0.08em]" style={{ color: "var(--app-ink-3)" }}>
              Distance
            </label>
            <span className="font-serif text-lg font-semibold tabular-nums" style={{ color: "var(--app-brand)" }}>
              {minutes} min <span className="text-[13px] font-normal" style={{ color: "var(--app-ink-3)" }}>· {formatDistance(meters)}</span>
            </span>
          </div>
          <input
            id="minutes-slider"
            type="range"
            min={3}
            max={mode === "walk" ? 30 : mode === "bike" ? 20 : 15}
            step={1}
            value={minutes}
            onChange={(e) => setMinutes(Number(e.target.value))}
            className="mt-1.5 w-full"
            style={{ accentColor: "var(--app-brand)" }}
          />
          <div className="mt-1 flex justify-between text-[11px]" style={{ color: "var(--app-ink-3)" }}>
            <span>3</span>
            <span>{mode === "walk" ? 30 : mode === "bike" ? 20 : 15} min</span>
          </div>
        </div>
      </section>

      <section
        className="flex items-center justify-between gap-3 rounded-[var(--app-radius-md)] border bg-[var(--app-bg-sunken)] px-3.5 py-2.5"
        style={{ borderColor: "var(--app-border)" }}
      >
        <p className="text-[13px]" style={{ color: "var(--app-ink-2)" }}>
          <strong className="font-serif text-base font-semibold" style={{ color: "var(--app-brand)" }}>
            {inside.length}
          </strong>{" "}
          place{inside.length === 1 ? "" : "s"} inside
          {farthest > 0 && (
            <span style={{ color: "var(--app-ink-3)" }}> · farthest {formatDistance(farthest)}</span>
          )}
        </p>
        {inside.length > 0 && (
          <div className="flex shrink-0 items-center gap-2">
            {/* Sort — Nearest (default) or A–Z. */}
            <div
              role="group"
              aria-label="Sort order"
              className="flex items-center gap-0.5 rounded-full border p-0.5"
              style={{ borderColor: "var(--app-border)" }}
            >
              {([
                { s: "near" as const, Icon: Navigation, label: "Nearest" },
                { s: "az" as const, Icon: ArrowDownAZ, label: "A to Z" },
              ]).map(({ s, Icon, label }) => {
                const active = sort === s;
                return (
                  <button
                    key={s}
                    type="button"
                    onClick={() => chooseSort(s)}
                    aria-pressed={active}
                    aria-label={`Sort ${label}`}
                    title={`Sort ${label}`}
                    className="grid h-7 w-7 place-items-center rounded-full transition-colors"
                    style={{
                      background: active ? "var(--app-brand)" : "transparent",
                      color: active ? "white" : "var(--app-ink-3)",
                    }}
                  >
                    <Icon className="h-3.5 w-3.5" strokeWidth={2} aria-hidden />
                  </button>
                );
              })}
            </div>
            {/* Density — Grid or List. */}
            <div
              role="group"
              aria-label="Result density"
              className="flex items-center gap-0.5 rounded-full border p-0.5"
              style={{ borderColor: "var(--app-border)" }}
            >
              {([
                { v: "grid" as const, Icon: LayoutGrid, label: "Grid" },
                { v: "list" as const, Icon: Rows3, label: "List" },
              ]).map(({ v, Icon, label }) => {
                const active = view === v;
                return (
                  <button
                    key={v}
                    type="button"
                    onClick={() => chooseView(v)}
                    aria-pressed={active}
                    aria-label={`${label} view`}
                    title={`${label} view`}
                    className="grid h-7 w-7 place-items-center rounded-full transition-colors"
                    style={{
                      background: active ? "var(--app-brand)" : "transparent",
                      color: active ? "white" : "var(--app-ink-3)",
                    }}
                  >
                    <Icon className="h-3.5 w-3.5" strokeWidth={2} aria-hidden />
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </section>

      {/* Every in-radius place, grouped by the real category tree —
          nothing hidden. Each section is distance-sorted (nearest
          first), shows a scannable peek, and expands in place. The
          food group also gets a cuisine filter built from what is
          actually nearby. */}
      {groups.map((g) => {
        const isFood = g.key === FOOD_GROUP;
        const filtered =
          isFood && activeCuisine
            ? g.items.filter((p) => cuisinesOf(p).includes(activeCuisine))
            : g.items;
        const isOpen = expanded.has(g.key);
        const peek = PEEK[view];
        const shown = isOpen ? filtered : filtered.slice(0, peek);
        const overflow = filtered.length - shown.length;
        return (
          <section key={g.key} className="space-y-3">
            <SectionHeading title={g.label} count={g.items.length} />

            {isFood && facets.length > 1 && (
              // Wrapped, not scrolled — every cuisine is visible at a
              // glance so the filter is discoverable, never hidden off
              // the right edge.
              <div className="flex flex-wrap gap-1.5">
                <FilterChip
                  label="All"
                  active={!activeCuisine}
                  onClick={() => setCuisine(null)}
                />
                {facets.map((f) => (
                  <FilterChip
                    key={f.slug}
                    label={f.label}
                    count={f.count}
                    active={activeCuisine === f.slug}
                    onClick={() =>
                      setCuisine(activeCuisine === f.slug ? null : f.slug)
                    }
                  />
                ))}
              </div>
            )}

            {shown.length === 0 ? (
              <p
                className="rounded-[var(--app-radius-md)] border border-dashed px-4 py-5 text-center text-[12px]"
                style={{ borderColor: "var(--app-border)", color: "var(--app-ink-3)" }}
              >
                No {activeCuisine ? "matching" : ""} spots in this group inside the radius.
              </p>
            ) : view === "grid" ? (
              <div className="grid grid-cols-2 gap-3">
                {shown.map((p) => (
                  <PlaceCard key={p.slug} place={p} variant="grid" />
                ))}
              </div>
            ) : (
              <div className="space-y-2">
                {shown.map((p) => (
                  <PlaceCard key={p.slug} place={p} variant="row" />
                ))}
              </div>
            )}

            {(overflow > 0 || isOpen) && filtered.length > peek && (
              <button
                type="button"
                onClick={() => toggleExpand(g.key)}
                className="inline-flex items-center gap-1.5 text-[13px] font-semibold transition active:opacity-70"
                style={{ color: "var(--app-brand)" }}
              >
                <ChevronDown
                  className={`h-4 w-4 transition-transform ${isOpen ? "rotate-180" : ""}`}
                  strokeWidth={2.25}
                  aria-hidden
                />
                {isOpen
                  ? `Show fewer`
                  : `Show all ${filtered.length}${
                      isFood && activeCuisine ? "" : ` ${g.label.toLowerCase()}`
                    }`}
              </button>
            )}
          </section>
        );
      })}

      {inside.length === 0 && (
        <p className="rounded-[var(--app-radius-md)] border border-dashed px-4 py-10 text-center text-sm"
           style={{ borderColor: "var(--app-border)", color: "var(--app-ink-3)" }}>
          Nothing inside this radius. Move the slider, change the mode, or pick a different center.
        </p>
      )}
    </div>
  );
}
