"use client";

import Link from "next/link";
import { Fragment, useMemo } from "react";
import {
  ArrowUpRight,
  CalendarDays,
  Clock3,
  ExternalLink,
  LocateFixed,
  MapPin,
} from "lucide-react";
import type { FoodTruck } from "@/data/food-trucks";
import { formatDistance, haversineMeters } from "@/lib/geo";
import type { TruckBeacon } from "@/lib/food-trucks/beacon";
import { readBeacon } from "@/lib/food-trucks/beacon";
import {
  prepareNearbyPublishedStops,
  type NearbyPublishedStop,
} from "@/lib/food-trucks/nearby";
import { foodTruckStopDirectionsUrl } from "@/lib/food-trucks/presentation";
import type { FoodTruckScheduleStop } from "@/lib/food-trucks/schedule-types";
import { useGeolocation, type GeoState } from "@/hooks/useGeolocation";
import FoodTruckIdentity from "./FoodTruckIdentity";
import TruckLiveStatus from "./TruckLiveStatus";

export type NearbyFoodTruck = Pick<
  FoodTruck,
  "slug" | "name" | "cuisine" | "kind" | "media"
> & {
  beacon: TruckBeacon;
};

const MAX_NEARBY_STOPS = 3;

function stopDateTime(iso: string): string {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(iso));
}

function stopTime(iso: string): string {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(iso));
}

function publishedStopTiming(stop: NearbyPublishedStop): string {
  const end = stop.endsAt ? stopTime(stop.endsAt) : null;
  if (stop.timing === "scheduled-now") {
    return end ? `Scheduled now · until ${end}` : "Scheduled now";
  }
  if (stop.timing === "today") {
    return `Today · ${stopTime(stop.startsAt)}${end ? `–${end}` : ""}`;
  }
  return `${stopDateTime(stop.startsAt)}${end ? `–${end}` : ""}`;
}

export function foodTruckLocationFallback(
  status: GeoState["status"],
): string | null {
  if (status === "denied") {
    return "Location is blocked. Published stops are sorted by time. Allow location in your browser settings to see nearest first.";
  }
  if (status === "unavailable") {
    return "Location is not available right now, so published stops are sorted by time. You can try again.";
  }
  if (status === "error") {
    return "We could not get your location, so published stops are sorted by time. You can try again.";
  }
  return null;
}

export function canRequestFoodTruckLocation(
  status: GeoState["status"],
): boolean {
  return (
    status === "idle" ||
    status === "loading" ||
    status === "unavailable" ||
    status === "error"
  );
}

export function foodTruckLocationActionLabel(
  status: GeoState["status"],
): string {
  if (status === "loading") return "Locating…";
  if (status === "unavailable" || status === "error") return "Try again";
  return "Find nearest";
}

