/**
 * Build src/data/transit.json from the live TransIT Frederick GTFS feed.
 * Fetches the static GTFS zip and extracts routes, stops, trip identity, and
 * every published route shape. `shapes` retains one representative line per
 * route for compatibility with older progress/snap code; `shapeVariants`
 * preserves the full network so alternate patterns do not disappear from the
 * rider map. Realtime is separate (src/lib/integrations/transitRealtime.ts).
 *
 *   npm run build:transit
 *
 * Uses the `unzip` CLI (build-time only; available on Linux/CI/Vercel).
 */
import { writeFileSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFileSync } from "node:child_process";
import {
  assertTransitValidation,
  validateFrederickTransitArtifacts,
} from "./lib/transit-data-validation";
import { fetchValidatedZip } from "./lib/fetch-validated-zip";

const GTFS_URL = "https://passio3.com/frederick/passioTransit/gtfs/google_transit.zip";
const OFFICIAL_SCHEDULE_URL =
  "https://www.frederickcountymd.gov/199/Connector-Schedules";
const TMP = mkdtempSync(join(tmpdir(), "fr-gtfs-"));
const OUT = new URL("../src/data/transit.json", import.meta.url).pathname;
const NETWORK_OUT = new URL(
  "../src/data/transit-network.json",
  import.meta.url,
).pathname;
const TRIPS_OUT = new URL(
  "../src/data/transit-trips.json",
  import.meta.url,
).pathname;

function splitCsvLine(line: string): string[] {
  const out: string[] = []; let cur = "", q = false;
  for (const ch of line) {
    if (ch === '"') q = !q;
    else if (ch === "," && !q) { out.push(cur); cur = ""; }
    else cur += ch;
  }
  out.push(cur); return out;
}
function csv(file: string): Record<string, string>[] {
  const lines = readFileSync(`${TMP}/${file}`, "utf8").split(/\r?\n/).filter(Boolean);
  const hdr = splitCsvLine(lines[0]);
  return lines.slice(1).map((l) => {
    const c = splitCsvLine(l); const o: Record<string, string> = {};
    hdr.forEach((h, i) => (o[h] = c[i])); return o;
  });
}

/** GTFS YYYYMMDD -> ISO YYYY-MM-DD. Invalid or absent dates stay absent. */
function gtfsDate(value: string | undefined): string | undefined {
  if (!value || !/^\d{8}$/.test(value)) return undefined;
  return `${value.slice(0, 4)}-${value.slice(4, 6)}-${value.slice(6, 8)}`;
}

