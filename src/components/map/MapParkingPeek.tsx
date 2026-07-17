"use client";

import { CornerUpRight, SquareParking, X } from "lucide-react";
import { directionsHref } from "@/lib/map/directionsHref";
import { haptic } from "@/lib/haptics";
import { track } from "@/lib/track";
import {
  parkingSpacesLabel,
  parkingTone,
  type ParkingPin,
} from "@/lib/map/parking";

/**
 * MapParkingPeek — the quick-peek card for a downtown garage.
 *
 * A garage isn't a saveable place (no category, hours, or open_status), so
 * this is a small parking-specific sibling of MapPeek rather than a reuse:
 * it shares the .map-peek* card language for a consistent look, but its
 * content is the three things that matter when you're deciding where to
 * park — the garage name, the LIVE spaces line (only a real number when the
 * feed has one, else no number), the hourly rate when the data carries it,
 * and a Directions handoff.
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
  onClose,
}: {
  pin: ParkingPin;
  onClose: () => void;
}) {
  const tone = parkingTone(pin);
  const spaces = parkingSpacesLabel(pin);
  const spacesColor = TONE_COLOR[tone];

  const directionsUrl = directionsHref(pin.lat, pin.lng);

  return (
    <div className="map-peek" role="dialog" aria-label={pin.name}>
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
            Downtown parking
          </span>
          <span className="map-peek-name font-serif">{pin.name}</span>
          <span className="map-peek-meta">
            {spaces ? (
              <span style={{ color: spacesColor, fontWeight: 600 }}>{spaces}</span>
            ) : (
              <span style={{ color: "var(--app-ink-3)" }}>Live spaces not reported</span>
            )}
            {pin.rate && (
              <>
                <span aria-hidden className="map-peek-dot">
                  ·
                </span>
                <span className="map-peek-dist">{pin.rate}</span>
              </>
            )}
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
