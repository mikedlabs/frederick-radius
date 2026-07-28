"use client";

import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
} from "react";
import { TrainFront, Bus, Navigation, MapPin } from "lucide-react";
import TRANSIT from "@/data/transit.json";
import { MARC_STATIONS } from "@/data/marc-stations";
import {
  marcCountdownMins,
  type MarcDeparture,
  type MarcStationBoard,
} from "@/lib/integrations/marcTrains";
import { useGeolocation } from "@/hooks/useGeolocation";
import { readableTextOn } from "@/lib/color/readableText";
import { useLiveVehicles } from "./useLiveVehicles";

/**
 * TransitNow — the "what can I catch right now" hero for /transit.
 *
 * A compact Bus | MARC switcher follows the stop-specific command center. Bus
 * opens first and describes the wider reporting network without presenting a
 * fleet-wide arrival as the rider's own bus. MARC keeps its live countdown at
 * the nearest station (resolved from a cached geolocation fix, or Frederick by
 * default), its 4-station selector, and its honest end-of-service fallback.
 *
 * All timing is read from state (a 1s tick) so there is never a Date.now() in
 * render; the MARC board is passed from the server page (schedule + realtime
 * delay), and buses ride the shared live-vehicle poll. Nothing is invented:
 * missing data reads as a clock time, a plain count, or a quiet empty state.
 */

const MARC_SCHEDULE_URL = "https://www.mta.maryland.gov/schedule/marc-brunswick";
const PLAN_TRIP_URL =
  "https://www.google.com/maps/dir/?api=1&travelmode=transit&origin=Frederick%2C+MD";

type TransitRoute = { id: string; short: string; name: string; color: string };
const ROUTE_BY_ID: Record<string, TransitRoute> = Object.fromEntries(
  (TRANSIT.routes as TransitRoute[]).map((r) => [r.id, r]),
);
const FARE_FREE = (TRANSIT as { fareFree?: boolean }).fareFree === true;

// Show the big number only when the train is close enough for a countdown to
// help; a train hours out reads better as a clock time.
const COUNTDOWN_WINDOW_MIN = 180;
// A bus within about this far reads as "near you".
const NEAR_MILES = 1;
type TransitMode = "bus" | "marc";

function arrivalMins(epoch: number | undefined, nowMs: number): number | null {
  if (epoch == null || nowMs === 0) return null;
  const mins = Math.round((epoch * 1000 - nowMs) / 60000);
  if (mins < 0 || mins > 90) return null;
  return mins;
}

/** "45s ago" / "3 min ago" for the live-feed freshness caveat. */
function agoLabel(ms: number): string {
  const s = Math.round(ms / 1000);
  return s < 90 ? `${s}s ago` : `${Math.round(s / 60)} min ago`;
}

