"use client";

/**
 * The below-map selection surfaces (#77 extraction from AppMap.tsx): every
 * peek card and bottom drawer that answers a tap — discovery, event, raw
 * OSM/amenity, town, aerial, cemetery, MARC, spot, place, parking, food
 * truck, the transit-stop arrivals drawer, and the co-located events index.
 * JSX is byte-identical to the inline original, including the peek
 * precedence guards. Camera work crosses the boundary as callbacks
 * (focusPlaceFromSpot / focusEventFromGroup) so the map ref and the
 * camera-intent ref never leave AppMap.
 */

import Link from "next/link";
import { Popup } from "react-map-gl/mapbox";
import { ArrowRight, ChevronRight } from "lucide-react";
import type { ComponentProps } from "react";
import BottomDrawer from "@/components/ui/BottomDrawer";
import StopArrivalsPopup, {
  type SelectedStop,
} from "@/components/transit/StopArrivalsPopup";
import { MUNICIPALITIES } from "@/data/municipalities";
import { municipalCivicFor, civicContacts } from "@/lib/loaders/municipalCivic";
import { directionsHref } from "@/lib/map/directionsHref";
import { haversineMeters, type LngLat } from "@/lib/geo";
import {
  nearestMapUtilities,
  type NearbyUtilityPoint,
} from "./mapNearby";
import type { AerialPhoto } from "./mapAerialArchive";
import type { MapDiscovery } from "./mapDiscoveries";
import type { MapEventGroup } from "./mapContent";
import type { ParkingPin } from "@/lib/map/parking";
import MapPeek from "./MapPeek";
import MapParkingPeek from "./MapParkingPeek";
import MapFoodTruckPeek from "./MapFoodTruckPeek";
import {
  MapAerialPeek,
  MapCemeteryPeek,
  MapEventPeek,
  MapMarcPeek,
  MapRawPeek,
  MapTownPeek,
} from "./MapEntityPeek";
import MapSpotPeek from "./MapSpotPeek";
import MapDiscoveryPeek from "./MapDiscoveryPeek";
import type {
  CemeteryPin,
  CivicTownSelection,
  EventPin,
  FoodTruckMapPin,
  MapPinPlace,
  MapSpotSelection,
  MarcStationPin,
  Selected,
} from "./types";

type SpotContext = ComponentProps<typeof MapSpotPeek>["context"];

type Props = {
  dock: unknown;
  compactMapViewport: boolean;
  selectedDiscovery: MapDiscovery | null;
  selectedDiscoveryIndex: number;
  discoveryDeckLength: number;
  showDiscoveryAt: (index: number) => void;
  selectedEvent: EventPin | null;
  selected: Selected;
  rawSelectionContext: string | null;
  civicTown: CivicTownSelection | null;
  selectedAerial: AerialPhoto | null;
  selectedCemetery: CemeteryPin | null;
  marcPeek: string | null;
  marcStations: MarcStationPin[];
  spotSelection: MapSpotSelection | null;
  spotContext: SpotContext | null;
  peekPlace: MapPinPlace | null;
  parkingPeek: ParkingPin | null;
  foodTruckPeek: FoodTruckMapPin | null;
  selectedTransitStop: SelectedStop | null;
  eventGroup: MapEventGroup | null;
  userLoc: LngLat | null;
  utilityPoints: NearbyUtilityPoint[];
  places: MapPinPlace[];
  events: EventPin[];
  parking: ParkingPin[];
  clearMapSelection: () => void;
  openPlaceSheet: (place: MapPinPlace) => void;
  /** Open + camera-focus a place tapped inside the spot peek. */
  focusPlaceFromSpot: (place: MapPinPlace) => void;
  /** Open + camera-focus one event chosen from the co-located index. */
  focusEventFromGroup: (event: EventPin) => void;
};

