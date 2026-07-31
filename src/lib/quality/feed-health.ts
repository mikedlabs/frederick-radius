/**
 * Small, bounded HTTP probes for the scheduled feed-health workflow.
 *
 * This is deliberately not an ingestion path. A probe reads only enough of a
 * response to distinguish the expected feed from a 200 HTML error page, then
 * cancels the body. Every request has a deadline and the fan-out is capped so
 * one slow publisher cannot turn a health check into another load incident.
 */

export type FeedHealthEndpoint = {
  group: string;
  /** Source-ledger id when this probe maps to one manifest row. */
  sourceId?: string;
  url: string;
  /** A down critical endpoint fails the run; non-critical only warns. */
  critical: boolean;
  method?: "GET" | "HEAD";
  /** Per-source deadline. Clamped to the global safety ceiling. */
  timeoutMs?: number;
  /** Maximum response bytes inspected before the body is cancelled. */
  maxBodyBytes?: number;
  /** Expected response media type. */
  contentType?: RegExp;
  /** Expected marker within the bounded response prefix. */
  bodyPattern?: RegExp;
  accept?: string;
  /**
   * Optional credential sent only as a request header. The endpoint URL and
   * result never contain the value, so logs cannot disclose it.
   */
  authHeader?: {
    env: string;
    name: string;
  };
};

export type FeedHealthResult = {
  group: string;
  sourceId?: string;
  url: string;
  status: number | "ERR" | "SKIP";
  ok: boolean;
  skipped: boolean;
  critical: boolean;
  note?: string;
};

type ProbeOptions = {
  fetchImpl?: typeof fetch;
  env?: Readonly<Record<string, string | undefined>>;
  /** Optional route-wide cancellation in addition to each source deadline. */
  signal?: AbortSignal;
};

type ProbeManyOptions = ProbeOptions & {
  concurrency?: number;
};

const DEFAULT_TIMEOUT_MS = 15_000;
const MAX_TIMEOUT_MS = 30_000;
const DEFAULT_PREFIX_BYTES = 4_096;
const MAX_PREFIX_BYTES = 64 * 1_024;
const DEFAULT_CONCURRENCY = 6;
const MAX_CONCURRENCY = 12;

/**
 * MARC is one runtime product backed by four independent MTA endpoints. Keep
 * the shared ledger id on every probe so a future persisted health pass can
 * aggregate the group instead of leaving a working rail feed "unknown."
 */
export const MARC_SOURCE_ENDPOINTS: readonly FeedHealthEndpoint[] = [
  {
    group: "MARC static GTFS",
    sourceId: "mta_marc_rt",
    url: "https://feeds.mta.maryland.gov/gtfs/marc",
    critical: true,
    method: "HEAD",
  },
  {
    group: "MARC vehicle positions",
    sourceId: "mta_marc_rt",
    url: "https://mdotmta-gtfs-rt.s3.amazonaws.com/MARC+RT/marc-vp.pb",
    critical: true,
    method: "GET",
  },
  {
    group: "MARC trip updates",
    sourceId: "mta_marc_rt",
    url: "https://mdotmta-gtfs-rt.s3.amazonaws.com/MARC+RT/marc-tu.pb",
    critical: true,
    method: "GET",
  },
  {
    group: "MTA service alerts",
    sourceId: "mta_marc_rt",
    url: "https://feeds.mta.maryland.gov/alerts.pb",
    critical: true,
    method: "GET",
  },
] as const;

/**
 * Request-time official-data adapters shared by the GitHub tripwire and the
 * durable Vercel runtime-source health pass. Pipeline endpoints deliberately
 * do not belong here: reachability is not proof that a pipeline published its
 * transformed output.
 */
