"use client";

import Image from "next/image";
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from "react";
import { CalendarDays } from "lucide-react";
import { CATEGORY_BY_SLUG } from "@/data/categories";
import { MUNICIPALITY_BY_SLUG } from "@/data/municipalities";
import { formatDistance, haversineMeters, type LngLat } from "@/lib/geo";
import { haptic } from "@/lib/haptics";
import { PAPER_CREAM_BLUR } from "@/lib/blur-placeholder";
import CategoryIcon from "@/components/place/CategoryIcon";
import { mapListPhotoLoader } from "./map-list-photo-loader";
import type { EventPin, MapPinPlace } from "./types";

/**
 * MapList — the map's list face. The same currently-filtered pins, turned
 * into a scannable roll the user can read top to bottom instead of hunting
 * the canvas. Rows carry the field-guide essentials (category plate, name,
 * town, open line, distance-from-you when we hold a fix); tapping one flies
 * the map to that pin and opens its peek. Nearest-first when located; with
 * no fix, open-now leads and the pins' feature score breaks ties, so the
 * first screen is a browsable ranking rather than whatever order arrived
 * (which fronted a run of golf clubs on the whole-county view).
 *
 * Honest empty state: when a filter matches nothing, say so plainly rather
 * than showing a blank sheet.
 */

function openLine(p: MapPinPlace): { text: string; tone: string } | null {
  switch (p.open_status.state) {
    case "open":
      return { text: "Open now", tone: "var(--app-positive)" };
    case "closing-soon":
      // "Closing soon" everywhere else (PlaceStatus, RightNow, PlaceIndex).
      // The map list was the one surface saying "Closes soon".
      return { text: "Closing soon", tone: "var(--app-warning-press, #8F5600)" };
    case "closed":
      return { text: "Closed", tone: "var(--app-ink-3)" };
    default:
      return null;
  }
}

/** Full PlaceCardData callers may already carry a photo even though the main
 * /map pin payload deliberately does not. Read that optional runtime field
 * without widening MapPinPlace and accidentally making it part of the payload
 * contract. */
function inlinePhoto(place: MapPinPlace): string | undefined {
  const value = (place as MapPinPlace & { google_photo_url?: unknown })
    .google_photo_url;
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function MapListPlaceVisual({
  place,
  color,
}: {
  place: MapPinPlace;
  color: string;
}) {
  const anchorRef = useRef<HTMLSpanElement>(null);
  const [photoUrl, setPhotoUrl] = useState<string | null | undefined>(
    () => inlinePhoto(place) ?? mapListPhotoLoader.peek(place.slug),
  );

  useEffect(() => {
    if (photoUrl !== undefined) return;

    let active = true;
    let started = false;
    const hydrate = () => {
      if (started) return;
      started = true;
      void mapListPhotoLoader.load(place.slug).then((photo) => {
        if (active) setPhotoUrl(photo);
      });
    };

    const anchor = anchorRef.current;
    if (!anchor || typeof IntersectionObserver === "undefined") {
      hydrate();
      return () => {
        active = false;
      };
    }

    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries.some((entry) => entry.isIntersecting)) return;
        observer.disconnect();
        hydrate();
      },
      { rootMargin: "180px 0px" },
    );
    observer.observe(anchor);
    return () => {
      active = false;
      observer.disconnect();
    };
  }, [photoUrl, place.slug]);

  return (
    <span
      ref={anchorRef}
      aria-hidden
      className="map-list-place-visual"
      data-photo-state={photoUrl ? "ready" : "fallback"}
      style={{ "--map-list-place-color": color } as CSSProperties}
    >
      {photoUrl ? (
        <Image
          src={photoUrl}
          alt=""
          fill
          unoptimized={photoUrl.startsWith("/api/place-photo")}
          sizes="44px"
          placeholder="blur"
          blurDataURL={PAPER_CREAM_BLUR}
          className="object-cover"
        />
      ) : (
        <CategoryIcon
          slug={place.category}
          className="h-5 w-5"
          strokeWidth={1.8}
        />
      )}
    </span>
  );
}