export default function AppMapSelectionSurfaces({
  dock,
  compactMapViewport,
  selectedDiscovery,
  selectedDiscoveryIndex,
  discoveryDeckLength,
  showDiscoveryAt,
  selectedEvent,
  selected,
  rawSelectionContext,
  civicTown,
  selectedAerial,
  selectedCemetery,
  marcPeek,
  marcStations,
  spotSelection,
  spotContext,
  peekPlace,
  parkingPeek,
  foodTruckPeek,
  selectedTransitStop,
  eventGroup,
  userLoc,
  utilityPoints,
  places,
  events,
  parking,
  clearMapSelection,
  openPlaceSheet,
  focusPlaceFromSpot,
  focusEventFromGroup,
}: Props) {
  return (
    <>
      {dock && selectedDiscovery && (
        <MapDiscoveryPeek
          discovery={selectedDiscovery}
          index={Math.max(0, selectedDiscoveryIndex)}
          total={Math.max(1, discoveryDeckLength)}
          onPrevious={() => showDiscoveryAt((selectedDiscoveryIndex < 0 ? 0 : selectedDiscoveryIndex) - 1)}
          onNext={() => showDiscoveryAt((selectedDiscoveryIndex < 0 ? 0 : selectedDiscoveryIndex) + 1)}
          onClose={clearMapSelection}
        />
      )}

      {dock && compactMapViewport && selectedEvent && (
        <MapEventPeek event={selectedEvent} onClose={clearMapSelection} />
      )}

      {dock && compactMapViewport && selected && (
        <MapRawPeek
          item={selected}
          distanceOrigin={userLoc}
          contextLabel={rawSelectionContext}
          onClose={clearMapSelection}
        />
      )}

      {dock && compactMapViewport && civicTown && (() => {
        const municipality =
          MUNICIPALITIES.find((item) => item.slug === civicTown.slug) ?? null;
        const civicRecord = municipality
          ? municipalCivicFor(municipality.slug)
          : null;
        return (
          <MapTownPeek
            title={municipality?.name ?? civicTown.name}
            contacts={civicRecord ? civicContacts(civicRecord).slice(0, 2) : []}
            guideHref={municipality ? `/m/${municipality.slug}` : undefined}
            onClose={clearMapSelection}
          />
        );
      })()}

      {dock && compactMapViewport && selectedAerial && (
        <MapAerialPeek photo={selectedAerial} onClose={clearMapSelection} />
      )}

      {dock && compactMapViewport && selectedCemetery && (
        <MapCemeteryPeek
          cemetery={selectedCemetery}
          onClose={clearMapSelection}
        />
      )}

      {dock && compactMapViewport && marcPeek && (() => {
        const station = marcStations.find((item) => item.name === marcPeek);
        return station ? (
          <MapMarcPeek station={station} onClose={clearMapSelection} />
        ) : null;
      })()}

      {dock && spotSelection && spotContext && !peekPlace && !parkingPeek && !foodTruckPeek && !selectedDiscovery && (
        <MapSpotPeek
          spot={spotSelection}
          context={spotContext}
          utilities={nearestMapUtilities(spotSelection, utilityPoints, 800, 4)}
          label={spotSelection.label}
          temporary={spotSelection.temporary}
          attribution={spotSelection.attribution}
          onClose={clearMapSelection}
          onOpenPlace={(slug) => {
            const place = places.find((candidate) => candidate.slug === slug);
            if (!place) return;
            focusPlaceFromSpot(place);
          }}
        />
      )}

      {/* The pin peek card. The cross-join: the soonest event pin hosted
          AT this place (venue_place_slug) rides along, so tapping a
          brewery answers "anything on here tonight?" without leaving the
          map (2026-07-17 map audit #2). */}
      {peekPlace && !parkingPeek && !foodTruckPeek && (
        <MapPeek
          key={peekPlace.slug}
          place={peekPlace}
          hostedEvent={
            events
              .filter((e) => e.venue_place_slug && e.venue_place_slug === peekPlace.slug)
              .sort((a, b) => Date.parse(a.starts_at) - Date.parse(b.starts_at))[0] ?? null
          }
          nearestGarage={
            // The third question after "open?" and "anything on?":
            // where do I park. Nearest downtown garage within a
            // 5-6 minute walk, with the live space count when the
            // feed reports one (2026-07-17 map audit follow-on).
            parking
              .map((g) => ({
                g,
                d: haversineMeters(peekPlace.geom, { lng: g.lng, lat: g.lat }),
              }))
              .filter((x) => x.d <= 500)
              .sort((a, b) => a.d - b.d)
              .map((x) => ({ name: x.g.name, distM: x.d, available: x.g.available }))[0] ?? null
          }
          nearbyUtilities={nearestMapUtilities(peekPlace.geom, utilityPoints)}
          // Once a place is selected the camera centers on that pin, so a
          // "0 ft from map center" readout is technically true but useless.
          // Show card distance only from a real device location; search
          // results retain the explicit map-center distance before selection.
          distanceOrigin={userLoc}
          distanceOriginLabel="from you"
          onClose={clearMapSelection}
          onDetails={() => openPlaceSheet(peekPlace)}
        />
      )}

      {/* The parking garage peek — its own compact card (a garage isn't a
          saveable place): live spaces, hourly rate, and Directions. */}
      {parkingPeek && (
        <MapParkingPeek pin={parkingPeek} userLoc={userLoc} onClose={clearMapSelection} />
      )}

      {foodTruckPeek && !peekPlace && !parkingPeek && (
        <MapFoodTruckPeek pin={foodTruckPeek} onClose={clearMapSelection} />
      )}

      <BottomDrawer
        title={selectedTransitStop?.name ?? "Bus stop"}
        subtitle="Live Frederick County TransIT arrivals"
        open={selectedTransitStop !== null}
        onOpenChange={(open) => {
          if (!open) clearMapSelection();
        }}
      >
        {selectedTransitStop && (
          <div className="pb-4">
            <StopArrivalsPopup
              key={selectedTransitStop.id}
              stop={selectedTransitStop}
              showName={false}
            />
            <Link
              href="/transit"
              className="tap-44 mt-3 inline-flex items-center gap-1.5 rounded-full border px-3.5 py-2 text-[12px] font-semibold"
              style={{ borderColor: "var(--app-border)", color: "var(--app-cool)" }}
            >
              Open Transit
              <ArrowRight className="h-3.5 w-3.5" strokeWidth={2.25} aria-hidden />
            </Link>
          </div>
        )}
      </BottomDrawer>

      {/* MARC station popup — the next scheduled trains, as clock times
          from the committed GTFS schedule (weekday commuter service;
          honest empty line when no more trains today). */}
      {marcPeek && (!dock || !compactMapViewport) && (() => {
        const st = marcStations.find((m) => m.name === marcPeek);
        if (!st) return null;
        return (
          <Popup
            longitude={st.lng}
            latitude={st.lat}
            anchor="bottom"
            onClose={clearMapSelection}
            closeOnClick
            maxWidth="260px"
          >
            <div style={{ fontFamily: "var(--font-inter, inherit)" }}>
              <p className="font-sans text-[14px] font-semibold" style={{ color: "var(--app-ink)" }}>
                MARC · {st.name}
              </p>
              {st.departures.length > 0 ? (
                <ul className="mt-1 space-y-0.5">
                  {st.departures.map((d, i) => (
                    <li key={i} className="text-[12px]" style={{ color: "var(--app-ink-2)" }}>
                      <span className="font-mono">{d.clock}</span> to {d.headsign}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="mt-1 text-[12px]" style={{ color: "var(--app-ink-3)" }}>
                  No more departures are scheduled today.
                </p>
              )}
              <div className="mt-2 flex items-center gap-2">
                <a
                  href={directionsHref(st.lat, st.lng)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="tap-44 inline-flex items-center rounded-full border px-3 py-2 text-[12px] font-semibold"
                  style={{ borderColor: "var(--app-border)", color: "var(--app-cool)" }}
                >
                  Directions
                </a>
                <Link
                  href="/transit"
                  className="tap-44 inline-flex items-center rounded-full border px-3 py-2 text-[12px] font-semibold"
                  style={{ borderColor: "var(--app-border)", color: "var(--app-cool)" }}
                >
                  Open Transit
                </Link>
              </div>
            </div>
          </Popup>
        );
      })()}

      {/* Co-located events remain one honest point on the map. The count
          marker opens this chronological index so no occurrence is hidden
          and each row can become the normal event popup in one tap. */}
      <BottomDrawer
        title={eventGroup?.venueLabel ?? "Events here"}
        subtitle={
          eventGroup
            ? `${eventGroup.events.length} ${eventGroup.events.length === 1 ? "event" : "events"} at this location`
            : undefined
        }
        open={eventGroup !== null}
        onOpenChange={(open) => {
          if (!open) clearMapSelection();
        }}
      >
        <ul className="space-y-1 pb-4">
          {(eventGroup?.events ?? []).map((event) => {
            const startsAt = new Date(event.starts_at);
            const when = Number.isFinite(startsAt.getTime())
              ? new Intl.DateTimeFormat("en-US", {
                  timeZone: "America/New_York",
                  weekday: "short",
                  month: "short",
                  day: "numeric",
                  hour: "numeric",
                  minute: "2-digit",
                }).format(startsAt)
              : "Time unavailable";
            return (
              <li key={event.slug}>
                <button
                  type="button"
                  className="tap-44 flex w-full items-center gap-3 rounded-[var(--app-radius-sm)] px-2.5 py-2.5 text-left transition-colors hover:bg-[var(--app-bg-sunken)]"
                  onClick={() => focusEventFromGroup(event)}
                >
                  <span
                    aria-hidden
                    className="h-2.5 w-2.5 shrink-0 rounded-full"
                    style={{
                      background: event.category_color || "var(--app-brand)",
                    }}
                  />
                  <span className="min-w-0 flex-1">
                    <span
                      className="block truncate text-[14px] font-semibold"
                      style={{ color: "var(--app-ink)" }}
                    >
                      {event.title}
                    </span>
                    <span
                      className="mt-0.5 block text-[12px]"
                      style={{ color: "var(--app-ink-3)" }}
                    >
                      {when}
                    </span>
                  </span>
                  <ChevronRight
                    className="h-4 w-4 shrink-0"
                    strokeWidth={2}
                    aria-hidden
                    style={{ color: "var(--app-ink-3)" }}
                  />
                </button>
              </li>
            );
          })}
        </ul>
      </BottomDrawer>
    </>
  );
}
