"use client";

import { useEffect, useMemo, useState } from "react";
import { TrainFront, Bus, Navigation, MapPin } from "lucide-react";
import TRANSIT from "@/data/transit.json";
import { MARC_STATIONS } from "@/data/marc-stations";
import {
  marcCountdownMins,
  type MarcDeparture,
  type MarcStationBoard,
} from "@/lib/integrations/marcTrains";
import { useGeolocation } from "@/hooks/useGeolocation";
import { useLiveVehicles } from "./useLiveVehicles";

/**
 * TransitNow — the "what can I catch right now" hero for /transit.
 *
 * Two cards. The MARC card leads with a live countdown to the next train at
 * the station nearest the rider (resolved from a cached geolocation fix, or
 * Frederick by default), with a 4-station switcher and an honest fallback once
 * the last train has gone. The buses card leads with the soonest live bus
 * arrival, backed by how many are moving and, when location is granted, how
 * many are near you.
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

function readableOn(hex: string): string {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex);
  if (!m) return "#FFFFFF";
  const n = parseInt(m[1], 16);
  const lum = (0.299 * ((n >> 16) & 255) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) / 255;
  return lum > 0.62 ? "#16140E" : "#FFFFFF";
}

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
        color: route ? readableOn(route.color) : "#FFFFFF",
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
  const { vehicles, loaded, fetchedAt, stale } = useLiveVehicles();
  const [nowMs, setNowMs] = useState(0);
  // When the feed goes quiet, present the frozen buses as "last seen," not as a
  // live countdown ticking a stuck fix down to "due."
  const staleAgo = stale && fetchedAt && nowMs ? agoLabel(nowMs - fetchedAt) : null;
  const [override, setOverride] = useState<string | null>(null);

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

  // Buses: soonest live arrival, plus how many are moving / near you.
  const soonestBus = useMemo(() => {
    let best: { route?: TransitRoute; stopName: string; mins: number } | null = null;
    for (const v of vehicles) {
      const mins = arrivalMins(v.nextStop?.etaEpoch, nowMs);
      if (mins == null || !v.nextStop) continue;
      if (!best || mins < best.mins) {
        best = { route: v.routeId ? ROUTE_BY_ID[v.routeId] : undefined, stopName: v.nextStop.name, mins };
      }
    }
    return best;
  }, [vehicles, nowMs]);

  const nearCount = useMemo(() => {
    if (!userPos) return null;
    return vehicles.filter((v) => haversineMiles(userPos, v) <= NEAR_MILES).length;
  }, [vehicles, userPos]);

  const cardStyle = {
    borderColor: "var(--app-border)",
    background: "var(--app-bg-elevated)",
    boxShadow: "var(--app-elev-1), var(--app-edge), var(--app-hi)",
  } as const;

  return (
    <section aria-labelledby="transit-now-heading" className="space-y-2.5">
      <h2 id="transit-now-heading" className="sr-only">
        What you can catch right now
      </h2>
      <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
        {/* MARC — countdown-first for the nearest station. */}
        <article className="rounded-[var(--app-radius-md)] border p-4" style={cardStyle}>
          <div className="flex items-center justify-between">
            <span className="eyebrow" style={{ color: "var(--app-ink-3)" }}>
              Next MARC train
            </span>
            <TrainFront className="h-4 w-4" strokeWidth={2} style={{ color: "var(--app-accent)" }} aria-hidden />
          </div>

          <div className="mt-2.5 flex flex-wrap gap-1.5" role="group" aria-label="Choose a MARC station">
            {MARC_STATIONS.map((s) => {
              const on = s.key === selectedKey;
              const isNearest = s.key === nearestKey && userPos != null;
              return (
                <button
                  key={s.key}
                  type="button"
                  onClick={() => setOverride(s.key)}
                  aria-pressed={on}
                  className="min-h-11 rounded-full border px-3 text-[12px] font-semibold"
                  style={{
                    borderColor: on ? "var(--app-accent)" : "var(--app-border)",
                    background: on ? "color-mix(in srgb, var(--app-accent) 16%, var(--app-bg-elevated))" : "var(--app-bg-elevated)",
                    color: on ? "var(--app-accent-press)" : "var(--app-ink-2)",
                  }}
                >
                  {s.name}
                  {isNearest && (
                    <span className="ml-1 text-[10px] font-normal" style={{ color: on ? "var(--app-accent-press)" : "var(--app-ink-3)" }}>
                      nearest
                    </span>
                  )}
                </button>
              );
            })}
          </div>

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

        {/* Buses — soonest live arrival, plus what is moving / near you. */}
        <article className="rounded-[var(--app-radius-md)] border p-4" style={cardStyle}>
          <div className="flex items-center justify-between">
            <span className="eyebrow" style={{ color: "var(--app-ink-3)" }}>
              {userPos ? "Buses near you" : "Buses moving now"}
            </span>
            <Bus className="h-4 w-4" strokeWidth={2} style={{ color: "var(--app-cool)" }} aria-hidden />
          </div>

          {!loaded ? (
            <p className="mt-3 text-[13px]" style={{ color: "var(--app-ink-3)" }}>
              Checking for buses on the road…
            </p>
          ) : vehicles.length === 0 ? (
            <p className="mt-3 text-[14px] font-semibold" style={{ color: "var(--app-ink)" }}>
              No buses are on the road right now.
            </p>
          ) : (
            <div className="mt-3">
              {stale ? (
                <p className="text-[14px] font-semibold" style={{ color: "var(--app-ink-2)" }}>
                  {vehicles.length} {vehicles.length === 1 ? "bus" : "buses"} last seen on the road
                </p>
              ) : soonestBus ? (
                <>
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
                  {vehicles.length} on the road now
                </p>
              )}
            </div>
          )}

          <p className="mt-2.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11.5px]" style={{ color: "var(--app-ink-3)" }}>
            {loaded && vehicles.length > 0 && (
              staleAgo ? (
                <span style={{ color: "var(--app-warning)", fontWeight: 600 }}>Live feed delayed, last update {staleAgo}</span>
              ) : (
                <span className="font-mono tabular-nums">{vehicles.length} moving now</span>
              )
            )}
            {FARE_FREE && <span style={{ color: "var(--app-brand-2)", fontWeight: 600 }}>free to ride</span>}
            {nearCount != null && vehicles.length > 0 && (
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
      </div>
    </section>
  );
}
