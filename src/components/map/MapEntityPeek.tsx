"use client";

import Link from "next/link";
import {
  Building2,
  CalendarDays,
  Camera,
  CornerUpRight,
  ExternalLink,
  Landmark,
  MapPin,
  TrainFront,
} from "lucide-react";
import { CATEGORY_BY_SLUG } from "@/data/categories";
import { directionsHref } from "@/lib/map/directionsHref";
import { formatDistance, haversineMeters, type LngLat } from "@/lib/geo";
import { sizedImage } from "@/lib/format/img";
import type {
  CemeteryPin,
  EventPin,
  MarcStationPin,
  SelectedOsm,
  SelectedPlace,
} from "./types";
import { mapPopupSource } from "./mapPopupSource";
import MapResultSurface from "./MapResultSurface";

function eventWhen(startsAt: string): string {
  const date = new Date(startsAt);
  if (!Number.isFinite(date.getTime())) return "Time unavailable";
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}

export function MapEventPeek({
  event,
  onClose,
}: {
  event: EventPin;
  onClose: () => void;
}) {
  const color = event.category_color || "var(--app-brand)";

  return (
    <MapResultSurface
      className="map-peek map-entity-peek"
      ariaLabel={event.title}
      closeLabel={`Close ${event.title}`}
      onClose={onClose}
    >
      <div className="map-peek-body">
        <span
          className="map-peek-thumb"
          style={{
            display: "grid",
            placeItems: "center",
            color,
            background: `color-mix(in srgb, ${color} 11%, var(--app-bg-sunken))`,
          }}
          aria-hidden
        >
          <CalendarDays className="h-7 w-7" strokeWidth={1.9} />
        </span>
        <span className="map-peek-text">
          <span className="map-peek-cat" style={{ color }}>
            {eventWhen(event.starts_at)}
          </span>
          <span className="map-peek-name font-serif">{event.title}</span>
          <span className="map-peek-detail">{event.venue_name}</span>
          <span className="map-peek-source">Radius event listing</span>
        </span>
      </div>
      <div className="map-peek-acts">
        <a
          href={directionsHref(event.lat, event.lng)}
          target="_blank"
          rel="noopener noreferrer"
          className="map-peek-act map-peek-act-go"
        >
          <CornerUpRight className="h-4 w-4" strokeWidth={2} aria-hidden />
          Directions
        </a>
        <Link href={`/events/${event.slug}`} className="map-peek-act">
          Event details
        </Link>
      </div>
    </MapResultSurface>
  );
}

export function MapRawPeek({
  item,
  distanceOrigin,
  contextLabel,
  onClose,
}: {
  item: SelectedOsm | SelectedPlace;
  distanceOrigin?: LngLat | null;
  contextLabel?: string | null;
  onClose: () => void;
}) {
  const isPlace = item._kind === "place";
  const category = isPlace ? item.category : item.category_slug;
  const categoryMeta = CATEGORY_BY_SLUG[category];
  const color = categoryMeta?.color ?? "var(--app-cool)";
  const lat = isPlace ? item.geom.lat : item.lat;
  const lng = isPlace ? item.geom.lng : item.lng;
  const address = [item.address, item.city].filter(Boolean).join(", ");
  const source = isPlace ? null : mapPopupSource(item.osm_id);
  const website =
    !isPlace && item.website && /^https?:\/\//i.test(item.website)
      ? item.website
      : null;
  const distance = distanceOrigin
    ? formatDistance(haversineMeters(distanceOrigin, { lat, lng }))
    : null;

  return (
    <MapResultSurface
      className="map-peek map-entity-peek"
      ariaLabel={item.name}
      closeLabel={`Close ${item.name}`}
      onClose={onClose}
    >
      <div className="map-peek-body">
        <span
          className="map-peek-thumb"
          style={{
            display: "grid",
            placeItems: "center",
            color,
            background: `color-mix(in srgb, ${color} 11%, var(--app-bg-sunken))`,
          }}
          aria-hidden
        >
          <MapPin className="h-7 w-7" strokeWidth={1.9} />
        </span>
        <span className="map-peek-text">
          <span className="map-peek-cat" style={{ color }}>
            {contextLabel ?? categoryMeta?.name ?? category}
          </span>
          <span className="map-peek-name font-serif">{item.name}</span>
          {address && <span className="map-peek-detail">{address}</span>}
          {distance && <span className="map-peek-detail">{distance} from you</span>}
          {!isPlace && item.cuisine && (
            <span className="map-peek-detail">{item.cuisine}</span>
          )}
          {source && (
            <a
              className="map-peek-source underline underline-offset-2"
              href={source.href}
              {...(source.href.startsWith("http")
                ? { target: "_blank", rel: "noreferrer" }
                : {})}
            >
              Source: {source.label}
            </a>
          )}
        </span>
      </div>
      <div className="map-peek-acts">
        <a
          href={directionsHref(lat, lng)}
          target="_blank"
          rel="noopener noreferrer"
          className="map-peek-act map-peek-act-go"
        >
          <CornerUpRight className="h-4 w-4" strokeWidth={2} aria-hidden />
          Directions
        </a>
        {isPlace ? (
          <Link href={`/places/${item.slug}`} className="map-peek-act">
            Place details
          </Link>
        ) : website ? (
          <a
            href={website}
            target="_blank"
            rel="noopener noreferrer"
            className="map-peek-act"
          >
            Website
            <ExternalLink className="h-3.5 w-3.5" strokeWidth={2} aria-hidden />
          </a>
        ) : null}
      </div>
    </MapResultSurface>
  );
}

