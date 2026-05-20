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
// TYPE ONLY: the points arrive as a server prop (radius/page →
// allAmenities()), so this client component never imports the loader
// or amenities.json — same loader-free discipline as places.
import type { Amenity, AmenityKind } from "@/lib/loaders/amenities";
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

// Local label + glyph table for the 6 curated amenity kinds, in
// most-asked-for order. Kept here (not imported from the loader) so
// this client component stays loader-free; the points themselves
// arrive as a server prop. Glyphs match the map's amenity language.
const AMENITY_META: { kind: AmenityKind; label: string; glyph: string }[] = [
  { kind: "restroom", label: "Restrooms", glyph: "\u{1F6BB}" },
  { kind: "wifi", label: "Free Wi-Fi", glyph: "\u{1F4F6}" },
  { kind: "ev_charging", label: "EV charging", glyph: "\u{26A1}" },
  { kind: "bike_parking", label: "Bike parking", glyph: "\u{1F6B2}" },
  { kind: "picnic", label: "Picnic spots", glyph: "\u{1FA91}" },
  { kind: "playground", label: "Playgrounds", glyph: "\u{1F6DD}" },
];

export default function RadiusBuilder({
  places,
  amenities = [],
}: {
  places: PlaceCardData[];
  amenities?: Amenity[];
}) {
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
  // The actual place sitting at the edge of the current radius — gives
  // the user a tangible "you can reach this" anchor instead of just a
  // number. Updates live as the slider moves.
  const edgePlace = inside[inside.length - 1] ?? null;
  // Live municipality coverage — how many distinct towns the
  // current radius reaches into. Climbs as the user widens the slider.
  const townsInside = useMemo(
    () => new Set(inside.map((p) => p.municipality).filter(Boolean)).size,
    [inside],
  );
  const formatFar = (m: number) => {
    if (m === 0) return "—";
    if (m < 1000) return `${Math.round(m)} ft`;
    return `${(m / 1609).toFixed(1)} mi`;
  };

  // Amenities inside the same radius — "what's within X" now genuinely
  // includes the restrooms / Wi-Fi / EV / bike / picnic / playgrounds,
  // not just businesses. Same haversine + center + meters as places.
  const insideAmenities = useMemo(() => {
    return amenities
      .map((a) => ({
        ...a,
        distance_m: haversineMeters(
          { lng: center.lng, lat: center.lat },
          { lng: a.lng, lat: a.lat },
        ),
      }))
      .filter((a) => a.distance_m <= meters)
      .sort((a, b) => a.distance_m - b.distance_m);
  }, [amenities, center.lng, center.lat, meters]);

  // Grouped by kind in the most-asked-for order; only kinds that
  // actually have a point inside the radius. Nearest stays first.
  const amenityGroups = useMemo(() => {
    const byKind = new Map<AmenityKind, (Amenity & { distance_m: number })[]>();
    for (const a of insideAmenities) {
      const arr = byKind.get(a.kind);
      if (arr) arr.push(a);
      else byKind.set(a.kind, [a]);
    }
    return AMENITY_META.map((m) => ({
      ...m,
      list: byKind.get(m.kind) ?? [],
    })).filter((g) => g.list.length > 0);
  }, [insideAmenities]);

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

        <div className="relative">
          <div className="flex items-baseline justify-between gap-2">
            <label htmlFor="minutes-slider" className="text-[11px] font-medium uppercase tracking-[0.08em]" style={{ color: "var(--app-ink-3)" }}>
              Distance
            </label>
            <span className="font-serif text-lg font-semibold tabular-nums" style={{ color: "var(--app-brand)" }}>
              {minutes} min <span className="text-[13px] font-normal" style={{ color: "var(--app-ink-3)" }}>· {formatDistance(meters)}</span>
            </span>
          </div>
          {/* Concentric-ring density backdrop — a quiet visual cue that
              the radius is a real spatial concept, not just a number.
              The ring count grows as the radius widens; the active ring
              pulses gently to draw the eye. SVG is pointer-events-none
              so it never blocks the slider. */}
          <div
            aria-hidden
            className="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2"
            style={{ width: 220, height: 56 }}
          >
            <svg viewBox="0 0 220 56" className="h-full w-full" preserveAspectRatio="xMidYMid meet">
              {[14, 26, 38, 50].map((r, i) => (
                <ellipse
                  key={r}
                  cx={110}
                  cy={28}
                  rx={r * 2}
                  ry={r * 0.55}
                  fill="none"
                  stroke="var(--app-brand)"
                  strokeWidth={0.7}
                  opacity={Math.max(0.04, 0.18 - i * 0.03)}
                />
              ))}
            </svg>
          </div>
          <input
            id="minutes-slider"
            type="range"
            min={3}
            max={mode === "walk" ? 30 : mode === "bike" ? 20 : 15}
            step={1}
            value={minutes}
            onChange={(e) => setMinutes(Number(e.target.value))}
            className="relative z-10 mt-1.5 w-full"
            style={{ accentColor: "var(--app-brand)" }}
          />
          <div className="mt-1 flex justify-between text-[11px]" style={{ color: "var(--app-ink-3)" }}>
            <span>3</span>
            <span>{mode === "walk" ? 30 : mode === "bike" ? 20 : 15} min</span>
          </div>
          {/* "What's at the edge" peek — tells the user the farthest
              concrete place they can reach right now. Reads as a
              tangible boundary, not an abstract distance. */}
          {edgePlace && (
            <div
              className="mt-2.5 flex items-center gap-2 rounded-[var(--app-radius-md)] px-3 py-1.5 text-[11px]"
              style={{
                background: "color-mix(in srgb, var(--app-brand) 8%, var(--app-bg-elevated))",
                color: "var(--app-ink-2)",
              }}
            >
              <span
                aria-hidden
                className="inline-block h-1.5 w-1.5 shrink-0 rounded-full"
                style={{ background: "var(--app-brand)" }}
              />
              <span className="min-w-0 flex-1 truncate">
                <span className="font-semibold uppercase tracking-[0.08em] text-[9px]" style={{ color: "var(--app-ink-3)" }}>
                  At the edge
                </span>{" "}
                <span style={{ color: "var(--app-ink)" }}>{edgePlace.name}</span>
              </span>
              <span className="shrink-0 tabular-nums" style={{ color: "var(--app-ink-3)" }}>
                {formatFar(farthest)}
              </span>
            </div>
          )}
        </div>
      </section>

      {/* Live stat strip — tactile module of confident tabular numbers
          that update as the radius widens or the mode changes. Replaces
          the static "X places inside" pill so the page makes the answer
          to "in play right now" visible at a glance. */}
      <section
        aria-label="In play right now"
        className="tactile relative overflow-hidden rounded-[var(--app-radius-lg)] bg-[var(--app-bg-elevated)] p-4"
      >
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0"
          style={{
            background:
              "radial-gradient(70% 90% at 10% 0%, color-mix(in srgb, var(--app-cool) 14%, transparent), transparent 60%)",
          }}
        />
        <div className="relative flex items-end justify-between gap-3">
          <p className="eyebrow" style={{ color: "var(--app-ink-3)" }}>
            In play right now
          </p>
          <p className="text-[10px] font-medium uppercase tracking-[0.08em]" style={{ color: "var(--app-ink-3)" }}>
            {mode === "walk" ? "Walking" : mode === "bike" ? "Biking" : "Driving"} · {minutes} min
          </p>
        </div>
        <div className="relative mt-3 grid grid-cols-3 gap-3">
          {[
            { label: "Places", value: inside.length.toLocaleString(), accent: "var(--app-brand)" },
            { label: "Towns", value: townsInside.toString(), accent: "var(--app-cool)" },
            { label: "Farthest", value: formatFar(farthest), accent: "var(--app-brand-2)" },
          ].map((s) => (
            <div key={s.label} className="text-center">
              <div
                className="font-serif text-[28px] font-semibold leading-none tracking-tight tabular-nums"
                style={{ color: s.accent }}
              >
                {s.value}
              </div>
              <div
                className="mt-1 text-[10px] font-semibold uppercase tracking-[0.12em]"
                style={{ color: "var(--app-ink-3)" }}
              >
                {s.label}
              </div>
            </div>
          ))}
        </div>
        {inside.length > 0 && (
          <div className="relative mt-3 flex flex-wrap items-center justify-end gap-2 border-t pt-3" style={{ borderColor: "var(--app-border)" }}>
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

      {/* Amenities inside the radius — restrooms, Wi-Fi, EV, bike
          parking, picnic, playgrounds. Each kind is a calm summary row
          (count + nearest) that expands to the full list, so "what's
          within X" genuinely includes them without a wall of pins. */}
      {amenityGroups.length > 0 && (
        <section className="space-y-3">
          <SectionHeading title="Amenities" count={insideAmenities.length} />
          <div className="space-y-2">
            {amenityGroups.map((g) => {
              const key = `amenity:${g.kind}`;
              const isOpen = expanded.has(key);
              const nearest = g.list[0]?.distance_m ?? 0;
              return (
                <div
                  key={g.kind}
                  className="overflow-hidden rounded-[var(--app-radius-md)] border bg-[var(--app-bg-elevated)]"
                  style={{ borderColor: "var(--app-border)" }}
                >
                  <button
                    type="button"
                    onClick={() => toggleExpand(key)}
                    aria-expanded={isOpen}
                    className="flex w-full items-center gap-3 px-3.5 py-2.5 text-left transition active:opacity-80"
                  >
                    <span
                      aria-hidden
                      className="grid h-8 w-8 shrink-0 place-items-center rounded-full text-[15px]"
                      style={{ background: "var(--app-bg-sunken)" }}
                    >
                      {g.glyph}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-[14px] font-semibold" style={{ color: "var(--app-ink)" }}>
                        {g.label}
                      </span>
                      <span className="block text-[12px]" style={{ color: "var(--app-ink-3)" }}>
                        {g.list.length} within · nearest {formatDistance(nearest)}
                      </span>
                    </span>
                    <ChevronDown
                      className={`h-4 w-4 shrink-0 transition-transform ${isOpen ? "rotate-180" : ""}`}
                      strokeWidth={2.25}
                      style={{ color: "var(--app-ink-3)" }}
                      aria-hidden
                    />
                  </button>
                  {isOpen && (
                    <ul>
                      {g.list.map((a) => (
                        <li
                          key={a.id}
                          className="flex items-center gap-3 px-3.5 py-2 text-[13px]"
                          style={{ borderTop: "1px solid var(--app-border)" }}
                        >
                          <span className="min-w-0 flex-1">
                            <span className="block truncate" style={{ color: "var(--app-ink-2)" }}>
                              {a.name}
                            </span>
                            {a.detail && (
                              <span className="block truncate text-[11px]" style={{ color: "var(--app-ink-3)" }}>
                                {a.detail}
                              </span>
                            )}
                          </span>
                          <span className="shrink-0 tabular-nums text-[12px]" style={{ color: "var(--app-ink-3)" }}>
                            {formatDistance(a.distance_m)}
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              );
            })}
          </div>
        </section>
      )}

      {inside.length === 0 && insideAmenities.length === 0 && (
        <p className="rounded-[var(--app-radius-md)] border border-dashed px-4 py-10 text-center text-sm"
           style={{ borderColor: "var(--app-border)", color: "var(--app-ink-3)" }}>
          Nothing inside this radius. Move the slider, change the mode, or pick a different center.
        </p>
      )}
    </div>
  );
}
