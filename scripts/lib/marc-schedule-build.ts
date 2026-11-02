import { createHash } from "node:crypto";
import { readFileSync, statSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { MARC_STATIONS, MARC_STOP_IDS } from "../../src/data/marc-stations";
import { assertTransitValidation, validateMarcGtfsRows, validateMarcScheduleArtifact } from "./transit-data-validation";

export const GTFS_URL = "https://feeds.mta.maryland.gov/gtfs/marc";
// Exact destination returned by the official MTA endpoint, reviewed November 2.
export const MARC_GTFS_DOWNLOAD_URL = "https://mdotmta-gtfs.s3.amazonaws.com/mdotmta_gtfs_marc.zip";
export const MAX_MARC_ARCHIVE_BYTES = 8 * 1024 * 1024;
export type MarcOriginal = { observedAt: string; sourceSha256: string };
export class MissingOptionalMarcFile extends Error {
  constructor(readonly file: "feed_info.txt" | "calendar_dates.txt") {
    super(`Optional MARC ZIP member is absent: ${file}`);
    this.name = "MissingOptionalMarcFile";
  }
}
const OPTIONAL_MEMBERS = new Set(["feed_info.txt", "calendar_dates.txt"]);
const KNOWN_MEMBERS = ["routes.txt", "stops.txt", "calendar.txt", "trips.txt", "stop_times.txt", ...OPTIONAL_MEMBERS];

function validateOriginalMetadata(original: MarcOriginal, now: Date) {
  if (!/^[a-f0-9]{64}$/.test(original.sourceSha256)) throw new Error("MARC requires the original source SHA256.");
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(original.observedAt) ||
      !Number.isFinite(Date.parse(original.observedAt)) || new Date(original.observedAt).toISOString() !== original.observedAt ||
      !Number.isFinite(now.getTime()) || Date.parse(original.observedAt) > now.getTime()) throw new Error("MARC requires the actual non-future original observation.");
}

export function validateMarcOriginal(bytes: Uint8Array, original: MarcOriginal, now = new Date()): void {
  if (!bytes.byteLength || bytes.byteLength > MAX_MARC_ARCHIVE_BYTES ||
      !/^[a-f0-9]{64}$/.test(original.sourceSha256) ||
      createHash("sha256").update(bytes).digest("hex") !== original.sourceSha256) throw new Error("MARC original bytes/hash mismatch or archive exceeds its bound.");
  validateOriginalMetadata(original, now);
}

/** Minimal CSV line splitter that respects double-quoted fields. */
function splitCsv(line: string): string[] {
  const out: string[] = [];
  let cur = "";
  let q = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (q) {
      if (c === '"' && line[i + 1] === '"') { cur += '"'; i++; }
      else if (c === '"') q = false;
      else cur += c;
    } else if (c === '"') q = true;
    else if (c === ",") { out.push(cur); cur = ""; }
    else cur += c;
  }
  if (q) throw new Error("Malformed GTFS CSV quoted field.");
  out.push(cur);
  return out;
}

function parseCsv(text: string, requiredHeaders: string[] = []): Record<string, string>[] {
  const lines = text.split(/\r?\n/).filter((l) => l.length > 0);
  if (lines.length === 0) {
    if (requiredHeaders.length) throw new Error("Present MARC calendar_dates.txt is empty or malformed.");
    return [];
  }
  const header = splitCsv(lines[0]);
  if (requiredHeaders.some(key => !header.includes(key)) || new Set(header).size !== header.length) throw new Error("Malformed MARC GTFS CSV headers.");
  return lines.slice(1).map((line) => {
    const cells = splitCsv(line);
    const row: Record<string, string> = {};
    header.forEach((h, i) => (row[h] = cells[i] ?? ""));
    return row;
  });
}

/** "HH:MM:SS" (GTFS, hours may exceed 24) → minutes from midnight. */
function toMinutes(hms: string): number {
  const [h, m] = hms.split(":").map(Number);
  return h * 60 + m;
}

function gtfsDateIso(value: string): string | undefined {
  if (!/^\d{8}$/.test(value)) return undefined;
  return `${value.slice(0, 4)}-${value.slice(4, 6)}-${value.slice(6, 8)}`;
}