export function MapTownPeek({
  title,
  contacts,
  guideHref,
  onClose,
}: {
  title: string;
  contacts: Array<{ label: string; phone?: string; website?: string }>;
  guideHref?: string;
  onClose: () => void;
}) {
  return (
    <MapResultSurface
      className="map-peek map-entity-peek"
      ariaLabel={`${title} local information`}
      closeLabel={`Close ${title} information`}
      onClose={onClose}
    >
      <div className="map-peek-body">
        <span className="map-peek-thumb map-entity-town-icon" aria-hidden>
          <Building2 className="h-7 w-7" strokeWidth={1.8} />
        </span>
        <span className="map-peek-text">
          <span className="map-peek-cat">You are in</span>
          <span className="map-peek-name font-serif">{title}</span>
          {contacts.length > 0 ? (
            <span className="map-entity-contact-list">
              {contacts.map((contact) => (
                <span key={contact.label} className="map-entity-contact">
                  <span>{contact.label}</span>
                  {contact.phone ? (
                    <a href={`tel:${contact.phone.replace(/[^0-9]/g, "")}`}>
                      {contact.phone}
                    </a>
                  ) : contact.website ? (
                    <a
                      href={contact.website}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      Website
                    </a>
                  ) : null}
                </span>
              ))}
            </span>
          ) : (
            <span className="map-peek-detail">
              Civic details are not available for this municipality yet.
            </span>
          )}
        </span>
      </div>
      {guideHref && (
        <div className="map-peek-acts">
          <Link href={guideHref} className="map-peek-act map-peek-act-go">
            Open {title} guide
          </Link>
        </div>
      )}
    </MapResultSurface>
  );
}

export function MapAerialPeek({
  photo,
  onClose,
}: {
  photo: {
    src: string;
    season: "spring" | "summer" | "fall" | "winter";
    takenAt: string | null;
    lng: number;
    lat: number;
  };
  onClose: () => void;
}) {
  const date = photo.takenAt ? new Date(photo.takenAt) : null;
  const dateLabel =
    date && Number.isFinite(date.getTime())
      ? new Intl.DateTimeFormat("en-US", {
          month: "short",
          day: "numeric",
          year: "numeric",
        }).format(date)
      : null;

  return (
    <MapResultSurface
      className="map-peek map-entity-peek map-aerial-peek"
      ariaLabel={`Aerial photograph from ${photo.season}`}
      closeLabel="Close aerial photograph"
      onClose={onClose}
    >
      <div className="map-entity-photo">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={sizedImage(photo.src, 800)}
          alt={`Frederick County from the air in ${photo.season}`}
          width={640}
          height={360}
          decoding="async"
        />
      </div>
      <div className="map-peek-body map-entity-photo-copy">
        <span className="map-peek-thumb map-entity-aerial-icon" aria-hidden>
          <Camera className="h-6 w-6" strokeWidth={1.8} />
        </span>
        <span className="map-peek-text">
          <span className="map-peek-cat">{photo.season}</span>
          <span className="map-peek-name font-serif">Frederick from this spot</span>
          <span className="map-peek-detail">
            {dateLabel ?? "Capture date unavailable"} · Radius photo archive
          </span>
        </span>
      </div>
      <div className="map-peek-acts">
        <a
          href={directionsHref(photo.lat, photo.lng)}
          target="_blank"
          rel="noopener noreferrer"
          className="map-peek-act map-peek-act-go"
        >
          <CornerUpRight className="h-4 w-4" strokeWidth={2} aria-hidden />
          Directions
        </a>
      </div>
    </MapResultSurface>
  );
}