export default function FoodTruckNearMe({
  trucks,
  stops,
  asOf,
  accent,
}: {
  trucks: NearbyFoodTruck[];
  stops: FoodTruckScheduleStop[];
  /** Server-render timestamp keeps the upcoming cutoff stable during hydration. */
  asOf: string;
  accent: string;
}) {
  const { state, request } = useGeolocation();
  const position = state.status === "granted" ? state.position : null;
  const live = useMemo(
    () =>
      trucks
        .flatMap((truck) => {
          const beacon = readBeacon(truck.beacon, new Date());
          if (!beacon) return [];
          const distance = position
            ? haversineMeters(position, { lat: beacon.lat, lng: beacon.lng })
            : null;
          return [{ ...truck, live: beacon, distance }];
        })
        .sort((a, b) => {
          if (a.distance !== null && b.distance !== null) return a.distance - b.distance;
          return a.name.localeCompare(b.name);
        }),
    [position, trucks],
  );
  const published = useMemo(
    () => prepareNearbyPublishedStops(stops, position, new Date(asOf)),
    [asOf, position, stops],
  );
  const visiblePublished = published.slice(0, MAX_NEARBY_STOPS);
  const canLocate = live.length > 0 || published.length > 0;
  const locationFallback = foodTruckLocationFallback(state.status);
  const canRequestLocation = canRequestFoodTruckLocation(state.status);

  return (
    <section id="near-me" className="scroll-mt-24 space-y-4">
      <div className="flex items-end justify-between gap-4 border-b pb-3" style={{ borderColor: "var(--app-border)" }}>
        <div>
          <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.14em]" style={{ color: accent }}>
            Live check-ins and official schedules
          </p>
          <h2 className="mt-1 font-serif text-[29px] leading-none tracking-tight" style={{ color: "var(--app-ink)" }}>
            {position
              ? "Closest food trucks"
              : live.length > 0
                ? "Food trucks out now"
                : "Food trucks coming up"}
          </h2>
        </div>
        {canLocate && canRequestLocation ? (
          <button
            type="button"
            onClick={request}
            disabled={state.status === "loading"}
            className="tap-44 inline-flex shrink-0 items-center gap-1.5 rounded-full border px-3 text-[11.5px] font-semibold disabled:opacity-60"
            style={{ borderColor: "var(--app-border)", color: "var(--app-ink)" }}
          >
            <LocateFixed className="h-3.5 w-3.5" strokeWidth={2} aria-hidden />
            {foodTruckLocationActionLabel(state.status)}
          </button>
        ) : null}
      </div>

      {locationFallback ? (
        <p
          role="status"
          aria-live="polite"
          className="rounded-[var(--app-radius-md)] border px-3.5 py-3 text-[12px] leading-relaxed"
          style={{
            borderColor: "var(--app-border)",
            background: "var(--app-bg-sunken)",
            color: "var(--app-ink-2)",
          }}
        >
          {locationFallback}
        </p>
      ) : null}

      {live.length > 0 ? (
        <div className="space-y-2.5">
          <div className="flex items-center justify-between gap-3">
            <p className="text-[11px] font-semibold uppercase tracking-[0.11em]" style={{ color: "var(--app-ink-2)" }}>
              Operator-confirmed check-ins
            </p>
            <span className="inline-flex items-center gap-1.5 text-[10.5px] font-semibold" style={{ color: "var(--app-positive)" }}>
              <span aria-hidden className="live-dot h-2 w-2 rounded-full" style={{ background: "var(--app-positive)" }} />
              Live
            </span>
          </div>
          <ul className="space-y-2.5">
            {live.map((truck) => (
              <li
                key={truck.slug}
                className="rounded-[var(--app-radius-lg)] border p-4"
                style={{ borderColor: "var(--app-border)", background: "var(--app-bg-elevated)" }}
              >
                <div className="flex items-start gap-3">
                  <div className="food-truck-near-identity shrink-0">
                    <FoodTruckIdentity
                      truck={truck}
                      size="thumb"
                      decorative
                    />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <Link
                          href={`#truck-${truck.slug}`}
                          className="block truncate font-serif text-[21px] font-semibold leading-tight underline decoration-[color:var(--app-border-strong)] underline-offset-4"
                          style={{ color: "var(--app-ink)" }}
                        >
                          {truck.name}
                        </Link>
                        <p className="mt-0.5 text-[11.5px]" style={{ color: "var(--app-ink-3)" }}>
                          {truck.cuisine}
                          {truck.distance !== null ? ` · ${formatDistance(truck.distance)} away` : ""}
                        </p>
                      </div>
                      <span
                        aria-label="Live location"
                        className="inline-flex shrink-0 items-center gap-1.5 text-[10.5px] font-semibold"
                        style={{ color: "var(--app-positive)" }}
                      >
                        <span aria-hidden className="live-dot h-2 w-2 rounded-full" style={{ background: "var(--app-positive)" }} />
                        Live
                      </span>
                    </div>
                    <TruckLiveStatus beacon={truck.beacon} accent={accent} />
                  </div>
                </div>
              </li>
            ))}
          </ul>
        </div>
      ) : published.length > 0 ? (
        <p
          className="rounded-[var(--app-radius-md)] border px-3.5 py-3 text-[12px] leading-relaxed"
          style={{
            borderColor: "var(--app-border)",
            background: "var(--app-bg-sunken)",
            color: "var(--app-ink-2)",
          }}
        >
          No operator has shared a live location. The published schedule below is the next-best information.
        </p>
      ) : null}

      {visiblePublished.length > 0 ? (
        <div className="space-y-2.5">
          <div>
            <div className="flex items-center justify-between gap-3">
              <p className="text-[11px] font-semibold uppercase tracking-[0.11em]" style={{ color: "var(--app-ink-2)" }}>
                Published schedule
              </p>
              <span className="inline-flex items-center gap-1.5 text-[10.5px] font-semibold" style={{ color: "var(--app-ink-3)" }}>
                <CalendarDays className="h-3.5 w-3.5" strokeWidth={2} aria-hidden />
                Schedule
              </span>
            </div>
            <p className="mt-1 text-[11.5px] leading-relaxed" style={{ color: "var(--app-ink-3)" }}>
              These times come from venue and organizer calendars. A scheduled stop is not a live check-in.
            </p>
          </div>
          <ul className="grid gap-2 sm:grid-cols-2">
            {visiblePublished.map((stop) => {
              const names = stop.vendors.map((item) => item.name).join(" · ");
              return (
                <li
                  key={stop.id}
                  className="rounded-[var(--app-radius-md)] border px-3.5 py-3"
                  style={{ borderColor: "var(--app-border)", background: "var(--app-bg-elevated)" }}
                >
                  <div className="flex items-start justify-between gap-3">
                    <p className="inline-flex min-w-0 items-center gap-1.5 text-[11px] font-semibold" style={{ color: accent }}>
                      <Clock3 className="h-3.5 w-3.5 shrink-0" strokeWidth={2} aria-hidden />
                      <span>{publishedStopTiming(stop)}</span>
                    </p>
                    {stop.distance !== null ? (
                      <span className="shrink-0 font-mono text-[10.5px] tabular-nums" style={{ color: "var(--app-ink-3)" }}>
                        {formatDistance(stop.distance)}
                      </span>
                    ) : null}
                  </div>
                  <p className="mt-2 font-serif text-[19px] font-semibold leading-tight" style={{ color: "var(--app-ink)" }}>
                    {stop.vendors.map((vendor, index) => (
                      <Fragment key={`${stop.id}-${vendor.name}`}>
                        {index > 0 ? " · " : null}
                        {vendor.slug ? (
                          <Link
                            href={`#truck-${vendor.slug}`}
                            className="underline decoration-[color:var(--app-border-strong)] underline-offset-4"
                          >
                            {vendor.name}
                          </Link>
                        ) : vendor.name}
                      </Fragment>
                    ))}
                  </p>
                  <p className="mt-1 flex items-start gap-1.5 text-[11.5px] leading-snug" style={{ color: "var(--app-ink-2)" }}>
                    <MapPin className="mt-px h-3.5 w-3.5 shrink-0" strokeWidth={2} aria-hidden />
                    {stop.venuePlaceSlug ? (
                      <Link
                        href={`/places/${stop.venuePlaceSlug}`}
                        className="font-semibold underline decoration-[color:var(--app-border-strong)] underline-offset-2"
                      >
                        {stop.venueName}
                      </Link>
                    ) : (
                      <span>{stop.venueName}</span>
                    )}
                  </p>
                  <p className="mt-2 text-[10.5px]" style={{ color: "var(--app-ink-3)" }}>
                    The schedule was published by {stop.sourceName}.
                  </p>
                  <div className="mt-2 flex gap-3 border-t pt-2" style={{ borderColor: "var(--app-border)" }}>
                    <a
                      href={foodTruckStopDirectionsUrl(stop)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="tap-44-y inline-flex items-center gap-1 text-[11px] font-semibold"
                      style={{ color: "var(--app-ink)" }}
                    >
                      Directions
                      <ArrowUpRight className="h-3.5 w-3.5" strokeWidth={2} aria-hidden />
                    </a>
                    <a
                      href={stop.sourceUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      aria-label={`Open the ${stop.sourceName} source for ${names}`}
                      className="tap-44-y inline-flex items-center gap-1 text-[11px] font-semibold"
                      style={{ color: "var(--app-ink-2)" }}
                    >
                      Source
                      <ExternalLink className="h-3 w-3" strokeWidth={2} aria-hidden />
                    </a>
                  </div>
                </li>
              );
            })}
          </ul>
          {published.length > MAX_NEARBY_STOPS ? (
            <a
              href="#this-week"
              className="tap-44-y inline-flex items-center gap-1 text-[11.5px] font-semibold underline underline-offset-4"
              style={{ color: accent }}
            >
              See the complete weekly schedule
              <ArrowUpRight className="h-3.5 w-3.5" strokeWidth={2} aria-hidden />
            </a>
          ) : null}
        </div>
      ) : live.length === 0 ? (
        <div className="food-truck-near-empty">
          <MapPin className="h-5 w-5 shrink-0" strokeWidth={1.8} aria-hidden style={{ color: accent }} />
          <div>
            <p className="font-serif text-[19px] font-semibold" style={{ color: "var(--app-ink)" }}>
              No truck has shared a live location.
            </p>
            <p className="mt-1 text-[12px] leading-relaxed" style={{ color: "var(--app-ink-2)" }}>
              This does not mean every truck is parked. Check the published stops before making a trip.
            </p>
            <a
              href="#this-week"
              className="tap-44-y mt-1.5 inline-flex items-center gap-1 text-[11.5px] font-semibold underline"
              style={{ color: accent }}
            >
              Check this week
              <ArrowUpRight className="h-3.5 w-3.5" strokeWidth={2} aria-hidden />
            </a>
          </div>
        </div>
      ) : null}
    </section>
  );
}
