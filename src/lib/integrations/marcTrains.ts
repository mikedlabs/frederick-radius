/**
 * MARC Brunswick Line — next trains at the four Frederick County
 * stations, schedule-backed with a realtime delay overlay.
 *
 * The static schedule (src/data/marc-schedule.json, built by
 * scripts/build-marc-schedule.ts) gives the day's scheduled departures
 * per platform. The realtime GTFS-RT trip-updates feed, decoded live and
 * cached ~30s, overlays the predicted time so the card reads "on time"
 * or "+6 min". Schedule-backed because the Brunswick Line is sparse
 * commuter service: a realtime-only card would be blank most of the day.
 *
 * No env key (the feeds are public). Every external read fails soft to
 * an empty result so a feed hiccup never breaks the page.
 *
 * The schedule + calendar logic is pure and unit-tested. Only the
 * protobuf fetch/decode is server-only.
 */
import { transit_realtime } from "gtfs-realtime-bindings";
import SCHEDULE from "@/data/marc-schedule.json";
import {
  MARC_STATIONS,
  MARC_STOP_IDS,
  type MarcStation,
  type MarcDirection,
} from "@/data/marc-stations";
import { easternWallToUtcISO } from "@/lib/tz";

const TRIP_UPDATES_URL =
  "https://mdotmta-gtfs-rt.s3.amazonaws.com/MARC+RT/marc-tu.pb";
const ALERTS_URL = "https://feeds.mta.maryland.gov/alerts.pb";
/** Brunswick Line route_id from the GTFS routes.txt. */
const BRUNSWICK_ROUTE_ID = "11704";

type ScheduledDep = {
  t: string;
  min: number;
  svc: string;
  head: string;
  trip: string;
};
type ScheduleJson = {
  calendar: Record<string, { days: number[]; start: string; end: string }>;
  exceptions: Record<string, { added: string[]; removed: string[] }>;
  stops: Record<string, ScheduledDep[]>;
};
const SCHED = SCHEDULE as unknown as ScheduleJson;

// ── Pure schedule logic (unit-tested) ────────────────────────────

/**
 * Eastern-time parts of an instant: the GTFS service-date as YYYYMMDD,
 * the weekday Monday-first (0=Mon .. 6=Sun, matching calendar.days), and
 * minutes from midnight.
 */
export function etNowParts(now: Date): {
  ymd: string;
  weekday: number;
  minutes: number;
} {
  const p = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", {
      timeZone: "America/New_York",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      weekday: "short",
      hour12: false,
    })
      .formatToParts(now)
      .map((x) => [x.type, x.value]),
  ) as Record<string, string>;
  const WEEKDAY: Record<string, number> = {
    Mon: 0, Tue: 1, Wed: 2, Thu: 3, Fri: 4, Sat: 5, Sun: 6,
  };
  return {
    ymd: `${p.year}${p.month}${p.day}`,
    weekday: WEEKDAY[p.weekday] ?? 0,
    minutes: (Number(p.hour) % 24) * 60 + Number(p.minute),
  };
}

/**
 * Service IDs running on a given Eastern date: those whose weekly
 * calendar covers the weekday and date range, then calendar_dates
 * exceptions applied (removed pulled out, added folded in).
 */
export function activeServiceIds(
  ymd: string,
  weekday: number,
  sched: ScheduleJson = SCHED,
): Set<string> {
  const active = new Set<string>();
  for (const [svc, c] of Object.entries(sched.calendar)) {
    if (c.days[weekday] === 1 && ymd >= c.start && ymd <= c.end) active.add(svc);
  }
  const ex = sched.exceptions[ymd];
  if (ex) {
    for (const s of ex.removed) active.delete(s);
    for (const s of ex.added) active.add(s);
  }
  return active;
}

export type NextDeparture = {
  t: string;
  min: number;
  headsign: string;
  trip: string;
};

/**
 * The next `limit` scheduled departures at a stop at or after `minutes`,
 * among services active today. Deduplicates replacement-service trips
 * that share the same time and headsign.
 */
