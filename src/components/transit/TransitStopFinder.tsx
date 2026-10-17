"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  Bookmark,
  BookmarkCheck,
  BusFront,
  ChevronDown,
  Clock3,
  ExternalLink,
  LocateFixed,
  MapPin,
  Navigation,
  Search,
  X,
} from "lucide-react";
import TRANSIT from "@/data/transit.json";
import styles from "./TransitExperience.module.css";
import {
  CURRENT_TRANSIT_STOPS,
  isCurrentTransitStop,
} from "@/lib/transit-static";
import {
  useGeolocation,
  type GeoPosition,
} from "@/hooks/useGeolocation";
import { useMounted } from "@/hooks/useSaved";
import { haversineMeters } from "@/lib/geo";
import { haptic } from "@/lib/haptics";
import { readableTextOn } from "@/lib/color/readableText";
import {
  findCurrentTransitVehicle,
  requestTransitVehicleFocus,
  requestTransitStopFocus,
  isTransitStopFocusDetail,
  TRANSIT_STOP_FOCUS_EVENT,
  type TransitVehicleFocusDetail,
} from "@/lib/transit-focus";
import StopArrivalsPopup, { type SelectedStop } from "./StopArrivalsPopup";
import {
  MAX_SAVED_TRANSIT_BUSES,
  MAX_SAVED_TRANSIT_STOPS,
  deriveCatchability,
  estimateWalkingMinutes,
  isPredictionFresh,
  minutesUntilArrival,
  transitBusWatchId,
  type Catchability,
  type TransitBusRef,
} from "./transitRiderModel";
import { useSavedTransitBuses } from "./useSavedTransitBuses";
import { useSavedTransitStops } from "./useSavedTransitStops";
import { useLiveVehicles } from "./useLiveVehicles";
import {
  useStopArrivals,
  type StopArrivalsStatus,
  type StopPrediction,
} from "./useStopArrivals";

type StopRecord = {
  id: string | number;
  name: string;
  lat: number;
  lng: number;
  wc?: boolean;
};

type TransitRoute = {
  id: string;
  short: string;
  name: string;
  color: string;
};

type ArrivalRowData = {
  key: string;
  prediction: StopPrediction;
  route?: TransitRoute;
  minutes: number;
  fresh: boolean;
  catchability: Catchability | null;
  focus: TransitVehicleFocusDetail | null;
  busRef: TransitBusRef | null;
};

const STOPS: SelectedStop[] = CURRENT_TRANSIT_STOPS.map((stop) => ({
  id: String(stop.id),
  name: stop.name,
  lat: stop.lat,
  lng: stop.lng,
}));
const STOP_BY_ID: Record<string, StopRecord> = Object.fromEntries(
  CURRENT_TRANSIT_STOPS.map((stop) => [stop.id, stop]),
);
const SELECTABLE_STOP_BY_ID: Record<string, SelectedStop> =
  Object.fromEntries(STOPS.map((stop) => [stop.id, stop]));

const ROUTE_BY_ID: Record<string, TransitRoute> = Object.fromEntries(
  (TRANSIT.routes as TransitRoute[]).map((route) => [route.id, route]),
);

const MAX_RESULTS = 6;
const MAX_LOCATION_ACCURACY_METERS = 250;
const COUNTY_TRANSIT_URL =
  "https://www.frederickcountymd.gov/207/Transit-Routes-Schedule-Information";
const CLOCK_FORMATTER = new Intl.DateTimeFormat("en-US", {
  hour: "numeric",
  minute: "2-digit",
});

function milesLabel(meters: number): string {
  const miles = meters / 1609.344;
  return miles < 0.1
    ? `${Math.max(1, Math.round(meters * 3.28084))} ft`
    : `${miles.toFixed(1)} mi`;
}

function directionsUrl(stop: SelectedStop): string {
  const destination = encodeURIComponent(`${stop.lat},${stop.lng}`);
  return `https://www.google.com/maps/dir/?api=1&travelmode=walking&destination=${destination}`;
}

function ageLabel(updatedAt: number | null, nowMs: number): string | null {
  if (updatedAt == null || nowMs <= 0) return null;
  const seconds = Math.max(0, Math.round((nowMs - updatedAt) / 1000));
  if (seconds < 15) return "just now";
  if (seconds < 90) return `${seconds} sec ago`;
  return `${Math.round(seconds / 60)} min ago`;
}

