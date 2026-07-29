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

type Endpoint = {
  group: string;
  /** Source-ledger id when this probe maps to one manifest row. */
  sourceId?: string;
  url: string;
  /** A down critical endpoint fails the run; non-critical only warns. */
  critical: boolean;
  /** Some GIS hosts answer GET only; use HEAD where it is safe + cheap. */
  method?: "GET" | "HEAD";
};

type Result = {
  group: string;
  sourceId?: string;
  url: string;
  status: number | string;
  ok: boolean;
  critical: boolean;
  note?: string;
};

const TIMEOUT_MS = 15_000;

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
  {
    group: "MARC static GTFS",
    url: "https://feeds.mta.maryland.gov/gtfs/marc",
    critical: true,
    method: "HEAD",
  },
  {
    group: "MARC vehicle positions",
    url: "https://mdotmta-gtfs-rt.s3.amazonaws.com/MARC+RT/marc-vp.pb",
    critical: true,
    method: "GET",
  },
  {
    group: "MARC trip updates",
    url: "https://mdotmta-gtfs-rt.s3.amazonaws.com/MARC+RT/marc-tu.pb",
    critical: true,
    method: "GET",
  },
  {
    group: "MTA service alerts",
    url: "https://feeds.mta.maryland.gov/alerts.pb",
    critical: true,
    method: "GET",
  },
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
const RUNTIME_FEED_ENDPOINTS: Endpoint[] = [
  {
    group: "Maryland WZDx",
    sourceId: "md_wzdx",
    url: "https://filter.ritis.org/wzdx_v4.1/mdot.geojson",
    critical: false,
    method: "GET",
  },
  {
    group: "CHART traffic speeds",
    sourceId: "mdot_chart_tss",
    url: "https://chartexp1.sha.maryland.gov/CHARTExportClientService/getTSSMapDataJSON.do",
    critical: false,
    method: "GET",
  },
  {
    group: "CHART travel times",
    sourceId: "mdot_chart_travel",
    url: "https://chartexp1.sha.maryland.gov/CHARTExportClientService/getTravelRouteDataJSON.do",
    critical: false,
    method: "GET",
  },
  {
    group: "CHART message signs",
    sourceId: "mdot_chart_dms",
    url: "https://chartexp1.sha.maryland.gov/CHARTExportClientService/getDMSMapDataJSON.do",
    critical: false,
    method: "GET",
  },
  {
    group: "CHART road weather",
    sourceId: "mdot_chart_rwis",
    url: "https://chartexp1.sha.maryland.gov/CHARTExportClientService/getRWISMapDataJSON.do",
    critical: false,
    method: "GET",
  },
  {
    group: "CHART road conditions",
    sourceId: "mdot_chart_ips",
    url: "https://chartexp1.sha.maryland.gov/CHARTExportClientService/getIPSMapDataJSON.do",
    critical: false,
    method: "GET",
  },
  {
    group: "CHART snow emergency",
    sourceId: "mdot_chart_sep",
    url: "https://chartexp1.sha.maryland.gov/CHARTExportClientService/getSEPMapDataJSON.do",
    critical: false,
    method: "GET",
  },
  {
    group: "City emergency RSS",
    sourceId: "city_emergency_rss",
    url: "https://www.cityoffrederickmd.gov/RSSFeed.aspx?ModID=63&CID=City-Emergencies-4",
    critical: false,
    method: "GET",
  },
  {
    group: "County Health burn-ban RSS",
    sourceId: "county_health_alerts",
    url: "https://health.frederickcountymd.gov/RSSFeed.aspx?ModID=63&CID=Burn-Ban-4",
    critical: false,
    method: "GET",
  },
  {
    group: "County Health closings RSS",
    sourceId: "county_health_alerts",
    url: "https://health.frederickcountymd.gov/RSSFeed.aspx?ModID=63&CID=Closings-5",
    critical: false,
    method: "GET",
  },
  {
    group: "County Health notices RSS",
    sourceId: "county_health_alerts",
    url: "https://health.frederickcountymd.gov/RSSFeed.aspx?ModID=63&CID=Health-Notices-1",
    critical: false,
    method: "GET",
  },
  {
    group: "NWS local storm reports",
    sourceId: "nws_lsr",
    url: "https://api.weather.gov/products/types/LSR/locations/LWX",
    critical: false,
    method: "GET",
  },
  {
    group: "NOAA nowCOAST lightning",
    sourceId: "nowcoast_lightning",
    url: "https://nowcoast.noaa.gov/geoserver/observations/lightning_detection/ows?SERVICE=WMS&VERSION=1.3.0&REQUEST=GetCapabilities",
    critical: false,
    method: "GET",
  },
];

const ENDPOINTS: Endpoint[] = [
  ...TOWN_ENDPOINTS,
  ...FEED_ENDPOINTS,
  ...RUNTIME_FEED_ENDPOINTS,
  ...approvedCountyHealthEndpoints(),
];

async function probe(ep: Endpoint): Promise<Result> {
  const base: Omit<Result, "status" | "ok"> = {
    group: ep.group,
    sourceId: ep.sourceId,
    url: ep.url,
    critical: ep.critical,
  };
  try {
    const res = await fetch(ep.url, {
      method: ep.method ?? "GET",
      redirect: "follow",
      signal: AbortSignal.timeout(TIMEOUT_MS),
      headers: {
        // Some municipal sites 403 a bare client; present a plain UA.
        "user-agent": "frederick-radius-feed-health/1.0",
      },
    });
    return {
      ...base,
      status: res.status,
      ok: res.status >= 200 && res.status < 400,
    };
  } catch (err) {
    const msg =
      err instanceof Error && err.name === "TimeoutError"
        ? "timeout"
        : err instanceof Error
          ? err.message
          : String(err);
    return { ...base, status: "ERR", ok: false, note: msg };
  }
}

async function main() {
  console.log(`Feed health: probing ${ENDPOINTS.length} endpoints...\n`);

  const results = await Promise.all(ENDPOINTS.map(probe));

  // Print a compact, aligned table of { url, status, ok }.
  const rows = results.map((r) => ({
    ok: r.ok ? "OK " : "DOWN",
    status: String(r.status),
    crit: r.critical ? "CRIT" : "    ",
    source: r.sourceId ?? "",
    url: r.url + (r.note ? `  (${r.note})` : ""),
  }));
  console.table(rows);

  const downCritical = results.filter((r) => !r.ok && r.critical);
  const downOther = results.filter((r) => !r.ok && !r.critical);

  console.log(
    `\nSummary: ${results.filter((r) => r.ok).length}/${results.length} healthy, ` +
      `${downCritical.length} critical down, ${downOther.length} non-critical down.`,
  );

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
    process.exit(1);
  }

  console.log("\nAll critical feeds healthy.");
}

// Never throw uncaught: a probe-loop bug should still exit cleanly red.
main().catch((err) => {
  console.error("feed-health crashed:", err);
  process.exit(1);
});
