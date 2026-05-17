"use client";

import { useEffect, useMemo, useState } from "react";
import { Footprints, Bike, Car, MapPin, LayoutGrid, Rows3, ChevronDown } from "lucide-react";
import PlaceCard from "@/components/place/PlaceCard";
import SectionHeading from "@/components/ui/SectionHeading";
import FilterChip from "@/components/ui/FilterChip";
import { decoratePlace, type PlaceCardData } from "@/lib/loaders/places";
import { CATEGORY_BY_SLUG } from "@/data/categories";
import { cuisineFacets, cuisinesOf } from "@/lib/cuisine";
import { minutesToMeters, type TravelMode, formatDistance } from "@/lib/geo";
import type { Place } from "@/data/places";

const PRESETS = [
  { slug: "downtown", label: "Downtown Frederick", lng: -77.4109, lat: 39.4143 },
  { slug: "carroll-creek", label: "Carroll Creek", lng: -77.4109, lat: 39.4137 },
  { slug: "brunswick", label: "Brunswick", lng: -77.6280, lat: 39.3134 },
  { slug: "thurmont", label: "Thurmont", lng: -77.4108, lat: 39.6231 },
  { slug: "catoctin", label: "Catoctin trailhead", lng: -77.4505, lat: 39.6361 },
  { slug: "middletown", label: "Middletown", lng: -77.5447, lat: 39.4434 },
] as const;

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
// How many to show before "Show all" expands a section in place. No
// data is hidden now — everything inside is one tap away. Distance-
// sorted, so the initial slice is always "the nearest few".
const PEEK: Record<ViewMode, number> = { grid: 8, list: 10 };
const FOOD_GROUP = "food";

export default function RadiusBuilder({ places }: { places: Place[] }) {
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
      .map((p) => ({ ...decoratePlace(p, { lng: center.lng, lat: center.lat }) }))
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
      .map(([key, items]) => ({ key, label: groupLabel(key), items }))
      .sort((a, b) => {
        const d = groupOrder(a.key) - groupOrder(b.key);
        return d !== 0 ? d : b.items.length - a.items.length;
      });
  }, [inside]);

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
      <section className="space-y-3 rounded-[var(--app-radius-xl)] border bg-[var(--app-bg-elevated)] p-4 shadow-[var(--app-shadow-1)]"
               style={{ borderColor: "var(--app-border)" }}>
        <div>
          <p className="text-xs font-medium uppercase tracking-[0.08em]" style={{ color: "var(--app-ink-3)" }}>
            Center
          </p>
          <div className="-mx-1 mt-1.5 overflow-x-auto px-1 scrollbar-hide">
            <ul className="flex min-w-max gap-1.5">
              {PRESETS.map((p, i) => {
                const active = i === presetIdx;
                return (
                  <li key={p.slug}>
                    <button
                      type="button"
                      onClick={() => setPresetIdx(i)}
                      aria-pressed={active}
                      className="inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors"
                      style={{
                        borderColor: active ? "var(--app-brand)" : "var(--app-border)",
                        background: active ? "var(--app-brand)" : "var(--app-bg-elevated)",
                        color: active ? "white" : "var(--app-ink-2)",
                      }}
                    >
                      <MapPin className="h-3 w-3" strokeWidth={2} aria-hidden />
                      {p.label}
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
        </div>

        <div>
          <p className="mb-1.5 text-xs font-medium uppercase tracking-[0.08em]" style={{ color: "var(--app-ink-3)" }}>
            Getting there
          </p>
          {/* One connected segmented control — not three separate
              buttons. Mode + distance are one instrument: "how far,
              by what". */}
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
                  className="flex items-center justify-center gap-1.5 rounded-[calc(var(--app-radius-md)-3px)] py-2 text-[13px] font-semibold transition-colors"
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
        </div>

        <div>
          <div className="flex items-baseline justify-between gap-2">
            <label htmlFor="minutes-slider" className="text-xs font-medium uppercase tracking-[0.08em]" style={{ color: "var(--app-ink-3)" }}>
              Distance
            </label>
            <span className="font-serif text-2xl font-semibold tabular-nums" style={{ color: "var(--app-brand)" }}>
              {minutes} min · <span className="text-base" style={{ color: "var(--app-ink-2)" }}>{formatDistance(meters)}</span>
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
          <div
            role="group"
            aria-label="Result density"
            className="flex shrink-0 items-center gap-0.5 rounded-full border p-0.5"
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
              <div className="-mx-4 px-4">
                <div className="shelf-rail gap-1.5 pb-1">
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
