"use client";

import { CornerUpRight, SquareParking } from "lucide-react";
import { directionsHref } from "@/lib/map/directionsHref";
import { haptic } from "@/lib/haptics";
import { track } from "@/lib/track";
import { haversineMeters, type LngLat } from "@/lib/geo";
import {
  parkingSpacesLabel,
  parkingTone,
  type ParkingPin,
} from "@/lib/map/parking";
import { formatMapTimestamp } from "./mapContent";
import MapResultSurface from "./MapResultSurface";
import { distanceFrom } from "./distanceOrigin";
import type { MapLayerSourceHealth } from "./deferredBrowseLayers";

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
  sourceHealth,
  onClose,
}: {
  pin: ParkingPin;
  userLoc: LngLat | null;
  sourceHealth?: MapLayerSourceHealth;
  onClose: () => void;
}) {
  const older = sourceHealth && (sourceHealth.stale || sourceHealth.status !== "current");
  const tone = older ? "neutral" : parkingTone(pin);
  const spaces = parkingSpacesLabel(pin);
  const spacesColor = TONE_COLOR[tone];

  const directionsUrl = directionsHref(pin.lat, pin.lng);
  // userLoc is the device fix, so the distance is measured from the reader.
  const distance = userLoc
    ? distanceFrom(haversineMeters(userLoc, { lng: pin.lng, lat: pin.lat }), "from you")
    : null;
  const updated = formatMapTimestamp(pin.updated);

  return (
    <MapResultSurface
      className="map-peek map-parking-peek"
      ariaLabel={pin.name}
      closeLabel={`Close ${pin.name}`}
      onClose={onClose}
    >
      <div className="map-peek-body" style={{ cursor: "default" }}>
        {/* No photograph: the plain glyph in muted ink, with no tile. */}
        <span className="map-peek-thumb" data-map-peek-glyph>
          <SquareParking className="h-6 w-6" strokeWidth={1.8} aria-hidden />
        </span>
        <span className="map-peek-text">
          <span className="map-peek-cat" style={{ color: "var(--app-cool-text)" }}>
            Parking garage
          </span>
          <span className="map-peek-name font-serif">{pin.name}</span>
          <span className="map-peek-meta">
            {spaces ? (
              <span style={{ color: spacesColor, fontWeight: 600 }}>{older ? `Last report: ${spaces.toLowerCase()}` : spaces}</span>
            ) : (
              <span style={{ color: "var(--app-ink-3)" }}>Live spaces not reported</span>
            )}
          </span>
          <span className="map-peek-detail">
            {pin.address}
            {distance ? ` · ${distance}` : ""}
          </span>
          {pin.rate && <span className="map-parking-rate">{pin.rate}</span>}
          {older && (
            <span className="map-peek-source" role="status">
              Current parking availability is unverified. Check again before relying on this report.
            </span>
          )}
          <span className="map-peek-source">
            {updated
              ? `Parking feed updated ${updated}`
              : "City garage information"}
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
    </MapResultSurface>
  );
}