function arrivalClock(arrivalEpoch: number | undefined): string {
  if (arrivalEpoch == null) return "Last estimate";
  return CLOCK_FORMATTER.format(new Date(arrivalEpoch * 1000));
}

function RouteBadge({ route }: { route?: TransitRoute }) {
  const background = route?.color ?? "var(--app-cool)";
  return (
    <span
      aria-label={route ? `Route ${route.short}` : "TransIT bus"}
      className={styles.routeBadge}
      style={{
        background,
        color: route ? readableTextOn(route.color) : "#FFFFFF",
        boxShadow: "inset 0 0 0 1px rgba(22, 20, 14, 0.12)",
      }}
    >
      {route?.short ?? "Bus"}
    </span>
  );
}

function CatchabilityLabel({ value }: { value: Catchability }) {
  const color =
    value.kind === "likely"
      ? "var(--state-open)"
      : value.kind === "tight"
        ? "var(--state-closing)"
        : "var(--app-danger-text)";
  return (
    <span
      className={styles.catchability}
      style={{ color }}
    >
      {value.label}
    </span>
  );
}

function FeedBadge({
  status,
  updatedAt,
  nowMs,
}: {
  status: StopArrivalsStatus;
  updatedAt: number | null;
  nowMs: number;
}) {
  const updated = ageLabel(updatedAt, nowMs);
  const meta =
    status === "live"
      ? {
          label: "Live",
          detail: updated ? `Updated ${updated}` : "Live feed",
          color: "var(--state-open)",
        }
      : status === "stale"
        ? {
            label: "Feed delayed",
            detail: updated ? `Last update ${updated}` : "Last update is old",
            color: "var(--state-closing)",
          }
        : status === "unavailable"
          ? {
              label: "Feed unavailable",
              detail: "Use the official schedule",
              color: "var(--state-closing)",
            }
          : {
              label: "Checking live feed",
              detail: "Getting stop arrivals",
              color: "var(--app-ink-2)",
            };

  return (
    <span
      className={styles.feedBadge}
    >
      <span
        aria-hidden
        className={`h-2 w-2 shrink-0 rounded-full ${
          status === "loading"
            ? "animate-pulse motion-reduce:animate-none"
            : ""
        }`}
        style={{ background: meta.color }}
      />
      <span className="leading-tight">
        <strong className="block" style={{ color: meta.color }}>
          {meta.label}
        </strong>
        <small>{meta.detail}</small>
      </span>
    </span>
  );
}

function ArrivalRow({
  row,
  saved,
  onTrack,
  onToggleSaved,
}: {
  row: ArrivalRowData;
  saved: boolean;
  onTrack: (detail: TransitVehicleFocusDetail) => void;
  onToggleSaved: (bus: TransitBusRef) => void;
}) {
  const timeLabel = row.fresh
    ? row.minutes === 0
      ? "Due"
      : `${row.minutes} min`
      : arrivalClock(row.prediction.arrivalEpoch);
  const destination = row.prediction.headsign?.trim();

  return (
    <li
      className={styles.arrivalRow}
    >
      <RouteBadge route={row.route} />
      <span className={styles.arrivalDestination}>
        <span
          className="block"
          style={{ color: "var(--app-ink)" }}
        >
          {destination
            ? `To ${destination}`
            : row.route?.name ?? "TransIT bus"}
        </span>
        <span
          className="block"
          style={{ color: "var(--app-ink-3)" }}
        >
          {row.route?.name ?? "TransIT bus"} ·{" "}
          {row.fresh ? "Live estimate" : "Estimate delayed"}
        </span>
      </span>
      <span className={styles.arrivalEta}>
        <span
          className={styles.arrivalTime} data-transit-arrival-time
          style={{
            color: "var(--app-ink)",
          }}
        >
          {timeLabel}
        </span>
        {row.catchability && <CatchabilityLabel value={row.catchability} />}
      </span>
      {row.focus && row.busRef && (
        <div className={styles.arrivalActions}>
          <button
            type="button"
            onClick={() => onTrack(row.focus as TransitVehicleFocusDetail)}
            aria-label={`Track ${
              destination
                ? `${row.route?.name ?? "this bus"} to ${destination}`
                : row.route?.name ?? "this bus"
            } on the live map`}
            className={styles.trackAction}
          >
            <LocateFixed
              className="h-3.5 w-3.5 shrink-0"
              strokeWidth={2.2}
              aria-hidden
            />
            Track on map
          </button>
          <button
            type="button"
            onClick={() => onToggleSaved(row.busRef as TransitBusRef)}
            aria-pressed={saved}
            aria-label={
              saved
                ? `Remove bus ${row.busRef.vehicleId} from Saved`
                : `Save bus ${row.busRef.vehicleId}`
            }
            className={styles.saveAction}
          >
            {saved ? (
              <BookmarkCheck
                className="h-3.5 w-3.5 shrink-0"
                strokeWidth={2.2}
                aria-hidden
              />
            ) : (
              <Bookmark
                className="h-3.5 w-3.5 shrink-0"
                strokeWidth={2.2}
                aria-hidden
              />
            )}
            {saved ? "Saved bus" : "Save bus"}
          </button>
        </div>
      )}
    </li>
  );
}

