"use client";

import Link from "next/link";
import {
  CalendarClock,
  CornerUpRight,
  ExternalLink,
  Radio,
  Truck,
} from "lucide-react";
import type { FoodTruckMapPin } from "./types";
import { directionsHref } from "@/lib/map/directionsHref";
import { haptic } from "@/lib/haptics";
import { track } from "@/lib/track";
import MapResultSurface from "./MapResultSurface";
import { formatEasternClock } from "@/lib/format/easternClock";
import { easternDayKey } from "@/lib/tz";

function remainingLabel(expiresAt: string): string {
  const minutes = Math.max(1, Math.round((Date.parse(expiresAt) - Date.now()) / 60_000));
  if (minutes >= 90) return `About ${Math.round(minutes / 60)} hours left`;
  if (minutes >= 45) return "About an hour left";
  return `About ${minutes} minutes left`;
}

function publishedTiming(pin: Extract<FoodTruckMapPin, { availability: "published-stop" }>): string {
  const now = new Date();
  const start = new Date(pin.startedAt);
  const end = pin.expiresAt ? new Date(pin.expiresAt) : null;
  if (start.getTime() <= now.getTime() && end && end.getTime() > now.getTime()) {
    return `The published window runs through ${formatEasternClock(end)}.`;
  }
  const day = easternDayKey(start) === easternDayKey(now)
    ? "today"
    : new Intl.DateTimeFormat("en-US", {
        timeZone: "America/New_York",
        weekday: "short",
      }).format(start);
  return `This stop is published for ${day} at ${formatEasternClock(start)}.`;
}

/** High-priority answer card that keeps live and scheduled evidence distinct. */
export default function MapFoodTruckPeek({ pin, onClose }: { pin: FoodTruckMapPin; onClose: () => void }) {
  const live = pin.availability === "operator-live";
  return (
    <MapResultSurface
      className="map-peek"
      ariaLabel={live ? `${pin.name} live location` : `${pin.name} published stop`}
      closeLabel={`Close ${pin.name}`}
      onClose={onClose}
    >
      <div className="map-peek-body" style={{ cursor: "default" }}>
        <span className="map-peek-thumb" style={{ background: "var(--app-brand)", display: "grid", placeItems: "center", color: "var(--app-on-brand)" }}>
          <Truck className="h-7 w-7" strokeWidth={2} aria-hidden />
        </span>
        <span className="map-peek-text">
          <span
            className="map-peek-cat"
            style={{ color: live ? "var(--app-positive)" : "var(--app-brand-press)" }}
          >
            {live ? (
              <Radio className="mr-1 inline h-3 w-3" strokeWidth={2.2} aria-hidden />
            ) : (
              <CalendarClock className="mr-1 inline h-3 w-3" strokeWidth={2.2} aria-hidden />
            )}
            {live ? "Operator confirmed live" : "Published stop"}
          </span>
          <span className="map-peek-name font-serif">{pin.name}</span>
          <span className="map-peek-meta">
            <span style={{ color: live ? "var(--app-positive)" : "var(--app-ink)", fontWeight: 650 }}>
              {live ? remainingLabel(pin.expiresAt) : publishedTiming(pin)}
            </span>
            <span aria-hidden className="map-peek-dot">·</span>
            <span>{pin.cuisine}</span>
          </span>
          {live && pin.spot ? <span className="mt-1 text-[11.5px]" style={{ color: "var(--app-ink-2)" }}>{pin.spot}</span> : null}
          {live && pin.note ? <span className="mt-0.5 text-[11px]" style={{ color: "var(--app-ink-3)" }}>{pin.note}</span> : null}
          {!live ? (
            <span className="mt-1 text-[11.5px]" style={{ color: "var(--app-ink-2)" }}>
              {pin.venueName}. The schedule does not confirm that the truck has arrived.
            </span>
          ) : null}
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
        <Link href={pin.href} className="map-peek-act">
          Truck details
        </Link>
        {!live ? (
          <a
            href={pin.sourceUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="map-peek-act"
          >
            <ExternalLink className="h-4 w-4" strokeWidth={2} aria-hidden />
            Schedule source
          </a>
        ) : null}
      </div>
    </MapResultSurface>
  );
}