export default function MapList({
  places,
  events,
  userLoc,
  sortOrigin,
  onPick,
  onPickEvent,
}: {
  places: MapPinPlace[];
  events: EventPin[];
  userLoc: LngLat | null;
  /** Ranking origin when a precise user fix is unavailable. The map center
   *  keeps the list synchronized with the area the reader just panned to. */
  sortOrigin?: LngLat | null;
  onPick: (place: MapPinPlace) => void;
  onPickEvent: (event: EventPin) => void;
}) {
  const effectiveOrigin = userLoc ?? sortOrigin ?? null;
  const rows = useMemo(
    () => rankMapListPlaces(places, effectiveOrigin),
    [places, effectiveOrigin],
  );
  const eventRows = useMemo(
    () => rankMapListEvents(events, effectiveOrigin),
    [events, effectiveOrigin],
  );
  const empty = rows.length === 0 && eventRows.length === 0;

  return (
    <div className="map-list" role="region" aria-label="Map results, as a list">
      <div
        className="mx-auto mb-1 flex max-w-[680px] items-baseline justify-between gap-3 px-2"
        aria-live="polite"
      >
        <span className="text-[12px] font-semibold" style={{ color: "var(--app-ink-2)" }}>
          {places.length.toLocaleString("en-US")} {places.length === 1 ? "place" : "places"}
          {events.length > 0
            ? ` · ${events.length.toLocaleString("en-US")} ${events.length === 1 ? "event" : "events"}`
            : ""}
          {" "}in this view
        </span>
        <span className="text-[10px]" style={{ color: "var(--app-ink-3)" }}>
          {userLoc ? "Nearest to you" : "Nearest map center"}
        </span>
      </div>
      {empty ? (
        <div className="map-list-empty">
          <p className="font-serif map-list-empty-title">Nothing matches yet</p>
          <p className="map-list-empty-sub">
            Loosen a filter in the dock, or switch back to the map to browse the
            whole county.
          </p>
        </div>
      ) : (
        <div className="map-list-results">
          {eventRows.length > 0 && (
            <section className="map-list-section" aria-labelledby="map-list-events-title">
              <h2 id="map-list-events-title" className="map-list-section-title">
                Happening here
              </h2>
              <ul className="map-list-rows">
                {eventRows.map((event) => {
                  const dist = effectiveOrigin
                    ? formatDistance(haversineMeters(effectiveOrigin, { lng: event.lng, lat: event.lat }))
                    : null;
                  return (
                    <li key={event.slug}>
                      <button
                        type="button"
                        className="map-list-row map-list-event tap-44"
                        onClick={() => {
                          haptic("light");
                          onPickEvent(event);
                        }}
                      >
                        <span aria-hidden className="map-list-event-icon">
                          <CalendarDays className="h-4 w-4" strokeWidth={2.1} />
                        </span>
                        <span className="map-list-main">
                          <span className="map-list-name">{event.title}</span>
                          <span className="map-list-sub">
                            <span style={{ color: "var(--app-brand-press)", fontWeight: 650 }}>
                              {eventClock(event.starts_at)}
                            </span>
                            <span aria-hidden className="map-list-mid">·</span>
                            <span>{event.venue_name}</span>
                          </span>
                        </span>
                        {dist && <span className="map-list-dist">{dist}</span>}
                      </button>
                    </li>
                  );
                })}
              </ul>
            </section>
          )}

          {rows.length > 0 && (
            <section className="map-list-section" aria-labelledby="map-list-places-title">
              <h2 id="map-list-places-title" className="map-list-section-title">
                Places in view
              </h2>
              <ul className="map-list-rows">
                {rows.map((p) => {
                  const cat = CATEGORY_BY_SLUG[p.category];
                  const color = cat?.color ?? "var(--app-brand)";
                  const open = openLine(p);
                  // The town anchors a whole-county roll ("Golf · Ijamsville") the
                  // way /nearby and /category cards already do — without it a row
                  // like "Whiskey Creek Golf Club · Golf" places nothing.
                  const town = MUNICIPALITY_BY_SLUG[p.municipality]?.name;
                  const dist =
                    userLoc && p.geom ? formatDistance(haversineMeters(userLoc, p.geom)) : null;
                  return (
                    <li key={p.slug}>
                      <button
                        type="button"
                        className="map-list-row tap-44"
                        data-map-place-slug={p.slug}
                        onClick={() => {
                          haptic("light");
                          onPick(p);
                        }}
                      >
                        <MapListPlaceVisual place={p} color={color} />
                        <span className="map-list-main">
                          <span className="map-list-name">{p.name}</span>
                          <span className="map-list-sub">
                            <span style={{ color }}>{cat?.name ?? p.category}</span>
                            {town && (
                              <>
                                <span aria-hidden className="map-list-mid">·</span>
                                <span>{town}</span>
                              </>
                            )}
                            {open && (
                              <>
                                <span aria-hidden className="map-list-mid">·</span>
                                <span style={{ color: open.tone, fontWeight: 600 }}>
                                  {open.text}
                                </span>
                              </>
                            )}
                          </span>
                        </span>
                        {dist && <span className="map-list-dist">{dist}</span>}
                      </button>
                    </li>
                  );
                })}
              </ul>
            </section>
          )}
        </div>
      )}
    </div>
  );
}

function eventClock(value: string): string {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "Time not listed";
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    weekday: "short",
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}

/** Stable list ranking. A real location or the visible map center leads by
 *  distance. The legacy open/quality fallback remains for embeds that do not
 *  expose either origin. Exported so the map/list contract is testable without
 *  mounting Mapbox. */
export function rankMapListPlaces(
  places: MapPinPlace[],
  origin: LngLat | null,
  limit = 200,
): MapPinPlace[] {
  if (origin) {
    return [...places]
      .map((p) => ({ p, d: p.geom ? haversineMeters(origin, p.geom) : Infinity }))
      .sort((a, b) => a.d - b.d)
      .slice(0, limit)
      .map((x) => x.p);
  }

  const openScore = (p: MapPinPlace) =>
    p.open_status.state === "open" || p.open_status.state === "closing-soon" ? 1 : 0;
  return [...places]
    .sort(
      (a, b) =>
        openScore(b) - openScore(a) ||
        (b.feature_score ?? 0) - (a.feature_score ?? 0),
    )
    .slice(0, limit);
}

/** Events in the visible map area lead by start time. Distance only breaks a
 *  tie, so a later event across the street never outranks something starting
 *  now. Exported for the map/list regression contract. */
export function rankMapListEvents(
  events: EventPin[],
  origin: LngLat | null,
  limit = 40,
): EventPin[] {
  return [...events]
    .map((event) => ({
      event,
      starts: Date.parse(event.starts_at),
      distance: origin
        ? haversineMeters(origin, { lng: event.lng, lat: event.lat })
        : Infinity,
    }))
    .sort(
      (a, b) =>
        (Number.isFinite(a.starts) ? a.starts : Infinity) -
          (Number.isFinite(b.starts) ? b.starts : Infinity) ||
        a.distance - b.distance ||
        a.event.title.localeCompare(b.event.title),
    )
    .slice(0, limit)
    .map(({ event }) => event);
}
