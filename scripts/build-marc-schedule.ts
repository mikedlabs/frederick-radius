/**
 * Build the compact MARC Brunswick Line schedule for the four Frederick
 * County stations from the official MTA Maryland static GTFS.
 *
 * Run: `npm run build:marc-schedule`
 *
 * Why a committed snapshot rather than a runtime parse: the GTFS is a
 * ~190KB zip of CSVs that changes a few times a year. Parsing it on
 * every request would be wasteful and add a build/runtime network
 * dependency on MTA. Instead this script downloads it, extracts only
 * what the four county stations need, and writes a small JSON that the
 * runtime loader reads. The realtime feed (decoded live) overlays
 * delays on top of this schedule. Re-run this when MTA publishes a new
 * GTFS (the feedDate in the output tells you how old the snapshot is).
 *
 * No new dependency: it shells out to curl + unzip, which exist in dev
 * and CI, rather than pulling a zip library into the app.
 */
import { execSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { MARC_STOP_IDS } from "../src/data/marc-stations";

const GTFS_URL = "https://feeds.mta.maryland.gov/gtfs/marc";
const OUT = join(process.cwd(), "src/data/marc-schedule.json");

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
  out.push(cur);
  return out;
}

function parseCsv(text: string): Record<string, string>[] {
  const lines = text.split(/\r?\n/).filter((l) => l.length > 0);
  if (lines.length === 0) return [];
  const header = splitCsv(lines[0]);
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

function main() {
  const dir = mkdtempSync(join(tmpdir(), "marc-gtfs-"));
  try {
    const zip = join(dir, "marc.zip");
    console.log(`Downloading ${GTFS_URL} ...`);
    execSync(`curl -sL --max-time 60 "${GTFS_URL}" -o "${zip}"`, { stdio: "inherit" });
    execSync(`unzip -o -q "${zip}" -d "${dir}"`, { stdio: "inherit" });

    const read = (f: string) => readFileSync(join(dir, f), "utf8");

    // feedDate: take the latest end_date stamp is not it; use the file
    // mtime via the zip listing's date. Simplest honest signal: read
    // calendar's first start_date is wrong too. We stamp with the
    // GTFS's own feed_info if present, else leave null.
    let feedDate: string | null = null;
    try {
      const fi = parseCsv(read("feed_info.txt"));
      feedDate = fi[0]?.feed_version || fi[0]?.feed_start_date || null;
    } catch {
      // feed_info.txt is optional in GTFS
    }

    // calendar: service_id -> weekday flags (mon..sun) + date range
    const calendar: Record<string, { days: number[]; start: string; end: string }> = {};
    for (const r of parseCsv(read("calendar.txt"))) {
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
    try {
      for (const r of parseCsv(read("calendar_dates.txt"))) {
        const d = (exceptions[r.date] ??= { added: [], removed: [] });
        if (r.exception_type === "1") d.added.push(r.service_id);
        else if (r.exception_type === "2") d.removed.push(r.service_id);
      }
    } catch {
      // calendar_dates.txt is optional
    }

    // trips: trip_id -> { service_id, headsign }
    const trips: Record<string, { svc: string; head: string }> = {};
    for (const r of parseCsv(read("trips.txt"))) {
      trips[r.trip_id] = { svc: r.service_id, head: r.trip_headsign };
    }

    // stop_times: keep only the county stop_ids, join to trips.
    type Dep = { t: string; min: number; svc: string; head: string; trip: string };
    const stops: Record<string, Dep[]> = {};
    for (const r of parseCsv(read("stop_times.txt"))) {
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

    const payload = {
      source: GTFS_URL,
      feedDate,
      stations: Object.keys(stops).length,
      departures: Object.values(stops).reduce((n, a) => n + a.length, 0),
      calendar,
      exceptions,
      stops,
    };
    writeFileSync(OUT, JSON.stringify(payload, null, 2) + "\n");
    console.log(
      `Wrote ${OUT}: ${payload.stations} stations, ${payload.departures} departures.`,
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

main();