function haversineMiles(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const R = 3958.8;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const la1 = (a.lat * Math.PI) / 180;
  const la2 = (b.lat * Math.PI) / 180;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(la1) * Math.cos(la2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

/** The soonest upcoming departure at a station across both directions, by the
 *  effective (predicted or scheduled) epoch. Falls back to the first listed
 *  departure when none carry an epoch. */
function soonestDeparture(st: MarcStationBoard | undefined): MarcDeparture | undefined {
  if (!st) return undefined;
  const all = [...st.departures.eb, ...st.departures.wb];
  const withEpoch = all.filter((d) => d.epoch != null).sort((a, b) => (a.epoch ?? 0) - (b.epoch ?? 0));
  return withEpoch[0] ?? all[0];
}

function RouteChip({ route }: { route?: TransitRoute }) {
  const color = route?.color ?? "var(--app-cool)";
  return (
    <span
      className="font-mono"
      style={{
        display: "inline-grid",
        placeItems: "center",
        minWidth: 24,
        height: 20,
        padding: "0 6px",
        borderRadius: 999,
        background: color,
        color: route ? readableTextOn(route.color) : "#FFFFFF",
        fontSize: 11,
        fontWeight: 700,
        fontVariantNumeric: "tabular-nums",
      }}
    >
      {route?.short ?? "·"}
    </span>
  );
}

function DelayNote({ dep }: { dep: MarcDeparture }) {
  if (!dep.live || dep.delayMin == null) {
    return (
      <span className="text-[11px] uppercase tracking-[0.08em]" style={{ color: "var(--app-ink-3)" }}>
        scheduled
      </span>
    );
  }
  if (Math.abs(dep.delayMin) < 2) {
    return (
      <span className="text-[11px] font-bold" style={{ color: "var(--app-positive)" }}>
        on time
      </span>
    );
  }
  const late = dep.delayMin > 0;
  return (
    <span className="font-mono text-[11px] font-bold tabular-nums" style={{ color: late ? "var(--app-warning)" : "var(--app-cool)" }}>
      {late ? `+${dep.delayMin} min` : `${Math.abs(dep.delayMin)} min early`}
    </span>
  );
}

export default function TransitNow({
  board,
}: {
  board: { stations: MarcStationBoard[]; serviceToday: boolean };
}) {
  const { state: geoState, request: requestGeo } = useGeolocation();
  const {
    vehicles,
    loaded,
    available,
    status,
    fetchedAt,
    stale,
  } = useLiveVehicles();
  const [nowMs, setNowMs] = useState(0);
  // When the feed goes quiet, present the frozen buses as "last seen," not as a
  // live countdown ticking a stuck fix down to "due."
  const staleAgo = stale && fetchedAt && nowMs ? agoLabel(nowMs - fetchedAt) : null;
  const [override, setOverride] = useState<string | null>(null);
  const [activeMode, setActiveMode] = useState<TransitMode>("bus");
  const busTabRef = useRef<HTMLButtonElement>(null);
  const marcTabRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const tick = setInterval(() => setNowMs(Date.now()), 1000);
    return () => clearInterval(tick);
  }, []);

  const userPos = geoState.status === "granted" ? geoState.position : null;

  const nearestKey = useMemo(() => {
    if (!userPos) return MARC_STATIONS[0].key;
    let best = MARC_STATIONS[0];
    let bestD = Infinity;
    for (const s of MARC_STATIONS) {
      const d = haversineMiles(userPos, s);
      if (d < bestD) {
        bestD = d;
        best = s;
      }
    }
    return best.key;
  }, [userPos]);

  const selectedKey = override ?? nearestKey;
  const station = board.stations.find((s) => s.station.key === selectedKey);
  const next = soonestDeparture(station);
  const countdown = next ? marcCountdownMins(next.epoch, nowMs) : null;
  const nextClock = next ? (next.live && next.predicted ? next.predicted : next.scheduled) : null;

  const nearbyVehicles = useMemo(() => {
    if (!userPos) return [];
    return vehicles.filter((vehicle) => haversineMiles(userPos, vehicle) <= NEAR_MILES);
  }, [vehicles, userPos]);

  // If the rider shared a location and a bus is genuinely nearby, lead with
  // that subset. Otherwise show the network result without calling it local.
  const busesToRank = nearbyVehicles.length > 0 ? nearbyVehicles : vehicles;
  const soonestBus = useMemo(() => {
    let best: { route?: TransitRoute; stopName: string; mins: number } | null = null;
    for (const v of busesToRank) {
      const mins = arrivalMins(v.nextStop?.etaEpoch, nowMs);
      if (mins == null || !v.nextStop) continue;
      if (!best || mins < best.mins) {
        best = { route: v.routeId ? ROUTE_BY_ID[v.routeId] : undefined, stopName: v.nextStop.name, mins };
      }
    }
    return best;
  }, [busesToRank, nowMs]);

  const nearCount = userPos ? nearbyVehicles.length : null;
  const busTabStatus = !loaded
    ? "Checking"
    : !available
      ? "Unavailable"
      : stale
        ? "Delayed"
        : vehicles.length > 0
          ? `${vehicles.length} reporting`
          : "No reports";
  const marcTabStatus = !board.serviceToday
    ? "No service today"
    : !next
      ? "Done today"
      : countdown != null && countdown <= COUNTDOWN_WINDOW_MIN
        ? countdown === 0
          ? "Due"
          : `${countdown} min`
        : nextClock ?? "Scheduled";

  const moveTabFocus = (
    event: KeyboardEvent<HTMLButtonElement>,
    currentMode: TransitMode,
  ) => {
    let nextMode: TransitMode | null = null;
    if (event.key === "ArrowRight") {
      nextMode = currentMode === "bus" ? "marc" : "bus";
    } else if (event.key === "ArrowLeft") {
      nextMode = currentMode === "bus" ? "marc" : "bus";
    } else if (event.key === "Home") {
      nextMode = "bus";
    } else if (event.key === "End") {
      nextMode = "marc";
    }
    if (!nextMode) return;
    event.preventDefault();
    setActiveMode(nextMode);
    (nextMode === "bus" ? busTabRef : marcTabRef).current?.focus();
  };

  const cardStyle = {
    borderColor: "var(--app-border)",
    background: "var(--app-bg-elevated)",
    boxShadow: "var(--app-elev-1), var(--app-edge), var(--app-hi)",
  } as const;

  return (
    <section aria-labelledby="transit-now-heading" className="space-y-2.5">
      <div className="px-1">
        <h2
          id="transit-now-heading"
          className="font-sans text-[17px] font-semibold leading-tight tracking-[-0.02em]"
          style={{ color: "var(--app-ink)" }}
        >
          Network status
        </h2>
        <p className="mt-0.5 text-[11.5px] leading-snug" style={{ color: "var(--app-ink-3)" }}>
          Check the wider bus and rail network.
        </p>
      </div>

      <div
        role="tablist"
        aria-label="Choose bus or MARC status"
        aria-orientation="horizontal"
        className="grid grid-cols-2 gap-1 rounded-[var(--app-radius-md)] border p-1"
        style={{
          borderColor: "var(--app-border)",
          background: "var(--app-bg-sunken)",
        }}
      >
        <button
          ref={busTabRef}
          id="transit-bus-tab"
          type="button"
          role="tab"
          aria-selected={activeMode === "bus"}
          aria-controls="transit-bus-panel"
          tabIndex={activeMode === "bus" ? 0 : -1}
          onClick={() => setActiveMode("bus")}
          onKeyDown={(event) => moveTabFocus(event, "bus")}
          className="flex min-h-11 min-w-0 items-center gap-2 rounded-[calc(var(--app-radius-md)-4px)] px-3 text-left transition-colors motion-reduce:transition-none"
          style={{
            color: activeMode === "bus" ? "var(--app-ink)" : "var(--app-ink-3)",
            background: activeMode === "bus" ? "var(--app-bg-elevated-solid)" : "transparent",
            boxShadow: activeMode === "bus" ? "var(--app-edge), var(--app-hi)" : "none",
          }}
        >
          <Bus
            className="h-4 w-4 shrink-0"
            strokeWidth={2.2}
            style={{ color: activeMode === "bus" ? "var(--app-cool)" : "currentColor" }}
            aria-hidden
          />
          <span className="min-w-0">
            <span className="block text-[12.5px] font-semibold leading-none">Bus</span>
            <span className="mt-1 block truncate text-[9.5px] leading-none">{busTabStatus}</span>
          </span>
        </button>
        <button
          ref={marcTabRef}
          id="transit-marc-tab"
          type="button"
          role="tab"
          aria-selected={activeMode === "marc"}
          aria-controls="transit-marc-panel"
          tabIndex={activeMode === "marc" ? 0 : -1}
          onClick={() => setActiveMode("marc")}
          onKeyDown={(event) => moveTabFocus(event, "marc")}
          className="flex min-h-11 min-w-0 items-center gap-2 rounded-[calc(var(--app-radius-md)-4px)] px-3 text-left transition-colors motion-reduce:transition-none"
          style={{
            color: activeMode === "marc" ? "var(--app-ink)" : "var(--app-ink-3)",
            background: activeMode === "marc" ? "var(--app-bg-elevated-solid)" : "transparent",
            boxShadow: activeMode === "marc" ? "var(--app-edge), var(--app-hi)" : "none",
          }}
        >
          <TrainFront
            className="h-4 w-4 shrink-0"
            strokeWidth={2.2}
            style={{ color: activeMode === "marc" ? "var(--app-accent)" : "currentColor" }}
            aria-hidden
          />
          <span className="min-w-0">
            <span className="block text-[12.5px] font-semibold leading-none">MARC</span>
            <span className="mt-1 block truncate text-[9.5px] leading-none">{marcTabStatus}</span>
          </span>
        </button>
      </div>

      {/* Bus opens first. Its arrival is explicitly network context, not the
          rider's stop-specific result from My stop above. */}
      <article
        id="transit-bus-panel"
        role="tabpanel"
        aria-labelledby="transit-bus-tab"
        hidden={activeMode !== "bus"}
        tabIndex={0}
        className="rounded-[var(--app-radius-md)] border p-4"
        style={cardStyle}
      >
        <div className="flex items-center justify-between">
          <span className="eyebrow" style={{ color: "var(--app-ink-3)" }}>
            {userPos && nearbyVehicles.length > 0 ? "Nearby bus network" : "Bus network"}
          </span>
          <Bus className="h-4 w-4" strokeWidth={2} style={{ color: "var(--app-cool)" }} aria-hidden />
        </div>

        <p className="mt-2 text-[11.5px] leading-snug" style={{ color: "var(--app-ink-3)" }}>
          Use My stop above for a stop-specific arrival.
        </p>

        {!loaded ? (
          <p className="mt-3 text-[13px]" style={{ color: "var(--app-ink-3)" }}>
            Checking the live bus feed…
          </p>
        ) : !available ? (
          <p className="mt-3 text-[14px] font-semibold" style={{ color: "var(--app-ink)" }}>
            Live bus positions are unavailable.
          </p>
        ) : vehicles.length === 0 ? (
          <p className="mt-3 text-[14px] font-semibold" style={{ color: "var(--app-ink)" }}>
            No buses are reporting right now.
          </p>
        ) : (
          <div className="mt-3">
            {stale ? (
              <p className="text-[14px] font-semibold" style={{ color: "var(--app-ink-2)" }}>
                {vehicles.length} {vehicles.length === 1 ? "bus" : "buses"} last reported
              </p>
            ) : soonestBus ? (
              <>
                <p className="mb-2 text-[11px] leading-snug" style={{ color: "var(--app-ink-3)" }}>
                  This is the soonest reported arrival {nearbyVehicles.length > 0 ? "within about a mile" : "across the network"}.
                </p>
                <div className="flex items-center gap-2">
                  <RouteChip route={soonestBus.route} />
                  <span className="font-mono text-[26px] font-bold leading-none tabular-nums" style={{ color: "var(--app-ink)" }}>
                    {soonestBus.mins === 0 ? "due" : soonestBus.mins}
                    {soonestBus.mins !== 0 && <span className="ml-1 text-[14px] font-semibold" style={{ color: "var(--app-ink-2)" }}>min</span>}
                  </span>
                </div>
                <p className="mt-1 truncate text-[12.5px]" style={{ color: "var(--app-ink-2)" }}>
                  to {soonestBus.stopName}
                </p>
              </>
            ) : (
              <p className="text-[14px] font-semibold tabular-nums" style={{ color: "var(--app-ink)" }}>
                {vehicles.length} reporting now
              </p>
            )}
          </div>
        )}

        <p className="mt-2.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11.5px]" style={{ color: "var(--app-ink-3)" }}>
          {loaded && available && vehicles.length > 0 && (
            staleAgo ? (
              <span style={{ color: "var(--app-warning)", fontWeight: 600 }}>Live feed delayed, last update {staleAgo}</span>
            ) : status === "degraded" ? (
              <span style={{ color: "var(--app-warning)", fontWeight: 600 }}>
                Positions are live. Arrival estimates are unavailable.
              </span>
            ) : (
              <span className="font-mono tabular-nums">{vehicles.length} reporting now</span>
            )
          )}
          {FARE_FREE && <span style={{ color: "var(--app-cool)", fontWeight: 600 }}>free to ride</span>}
          {available && nearCount != null && vehicles.length > 0 && (
            <span className="font-mono tabular-nums">{nearCount} within about a mile</span>
          )}
          {!userPos && geoState.status !== "loading" && (
            <button
              type="button"
              onClick={requestGeo}
              className="tap-44-y inline-flex items-center gap-1 font-semibold"
              style={{ color: "var(--app-cool)" }}
            >
              <MapPin className="h-3.5 w-3.5" strokeWidth={2.25} aria-hidden />
              Use my location
            </button>
          )}
        </p>

        <a
          href={PLAN_TRIP_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="tap-44-y mt-2 inline-flex items-center gap-1.5 text-[12.5px] font-semibold"
          style={{ color: "var(--app-cool)" }}
        >
          <Navigation className="h-3.5 w-3.5" strokeWidth={2.25} aria-hidden />
          Plan a trip with the bus
        </a>
      </article>

      {/* MARC preserves the nearest-station countdown and manual selector. */}
      <article
        id="transit-marc-panel"
        role="tabpanel"
        aria-labelledby="transit-marc-tab"
        hidden={activeMode !== "marc"}
        tabIndex={0}
        className="rounded-[var(--app-radius-md)] border p-4"
        style={cardStyle}
      >
        <div className="flex items-center justify-between">
          <span className="eyebrow" style={{ color: "var(--app-ink-3)" }}>
            Next MARC train
          </span>
          <TrainFront className="h-4 w-4" strokeWidth={2} style={{ color: "var(--app-accent)" }} aria-hidden />
        </div>

        <label className="mt-2.5 flex items-center gap-2">
          <span className="shrink-0 text-[12px] font-semibold" style={{ color: "var(--app-ink-2)" }}>
            Station
          </span>
          <select
            value={selectedKey}
            onChange={(event) => setOverride(event.target.value)}
            aria-label="MARC station"
            className="min-h-11 min-w-0 flex-1 rounded-[var(--app-radius-md)] border bg-[var(--app-bg-elevated)] px-3 text-[13px] font-semibold"
            style={{ borderColor: "var(--app-control-border)", color: "var(--app-ink)" }}
          >
            {MARC_STATIONS.map((item) => (
              <option key={item.key} value={item.key}>
                {item.name}
                {item.key === nearestKey && userPos != null ? " · nearest" : ""}
              </option>
            ))}
          </select>
        </label>

        {board.serviceToday && next ? (
          <div className="mt-3">
            {countdown != null && countdown <= COUNTDOWN_WINDOW_MIN ? (
              <p className="font-mono leading-none tabular-nums" style={{ color: "var(--app-ink)" }}>
                <span className="text-[42px] font-bold">{countdown === 0 ? "due" : countdown}</span>
                {countdown !== 0 && <span className="ml-1 text-[15px] font-semibold" style={{ color: "var(--app-ink-2)" }}>min</span>}
              </p>
            ) : (
              <p className="font-mono text-[30px] font-bold leading-none tabular-nums" style={{ color: "var(--app-ink)" }}>
                {nextClock}
              </p>
            )}
            <p className="mt-1.5 flex flex-wrap items-baseline gap-x-1.5 text-[13px]" style={{ color: "var(--app-ink-2)" }}>
              <span>
                to {next.headsign} <span className="font-mono tabular-nums" style={{ color: "var(--app-ink-3)" }}>· {nextClock}</span>
              </span>
              <DelayNote dep={next} />
            </p>
          </div>
        ) : (
          <div className="mt-3">
            <p className="text-[14px] font-semibold" style={{ color: "var(--app-ink)" }}>
              {board.serviceToday ? "No more trains stop here today." : "No county MARC trains run today."}
            </p>
            <p className="mt-1 text-[12px]" style={{ color: "var(--app-ink-3)" }}>
              The Brunswick Line runs weekday commuter service.{" "}
              <a href={MARC_SCHEDULE_URL} target="_blank" rel="noopener noreferrer" className="tap-44-y font-semibold" style={{ color: "var(--app-cool)" }}>
                See the schedule
              </a>
              .
            </p>
          </div>
        )}
      </article>
    </section>
  );
}