export function nextScheduled(
  stopId: string,
  minutes: number,
  active: Set<string>,
  limit: number,
  sched: ScheduleJson = SCHED,
): NextDeparture[] {
  const deps = sched.stops[stopId] ?? [];
  const out: NextDeparture[] = [];
  const seen = new Set<string>();
  for (const d of deps) {
    if (d.min < minutes) continue;
    if (!active.has(d.svc)) continue;
    const key = `${d.t}|${d.head}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ t: d.t, min: d.min, headsign: d.head, trip: d.trip });
    if (out.length >= limit) break;
  }
  return out;
}

// ── Realtime overlay (server-only) ───────────────────────────────

function toNum(v: number | Long | null | undefined): number | null {
  if (v == null) return null;
  if (typeof v === "number") return v;
  const n = (v as { toNumber?: () => number }).toNumber?.();
  return typeof n === "number" ? n : null;
}
// Minimal Long shape (protobufjs) so we avoid an any.
type Long = { toNumber: () => number };

/**
 * Predicted departure epoch (seconds) per `${trip}|${stop}` from the
 * realtime trip-updates feed. Empty map on any failure.
 */
async function getTripPredictions(): Promise<Map<string, number>> {
  const map = new Map<string, number>();
  try {
    const res = await fetch(TRIP_UPDATES_URL, { next: { revalidate: 30 } });
    if (!res.ok) return map;
    const buf = new Uint8Array(await res.arrayBuffer());
    const feed = transit_realtime.FeedMessage.decode(buf);
    for (const e of feed.entity) {
      const tu = e.tripUpdate;
      const trip = tu?.trip?.tripId;
      if (!tu || !trip) continue;
      for (const stu of tu.stopTimeUpdate ?? []) {
        const stop = stu.stopId;
        if (!stop || !MARC_STOP_IDS.has(stop)) continue;
        const sec = toNum(stu.departure?.time ?? stu.arrival?.time);
        if (sec != null) map.set(`${trip}|${stop}`, sec);
      }
    }
  } catch {
    // network / decode hiccup — schedule-only board still renders
  }
  return map;
}

export type MarcDeparture = {
  scheduled: string;
  headsign: string;
  /** Live predicted clock time when the realtime feed has it. */
  predicted?: string;
  /** Minutes late (positive) or early (negative); absent when no live data. */
  delayMin?: number;
  live: boolean;
};

export type MarcStationBoard = {
  station: MarcStation;
  departures: Record<MarcDirection, MarcDeparture[]>;
};

/** Format an epoch-seconds instant as an Eastern HH:MM clock label. */
function etClock(epochSec: number): string {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(epochSec * 1000));
}

/**
 * The next-train board for all four county stations, both directions,
 * schedule-backed with realtime delays overlaid. Returns up to two
 * upcoming departures per direction.
 */
export async function getMarcBoard(
  now: Date,
): Promise<{ stations: MarcStationBoard[]; serviceToday: boolean }> {
  const { ymd, weekday, minutes } = etNowParts(now);
  const active = activeServiceIds(ymd, weekday);
  // Whether ANY county stop has a scheduled train today (ignoring the
  // current time). Lets the UI show one honest "weekday commuter
  // service, none today" note on weekends instead of four empty cards.
  const serviceToday = MARC_STATIONS.some((s) =>
    [s.stopIds.eb, s.stopIds.wb].some(
      (stop) => nextScheduled(stop, 0, active, 1).length > 0,
    ),
  );
  const predictions = await getTripPredictions();

  const year = Number(ymd.slice(0, 4));
  const month = Number(ymd.slice(4, 6));
  const day = Number(ymd.slice(6, 8));

  const overlay = (dep: NextDeparture, stopId: string): MarcDeparture => {
    const predictedSec = predictions.get(`${dep.trip}|${stopId}`);
    if (predictedSec == null) {
      return { scheduled: dep.t, headsign: dep.headsign, live: false };
    }
    const [hh, mm] = dep.t.split(":").map(Number);
    const scheduledSec = Date.parse(easternWallToUtcISO(year, month, day, hh, mm)) / 1000;
    const delayMin = Math.round((predictedSec - scheduledSec) / 60);
    return {
      scheduled: dep.t,
      headsign: dep.headsign,
      predicted: etClock(predictedSec),
      delayMin,
      live: true,
    };
  };

  const stations = MARC_STATIONS.map((station) => ({
    station,
    departures: {
      eb: nextScheduled(station.stopIds.eb, minutes, active, 2).map((d) =>
        overlay(d, station.stopIds.eb),
      ),
      wb: nextScheduled(station.stopIds.wb, minutes, active, 2).map((d) =>
        overlay(d, station.stopIds.wb),
      ),
    },
  }));
  return { stations, serviceToday };
}

export type MarcAlert = { header: string; description: string };

/**
 * Active Brunswick Line service alerts. Filtered to alerts whose
 * informed entities reference the Brunswick route or a county stop.
 * Empty on any failure.
 */
export async function getMarcAlerts(): Promise<MarcAlert[]> {
  try {
    const res = await fetch(ALERTS_URL, { next: { revalidate: 60 } });
    if (!res.ok) return [];
    const feed = transit_realtime.FeedMessage.decode(new Uint8Array(await res.arrayBuffer()));
    const out: MarcAlert[] = [];
    for (const e of feed.entity) {
      const a = e.alert;
      if (!a) continue;
      const relevant = (a.informedEntity ?? []).some(
        (ie) => ie.routeId === BRUNSWICK_ROUTE_ID || (ie.stopId && MARC_STOP_IDS.has(ie.stopId)),
      );
      if (!relevant) continue;
      const header = a.headerText?.translation?.[0]?.text?.trim() ?? "";
      const description = a.descriptionText?.translation?.[0]?.text?.trim() ?? "";
      if (header || description) out.push({ header, description });
    }
    return out;
  } catch {
    return [];
  }
}
