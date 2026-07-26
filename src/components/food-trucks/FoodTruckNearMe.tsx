"use client";

import { useMemo } from "react";
import { ArrowUpRight, LocateFixed, MapPin } from "lucide-react";
import { formatDistance, haversineMeters } from "@/lib/geo";
import type { TruckBeacon } from "@/lib/food-trucks/beacon";
import { readBeacon } from "@/lib/food-trucks/beacon";
import { useGeolocation } from "@/hooks/useGeolocation";
import TruckLiveStatus from "./TruckLiveStatus";

export type NearbyFoodTruck = {
  slug: string;
  name: string;
  cuisine: string;
  beacon: TruckBeacon;
};

export default function FoodTruckNearMe({
  trucks,
  accent,
}: {
  trucks: NearbyFoodTruck[];
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

  return (
    <section id="near-me" className="scroll-mt-24 space-y-4">
      <div className="flex items-end justify-between gap-4 border-b pb-3" style={{ borderColor: "var(--app-border)" }}>
        <div>
          <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.14em]" style={{ color: accent }}>
            Operator-posted locations
          </p>
          <h2 className="mt-1 font-serif text-[29px] leading-none tracking-tight" style={{ color: "var(--app-ink)" }}>
            Out right now
          </h2>
        </div>
        {live.length > 1 && state.status !== "granted" ? (
          <button
            type="button"
            onClick={request}
            disabled={state.status === "loading"}
            className="tap-44 inline-flex shrink-0 items-center gap-1.5 rounded-full border px-3 text-[11.5px] font-semibold disabled:opacity-60"
            style={{ borderColor: "var(--app-border)", color: "var(--app-ink)" }}
          >
            <LocateFixed className="h-3.5 w-3.5" strokeWidth={2} aria-hidden />
            {state.status === "loading" ? "Locating…" : "Nearest first"}
          </button>
        ) : null}
      </div>

      {live.length > 0 ? (
        <ul className="space-y-2.5">
          {live.map((truck) => (
            <li
              key={truck.slug}
              className="rounded-[var(--app-radius-lg)] border p-4"
              style={{ borderColor: "var(--app-border)", background: "var(--app-bg-elevated)" }}
            >
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <p className="font-serif text-[21px] font-semibold leading-tight" style={{ color: "var(--app-ink)" }}>
                    {truck.name}
                  </p>
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
            </li>
          ))}
        </ul>
      ) : (
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
      )}
    </section>
  );
}
