"use client";

import { CornerUpRight, SquareParking, X } from "lucide-react";
import { directionsHref } from "@/lib/map/directionsHref";
import { haptic } from "@/lib/haptics";
import { track } from "@/lib/track";
import { formatDistance, haversineMeters, type LngLat } from "@/lib/geo";
import {
  parkingSpacesLabel,
  parkingTone,
  type ParkingPin,
} from "@/lib/map/parking";
import { formatMapTimestamp } from "./mapContent";

/**
 * MapParkingPeek — the quick-peek card for a downtown garage.
 *
 * A garage isn't a saveable place (no category, hours, or open_status), so
 * this is a small parking-specific sibling of MapPeek rather than a reuse:
 * it shares the .map-peek* card language for a consistent look, but its
 * content answers the parking decision in order: which garage, whether the
 * feed reports space, how far away it is, what it costs, how fresh the feed
 * is, and the Directions handoff.
 *
 * Honesty: the spaces line comes straight from parkingSpacesLabel, which
 * returns null when availability is unknown — we then say "Live spaces not
 * reported" instead of inventing a count.
 */

const TONE_COLOR = {
  positive: "var(--app-positive)",
  warning: "var(--app-warning-press, #8F5600)",
  danger: "var(--app-danger)",
  neutral: "var(--app-ink-3)",
} as const;

export default function MapParkingPeek({
  pin,
  userLoc,
  onClose,
}: {
  pin: ParkingPin;
  userLoc: LngLat | null;
  onClose: () => void;
}) {
  const tone = parkingTone(pin);
  const spaces = parkingSpacesLabel(pin);
  const spacesColor = TONE_COLOR[tone];

  const directionsUrl = directionsHref(pin.lat, pin.lng);
  const distance = userLoc
    ? formatDistance(haversineMeters(userLoc, { lng: pin.lng, lat: pin.lat }))
    : null;
  const updated = formatMapTimestamp(pin.updated);

  return (
    <div className="map-peek map-parking-peek" role="dialog" aria-label={pin.name}>
      <button
        type="button"
        className="map-peek-close tap-44"
        onClick={onClose}
        aria-label="Close"
      >
        <X className="h-4 w-4" strokeWidth={2.4} aria-hidden />
      </button>

      <div className="map-peek-body" style={{ cursor: "default" }}>
        <span
          className="map-peek-thumb"
          style={{
            background: "var(--app-cool)",
            display: "grid",
            placeItems: "center",
            color: "var(--app-on-brand, #FCFBF8)",
          }}
        >
          <SquareParking className="h-7 w-7" strokeWidth={2} aria-hidden />
        </span>
        <span className="map-peek-text">
          <span className="map-peek-cat" style={{ color: "var(--app-cool)" }}>
            Parking garage
          </span>
          <span className="map-peek-name font-serif">{pin.name}</span>
          <span className="map-peek-meta">
            {spaces ? (
              <span style={{ color: spacesColor, fontWeight: 600 }}>{spaces}</span>
            ) : (
              <span style={{ color: "var(--app-ink-3)" }}>Live spaces not reported</span>
            )}
          </span>
          <span className="map-peek-detail">
            {pin.address}
            {distance ? ` · ${distance} away` : ""}
          </span>
          {pin.rate && <span className="map-parking-rate">{pin.rate}</span>}
          <span className="map-peek-source">
            {updated
              ? `Parking feed updated ${updated}`
              : "Availability not reported · City garage information"}
          </span>
        </span>
      </div>

      <div className="map-peek-acts">
        <a
          href={directionsUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="map-peek-act map-peek-act-go"
          onClick={() => {
            haptic("light");
            track("map_parking_peek", { pick: "directions", garage: pin.slug });
          }}
        >
          <CornerUpRight className="h-4 w-4" strokeWidth={2} aria-hidden />
          Directions
        </a>
      </div>
    </div>
  );
}
