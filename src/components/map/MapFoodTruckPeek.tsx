"use client";

import Link from "next/link";
import { CornerUpRight, Radio, Truck } from "lucide-react";
import type { FoodTruckMapPin } from "./types";
import { directionsHref } from "@/lib/map/directionsHref";
import { haptic } from "@/lib/haptics";
import { track } from "@/lib/track";
import MapResultSurface from "./MapResultSurface";

function remainingLabel(expiresAt: string): string {
  const minutes = Math.max(1, Math.round((Date.parse(expiresAt) - Date.now()) / 60_000));
  if (minutes >= 90) return `About ${Math.round(minutes / 60)} hours left`;
  if (minutes >= 45) return "About an hour left";
  return `About ${minutes} minutes left`;
}
/** High-priority answer card for an operator-confirmed live truck pin. */
export default function MapFoodTruckPeek({ pin, onClose }: { pin: FoodTruckMapPin; onClose: () => void }) {
  return (
    <MapResultSurface
      className="map-peek"
      ariaLabel={`${pin.name} live location`}
      closeLabel={`Close ${pin.name}`}
      onClose={onClose}
    >
      <div className="map-peek-body" style={{ cursor: "default" }}>
        <span className="map-peek-thumb" style={{ background: "var(--app-brand)", display: "grid", placeItems: "center", color: "var(--app-on-brand)" }}>
          <Truck className="h-7 w-7" strokeWidth={2} aria-hidden />
        </span>
        <span className="map-peek-text">
          <span className="map-peek-cat" style={{ color: "var(--app-positive)" }}>
            <Radio className="mr-1 inline h-3 w-3" strokeWidth={2.2} aria-hidden />
            Operator-confirmed live pin
          </span>
          <span className="map-peek-name font-serif">{pin.name}</span>
          <span className="map-peek-meta">
            <span style={{ color: "var(--app-positive)", fontWeight: 650 }}>{remainingLabel(pin.expiresAt)}</span>
            <span aria-hidden className="map-peek-dot">·</span>
            <span>{pin.cuisine}</span>
          </span>
          {pin.spot ? <span className="mt-1 text-[11.5px]" style={{ color: "var(--app-ink-2)" }}>{pin.spot}</span> : null}
          {pin.note ? <span className="mt-0.5 text-[11px]" style={{ color: "var(--app-ink-3)" }}>{pin.note}</span> : null}
        </span>
      </div>

      <div className="map-peek-acts">
        <a
          href={directionsHref(pin.lat, pin.lng)}
          target="_blank"
          rel="noopener noreferrer"
          className="map-peek-act map-peek-act-go"
          onClick={() => {
            haptic("light");
            track("map_food_truck_peek", { pick: "directions", truck: pin.slug });
          }}
        >
          <CornerUpRight className="h-4 w-4" strokeWidth={2} aria-hidden />
          Directions
        </a>
        <Link href={`/food-trucks#truck-${pin.slug}`} className="map-peek-act">
          Truck details
        </Link>
      </div>
    </MapResultSurface>
  );
}
