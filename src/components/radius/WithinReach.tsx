"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Coffee,
  Utensils,
  Beer,
  Trees,
  Palette,
  ShoppingBag,
  Toilet,
  SquareParking,
  Droplets,
  Trash2,
  Armchair,
  type LucideIcon,
} from "lucide-react";
import Link from "next/link";
import type { PlaceCardData } from "@/lib/loaders/places";
import type { Amenity } from "@/lib/loaders/amenities";
import { metersToMinutes, type TravelMode } from "@/lib/geo";
import { usePlaceSheet } from "@/components/place/PlaceSheetProvider";
import { haptic } from "@/lib/haptics";
import { BRAND } from "@/lib/brand";
import type { ReachBoundaryStatus } from "./reach";
import {
  MATRIX_MIN_DESTINATIONS,
  isMatrixTravelMode,
  matrixEtaQuery,
} from "@/lib/mapboxMatrix";
import {
  formatReachMinutes,
  routedMinutesFor,
  shortlistReachMatrixDestinations,
  sortReachByTravelTime,
} from "./withinReachModel";

/**
 * WithinReach — the map's "you can reach X in N minutes" outcomes strip.
 *
 * Answers the question a stranger actually has — "what's close, and how
 * close?" — instead of "488 places in radius." For each useful kind it
 * finds the NEAREST match inside the current radius, estimates walk/bike/
 * drive minutes from straight-line distance, and renders a compact tappable
 * chip. Sorted nearest first so the quickest wins lead. Self-hides kinds with
 * no match (and the whole strip when nothing's reachable), so dialing the
 * slider down never shows empty placeholders. Live: the parent recomputes the
 * inside set on every slider/center change, so this tracks the radius.
 *
 * Supersedes the 3-tile BestNearbyMoves with a fuller, denser picture.
 */

type Group = {
  key: string;
  label: string;
  icon: LucideIcon;
  color: string;
  cats?: string[]; // place categories that satisfy this kind
  amenity?: string; // OR an OSM amenity kind
  mapGroup?: string;
};

const GROUPS: Group[] = [
  { key: "coffee", label: "Coffee", icon: Coffee, color: "var(--app-brand)", cats: ["coffee", "bakery"] },
  { key: "eat", label: "Eat", icon: Utensils, color: "#A02929", cats: ["restaurant", "pizza"] },
  { key: "drinks", label: "Drinks", icon: Beer, color: BRAND.colors.functionalAmber, cats: ["bar", "brewery"] },
  { key: "park", label: "Park", icon: Trees, color: "var(--app-brand-2)", cats: ["park", "trail", "playground", "outdoors"] },
  { key: "art", label: "Art", icon: Palette, color: "#7E2C6F", cats: ["gallery", "museum", "theater"] },
  { key: "shops", label: "Shops", icon: ShoppingBag, color: "var(--app-cool)", cats: ["shopping", "market", "book-store"] },
  { key: "restroom", label: "Restroom", icon: Toilet, color: "var(--app-cool)", amenity: "restroom" },
  { key: "water", label: "Water", icon: Droplets, color: "var(--app-cool)", amenity: "water", mapGroup: "water" },
  { key: "trash", label: "Trash", icon: Trash2, color: "var(--app-ink-3)", amenity: "trash", mapGroup: "trash" },
  { key: "bench", label: "Seat", icon: Armchair, color: "var(--app-ink-3)", amenity: "bench", mapGroup: "seating" },
  { key: "parking", label: "Parking", icon: SquareParking, color: "var(--app-ink-3)", cats: ["parking"] },
];

const EMPTY_ROUTED_DURATIONS: Record<string, number> = {};

type Reach = {
  group: Group;
  matrixId: string;
  name: string;
  minutes: number;
  distanceMeters: number;
  lng: number;
  lat: number;
  place?: PlaceCardData;
  href?: string;
};