async function main() {
  const archivePath = `${TMP}/gtfs.zip`;
  const archive = await fetchValidatedZip(GTFS_URL, {
    onRetry: (message) => console.warn(`  ${message}`),
    validateArchive(candidate) {
      writeFileSync(archivePath, candidate);
      execFileSync("unzip", ["-tq", archivePath], { stdio: "ignore" });
    },
  });
  writeFileSync(archivePath, archive);
  execFileSync("unzip", ["-o", archivePath, "-d", TMP], { stdio: "ignore" });

  const routes = csv("routes.txt").map((r) => ({
    id: r.route_id, short: r.route_short_name, name: r.route_long_name,
    color: "#" + (r.route_color || "888888"), text: "#" + (r.route_text_color || "FFFFFF"),
  }));
  const stops = csv("stops.txt")
    .filter((s) => s.stop_lat && s.stop_lon && s.location_type !== "1")
    .map((s) => ({
      id: s.stop_id, name: s.stop_name,
      lat: +(+s.stop_lat).toFixed(5), lng: +(+s.stop_lon).toFixed(5),
      wc: s.wheelchair_boarding === "1" || undefined,
    }));

  // Keep the trip identity fields needed to turn a realtime trip_id into a
  // useful direction/headsign. This is descriptive context only; it is not a
  // static departure-time promise.
  const tripRows = csv("trips.txt");
  const trips = Object.fromEntries(
    tripRows
      .filter((trip) => trip.trip_id && trip.route_id)
      .map((trip) => [
        trip.trip_id,
        {
          routeId: trip.route_id,
          shapeId: trip.shape_id || undefined,
          serviceId: trip.service_id || undefined,
          directionId:
            trip.direction_id === "0" || trip.direction_id === "1"
              ? Number(trip.direction_id)
              : undefined,
          headsign: trip.trip_headsign?.trim() || undefined,
        },
      ]),
  );
  const routeByTripId = new Map(
    tripRows
      .filter((trip) => trip.trip_id && trip.route_id)
      .map((trip) => [trip.trip_id, trip.route_id]),
  );
  const stopRouteSets: Record<string, Set<string>> = {};
  for (const stopTime of csv("stop_times.txt")) {
    const routeId = routeByTripId.get(stopTime.trip_id);
    if (!routeId || !stopTime.stop_id) continue;
    (stopRouteSets[stopTime.stop_id] ??= new Set()).add(routeId);
  }
  const stopRoutes = Object.fromEntries(
    Object.entries(stopRouteSets).map(([stopId, routeIds]) => [
      stopId,
      Array.from(routeIds).sort((a, b) =>
        a.localeCompare(b, undefined, { numeric: true }),
      ),
    ]),
  );

  // route → every official shape, plus one representative (longest) shape
  // retained in the old `shapes` field for backwards compatibility.
  const shapeByRoute: Record<string, Set<string>> = {};
  for (const t of tripRows) {
    if (!t.shape_id) continue;
    (shapeByRoute[t.route_id] ??= new Set()).add(t.shape_id);
  }
  const raw: Record<string, [number, number, number][]> = {};
  for (const p of csv("shapes.txt"))
    (raw[p.shape_id] ??= []).push([+p.shape_pt_sequence, +p.shape_pt_lat, +p.shape_pt_lon]);
  for (const k in raw) raw[k].sort((a, b) => a[0] - b[0]);
  const simplify = (pts: [number, number, number][]) => {
    const step = Math.max(1, Math.ceil(pts.length / 120));
    const out = pts.filter((_, i) => i % step === 0);
    if (out[out.length - 1] !== pts[pts.length - 1]) out.push(pts[pts.length - 1]);
    return out.map((p) => [+p[1].toFixed(5), +p[2].toFixed(5)]);
  };
  const shapes: Record<string, number[][]> = {};
  const shapeVariants: Record<
    string,
    Array<{
      id: string;
      directionIds: number[];
      headsigns: string[];
      points: number[][];
    }>
  > = {};
  for (const [rid, set] of Object.entries(shapeByRoute)) {
    let best: string | null = null;
    for (const sid of set) if (raw[sid] && (!best || raw[sid].length > raw[best].length)) best = sid;
    if (best) shapes[rid] = simplify(raw[best]);
    shapeVariants[rid] = Array.from(set)
      .filter((shapeId) => Boolean(raw[shapeId]))
      .map((shapeId) => {
        const matchingTrips = tripRows.filter(
          (trip) => trip.route_id === rid && trip.shape_id === shapeId,
        );
        return {
          id: shapeId,
          directionIds: Array.from(
            new Set(
              matchingTrips
                .map((trip) =>
                  trip.direction_id === "0" || trip.direction_id === "1"
                    ? Number(trip.direction_id)
                    : null,
                )
                .filter(
                  (directionId): directionId is number =>
                    directionId != null,
                ),
            ),
          ).sort(),
          headsigns: Array.from(
            new Set(
              matchingTrips
                .map((trip) => trip.trip_headsign?.trim())
                .filter((headsign): headsign is string => Boolean(headsign)),
            ),
          ).sort(),
          points: simplify(raw[shapeId]),
        };
      })
      .sort((a, b) => a.id.localeCompare(b.id, undefined, { numeric: true }));
  }

  const feedInfo = csv("feed_info.txt")[0] ?? {};
  const agencyInfo = csv("agency.txt")[0] ?? {};
  const generatedAt = new Date().toISOString().slice(0, 10);

  const out = {
    agency: "Transit Services of Frederick County", fareFree: true, phone: "301-600-2065",
    generatedAt,
    // This block describes the committed STATIC GTFS snapshot. It must never be
    // used as proof that vehicle positions or arrival predictions are live.
    staticFeed: {
      sourceUrl: GTFS_URL,
      agencyUrl: agencyInfo.agency_url || "https://www.frederickcountymd.gov/105/Transit-Services",
      scheduleUrl: OFFICIAL_SCHEDULE_URL,
      fetchedOn: generatedAt,
      serviceWindowStart: gtfsDate(feedInfo.feed_start_date),
      serviceWindowEnd: gtfsDate(feedInfo.feed_end_date),
    },
    routes, stops, shapes,
  };
  const network = { shapeVariants, stopRoutes };
  assertTransitValidation(
    "Frederick TransIT generated artifacts",
    validateFrederickTransitArtifacts({ transit: out, network, trips }),
  );
  writeFileSync(OUT, JSON.stringify(out));
  // These richer indexes are split from transit.json so the many small client
  // components that only need route colors or stop coordinates do not all
  // inherit the full network/trip payload. Trip metadata is joined into the
  // stop-arrivals API server-side.
  writeFileSync(
    NETWORK_OUT,
    JSON.stringify(network),
  );
  writeFileSync(TRIPS_OUT, JSON.stringify(trips));
  rmSync(TMP, { recursive: true, force: true });
  const variantCount = Object.values(shapeVariants).reduce(
    (sum, variants) => sum + variants.length,
    0,
  );
  console.log(
    `  transit.json: ${routes.length} routes · ${stops.length} stops · ${variantCount} shape variants · ${Object.keys(trips).length} trips`,
  );
}

main();