/** Pure schedule projection. Source observation, rather than replay time, owns freshness. */
export function buildMarcSchedule(read: (file: string) => string, original: MarcOriginal, now = new Date()) {
  validateOriginalMetadata(original, now);
    // feedDate: take the latest end_date stamp is not it; use the file
    // mtime via the zip listing's date. Simplest honest signal: read
    // calendar's first start_date is wrong too. We stamp with the
    // GTFS's own feed_info if present, else leave null.
    let feedDate: string | null = null;
    try {
      const fi = parseCsv(read("feed_info.txt"));
      feedDate = fi[0]?.feed_version || fi[0]?.feed_start_date || null;
    } catch (error) {
      if (!(error instanceof MissingOptionalMarcFile) || error.file !== "feed_info.txt") throw error;
    }

    const routeRows = parseCsv(read("routes.txt"));
    const stopRows = parseCsv(read("stops.txt"));
    const calendarRows = parseCsv(read("calendar.txt"));
    let calendarDateRows: Record<string, string>[] = [];
    try {
      calendarDateRows = parseCsv(read("calendar_dates.txt"), ["service_id", "date", "exception_type"]);
    } catch (error) {
      if (!(error instanceof MissingOptionalMarcFile) || error.file !== "calendar_dates.txt") throw error;
    }
    const exceptionKeys = new Set<string>();
    for (const row of calendarDateRows) {
      const key = JSON.stringify([row.service_id, row.date]);
      if (!row.service_id?.trim() || !/^\d{8}$/.test(row.date ?? "")
        || !["1", "2"].includes(row.exception_type) || exceptionKeys.has(key)) {
        throw new Error("Invalid or duplicate MARC service-date exception.");
      }
      exceptionKeys.add(key);
    }
    const tripRows = parseCsv(read("trips.txt"));
    const stopTimeRows = parseCsv(read("stop_times.txt"));

    assertTransitValidation(
      "MARC source GTFS",
      validateMarcGtfsRows(
        {
          routes: routeRows,
          stops: stopRows,
          trips: tripRows,
          stopTimes: stopTimeRows,
          calendar: calendarRows,
          calendarDates: calendarDateRows,
        },
        MARC_STOP_IDS,
      ),
    );

    // calendar: service_id -> weekday flags (mon..sun) + date range
    const calendar: Record<string, { days: number[]; start: string; end: string }> = {};
    for (const r of calendarRows) {
      calendar[r.service_id] = {
        days: [
          +r.monday, +r.tuesday, +r.wednesday, +r.thursday, +r.friday,
          +r.saturday, +r.sunday,
        ],
        start: r.start_date,
        end: r.end_date,
      };
    }

    // calendar_dates: exception_type 1 = added, 2 = removed, per date
    const exceptions: Record<string, { added: string[]; removed: string[] }> = {};
    for (const r of calendarDateRows) {
      const d = (exceptions[r.date] ??= { added: [], removed: [] });
      if (r.exception_type === "1") d.added.push(r.service_id);
      else if (r.exception_type === "2") d.removed.push(r.service_id);
    }

    // trips: trip_id -> { service_id, headsign }
    const trips: Record<string, { svc: string; head: string }> = {};
    for (const r of tripRows) {
      trips[r.trip_id] = { svc: r.service_id, head: r.trip_headsign };
    }

    // stop_times: keep only the county stop_ids, join to trips.
    type Dep = { t: string; min: number; svc: string; head: string; trip: string };
    const stops: Record<string, Dep[]> = {};
    for (const r of stopTimeRows) {
      if (!MARC_STOP_IDS.has(r.stop_id)) continue;
      const trip = trips[r.trip_id];
      if (!trip) continue;
      const hms = r.departure_time || r.arrival_time;
      if (!hms) continue;
      (stops[r.stop_id] ??= []).push({
        t: hms.slice(0, 5),
        min: toMinutes(hms),
        svc: trip.svc,
        head: trip.head,
        trip: r.trip_id,
      });
    }
    // Sort each station's departures by time and drop only the services
    // that never run (no calendar entry AND never added by exception).
    const exceptionAdded = new Set(
      Object.values(exceptions).flatMap((e) => e.added),
    );
    for (const id of Object.keys(stops)) {
      stops[id] = stops[id]
        .filter((d) => calendar[d.svc] || exceptionAdded.has(d.svc))
        .sort((a, b) => a.min - b.min);
    }

    const generatedAt = original.observedAt.slice(0, 10);
    const serviceDates = [
      ...Object.values(calendar).flatMap((service) => [
        service.start,
        service.end,
      ]),
      ...Object.keys(exceptions),
    ]
      .map(gtfsDateIso)
      .filter((date): date is string => Boolean(date))
      .sort();
    const payload = {
      source: GTFS_URL,
      feedDate,
      generatedAt,
      staticFeed: {
        sourceUrl: GTFS_URL,
        fetchedOn: generatedAt,
        observedAt: original.observedAt,
        sourceSha256: original.sourceSha256,
        serviceWindowStart: serviceDates[0],
        serviceWindowEnd: serviceDates.at(-1),
      },
      stations: Object.keys(stops).length,
      departures: Object.values(stops).reduce((n, a) => n + a.length, 0),
      calendar,
      exceptions,
      stops,
    };
    assertTransitValidation(
      "MARC generated schedule",
      validateMarcScheduleArtifact(
        payload,
        MARC_STATIONS.flatMap((station) => [
          { id: station.stopIds.eb, lat: station.lat, lng: station.lng },
          { id: station.stopIds.wb, lat: station.lat, lng: station.lng },
        ]),
        now,
      ),
    );
    return payload;
}

/** Replay exactly one retained ZIP. No fetch, fallback download or clock refresh. */
export function buildMarcScheduleFromZip(path: string, original: MarcOriginal, now = new Date()) {
  if (statSync(path).size > MAX_MARC_ARCHIVE_BYTES) throw new Error("MARC archive exceeds its bound.");
  validateMarcOriginal(readFileSync(path), original, now);
  const members = execFileSync("unzip", ["-Z1", path], {
    encoding: "utf8", maxBuffer: 1024 * 1024, stdio: ["ignore", "pipe", "pipe"],
  }).split(/\r?\n/).filter(Boolean);
  for (const file of KNOWN_MEMBERS) {
    if (members.filter(member => member === file).length > 1) throw new Error(`Duplicate MARC GTFS ZIP member: ${file}`);
  }
  const read = (file: string) => {
    if (!members.includes(file)) {
      if (file === "feed_info.txt" || file === "calendar_dates.txt") throw new MissingOptionalMarcFile(file);
      throw new Error(`Required MARC ZIP member is absent: ${file}`);
    }
    return execFileSync("unzip", ["-p", path, file], {
      encoding: "utf8", maxBuffer: 32 * 1024 * 1024, stdio: ["ignore", "pipe", "pipe"],
    });
  };
  return buildMarcSchedule(read, original, now);
}
