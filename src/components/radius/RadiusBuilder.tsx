"use client";

import { useMemo, useState } from "react";
import { Footprints, Bike, Car, MapPin, ChevronDown, Locate } from "lucide-react";
import PlaceCard from "@/components/place/PlaceCard";
import SectionHeading from "@/components/ui/SectionHeading";
import FilterChip from "@/components/ui/FilterChip";
import RadiusRing from "./RadiusRing";
import RadiusPresets from "./RadiusPresets";
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
  // Cuisine filter (food group only) + which groups are expanded.
  const [cuisine, setCuisine] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  // `seeAll` flips the page from "category tiles only" (default —
  // scan the buckets fast) to "every section expanded inline" (the
  // full directory view). User-flow fix: the old default landed on
  // a 6-section, 8-card-each wall before you could find your bucket.
  const [seeAll, setSeeAll] = useState(false);
  const toggleExpand = (key: string) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  // "Use my location" — a custom center the user can opt into via
  // browser geolocation. Falls through to the preset list when null.
  // Stored only in component state (not localStorage) so a returning
  // user always sees the preset they last picked, not a stale GPS.
  const [myLoc, setMyLoc] = useState<{ lng: number; lat: number } | null>(null);
  const [myLocLabel, setMyLocLabel] = useState<string>("Your location");
  const [locating, setLocating] = useState(false);
  const requestMyLocation = () => {
    if (!("geolocation" in navigator)) return;
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setMyLoc({ lng: pos.coords.longitude, lat: pos.coords.latitude });
        setMyLocLabel("Your location");
        setLocating(false);
      },
      () => setLocating(false),
      { enableHighAccuracy: true, timeout: 8000 },
    );
  };

  const presetCenter = PRESETS[presetIdx];
  const center = myLoc ? { ...presetCenter, label: myLocLabel, lng: myLoc.lng, lat: myLoc.lat } : presetCenter;
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
        // Items inherit `inside`'s distance order — nearest first, which
        // is the right default for a "what's near me" tool.
        items,
      }))
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
  // The actual place sitting at the edge of the current radius — gives
  // the user a tangible "you can reach this" anchor instead of just a
  // number. Updates live as the slider moves.
  const edgePlace = inside[inside.length - 1] ?? null;

  // Edge place's compass bearing from the center, in degrees where
  // 0° is North and angles increase clockwise. Used to position the
  // edge dot on the RadiusRing SVG. Approximation by atan2 of the
  // lat/lng deltas is plenty for the visual marker — we're not
  // computing a great-circle route here, just placing a dot.
  const edgeForRing = useMemo(() => {
    if (!edgePlace) return null;
    const dLat = edgePlace.geom.lat - center.lat;
    const dLng = edgePlace.geom.lng - center.lng;
    const bearing = (Math.atan2(dLng, dLat) * 180) / Math.PI;
    return {
      name: edgePlace.name,
      distance_m: edgePlace.distance_m ?? farthest,
      bearing: ((bearing % 360) + 360) % 360,
    };
  }, [edgePlace, center.lat, center.lng, farthest]);

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
      {/* New visual hero — SVG distance ring with the edge place named.
          Replaces the previous "control card first" pattern with
          "see what your radius looks like, then refine it." */}
      <RadiusRing
        mode={mode}
        minutes={minutes}
        meters={meters}
        centerLabel={center.label}
        edge={edgeForRing}
        countInside={inside.length}
      />

      {/* Quick-pick chips — one tap sets BOTH mode and minutes for
          the six most-asked-for combinations. The slider + mode
          buttons below still own fine control. */}
      <RadiusPresets
        mode={mode}
        minutes={minutes}
        onPick={(m, n) => {
          setMode(m);
          setMinutes(n);
        }}
      />

      <section className="space-y-3 rounded-[var(--app-radius-lg)] border bg-[var(--app-bg-elevated)] p-3.5 shadow-[var(--app-shadow-1)]"
               style={{ borderColor: "var(--app-border)" }}>
        {/* Center — a dropdown with every municipality + landmarks
            PLUS a "Use my location" button so the user has a real
            custom-center path. Obvious, fully reachable. */}
        <div className="flex items-center gap-2">
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
              value={myLoc ? -1 : presetIdx}
              onChange={(e) => {
                const v = Number(e.target.value);
                if (v >= 0) {
                  setMyLoc(null);
                  setPresetIdx(v);
                }
              }}
              className="w-full appearance-none rounded-[var(--app-radius-md)] border bg-[var(--app-bg-sunken)] py-2 pl-3 pr-9 text-[14px] font-semibold outline-none focus-visible:ring-2 focus-visible:ring-[var(--app-brand)]"
              style={{ borderColor: "var(--app-border)", color: "var(--app-ink)" }}
            >
              {myLoc && (
                <option value={-1}>Your location</option>
              )}
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
          {/* Use my location — geolocation override for "what's near
              ME right now" without picking a preset. Once set, it
              shows in the dropdown as "Your location" and persists
              until the user picks a different center. */}
          <button
            type="button"
            onClick={requestMyLocation}
            aria-pressed={Boolean(myLoc)}
            aria-busy={locating || undefined}
            title={myLoc ? "Using your location" : "Center on your location"}
            className="grid h-9 w-9 shrink-0 place-items-center rounded-full border transition active:scale-[0.94]"
            style={{
              borderColor: myLoc ? "var(--app-brand)" : "var(--app-border)",
              background: myLoc
                ? "color-mix(in srgb, var(--app-brand) 14%, var(--app-bg-elevated))"
                : "var(--app-bg-elevated)",
              color: myLoc ? "var(--app-brand)" : "var(--app-ink-2)",
            }}
          >
            <Locate
              className="h-4 w-4"
              strokeWidth={myLoc ? 2.5 : 2}
              fill={myLoc ? "currentColor" : "none"}
              aria-hidden
            />
          </button>
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
        </div>
      </section>

      {/* Category tile grid — tap a tile to expand JUST that section
          inline below. The RadiusRing above already shows the in-range
          count, so the header is just a single Expand-all affordance. */}
      {groups.length > 0 && (
        <section aria-label="Categories in radius" className="space-y-3">
          <div className="flex items-center justify-end">
            <button
              type="button"
              onClick={() => setSeeAll((v) => !v)}
              className="inline-flex shrink-0 items-center gap-1 text-[12px] font-semibold transition active:opacity-70"
              style={{ color: "var(--app-brand)" }}
              aria-pressed={seeAll}
            >
              {seeAll ? "Collapse all" : "Expand all"}
              <ChevronDown
                className={`h-3.5 w-3.5 transition-transform ${seeAll ? "rotate-180" : ""}`}
                strokeWidth={2.25}
                aria-hidden
              />
            </button>
          </div>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {groups.map((g) => {
              const color = CATEGORY_BY_SLUG[g.key]?.color ?? "#C4451C";
              const isOpen = expanded.has(g.key) || seeAll;
              return (
                <button
                  key={g.key}
                  type="button"
                  onClick={() => toggleExpand(g.key)}
                  aria-expanded={isOpen}
                  className="tactile tactile-interactive relative flex items-center justify-between gap-2 overflow-hidden rounded-[var(--app-radius-md)] px-3.5 py-2.5 text-left"
                  style={{
                    background: isOpen
                      ? `linear-gradient(135deg, color-mix(in srgb, ${color} 32%, var(--app-bg-elevated)), color-mix(in srgb, ${color} 10%, var(--app-bg-elevated)))`
                      : "var(--app-bg-elevated)",
                    boxShadow: isOpen ? `0 8px 22px -10px ${color}` : undefined,
                  }}
                >
                  <span
                    aria-hidden
                    className="absolute inset-y-0 left-0 w-[3px]"
                    style={{ background: color }}
                  />
                  <span className="relative min-w-0 flex-1 truncate">
                    <span
                      className="block font-serif text-[14px] font-semibold leading-tight tracking-tight"
                      style={{ color: "var(--app-ink)" }}
                    >
                      {g.label}
                    </span>
                    <span
                      className="block text-[10px] font-bold uppercase tracking-[0.08em]"
                      style={{ color }}
                    >
                      {g.items.length} {g.items.length === 1 ? "place" : "places"}
                    </span>
                  </span>
                  <ChevronDown
                    className={`relative h-4 w-4 shrink-0 transition-transform ${isOpen ? "rotate-180" : ""}`}
                    strokeWidth={2.25}
                    style={{ color }}
                    aria-hidden
                  />
                </button>
              );
            })}
          </div>
        </section>
      )}

      {/* Every in-radius place, grouped by the real category tree —
          rendered only for sections the user has expanded (via tap
          on the tile above) OR when "Expand all" is on. The food
          group also gets a cuisine filter built from what is
          actually nearby. */}
      {groups.map((g) => {
        const isFood = g.key === FOOD_GROUP;
        const shown =
          isFood && activeCuisine
            ? g.items.filter((p) => cuisinesOf(p).includes(activeCuisine))
            : g.items;
        const isOpen = expanded.has(g.key) || seeAll;
        if (!isOpen) return null;
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
            ) : (
              <div className="grid grid-cols-2 gap-3">
                {shown.map((p) => (
                  <PlaceCard key={p.slug} place={p} variant="grid" />
                ))}
              </div>
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