export const RUNTIME_SOURCE_ENDPOINTS: readonly FeedHealthEndpoint[] = [
  {
    group: "Maryland WZDx",
    sourceId: "md_wzdx",
    url: "https://filter.ritis.org/wzdx_v4.1/mdot.geojson",
    critical: false,
    method: "GET",
    maxBodyBytes: 1_024,
    contentType: /json|geo\+json/i,
    bodyPattern: /^\s*\{/,
    accept: "application/geo+json, application/json",
  },
  {
    group: "CHART traffic speeds",
    sourceId: "mdot_chart_tss",
    url: "https://chartexp1.sha.maryland.gov/CHARTExportClientService/getTSSMapDataJSON.do",
    critical: false,
    method: "GET",
    maxBodyBytes: 1_024,
    contentType: /json|text\/plain/i,
    bodyPattern: /^\s*[\[{]/,
    accept: "application/json, text/plain",
  },
  {
    group: "CHART travel times",
    sourceId: "mdot_chart_travel",
    url: "https://chartexp1.sha.maryland.gov/CHARTExportClientService/getTravelRouteDataJSON.do",
    critical: false,
    method: "GET",
    maxBodyBytes: 1_024,
    contentType: /json|text\/plain/i,
    bodyPattern: /^\s*[\[{]/,
    accept: "application/json, text/plain",
  },
  {
    group: "CHART message signs",
    sourceId: "mdot_chart_dms",
    url: "https://chartexp1.sha.maryland.gov/CHARTExportClientService/getDMSMapDataJSON.do",
    critical: false,
    method: "GET",
    maxBodyBytes: 1_024,
    contentType: /json|text\/plain/i,
    bodyPattern: /^\s*[\[{]/,
    accept: "application/json, text/plain",
  },
  {
    group: "CHART road weather",
    sourceId: "mdot_chart_rwis",
    url: "https://chartexp1.sha.maryland.gov/CHARTExportClientService/getRWISMapDataJSON.do",
    critical: false,
    method: "GET",
    maxBodyBytes: 1_024,
    contentType: /json|text\/plain/i,
    bodyPattern: /^\s*[\[{]/,
    accept: "application/json, text/plain",
  },
  {
    group: "CHART road conditions",
    sourceId: "mdot_chart_ips",
    url: "https://chartexp1.sha.maryland.gov/CHARTExportClientService/getIPSMapDataJSON.do",
    critical: false,
    method: "GET",
    maxBodyBytes: 1_024,
    contentType: /json|text\/plain/i,
    bodyPattern: /^\s*[\[{]/,
    accept: "application/json, text/plain",
  },
  {
    group: "CHART snow emergency",
    sourceId: "mdot_chart_sep",
    url: "https://chartexp1.sha.maryland.gov/CHARTExportClientService/getSEPMapDataJSON.do",
    critical: false,
    method: "GET",
    maxBodyBytes: 1_024,
    contentType: /json|text\/plain/i,
    bodyPattern: /^\s*[\[{]/,
    accept: "application/json, text/plain",
  },
  {
    group: "City emergency RSS",
    sourceId: "city_emergency_rss",
    url: "https://www.cityoffrederickmd.gov/RSSFeed.aspx?ModID=63&CID=City-Emergencies-4",
    critical: false,
    method: "GET",
    maxBodyBytes: 4_096,
    contentType: /xml|rss/i,
    bodyPattern: /<rss\b|<\?xml\b/i,
    accept: "application/rss+xml, application/xml, text/xml",
  },
  {
    group: "County Health burn-ban RSS",
    sourceId: "county_health_alerts",
    url: "https://health.frederickcountymd.gov/RSSFeed.aspx?ModID=63&CID=Burn-Ban-4",
    critical: false,
    method: "GET",
    maxBodyBytes: 4_096,
    contentType: /xml|rss/i,
    bodyPattern: /<rss\b|<\?xml\b/i,
    accept: "application/rss+xml, application/xml, text/xml",
  },
  {
    group: "County Health closings RSS",
    sourceId: "county_health_alerts",
    url: "https://health.frederickcountymd.gov/RSSFeed.aspx?ModID=63&CID=Closings-5",
    critical: false,
    method: "GET",
    maxBodyBytes: 4_096,
    contentType: /xml|rss/i,
    bodyPattern: /<rss\b|<\?xml\b/i,
    accept: "application/rss+xml, application/xml, text/xml",
  },
  {
    group: "County Health notices RSS",
    sourceId: "county_health_alerts",
    url: "https://health.frederickcountymd.gov/RSSFeed.aspx?ModID=63&CID=Health-Notices-1",
    critical: false,
    method: "GET",
    maxBodyBytes: 4_096,
    contentType: /xml|rss/i,
    bodyPattern: /<rss\b|<\?xml\b/i,
    accept: "application/rss+xml, application/xml, text/xml",
  },
  {
    group: "NWS local storm reports",
    sourceId: "nws_lsr",
    url: "https://api.weather.gov/products/types/LSR/locations/LWX",
    critical: false,
    method: "GET",
    maxBodyBytes: 1_024,
    contentType: /json/i,
    bodyPattern: /^\s*\{/,
    accept: "application/json",
  },
  {
    group: "NOAA nowCOAST lightning",
    sourceId: "nowcoast_lightning",
    url: "https://nowcoast.noaa.gov/geoserver/observations/lightning_detection/ows?SERVICE=WMS&VERSION=1.3.0&REQUEST=GetCapabilities",
    critical: false,
    method: "GET",
    maxBodyBytes: 4_096,
    contentType: /xml/i,
    bodyPattern: /WMS_Capabilities|WMT_MS_Capabilities/i,
    accept: "application/xml, text/xml",
  },
] as const;

export type AggregatedSourceProbeResult = {
  sourceId: string;
  outcome: "success" | "failure" | "skipped";
  endpointCount: number;
  /** Safe, source-agnostic text suitable for durable operational evidence. */
  error: string | null;
};

export type RuntimeSourceProbeGate = {
  blocking: boolean;
  configured: number;
  healthy: number;
  failed: number;
  criticalFailed: string[];
  reason: "critical-source" | "systemic-outage" | null;
};

/**
 * Collapse one or more endpoint checks into exactly one source result. A
 * multi-endpoint source is healthy only when every required endpoint answers.
 * Detailed URLs, status notes, and credential names stay in ephemeral logs and
 * are never copied into the database.
 */
export function aggregateFeedHealthBySource(
  results: readonly FeedHealthResult[],
): AggregatedSourceProbeResult[] {
  const grouped = new Map<string, FeedHealthResult[]>();
  for (const result of results) {
    const sourceId = result.sourceId?.trim();
    if (!sourceId) continue;
    const rows = grouped.get(sourceId) ?? [];
    rows.push(result);
    grouped.set(sourceId, rows);
  }

  return [...grouped.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([sourceId, rows]) => {
      const succeeded = rows.every((row) => row.ok && !row.skipped);
      const allSkipped = rows.every((row) => row.skipped);
      const partiallySkipped =
        !allSkipped && rows.some((row) => row.skipped);
      return {
        sourceId,
        outcome: succeeded
          ? "success"
          : allSkipped
            ? "skipped"
            : "failure",
        endpointCount: rows.length,
        error: succeeded || allSkipped
          ? null
          : partiallySkipped
            ? "The runtime source health probe is not configured."
            : "One or more bounded runtime source health probes failed.",
      };
    });
}

/**
 * Decide when a runtime probe pass is unhealthy enough to fail an HTTP-only
 * scheduler or CI monitor. One optional publisher may fail without making the
 * whole app unavailable, but a critical source, a total outage, or a majority
 * outage across at least three configured sources must never look green.
 */
export function runtimeSourceProbeGate(
  aggregated: readonly AggregatedSourceProbeResult[],
  endpointResults: readonly FeedHealthResult[],
): RuntimeSourceProbeGate {
  const configured = aggregated.filter(
    (result) => result.outcome !== "skipped",
  );
  const failed = configured.filter((result) => result.outcome === "failure");
  const healthy = configured.length - failed.length;
  const failedIds = new Set(failed.map((result) => result.sourceId));
  const criticalFailed = [
    ...new Set(
      endpointResults
        .filter(
          (result) =>
            result.critical &&
            !result.ok &&
            !result.skipped &&
            result.sourceId &&
            failedIds.has(result.sourceId),
        )
        .map((result) => result.sourceId as string),
    ),
  ].sort();
  const systemicOutage =
    configured.length > 0 &&
    (healthy === 0 ||
      (failed.length >= 3 && failed.length / configured.length >= 0.5));
  const reason =
    criticalFailed.length > 0
      ? "critical-source"
      : systemicOutage
        ? "systemic-outage"
        : null;

  return {
    blocking: reason !== null,
    configured: configured.length,
    healthy,
    failed: failed.length,
    criticalFailed,
    reason,
  };
}

/**
 * High-value active sources that were not covered by the original scheduled
 * tripwire. These are warning-only because each runtime adapter fails soft and
 * no one publisher represents complete event, water, or incident coverage.
 */
export const HIGH_VALUE_SOURCE_ENDPOINTS: readonly FeedHealthEndpoint[] = [
  {
    group: "FCPL programs",
    sourceId: "fcpl_libraries",
    url: "https://frederick.librarycalendar.com/events/feed/json",
    critical: false,
    method: "GET",
    // This public feed is unusually large and historically takes 16-23s.
    timeoutMs: 30_000,
    maxBodyBytes: 2_048,
    contentType: /json/i,
    bodyPattern: /^\s*\[/,
    accept: "application/json",
  },
  {
    group: "County Parks & Recreation programs",
    sourceId: "fc_parks_rec",
    url: "https://www.recreater.com/RSSFeed.aspx?ModID=58&CID=All-calendar.xml",
    critical: false,
    method: "GET",
    maxBodyBytes: 8_192,
    contentType: /xml|rss/i,
    bodyPattern: /<rss\b|<\?xml\b/i,
    accept: "application/rss+xml, application/xml, text/xml",
  },
  {
    group: "Downtown Frederick events",
    sourceId: "dfp_events",
    // A one-row projection exercises the same WordPress collection without
    // downloading the full Vibemap registry.
    url: "https://downtownfrederick.org/wp-json/wp/v2/vibemap_event?per_page=1&_fields=id",
    critical: false,
    method: "GET",
    maxBodyBytes: 2_048,
    contentType: /json/i,
    bodyPattern: /^\s*\[/,
    accept: "application/json",
  },
  {
    group: "Visit Frederick events",
    sourceId: "visit_frederick",
    url: "https://www.visitfrederick.org/event/rss/",
    critical: false,
    method: "GET",
    maxBodyBytes: 8_192,
    contentType: /xml|rss/i,
    bodyPattern: /<rss\b|<\?xml\b/i,
    accept: "application/rss+xml, application/xml, text/xml",
  },
  {
    group: "USGS Frederick water",
    sourceId: "usgs_water",
    url:
      "https://waterservices.usgs.gov/nwis/iv/?format=json" +
      "&countyCd=24021&parameterCd=00065,00060&siteStatus=active",
    critical: false,
    method: "GET",
    maxBodyBytes: 16_384,
    contentType: /json/i,
    bodyPattern: /^\s*\{/,
    accept: "application/json",
  },
  {
    group: "FredScanner public incidents",
    sourceId: "fredscanner",
    url: "https://frederickscanner.com/fredscannerpro/tweets.html",
    critical: false,
    method: "GET",
    maxBodyBytes: 16_384,
    contentType: /html|text/i,
    bodyPattern:
      /\bLatest Incidents\s*:|\bNew incident log started\.\s*This will start populating soon\./i,
    accept: "text/html",
  },
  {
    group: "National Park Service alerts",
    sourceId: "nps",
    url:
      "https://developer.nps.gov/api/v1/alerts" +
      "?parkCode=cato%2Cmono%2Cchoh&limit=1",
    critical: false,
    method: "GET",
    maxBodyBytes: 4_096,
    contentType: /json/i,
    bodyPattern: /^\s*\{/,
    accept: "application/json",
    authHeader: {
      env: "NPS_API_KEY",
      name: "X-Api-Key",
    },
  },
] as const;

function boundedInt(
  value: number | undefined,
  fallback: number,
  max: number,
): number {
  if (!Number.isFinite(value)) return fallback;
  return Math.max(1, Math.min(max, Math.floor(value as number)));
}

async function cancelBody(body: ReadableStream<Uint8Array> | null): Promise<void> {
  if (!body) return;
  try {
    await body.cancel();
  } catch {
    // The connection may already be closed. Probe classification should still
    // be based on the response we received.
  }
}

async function readPrefix(
  body: ReadableStream<Uint8Array> | null,
  maxBytes: number,
): Promise<string> {
  if (!body) return "";
  const reader = body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (total < maxBytes) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!value?.byteLength) continue;
      const remaining = maxBytes - total;
      const chunk =
        value.byteLength <= remaining ? value : value.subarray(0, remaining);
      chunks.push(chunk);
      total += chunk.byteLength;
      if (value.byteLength > remaining) break;
    }
  } finally {
    try {
      await reader.cancel();
    } catch {
      // Ignore an already-closed stream.
    }
    reader.releaseLock();
  }

  const joined = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    joined.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder().decode(joined);
}

function safeError(err: unknown): string {
  if (err instanceof Error) {
    if (err.name === "TimeoutError" || err.name === "AbortError") {
      return "timeout";
    }
    return err.message;
  }
  return String(err);
}

export async function probeFeedEndpoint(
  endpoint: FeedHealthEndpoint,
  options: ProbeOptions = {},
): Promise<FeedHealthResult> {
  const base: Omit<FeedHealthResult, "status" | "ok" | "skipped"> = {
    group: endpoint.group,
    sourceId: endpoint.sourceId,
    url: endpoint.url,
    critical: endpoint.critical,
  };
  const env = options.env ?? process.env;
  const fetchImpl = options.fetchImpl ?? fetch;
  const authValue = endpoint.authHeader
    ? env[endpoint.authHeader.env]?.trim()
    : undefined;

  if (endpoint.authHeader && !authValue) {
    return {
      ...base,
      status: "SKIP",
      ok: false,
      skipped: true,
      note: `${endpoint.authHeader.env} is not configured`,
    };
  }
  if (options.signal?.aborted) {
    return {
      ...base,
      status: "ERR",
      ok: false,
      skipped: false,
      note: "route deadline",
    };
  }

  const timeoutMs = boundedInt(
    endpoint.timeoutMs,
    DEFAULT_TIMEOUT_MS,
    MAX_TIMEOUT_MS,
  );
  const maxBodyBytes = boundedInt(
    endpoint.maxBodyBytes,
    DEFAULT_PREFIX_BYTES,
    MAX_PREFIX_BYTES,
  );
  const headers = new Headers({
    "user-agent": "frederick-radius-feed-health/1.0",
    ...(endpoint.accept ? { accept: endpoint.accept } : {}),
  });
  if (endpoint.authHeader && authValue) {
    headers.set(endpoint.authHeader.name, authValue);
  }

  try {
    const timeoutSignal = AbortSignal.timeout(timeoutMs);
    const signal = options.signal
      ? AbortSignal.any([options.signal, timeoutSignal])
      : timeoutSignal;
    const response = await fetchImpl(endpoint.url, {
      method: endpoint.method ?? "GET",
      redirect: "follow",
      signal,
      headers,
    });
    const httpOk = response.status >= 200 && response.status < 400;
    if (!httpOk || endpoint.method === "HEAD") {
      await cancelBody(response.body);
      return {
        ...base,
        status: response.status,
        ok: httpOk,
        skipped: false,
      };
    }

    const contentType = response.headers.get("content-type") ?? "";
    if (endpoint.contentType && !endpoint.contentType.test(contentType)) {
      await cancelBody(response.body);
      return {
        ...base,
        status: response.status,
        ok: false,
        skipped: false,
        note: `unexpected content type (${contentType || "missing"})`,
      };
    }

    if (endpoint.bodyPattern) {
      const prefix = await readPrefix(response.body, maxBodyBytes);
      if (!endpoint.bodyPattern.test(prefix)) {
        return {
          ...base,
          status: response.status,
          ok: false,
          skipped: false,
          note: `expected feed marker not found in first ${maxBodyBytes} bytes`,
        };
      }
    } else {
      await cancelBody(response.body);
    }

    return {
      ...base,
      status: response.status,
      ok: true,
      skipped: false,
    };
  } catch (err) {
    return {
      ...base,
      status: "ERR",
      ok: false,
      skipped: false,
      note: safeError(err),
    };
  }
}

export async function probeFeedEndpoints(
  endpoints: readonly FeedHealthEndpoint[],
  options: ProbeManyOptions = {},
): Promise<FeedHealthResult[]> {
  if (endpoints.length === 0) return [];
  const concurrency = Math.min(
    endpoints.length,
    boundedInt(
      options.concurrency,
      DEFAULT_CONCURRENCY,
      MAX_CONCURRENCY,
    ),
  );
  const results = new Array<FeedHealthResult>(endpoints.length);
  let nextIndex = 0;

  await Promise.all(
    Array.from({ length: concurrency }, async () => {
      while (true) {
        const index = nextIndex++;
        if (index >= endpoints.length) return;
        const endpoint = endpoints[index];
        // Always enter the source classifier so an auth-gated source remains
        // SKIP even after the route deadline. `probeFeedEndpoint` checks the
        // already-aborted signal before fetch, so queued network work cannot
        // start.
        results[index] = await probeFeedEndpoint(endpoint, options);
      }
    }),
  );

  return results;
}