function StopCommandPanel({
  stop,
  position,
  saved,
  onToggleSaved,
  onTrackVehicle,
  onShowStop,
  onAnnounce,
}: {
  stop: SelectedStop;
  position: GeoPosition | null;
  saved: boolean;
  onToggleSaved: (stop: SelectedStop) => void;
  onTrackVehicle: (detail: TransitVehicleFocusDetail) => void;
  onShowStop: (stop: SelectedStop) => void;
  onAnnounce: (message: string) => void;
}) {
  const [showFullDetail, setShowFullDetail] = useState(false);
  const { snapshot, nowMs } = useStopArrivals(stop.id);
  const liveVehicles = useLiveVehicles();
  const { buses: savedBuses, toggle: toggleSavedBus } =
    useSavedTransitBuses();
  const accuratePosition =
    position && position.accuracy <= MAX_LOCATION_ACCURACY_METERS
      ? position
      : null;
  const distanceMeters = accuratePosition
    ? haversineMeters(accuratePosition, stop)
    : null;
  const walkingMinutes =
    distanceMeters == null ? null : estimateWalkingMinutes(distanceMeters);
  const wheelchairBoarding = STOP_BY_ID[stop.id]?.wc === true;

  const routes = Array.from(
    new Set(
      snapshot.predictions
        .filter((prediction) =>
          isPredictionFresh(
            prediction.timestamp,
            nowMs,
            snapshot.status === "live",
          ),
        )
        .map((prediction) => prediction.routeId)
        .filter((routeId): routeId is string => Boolean(routeId)),
    ),
  )
    .map((routeId) => ROUTE_BY_ID[routeId])
    .filter((route): route is TransitRoute => Boolean(route));

  const arrivals = snapshot.predictions
    .map((prediction, index): ArrivalRowData | null => {
      const minutes = minutesUntilArrival(
        prediction.arrivalEpoch,
        nowMs,
      );
      if (minutes == null) return null;
      const fresh =
        prediction.tripScheduleRelationship !== "CANCELED" &&
        prediction.tripScheduleRelationship !== "DELETED" &&
        prediction.scheduleRelationship !== "SKIPPED" &&
        prediction.scheduleRelationship !== "NO_DATA" &&
        isPredictionFresh(
          prediction.timestamp,
          nowMs,
          snapshot.status === "live",
        );
      const currentVehicle = fresh
        ? findCurrentTransitVehicle({
            vehicles: liveVehicles.vehicles,
            vehicleId: prediction.vehicleId,
            expectedRouteId: prediction.routeId,
            expectedTripId: prediction.tripId,
            feedCurrent:
              liveVehicles.loaded &&
              liveVehicles.available &&
              !liveVehicles.stale &&
              liveVehicles.status !== "unavailable",
            nowMs,
          })
        : null;
      const exactTripId = prediction.tripId ?? currentVehicle?.tripId;
      return {
        key:
          prediction.tripId ??
          `${prediction.routeId ?? "bus"}-${prediction.arrivalEpoch ?? index}`,
        prediction,
        route: prediction.routeId
          ? ROUTE_BY_ID[prediction.routeId]
          : undefined,
        minutes,
        fresh,
        catchability: deriveCatchability(
          minutes,
          walkingMinutes,
          fresh,
        ),
        focus: currentVehicle
          ? {
              vehicleId: currentVehicle.vehicleId,
              routeId: currentVehicle.routeId ?? prediction.routeId,
              bus: {
                lng: currentVehicle.lng,
                lat: currentVehicle.lat,
              },
              stop: { lng: stop.lng, lat: stop.lat },
              stopId: stop.id,
              stopName: stop.name,
            }
          : null,
        busRef: currentVehicle && exactTripId
          ? {
              vehicleId: currentVehicle.vehicleId,
              tripId: exactTripId,
              routeId: currentVehicle.routeId ?? prediction.routeId,
              routeShort: prediction.routeId
                ? ROUTE_BY_ID[prediction.routeId]?.short
                : undefined,
              routeName: prediction.routeId
                ? ROUTE_BY_ID[prediction.routeId]?.name
                : undefined,
              directionId: prediction.directionId,
              headsign: prediction.headsign,
              targetStop: {
                id: stop.id,
                name: stop.name,
                lat: stop.lat,
                lng: stop.lng,
              },
              lastSeenAt: currentVehicle.timestamp,
            }
          : null,
      };
    })
    .filter((row): row is ArrivalRowData => row != null)
    .sort((a, b) => a.minutes - b.minutes)
    .slice(0, 4);

  const showScheduleLink =
    snapshot.status === "stale" ||
    snapshot.status === "unavailable" ||
    (snapshot.status === "live" && arrivals.length === 0);

  return (
    <div className={styles.boardingCard} data-transit-boarding-card>
      <div className={`${styles.boardingBody} space-y-3`}>
        <div className={styles.stopHeading}>
          <div className={styles.stopIdentity}>
            <p
              className={styles.stopKicker}
              style={{ color: "var(--app-ink-2)" }}
            >
              Your stop
            </p>
            <h3
              className="mt-0.5"
              style={{ color: "var(--app-ink)" }}
            >
              {stop.name}
            </h3>
            {walkingMinutes != null && distanceMeters != null ? (
              <p
                className="mt-1 flex items-center gap-1.5 text-[13px]"
                style={{ color: "var(--app-ink-2)" }}
              >
                <Navigation className="h-3 w-3" strokeWidth={2.2} aria-hidden />
                About {walkingMinutes} min on foot ·{" "}
                {milesLabel(distanceMeters)}
              </p>
            ) : position ? (
              <p
                className="mt-1 text-[13px]"
                style={{ color: "var(--app-ink-3)" }}
              >
                Your location is too broad for a useful walk estimate.
              </p>
            ) : (
              <p
                className="mt-1 text-[13px]"
                style={{ color: "var(--app-ink-3)" }}
              >
                Use your location below to compare the walk with arrivals.
              </p>
            )}
            {wheelchairBoarding && (
              <p
                className="mt-1 text-[12.5px] font-medium"
                style={{ color: "var(--state-open)" }}
              >
                Wheelchair boarding is listed for this stop.
              </p>
            )}
          </div>
          <FeedBadge
            status={snapshot.status}
            updatedAt={snapshot.providerUpdatedAt}
            nowMs={nowMs}
          />
        </div>

        {routes.length > 0 && (
          <div>
            <p
              className="mb-1 text-[12px] font-semibold"
              style={{ color: "var(--app-ink-3)" }}
            >
              Routes with live arrivals
            </p>
            <div
              aria-label="Routes with live arrivals"
              className={styles.servedRoutes}
            >
              {routes.map((route) => (
                <span
                  key={route.id}
                  className={styles.servedRoute}
                >
                  <RouteBadge route={route} />
                  <span
                    className="text-[12.5px] font-medium"
                    style={{ color: "var(--app-ink-2)" }}
                  >
                    {route.name}
                  </span>
                </span>
              ))}
            </div>
          </div>
        )}

        <div>
          <div className="mb-1.5 flex items-center justify-between gap-2">
            <p
              className="flex items-center gap-1.5 text-[11px] font-bold"
              style={{ color: "var(--app-ink-2)" }}
            >
              <Clock3 className="h-3.5 w-3.5" strokeWidth={2.1} aria-hidden />
              Next arrivals
            </p>
            {walkingMinutes != null && snapshot.status === "live" && (
              <span
                className="text-[12px]"
                style={{ color: "var(--app-ink-3)" }}
              >
                Walk timing included
              </span>
            )}
          </div>

          {snapshot.status === "loading" ? (
            <p
              className="rounded-[var(--app-radius-sm)] px-3 py-3 text-[12px]"
              style={{
                color: "var(--app-ink-3)",
                background: "var(--app-bg-sunken)",
              }}
            >
              Radius is checking for inbound buses.
            </p>
          ) : arrivals.length > 0 ? (
            <ul className={styles.arrivalList}>
              {arrivals.map((row) => (
                <ArrivalRow
                  key={row.key}
                  row={row}
                  saved={
                    row.busRef
                      ? savedBuses.some(
                          (bus) =>
                            bus.watchId === transitBusWatchId(row.busRef!),
                        )
                      : false
                  }
                  onTrack={onTrackVehicle}
                  onToggleSaved={(bus) => {
                    const result = toggleSavedBus(bus);
                    if (result.limitReached) {
                      haptic("warning");
                      onAnnounce(
                        `You can save up to ${MAX_SAVED_TRANSIT_BUSES} buses. Remove one from Saved before adding another.`,
                      );
                      return;
                    }
                    haptic(result.saved ? "success" : "light");
                    onAnnounce(
                      result.saved
                        ? result.persistent
                          ? `Bus ${bus.vehicleId} saved for future tracking.`
                          : `Bus ${bus.vehicleId} saved for this visit only. Device storage is unavailable.`
                        : result.persistent
                          ? `Bus ${bus.vehicleId} removed from Saved.`
                          : `Bus ${bus.vehicleId} removed for this visit only. Device storage is unavailable.`,
                    );
                  }}
                />
              ))}
            </ul>
          ) : snapshot.status === "unavailable" ? (
            <p
              className="rounded-[var(--app-radius-sm)] px-3 py-3 text-[12px] leading-snug"
              style={{
                color: "var(--app-ink-2)",
                background: "var(--app-bg-sunken)",
              }}
            >
              Live arrivals are unavailable for this stop right now.
            </p>
          ) : snapshot.status === "stale" ? (
            <p
              className="rounded-[var(--app-radius-sm)] px-3 py-3 text-[12px] leading-snug"
              style={{
                color: "var(--app-ink-2)",
                background: "var(--app-bg-sunken)",
              }}
            >
              The last feed update has no usable arrival times.
            </p>
          ) : (
            <p
              className="rounded-[var(--app-radius-sm)] px-3 py-3 text-[12px] leading-snug"
              style={{
                color: "var(--app-ink-2)",
                background: "var(--app-bg-sunken)",
              }}
            >
              No live arrival is reporting for this stop right now. Check the
              official schedule before leaving.
            </p>
          )}

          {showScheduleLink && (
            <a
              href={COUNTY_TRANSIT_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="tap-44-y mt-1.5 inline-flex items-center gap-1.5 text-[13px] font-semibold"
              style={{ color: "var(--app-link)" }}
            >
              Check the official schedule
              <ExternalLink className="h-3 w-3" strokeWidth={2} aria-hidden />
            </a>
          )}
        </div>

        {walkingMinutes != null && (
          <p
            className="text-[12.5px] leading-snug"
            style={{ color: "var(--app-ink-3)" }}
          >
            Rough walk timing uses straight-line distance with extra allowance.
            Arrival times can change.
          </p>
        )}

        <div className={styles.stopActions}>
          <button
            type="button"
            onClick={() => onShowStop(stop)}
            className={styles.saveAction}
          >
            <MapPin className="h-4 w-4 shrink-0" strokeWidth={2.2} aria-hidden />
            Show stop on map
          </button>
          <a
            href={directionsUrl(stop)}
            target="_blank"
            rel="noopener noreferrer"
            aria-label="Walking directions to this stop"
            className={styles.walkAction}
          >
            <Navigation
              className="h-4 w-4 shrink-0"
              strokeWidth={2.2}
              aria-hidden
            />
            Walk there
          </a>
          <button
            type="button"
            onClick={() => onToggleSaved(stop)}
            aria-pressed={saved}
            className={styles.saveAction}
          >
            {saved ? (
              <BookmarkCheck
                className="h-4 w-4"
                strokeWidth={2.2}
                aria-hidden
              />
            ) : (
              <Bookmark
                className="h-4 w-4"
                strokeWidth={2.2}
                aria-hidden
              />
            )}
            {saved ? "Saved stop" : "Save stop"}
          </button>
        </div>
      </div>

      <details
        className="group border-t"
        style={{ borderColor: "var(--app-border)" }}
        onToggle={(event) => setShowFullDetail(event.currentTarget.open)}
      >
        <summary className={styles.detailSummary}>
          <span style={{ color: "var(--app-ink-2)" }}>
            Full arrival detail
          </span>
          <ChevronDown
            className="h-3.5 w-3.5 transition-transform group-open:rotate-180 motion-reduce:transition-none"
            strokeWidth={2.2}
            aria-hidden
            style={{ color: "var(--app-ink-3)" }}
          />
        </summary>
        {showFullDetail && (
          <div
            className="border-t px-3.5 py-3"
            style={{ borderColor: "var(--app-border)" }}
          >
            <StopArrivalsPopup key={stop.id} stop={stop} showName={false} />
          </div>
        )}
      </details>
    </div>
  );
}

function SavedStopRail({
  stops,
  activeStopId,
  onSelect,
}: {
  stops: SelectedStop[];
  activeStopId: string | null;
  onSelect: (stop: SelectedStop) => void;
}) {
  if (stops.length === 0) return null;

  return (
    <div className={styles.savedRail}>
      <div className={styles.savedRailHeader}>
        <p
          className="text-[12.5px] font-semibold"
          style={{ color: "var(--app-ink-2)" }}
        >
          Saved on this phone
        </p>
        <p
          className="font-mono text-[12px] tabular-nums"
          style={{ color: "var(--app-ink-3)" }}
        >
          {stops.length}/{MAX_SAVED_TRANSIT_STOPS}
        </p>
      </div>
      <div
        aria-label="Saved bus stops"
        className={styles.savedStops}
      >
        {stops.map((stop) => {
          const active = stop.id === activeStopId;
          return (
            <button
              key={stop.id}
              type="button"
              aria-pressed={active}
              onClick={() => onSelect(stop)}
              className={styles.savedStop}
              style={{
                borderColor: active
                  ? "var(--app-cool)"
                  : "var(--app-control-border)",
                color: active ? "var(--app-link)" : "var(--app-ink-2)",
                background: active
                  ? "var(--app-cool-tint-6)"
                  : "var(--app-bg-elevated-solid)",
              }}
            >
              {stop.name}
            </button>
          );
        })}
      </div>
    </div>
  );
}

/**
 * The mobile rider command center. Saved stops stay on the device, location is
 * requested only after a tap, and catchability appears only beside fresh live
 * arrivals with a usable location fix.
 */
export default function TransitStopFinder() {
  const interactionReady = useMounted();
  const { state: geoState, request: requestLocation } = useGeolocation();
  const { stops: savedStops, toggle: toggleSavedStop } =
    useSavedTransitStops();
  const [query, setQuery] = useState("");
  const [showNearby, setShowNearby] = useState(false);
  const [selected, setSelected] = useState<SelectedStop | null>(null);
  const [notice, setNotice] = useState("");
  const noticeTimer = useRef<number | null>(null);
  const normalized = query.trim().toLocaleLowerCase();
  const position = geoState.status === "granted" ? geoState.position : null;
  const currentSavedStops = savedStops.filter((stop) =>
    isCurrentTransitStop(stop.id),
  );
  const activeStop: SelectedStop | null =
    selected ?? currentSavedStops[0] ?? null;

  const announce = useCallback((message: string) => {
    if (noticeTimer.current != null) {
      window.clearTimeout(noticeTimer.current);
    }
    setNotice(message);
    noticeTimer.current = window.setTimeout(() => {
      setNotice("");
      noticeTimer.current = null;
    }, 3200);
  }, []);

  useEffect(
    () => () => {
      if (noticeTimer.current != null) {
        window.clearTimeout(noticeTimer.current);
      }
    },
    [],
  );

  useEffect(() => {
    const requestedId = new URLSearchParams(window.location.search).get(
      "stop",
    );
    if (!requestedId) return;
    const requested = SELECTABLE_STOP_BY_ID[requestedId];
    const timer = window.setTimeout(() => {
      if (!requested) {
        announce(
          "That saved stop is no longer in the current TransIT network.",
        );
        return;
      }
      setSelected(requested);
    }, 0);
    return () => window.clearTimeout(timer);
  }, [announce]);

  const results = useMemo(() => {
    if (normalized.length >= 2) {
      return STOPS.filter((stop) =>
        stop.name.toLocaleLowerCase().includes(normalized),
      )
        .sort((a, b) => a.name.localeCompare(b.name))
        .slice(0, MAX_RESULTS)
        .map((stop) => ({ stop, distance: null as number | null }));
    }
    if (!showNearby || !position) return [];
    return STOPS.map((stop) => ({
      stop,
      distance: haversineMeters(position, stop),
    }))
      .sort((a, b) => a.distance - b.distance)
      .slice(0, MAX_RESULTS);
  }, [normalized, position, showNearby]);

  const chooseStop = useCallback((stop: SelectedStop) => {
    setSelected(stop);
    setQuery("");
    setShowNearby(false);
    const url = new URL(window.location.href);
    url.searchParams.set("stop", stop.id);
    window.history.replaceState(
      window.history.state,
      "",
      `${url.pathname}${url.search}${url.hash}`,
    );
    haptic("light");
    announce(`${stop.name} selected.`);
  }, [announce]);

  useEffect(() => {
    const useStop = (event: Event) => {
      const detail: unknown = (event as CustomEvent).detail;
      if (!isTransitStopFocusDetail(detail) || detail.selectForRider !== true) return;
      const stop = SELECTABLE_STOP_BY_ID[detail.stopId];
      if (!stop) return;
      chooseStop(stop);
      window.requestAnimationFrame(() => {
        const heading = document.getElementById("my-stop-heading");
        const reduced = window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches;
        heading?.scrollIntoView({ behavior: reduced ? "auto" : "smooth", block: "start" });
        heading?.focus({ preventScroll: true });
      });
    };
    window.addEventListener(TRANSIT_STOP_FOCUS_EVENT, useStop);
    return () => window.removeEventListener(TRANSIT_STOP_FOCUS_EVENT, useStop);
  }, [chooseStop]);

  const toggleSaved = (stop: SelectedStop) => {
    const result = toggleSavedStop(stop);
    if (result.limitReached) {
      haptic("warning");
      announce(
        `You can save up to ${MAX_SAVED_TRANSIT_STOPS} stops. Remove one before saving another.`,
      );
      return;
    }
    haptic(result.saved ? "success" : "light");
    announce(
      result.saved
        ? result.persistent
          ? `${stop.name} saved on this phone.`
          : `${stop.name} saved for this visit only. Device storage is unavailable.`
        : result.persistent
          ? `${stop.name} removed from saved stops.`
          : `${stop.name} removed for this visit only. Device storage is unavailable.`,
    );
  };

  const showNearestStops = () => {
    setQuery("");
    setShowNearby(true);
    haptic("light");
    requestLocation();
  };

  const showStopOnMap = (stop: SelectedStop) => {
    if (!requestTransitStopFocus({ stopId: stop.id })) return;
    const heading = document.getElementById("live-network-heading");
    const reduced = window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches;
    (heading?.closest("section") ?? heading)?.scrollIntoView({
      behavior: reduced ? "auto" : "smooth",
      block: "start",
    });
    haptic("light");
    announce(`Showing ${stop.name} on the map.`);
  };

  const trackVehicle = (detail: TransitVehicleFocusDetail) => {
    if (!requestTransitVehicleFocus(detail)) return;
    const liveNetworkHeading = document.getElementById(
      "live-network-heading",
    );
    const liveNetwork =
      liveNetworkHeading?.closest("section") ?? liveNetworkHeading;
    const reduced =
      window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches ??
      false;
    liveNetwork?.scrollIntoView({
      behavior: reduced ? "auto" : "smooth",
      block: "start",
    });
    haptic("success");
    const route = detail.routeId
      ? ROUTE_BY_ID[detail.routeId]
      : undefined;
    announce(
      route
        ? `Opening route ${route.short} on the live map.`
        : "Opening this bus on the live map.",
    );
  };

  const locationMessage =
    geoState.status === "loading"
      ? "Finding nearby stops."
      : geoState.status === "denied"
        ? "Location access is off. You can still search by stop name."
        : geoState.status === "unavailable"
          ? "Location is unavailable on this device. Search by stop name."
          : geoState.status === "error"
            ? "Your location could not be found. Search by stop name or try again."
            : showNearby && position
              ? "Nearest mapped stops. Distances are straight-line."
              : null;

  return (
    <section
      aria-labelledby="my-stop-heading"
      aria-busy={!interactionReady}
      data-transit-stop-interaction-ready={
        interactionReady ? "true" : "false"
      }
      className={styles.stopFinder}
    >
      <header className={styles.finderHeader}>
        <span className={styles.finderIcon} aria-hidden>
          <BusFront className="h-5 w-5" strokeWidth={2.1} />
        </span>
        <div className="min-w-0">
          <h2 id="my-stop-heading" tabIndex={-1}>My stop</h2>
          <p>Search by stop or street. Your location is optional.</p>
        </div>
      </header>

      <div className={styles.searchArea}>
        <p
          className={styles.searchLabel}
          style={{ color: "var(--app-ink-2)" }}
        >
          {activeStop ? "Choose another stop" : "Find your stop"}
        </p>
        <div className={styles.searchRow}>
          <label className="relative min-w-0 flex-1">
            <span className="sr-only">Search bus stops by name</span>
            <Search
              className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2"
              strokeWidth={2}
              aria-hidden
              style={{ color: "var(--app-ink-3)" }}
            />
            <input
              type="search"
              disabled={!interactionReady}
              value={query}
              onChange={(event) => {
                const nextQuery = event.target.value;
                setQuery(nextQuery);
                if (nextQuery) setShowNearby(false);
              }}
              placeholder="Stop or street name"
              className={styles.searchInput}
              style={{
                borderColor: "var(--app-control-border)",
                color: "var(--app-ink)",
              }}
            />
            {query && (
              <button
                type="button"
                onClick={() => {
                  setQuery("");
                  setShowNearby(false);
                }}
                aria-label="Clear stop search"
                className="tap-44 absolute right-0 top-1/2 grid h-11 w-11 -translate-y-1/2 place-items-center rounded-full"
                style={{ color: "var(--app-ink-3)" }}
              >
                <X className="h-4 w-4" strokeWidth={2.25} aria-hidden />
              </button>
            )}
          </label>
          <button
            type="button"
            onClick={showNearestStops}
            disabled={!interactionReady || geoState.status === "loading"}
            aria-label="Show the nearest bus stops"
            className={`${styles.nearest} disabled:opacity-60`}
            style={{
              borderColor:
                showNearby && position
                  ? "var(--app-link)"
                  : "var(--app-control-border)",
              color:
                showNearby && position
                  ? "var(--app-link)"
                  : "var(--app-ink-2)",
              background:
                showNearby && position
                  ? "var(--app-cool-tint-6)"
                  : "var(--app-bg-elevated-solid)",
            }}
          >
            <LocateFixed
              className="h-[18px] w-[18px]"
              strokeWidth={2.1}
              aria-hidden
            />
          </button>
        </div>

        {normalized.length === 1 && (
          <p
            className="mt-2 text-[13px]"
            style={{ color: "var(--app-ink-3)" }}
          >
            Type one more letter to search.
          </p>
        )}

        {normalized.length >= 2 && results.length === 0 && (
          <p
            className="mt-2 text-[12px]"
            style={{ color: "var(--app-ink-2)" }}
          >
            No mapped stop matches that name.
          </p>
        )}

        {locationMessage && (
          <p
            className="mt-2 text-[13px] leading-snug"
            style={{
              color:
                geoState.status === "denied" ||
                geoState.status === "unavailable" ||
                geoState.status === "error"
                  ? "var(--state-closing)"
                  : "var(--app-ink-3)",
            }}
          >
            {locationMessage}
          </p>
        )}

        {!normalized && !showNearby && (
          <p
            className="mt-2 text-[13px] leading-snug"
            style={{ color: "var(--app-ink-3)" }}
          >
            Frederick Radius asks for location only after you tap the nearby
            button.
          </p>
        )}

        {results.length > 0 && (
          <ul
            className={styles.resultList}
            style={{ borderColor: "var(--app-border)" }}
          >
            {results.map(({ stop, distance }) => (
              <li key={stop.id}>
                <button
                  type="button"
                  onClick={() => chooseStop(stop)}
                  className={styles.result}
                >
                  <MapPin
                    className="h-4 w-4 shrink-0"
                    strokeWidth={2.15}
                    aria-hidden
                    style={{ color: "var(--app-cool)" }}
                  />
                  <span
                    className={`${styles.resultName} font-semibold`}
                    style={{ color: "var(--app-ink)" }}
                  >
                    {stop.name}
                  </span>
                  {distance != null && (
                    <span
                      className="shrink-0 font-mono text-[11px] tabular-nums"
                      style={{ color: "var(--app-ink-3)" }}
                    >
                      {milesLabel(distance)}
                    </span>
                  )}
                </button>
              </li>
            ))}
          </ul>
        )}

        <p
          role="status"
          aria-live="polite"
          className={
            notice
              ? "mt-2 min-h-5 text-[13px] font-medium"
              : "sr-only"
          }
          style={{ color: "var(--app-link)" }}
        >
          {notice}
        </p>
      </div>
      <SavedStopRail
        stops={currentSavedStops}
        activeStopId={activeStop?.id ?? null}
        onSelect={chooseStop}
      />

      {activeStop && (
        <StopCommandPanel
          key={activeStop.id}
          stop={activeStop}
          position={position}
          saved={currentSavedStops.some((stop) => stop.id === activeStop.id)}
          onToggleSaved={toggleSaved}
          onTrackVehicle={trackVehicle}
          onShowStop={showStopOnMap}
          onAnnounce={announce}
        />
      )}

    </section>
  );
}