export default function WithinReach({
  places,
  amenities,
  mode,
  originLng,
  originLat,
  boundaryStatus,
}: {
  /** Inside-radius places, distance-decorated, distance-ascending. */
  places: PlaceCardData[];
  /** Inside-radius OSM amenities, distance-ascending. */
  amenities: (Amenity & { distance_m: number })[];
  mode: TravelMode;
  /** Rounded before either value enters the Matrix request URL. */
  originLng: number;
  originLat: number;
  boundaryStatus: ReachBoundaryStatus;
}) {
  const { openSheet } = usePlaceSheet();

  const baseReach = useMemo<Reach[]>(() => {
    const out: Reach[] = [];
    for (const group of GROUPS) {
      if (group.cats) {
        const cats = new Set(group.cats);
        const hit = places.find(
          (p) =>
            cats.has(p.category) &&
            p.distance_m !== undefined &&
            p.open_status?.state !== "closed",
        );
        if (hit && hit.distance_m !== undefined) {
          out.push({
            group,
            matrixId: `place:${hit.slug}`,
            name: hit.name,
            minutes: Math.max(1, metersToMinutes(mode, hit.distance_m)),
            distanceMeters: hit.distance_m,
            lng: hit.geom.lng,
            lat: hit.geom.lat,
            place: hit,
          });
        }
      } else if (group.amenity) {
        const hit = amenities.find((a) => a.kind === group.amenity);
        if (hit) {
          out.push({
            group,
            matrixId: `amenity:${hit.id}`,
            name: hit.name ?? group.label,
            minutes: Math.max(1, metersToMinutes(mode, hit.distance_m)),
            distanceMeters: hit.distance_m,
            lng: hit.lng,
            lat: hit.lat,
            href: `/map?amenity=${group.mapGroup ?? group.key}&at=${hit.lat.toFixed(6)},${hit.lng.toFixed(6)}`,
          });
        }
      }
    }
    return out;
  }, [places, amenities, mode]);

  // Matrix runs only on this small, deterministic set — never the full
  // in-radius catalog. Keeping it stable lets Mapbox/server caches absorb
  // repeat slider exploration.
  const matrixDestinations = useMemo(
    () =>
      shortlistReachMatrixDestinations(
        baseReach.map((item) => ({
          id: item.matrixId,
          lng: item.lng,
          lat: item.lat,
          distanceMeters: item.distanceMeters,
        })),
      ),
    [baseReach],
  );
  const matrixQuery = useMemo(() => {
    if (
      boundaryStatus !== "street" ||
      !isMatrixTravelMode(mode) ||
      matrixDestinations.length < MATRIX_MIN_DESTINATIONS
    ) {
      return null;
    }
    return matrixEtaQuery(
      { lng: originLng, lat: originLat },
      mode,
      matrixDestinations,
    );
  }, [
    boundaryStatus,
    matrixDestinations,
    mode,
    originLat,
    originLng,
  ]);
  const [matrixState, setMatrixState] = useState<{
    query: string;
    durations: Record<string, number>;
  } | null>(null);

  useEffect(() => {
    if (!matrixQuery) return;
    const controller = new AbortController();
    let cancelled = false;
    // A slider drag can emit many valid whole-minute isochrones. Waiting for
    // the street boundary and then settling for 450ms prevents a Matrix storm.
    const timeoutId = window.setTimeout(() => {
      fetch(`/api/travel-matrix?${matrixQuery}`, {
        cache: "force-cache",
        signal: controller.signal,
      })
        .then((response) => (response.ok ? response.json() : null))
        .then((data: unknown) => {
          if (cancelled) return;
          const durations: Record<string, number> = {};
          if (
            data &&
            typeof data === "object" &&
            "ok" in data &&
            data.ok === true &&
            "durations" in data &&
            data.durations &&
            typeof data.durations === "object"
          ) {
            const allowed = new Set(
              matrixDestinations.map((destination) => destination.id),
            );
            for (const [id, value] of Object.entries(data.durations)) {
              if (
                allowed.has(id) &&
                Number.isInteger(value) &&
                (value as number) > 0
              ) {
                durations[id] = value as number;
              }
            }
          }
          setMatrixState({ query: matrixQuery, durations });
        })
        .catch(() => {
          if (!cancelled) {
            setMatrixState({ query: matrixQuery, durations: {} });
          }
        });
    }, 450);

    return () => {
      cancelled = true;
      window.clearTimeout(timeoutId);
      controller.abort();
    };
  }, [matrixDestinations, matrixQuery]);

  const routedDurations =
    matrixQuery && matrixState?.query === matrixQuery
      ? matrixState.durations
      : EMPTY_ROUTED_DURATIONS;
  const reach = useMemo(
    () => sortReachByTravelTime(baseReach, routedDurations),
    [baseReach, routedDurations],
  );
  const hasRoutedTimes = reach.some(
    (item) => routedMinutesFor(routedDurations, item.matrixId) !== null,
  );

  if (reach.length === 0) return null;

  return (
    <section aria-label="Within reach" className="space-y-2">
      <h2 className="eyebrow px-1" style={{ color: "var(--app-ink-3)" }}>
        Within reach
      </h2>
      <ul className="flex flex-wrap gap-1.5">
        {reach.map((r) => {
          const Icon = r.group.icon;
          const routedMinutes = routedMinutesFor(
            routedDurations,
            r.matrixId,
          );
          const body = (
            <>
              <span
                className="grid h-5 w-5 shrink-0 place-items-center rounded-full"
                style={{ background: `color-mix(in srgb, ${r.group.color} 16%, transparent)` }}
                aria-hidden
              >
                <Icon className="h-3 w-3" strokeWidth={2.25} style={{ color: r.group.color }} />
              </span>
              <span className="text-[12px] font-semibold" style={{ color: "var(--app-ink)" }}>
                {r.group.label}
              </span>
              <span
                className="font-mono text-[12px] font-bold tabular-nums"
                style={{ color: r.group.color }}
                aria-label={`${routedMinutes === null ? "Estimated" : "Routed"} ${routedMinutes ?? r.minutes} minutes`}
              >
                {formatReachMinutes(r.minutes, routedMinutes)}
              </span>
            </>
          );
          return (
            <li key={r.group.key}>
              {r.place ? (
                <button
                  type="button"
                  title={r.name}
                  onClick={() => {
                    haptic("light");
                    openSheet(r.place!);
                  }}
                  className="tactile-interactive inline-flex items-center gap-1.5 rounded-full border bg-[var(--app-bg-elevated)] py-1.5 pl-2 pr-2.5 text-left transition active:scale-[0.96]"
                  style={{ borderColor: "var(--app-border)" }}
                >
                  {body}
                </button>
              ) : (
                <Link
                  href={r.href ?? "/map"}
                  title={r.name}
                  className="tactile-interactive inline-flex items-center gap-1.5 rounded-full border bg-[var(--app-bg-elevated)] py-1.5 pl-2 pr-2.5 text-left transition active:scale-[0.96]"
                  style={{ borderColor: "var(--app-border)" }}
                >
                  {body}
                </Link>
              )}
            </li>
          );
        })}
      </ul>
      <p className="px-1 text-[10px]" style={{ color: "var(--app-ink-3)" }}>
        {boundaryStatus === "street"
          ? hasRoutedTimes
            ? "Plain times are routed on mapped streets. Times marked ~ are straight-line estimates where no route was returned."
            : "Times marked ~ are straight-line estimates; the reach boundary follows mapped streets."
          : boundaryStatus === "loading"
            ? "Times marked ~ and the temporary reach circle are straight-line estimates while mapped streets load."
            : "Times marked ~ and the reach circle are straight-line estimates because mapped streets are unavailable."}
      </p>
    </section>
  );
}
