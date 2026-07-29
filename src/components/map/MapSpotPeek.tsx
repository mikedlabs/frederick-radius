"use client";

import { ArrowRight, Crosshair, Navigation } from "lucide-react";
import { CATEGORY_BY_SLUG } from "@/data/categories";
import { formatDistance, type LngLat } from "@/lib/geo";
import { directionsHref } from "@/lib/map/directionsHref";
import type { NearbyUtility } from "./mapNearby";
import type { MapSpotContext } from "./mapSpotContext";
import MapResultSurface from "./MapResultSurface";

function eventTime(value: string): string {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    weekday: "short",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(value));
}

export default function MapSpotPeek({
  spot,
  context,
  utilities,
  label,
  temporary = false,
  attribution,
  onClose,
  onOpenPlace,
}: {
  spot: LngLat;
  context: MapSpotContext;
  utilities: NearbyUtility[];
  label?: string;
  temporary?: boolean;
  attribution?: string;
  onClose: () => void;
  onOpenPlace: (slug: string) => void;
}) {
  const hasContext =
    Boolean(context.place) ||
    Boolean(context.parking) ||
    Boolean(context.transit) ||
    Boolean(context.event) ||
    Boolean(context.road) ||
    utilities.length > 0;

  return (
    <MapResultSurface
      className="map-peek map-spot-peek"
      ariaLabel={label || "At this spot"}
      closeLabel="Close this map result"
      onClose={onClose}
    >
      <div className="map-peek-body" style={{ cursor: "default" }}>
        <span
          className="map-peek-thumb"
          style={{
            display: "grid",
            placeItems: "center",
            background: "color-mix(in srgb, var(--app-cool) 12%, var(--app-bg-sunken))",
            color: "var(--app-cool)",
          }}
          aria-hidden
        >
          <Crosshair className="h-6 w-6" strokeWidth={1.9} />
        </span>
        <span className="map-peek-text">
          <span className="map-peek-cat" style={{ color: "var(--app-cool)" }}>
            {temporary ? "Temporary map result" : "Local read"}
          </span>
          <span className="map-peek-name font-serif">{label || "At this spot"}</span>
          <span className="map-peek-detail">
            {temporary
              ? "Mapbox found this location. Radius has not verified it as a local listing."
              : hasContext
              ? "What Radius can confirm within a short walk."
              : "No Radius-mapped essentials are close enough to call nearby."}
          </span>
          {temporary && attribution && (
            <span className="map-peek-source">{attribution}</span>
          )}
        </span>
      </div>

      {hasContext && (
        <div
          className="map-peek-around-body"
          style={{
            borderTop: "1px solid var(--app-border)",
            paddingTop: 9,
          }}
        >
          {context.place && (
            <button
              type="button"
              className="flex min-h-11 w-full items-center justify-between gap-3 text-left"
              onClick={() => onOpenPlace(context.place!.slug)}
            >
              <span>
                <strong>Nearest place</strong>{" "}
                {context.place.name} · {CATEGORY_BY_SLUG[context.place.category]?.name ?? context.place.category}
              </span>
              <span className="shrink-0 font-mono text-[10px]" style={{ color: "var(--app-ink-3)" }}>
                {formatDistance(context.place.distM)}
              </span>
            </button>
          )}
          {utilities.length > 0 && (
            <p>
              <strong>Public essentials</strong>{" "}
              {utilities.map((item) => `${item.label} · ${formatDistance(item.distM)}`).join(" · ")}
            </p>
          )}
          {context.event && (
            <p>
              <strong>Starts nearby</strong>{" "}
              {context.event.title} · {eventTime(context.event.startsAt)} · {formatDistance(context.event.distM)}
            </p>
          )}
          {context.transit && (
            <p>
              <strong>Transit</strong>{" "}
              {context.transit.name} · {formatDistance(context.transit.distM)}
            </p>
          )}
          {context.parking && (
            <p>
              <strong>Parking</strong>{" "}
              {context.parking.name} · {formatDistance(context.parking.distM)}
              {context.parking.available != null ? ` · ${context.parking.available} spaces reported` : ""}
            </p>
          )}
          {context.road && (
            <p>
              <strong>
                {context.road.kind === "issue"
                  ? "Nearby civic report"
                  : "Road note"}
              </strong>{" "}
              {context.road.label} · {formatDistance(context.road.distM)}
            </p>
          )}
        </div>
      )}

      <div
        className="map-peek-acts"
        style={{
          gridTemplateColumns: context.place
            ? "minmax(0, 1.2fr) minmax(0, 1fr)"
            : "minmax(0, 1fr)",
        }}
      >
        <a
          href={directionsHref(spot.lat, spot.lng)}
          target="_blank"
          rel="noopener noreferrer"
          className="map-peek-act map-peek-act-go"
        >
          <Navigation className="h-4 w-4" strokeWidth={2.2} aria-hidden />
          Directions here
        </a>
        {context.place && (
          <button
            type="button"
            className="map-peek-act"
            onClick={() => onOpenPlace(context.place!.slug)}
          >
            Nearest place
            <ArrowRight className="h-4 w-4" strokeWidth={2.2} aria-hidden />
          </button>
        )}
      </div>
    </MapResultSurface>
  );
}
