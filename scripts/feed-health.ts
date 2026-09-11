/**
 * Feed health check — pings the critical external endpoints the app
 * depends on and reports HTTP status, flagging anything dead or moved.
 *
 * The data pipeline can fetch cleanly one day and silently 404 the next
 * when an upstream feed moves or a GIS service is retired. This script
 * is the early-warning tripwire: it never writes data, it just probes a
 * hardcoded list of load-bearing endpoints and prints a status table.
 *
 * Read-tolerant by design: every probe is wrapped in a timeout + try /
 * catch, so a hung host or DNS failure becomes a row in the table, never
 * an uncaught throw. The process exits 1 only when a CRITICAL endpoint is
 * down, so the daily GitHub Action shows red (and can alert) on real
 * breakage while staying quiet on flaky non-critical hosts.
 *
 * Usage: npm run feed:health
 */
import { VERIFIED_TOWN_WEBSITES } from "@/data/town-websites";
import { approvedCountyHealthEndpoints } from "@/lib/integrations/fcCountyHealth";
import {
  HIGH_VALUE_SOURCE_ENDPOINTS,
  MARC_SOURCE_ENDPOINTS,
  RUNTIME_SOURCE_ENDPOINTS,
  aggregateFeedHealthBySource,
  probeFeedEndpoints,
  runtimeSourceProbeGate,
  type FeedHealthEndpoint as Endpoint,
} from "@/lib/quality/feed-health";

// Town homepages: read from the verified rows so this list stays in sync
// with src/data/town-websites.ts (the 11 confirmed municipalities). A
// town site moving is news, but a single town being briefly down should
// not page anyone — so these are non-critical.
const TOWN_ENDPOINTS: Endpoint[] = VERIFIED_TOWN_WEBSITES.filter(
  (t): t is typeof t & { homepage: string } => Boolean(t.homepage),
).map((t) => ({
  group: "Town sites",
  url: t.homepage,
  critical: false,
  method: "HEAD",
}));

// Transit + GIS feeds the build/ingest scripts read. These are the ones
// that, when they move, silently break a whole page — so they are
// critical and fail the run.
const FEED_ENDPOINTS: Endpoint[] = [
  {
    group: "TransIT static GTFS",
    url: "https://passio3.com/frederick/passioTransit/gtfs/google_transit.zip",
    critical: true,
    method: "HEAD",
  },
  {
    group: "TransIT vehicle positions",
    url: "https://passio3.com/frederick/passioTransit/gtfs/realtime/vehiclePositions",
    critical: true,
    method: "GET",
  },
  {
    group: "TransIT trip updates",
    url: "https://passio3.com/frederick/passioTransit/gtfs/realtime/tripUpdates",
    critical: true,
    method: "GET",
  },
  {
    group: "TransIT service alerts",
    url: "https://passio3.com/frederick/passioTransit/gtfs/realtime/serviceAlerts",
    critical: true,
    method: "GET",
  },
  ...MARC_SOURCE_ENDPOINTS,
  {
    group: "County rec FeatureServer",
    url: "https://services5.arcgis.com/o8KSxSzYaulbGcFX/arcgis/rest/services/survey123_4590893d5fdc4e6ab6d653f985715200_results/FeatureServer/0?f=json",
    critical: true,
    method: "GET",
  },
  {
    group: "City GIS",
    url: "https://spires.cityoffrederick.com/arcgis/rest/services?f=json",
    critical: true,
    method: "GET",
  },
];

// Request-time official-data adapters fail soft and expose unavailable or
// degraded state to their consumers. Probe every upstream here, but keep each
// one warning-only: no single source below provides complete traffic, weather,
// emergency, or public-health coverage by itself.
const ENDPOINTS: Endpoint[] = [
  ...TOWN_ENDPOINTS,
  ...FEED_ENDPOINTS,
  ...RUNTIME_SOURCE_ENDPOINTS,
  ...HIGH_VALUE_SOURCE_ENDPOINTS,
  ...approvedCountyHealthEndpoints(),
].map((endpoint) =>
  endpoint.critical ? { ...endpoint, attempts: 2 } : endpoint,
);

async function main() {
  console.log(`Feed health: probing ${ENDPOINTS.length} endpoints...\n`);

  const results = await probeFeedEndpoints(ENDPOINTS, { concurrency: 6 });

  // Print a compact, aligned table of { url, status, ok }.
  const rows = results.map((r) => ({
    ok: r.skipped ? "SKIP" : r.ok ? "OK  " : "DOWN",
    status: String(r.status),
    crit: r.critical ? "CRIT" : "    ",
    source: r.sourceId ?? "",
    url: r.url + (r.note ? `  (${r.note})` : ""),
  }));
  console.table(rows);

  const skipped = results.filter((r) => r.skipped);
  const downCritical = results.filter(
    (r) => !r.ok && !r.skipped && r.critical,
  );
  const downOther = results.filter(
    (r) => !r.ok && !r.skipped && !r.critical,
  );
  const runtimeGate = runtimeSourceProbeGate(
    aggregateFeedHealthBySource(results),
    results,
  );

  console.log(
    `\nSummary: ${results.filter((r) => r.ok).length} healthy, ` +
      `${skipped.length} not configured, ${downCritical.length} critical down, ` +
      `${downOther.length} non-critical down.`,
  );

  if (skipped.length) {
    console.info(
      "\nConfiguration-gated probes skipped:\n" +
        skipped
          .map(
            (r) =>
              `  - [${r.group}] ${r.note ?? "required setting is not configured"}`,
          )
          .join("\n"),
    );
  }

  if (downOther.length) {
    console.warn(
      "\nNon-critical endpoints down (warning only):\n" +
        downOther.map((r) => `  - [${r.group}] ${r.url} → ${r.status}`).join("\n"),
    );
  }

  if (downCritical.length) {
    console.error(
      "\nCRITICAL endpoints down — failing the run:\n" +
        downCritical
          .map((r) => `  - [${r.group}] ${r.url} → ${r.status}`)
          .join("\n"),
    );
  }

  if (runtimeGate.blocking && downCritical.length === 0) {
    console.error(
      "\nSYSTEMIC runtime-source outage — failing the run:\n" +
        `  - ${runtimeGate.failed} of ${runtimeGate.configured} configured source(s) failed (${runtimeGate.reason}).`,
    );
  }

  if (downCritical.length || runtimeGate.blocking) process.exit(1);

  console.log("\nAll critical feeds healthy.");
}

// Never throw uncaught: a probe-loop bug should still exit cleanly red.
main().catch((err) => {
  console.error("feed-health crashed:", err);
  process.exit(1);
});
