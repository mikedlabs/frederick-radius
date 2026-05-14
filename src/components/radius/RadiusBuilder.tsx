"use client";

import { useMemo, useState } from "react";
import { Footprints, Bike, Car, MapPin } from "lucide-react";
import PlaceCard from "@/components/place/PlaceCard";
import { decoratePlace } from "@/lib/loaders/places";
import { CATEGORY_BY_SLUG } from "@/data/categories";
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

const BUCKETS = [
  { id: "eat", title: "Eat & drink", cats: ["restaurant", "coffee", "bar", "brewery", "bakery", "pizza"] },
  { id: "do", title: "Do & see", cats: ["park", "trail", "museum", "gallery", "theater", "music", "playground", "antiques", "library"] },
  { id: "practical", title: "Practical", cats: ["parking", "transit", "pharmacy", "hardware", "voting", "government"] },
];

export default function RadiusBuilder({ places }: { places: Place[] }) {
  const [presetIdx, setPresetIdx] = useState(0);
  const [mode, setMode] = useState<TravelMode>("walk");
  const [minutes, setMinutes] = useState(10);

  const center = PRESETS[presetIdx];
  const meters = minutesToMeters(mode, minutes);

  const inside = useMemo(() => {
    return places
      .map((p) => ({ ...decoratePlace(p, { lng: center.lng, lat: center.lat }) }))
      .filter((p) => (p.distance_m ?? Infinity) <= meters)
      .sort((a, b) => (a.distance_m ?? Infinity) - (b.distance_m ?? Infinity));
  }, [places, center.lng, center.lat, meters]);

  const buckets = BUCKETS.map((b) => ({
    ...b,
    items: inside.filter((p) => {
      const cat = CATEGORY_BY_SLUG[p.category];
      return b.cats.includes(p.category) || (cat?.parent && b.cats.includes(cat.parent));
    }),
  }));

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

        <div className="grid grid-cols-3 gap-1.5">
          {MODES.map(({ mode: m, label, icon: Icon }) => {
            const active = m === mode;
            return (
              <button
                key={m}
                type="button"
                onClick={() => setMode(m)}
                aria-pressed={active}
                className="flex flex-col items-center justify-center gap-1 rounded-[var(--app-radius-md)] border py-2.5 text-xs font-medium transition-colors"
                style={{
                  borderColor: active ? "var(--app-brand)" : "var(--app-border)",
                  background: active ? "var(--app-brand)" : "var(--app-bg-elevated)",
                  color: active ? "white" : "var(--app-ink-2)",
                }}
              >
                <Icon className="h-4 w-4" strokeWidth={1.75} aria-hidden />
                {label}
              </button>
            );
          })}
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
        className="rounded-[var(--app-radius-md)] border bg-[var(--app-bg-sunken)] p-3 text-center"
        style={{ borderColor: "var(--app-border)" }}
      >
        <p className="font-serif text-lg" style={{ color: "var(--app-ink)" }}>
          <strong className="font-semibold" style={{ color: "var(--app-brand)" }}>{inside.length}</strong>{" "}
          place{inside.length === 1 ? "" : "s"} inside this radius
          {farthest > 0 && <> · farthest {formatDistance(farthest)}</>}
        </p>
      </section>

      {buckets.map((b) => b.items.length > 0 && (
        <section key={b.id} className="space-y-2">
          <h2 className="font-serif text-lg font-semibold tracking-tight" style={{ color: "var(--app-ink)" }}>
            {b.title} <span className="text-sm font-normal" style={{ color: "var(--app-ink-3)" }}>· {b.items.length}</span>
          </h2>
          <ul className="space-y-2">
            {b.items.map((p) => (
              <li key={p.slug}><PlaceCard place={p} /></li>
            ))}
          </ul>
        </section>
      ))}

      {inside.length === 0 && (
        <p className="rounded-[var(--app-radius-md)] border border-dashed px-4 py-10 text-center text-sm"
           style={{ borderColor: "var(--app-border)", color: "var(--app-ink-3)" }}>
          Nothing inside this radius. Move the slider, change the mode, or pick a different center.
        </p>
      )}
    </div>
  );
}
