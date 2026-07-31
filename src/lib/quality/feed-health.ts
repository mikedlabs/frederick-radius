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
    const response = await fetchImpl(endpoint.url, {
      method: endpoint.method ?? "GET",
      redirect: "follow",
      signal: AbortSignal.timeout(timeoutMs),
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
        results[index] = await probeFeedEndpoint(endpoints[index], options);
      }
    }),
  );

  return results;
}