export function MapCemeteryPeek({
  cemetery,
  onClose,
}: {
  cemetery: CemeteryPin;
  onClose: () => void;
}) {
  return (
    <MapResultSurface
      className="map-peek map-entity-peek"
      ariaLabel={cemetery.name}
      closeLabel={`Close ${cemetery.name}`}
      onClose={onClose}
    >
      <div className="map-peek-body">
        <span className="map-peek-thumb map-entity-history-icon" aria-hidden>
          <Landmark className="h-7 w-7" strokeWidth={1.8} />
        </span>
        <span className="map-peek-text">
          <span className="map-peek-cat">Historic cemetery</span>
          <span className="map-peek-name font-serif">{cemetery.name}</span>
          {cemetery.place && (
            <span className="map-peek-detail">{cemetery.place}</span>
          )}
          {cemetery.approximate && (
            <span className="map-peek-detail">
              County records mark this location as approximate.
            </span>
          )}
          <a
            className="map-peek-source underline underline-offset-2"
            href="https://services5.arcgis.com/o8KSxSzYaulbGcFX/arcgis/rest/services/HistoricCemeteries/FeatureServer/0"
            target="_blank"
            rel="noreferrer"
          >
            Source: Frederick County GIS
          </a>
        </span>
      </div>
      <div className="map-peek-acts">
        <a
          href={directionsHref(cemetery.lat, cemetery.lng)}
          target="_blank"
          rel="noopener noreferrer"
          className="map-peek-act map-peek-act-go"
        >
          <CornerUpRight className="h-4 w-4" strokeWidth={2} aria-hidden />
          Directions
        </a>
      </div>
    </MapResultSurface>
  );
}

export function MapMarcPeek({
  station,
  onClose,
}: {
  station: MarcStationPin;
  onClose: () => void;
}) {
  return (
    <MapResultSurface
      className="map-peek map-entity-peek"
      ariaLabel={`MARC at ${station.name}`}
      closeLabel={`Close ${station.name} departures`}
      onClose={onClose}
    >
      <div className="map-peek-body">
        <span className="map-peek-thumb map-entity-transit-icon" aria-hidden>
          <TrainFront className="h-7 w-7" strokeWidth={1.8} />
        </span>
        <span className="map-peek-text">
          <span className="map-peek-cat">MARC station</span>
          <span className="map-peek-name font-serif">{station.name}</span>
          {station.departures.length > 0 ? (
            <span className="map-entity-departures">
              {station.departures.slice(0, 3).map((departure, index) => (
                <span key={`${departure.clock}:${departure.headsign}:${index}`}>
                  <strong>{departure.clock}</strong> to {departure.headsign}
                </span>
              ))}
            </span>
          ) : (
            <span className="map-peek-detail">
              No more departures are scheduled today.
            </span>
          )}
          <span className="map-peek-source">Published MARC schedule</span>
        </span>
      </div>
      <div className="map-peek-acts">
        <a
          href={directionsHref(station.lat, station.lng)}
          target="_blank"
          rel="noopener noreferrer"
          className="map-peek-act map-peek-act-go"
        >
          <CornerUpRight className="h-4 w-4" strokeWidth={2} aria-hidden />
          Directions
        </a>
        <Link href="/transit" className="map-peek-act">
          Open Transit
        </Link>
      </div>
    </MapResultSurface>
  );
}
