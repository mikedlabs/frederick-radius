import {
  validateFirecrawlPublicUrl,
  FirecrawlRestError,
} from "./firecrawl-rest";

const APIFY_RUN_ENDPOINT =
  "https://api.apify.com/v2/actors/apify~website-content-crawler/runs";
const APIFY_API_ORIGIN = "https://api.apify.com";
const DEFAULT_TIMEOUT_MS = 240_000;
const DEFAULT_ACTOR_TIMEOUT_SECONDS = 180;
const DEFAULT_WAIT_SECONDS = 60;
const DEFAULT_MAX_RESPONSE_BYTES = 6 * 1_024 * 1_024;
const DEFAULT_MAX_TOTAL_CHARGE_USD = 0.25;
const ABSOLUTE_MAX_TOTAL_CHARGE_USD = 0.25;

export type ApifyFetch = (
  input: string | URL | Request,
  init?: RequestInit,
) => Promise<Response>;

export type ApifyPageSnapshot = {
  requestedUrl: string;
  finalUrl: string;
  text: string;
  markdown: string;
  links: string[];
  metadata: Record<string, unknown>;
  runId: string;
  datasetId: string;
  usageTotalUsd?: number;
};

export type ApifyRestOptions = {
  /** Defaults to APIFY_TOKEN at call time. Never expose this to browser code. */
  token?: string;
  /** Radius wall-clock ceiling across start, status polling, and dataset read. */
  timeoutMs?: number;
  /** Actor-side ceiling. The pilot never permits more than 180 seconds. */
  actorTimeoutSeconds?: number;
  /** Maximum total provider charge for this Actor run. Hard-capped at $0.25. */
  maxTotalChargeUsd?: number;
  /** Reviewed exception for an exact source that genuinely has no HTTPS URL. */
  allowHttp?: boolean;
  /** Bounds each JSON response before parsing. */
  maxResponseBytes?: number;
  /** Test seam; production callers use the global server-side fetch. */
  fetchImpl?: ApifyFetch;
};

export type ApifyRestErrorCode =
  | "INVALID_URL"
  | "MISSING_TOKEN"
  | "INVALID_CONFIG"
  | "TIMEOUT"
  | "NETWORK_ERROR"
  | "HTTP_ERROR"
  | "ACTOR_FAILED"
  | "INVALID_RESPONSE";

export class ApifyRestError extends Error {
  readonly code: ApifyRestErrorCode;
  readonly status?: number;

  constructor(
    code: ApifyRestErrorCode,
    message: string,
    options: { status?: number } = {},
  ) {
    super(message);
    this.name = "ApifyRestError";
    this.code = code;
    this.status = options.status;
  }
}

type ActorRun = {
  id?: unknown;
  status?: unknown;
  statusMessage?: unknown;
  defaultDatasetId?: unknown;
  usageTotalUsd?: unknown;
};

type ActorRunEnvelope = {
  data?: ActorRun;
  error?: unknown;
  message?: unknown;
};

type CrawlerDatasetItem = {
  url?: unknown;
  markdown?: unknown;
  text?: unknown;
  links?: unknown;
  crawl?: unknown;
  metadata?: unknown;
};

const TERMINAL_STATUSES = new Set([
  "SUCCEEDED",
  "FAILED",
  "TIMED-OUT",
  "ABORTED",
]);
const TRANSITIONAL_STATUSES = new Set([
  "READY",
  "RUNNING",
  "TIMING-OUT",
  "ABORTING",
]);

function validateRequestedUrl(url: string, allowHttp: boolean): void {
  try {
    validateFirecrawlPublicUrl(url, { allowHttp });
  } catch (error) {
    const detail =
      error instanceof FirecrawlRestError
        ? error.message.replace(/^Firecrawl/, "Apify")
        : "Apify requires a valid public source URL.";
    throw new ApifyRestError("INVALID_URL", detail);
  }
}

function positiveFinite(value: number, label: string): number {
  if (!Number.isFinite(value) || value <= 0) {
    throw new ApifyRestError(
      "INVALID_CONFIG",
      `${label} must be a positive number.`,
    );
  }
  return value;
}

function validateId(value: unknown, label: string): string {
  if (typeof value !== "string" || !/^[A-Za-z0-9]+$/.test(value)) {
    throw new ApifyRestError(
      "INVALID_RESPONSE",
      `Apify did not return a valid ${label}.`,
    );
  }
  return value;
}

function asRecord(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? { ...(value as Record<string, unknown>) }
    : {};
}

export function redactApifySecrets(value: string, token: string): string {
  const exactRedacted = token
    ? value.split(token).join("[redacted]")
    : value;
  return exactRedacted.replace(
    /\bapify_api_[A-Za-z0-9_-]+\b/g,
    "[redacted]",
  );
}

function responseDetail(payload: unknown, token: string): string | null {
  const record = asRecord(payload);
  const candidate =
    typeof record.error === "string"
      ? record.error
      : typeof record.message === "string"
        ? record.message
        : null;
  return candidate ? redactApifySecrets(candidate, token).slice(0, 500) : null;
}

async function readBoundedResponseText(
  response: Response,
  maxResponseBytes: number,
): Promise<string> {
  const declaredLength = Number(response.headers.get("content-length"));
  if (
    Number.isFinite(declaredLength) &&
    declaredLength > maxResponseBytes
  ) {
    throw new ApifyRestError(
      "INVALID_RESPONSE",
      "Apify response exceeded its declared size limit.",
      { status: response.status },
    );
  }
  if (!response.body) return "";

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  const chunks: string[] = [];
  let bytesRead = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      bytesRead += value.byteLength;
      if (bytesRead > maxResponseBytes) {
        await reader.cancel("Apify response exceeded its size limit");
        throw new ApifyRestError(
          "INVALID_RESPONSE",
          "Apify response exceeded its size limit.",
          { status: response.status },
        );
      }
      chunks.push(decoder.decode(value, { stream: true }));
    }
    chunks.push(decoder.decode());
    return chunks.join("");
  } finally {
    reader.releaseLock();
  }
}

function crawlerInput(requestedUrl: string): Record<string, unknown> {
  return {
    startUrls: [{ url: requestedUrl }],
    crawlerType: "playwright:adaptive",
    maxCrawlDepth: 0,
    maxCrawlPages: 1,
    maxResults: 1,
    includeUrlGlobs: [],
    excludeUrlGlobs: [],
    useSitemaps: false,
    useLlmsTxt: false,
    respectRobotsTxtFile: true,
    proxyConfiguration: { useApifyProxy: true },
    initialCookies: [],
    customHttpHeaders: {},
    signHttpRequests: false,
    requestTimeoutSecs: 60,
    blockMedia: true,
    saveMarkdown: true,
    saveHtmlAsFile: false,
    saveScreenshots: false,
    storeSkippedUrls: false,
    summarize: false,
  };
}

function extractMarkdownLinks(markdown: string, supplied: unknown): string[] {
  const values = Array.isArray(supplied)
    ? supplied.filter((value): value is string => typeof value === "string")
    : [];
  for (const match of markdown.matchAll(/\]\((https?:\/\/[^)\s]+)(?:\s+"[^"]*")?\)/gi)) {
    values.push(match[1]!);
  }
  const safe = new Set<string>();
  for (const value of values) {
    try {
      validateFirecrawlPublicUrl(value, { allowHttp: true });
      safe.add(value);
    } catch {
      // Links are supporting hints only. Unsafe or malformed links are omitted.
    }
  }
  return [...safe].slice(0, 500);
}

function parseRunEnvelope(payload: unknown): ActorRun {
  const envelope = asRecord(payload) as ActorRunEnvelope;
  if (!envelope.data || typeof envelope.data !== "object") {
    throw new ApifyRestError(
      "INVALID_RESPONSE",
      "Apify did not return an Actor run envelope.",
    );
  }
  return envelope.data;
}

function actorStatus(run: ActorRun): string {
  if (typeof run.status !== "string") {
    throw new ApifyRestError(
      "INVALID_RESPONSE",
      "Apify did not return an Actor run status.",
    );
  }
  if (
    !TERMINAL_STATUSES.has(run.status) &&
    !TRANSITIONAL_STATUSES.has(run.status)
  ) {
    throw new ApifyRestError(
      "INVALID_RESPONSE",
      `Apify returned an unknown Actor status: ${run.status.slice(0, 80)}.`,
    );
  }
  return run.status;
}

/**
 * Retrieve one exact, reviewed public page with Apify's maintained Website
 * Content Crawler. This adapter is intentionally candidate-only: it does not
 * publish, mutate Radius data, follow discovered links, or accept arbitrary
 * Actor names. Callers retain the original publisher URL as the authority.
 */
export async function fetchApifyPage(
  requestedUrl: string,
  options: ApifyRestOptions = {},
): Promise<ApifyPageSnapshot> {
  const allowHttp = options.allowHttp === true;
  validateRequestedUrl(requestedUrl, allowHttp);

  const token = options.token ?? process.env.APIFY_TOKEN ?? "";
  if (!token) {
    throw new ApifyRestError(
      "MISSING_TOKEN",
      "APIFY_TOKEN is required for Apify requests.",
    );
  }

  const timeoutMs = positiveFinite(
    options.timeoutMs ?? DEFAULT_TIMEOUT_MS,
    "Apify timeoutMs",
  );
  if (timeoutMs > DEFAULT_TIMEOUT_MS) {
    throw new ApifyRestError(
      "INVALID_CONFIG",
      `Apify timeoutMs cannot exceed ${DEFAULT_TIMEOUT_MS}.`,
    );
  }
  const actorTimeoutSeconds = Math.trunc(
    positiveFinite(
      options.actorTimeoutSeconds ?? DEFAULT_ACTOR_TIMEOUT_SECONDS,
      "Apify actorTimeoutSeconds",
    ),
  );
  if (
    actorTimeoutSeconds < 1 ||
    actorTimeoutSeconds > DEFAULT_ACTOR_TIMEOUT_SECONDS
  ) {
    throw new ApifyRestError(
      "INVALID_CONFIG",
      `Apify actorTimeoutSeconds must be a whole-second value from 1 through ${DEFAULT_ACTOR_TIMEOUT_SECONDS}.`,
    );
  }
  const maxTotalChargeUsd = positiveFinite(
    options.maxTotalChargeUsd ?? DEFAULT_MAX_TOTAL_CHARGE_USD,
    "Apify maxTotalChargeUsd",
  );
  if (
    maxTotalChargeUsd < 0.01 ||
    maxTotalChargeUsd > ABSOLUTE_MAX_TOTAL_CHARGE_USD
  ) {
    throw new ApifyRestError(
      "INVALID_CONFIG",
      `Apify maxTotalChargeUsd must be between $0.01 and $${ABSOLUTE_MAX_TOTAL_CHARGE_USD.toFixed(2)}.`,
    );
  }
  const maxResponseBytes = Math.trunc(
    positiveFinite(
      options.maxResponseBytes ?? DEFAULT_MAX_RESPONSE_BYTES,
      "Apify maxResponseBytes",
    ),
  );
  if (maxResponseBytes > DEFAULT_MAX_RESPONSE_BYTES) {
    throw new ApifyRestError(
      "INVALID_CONFIG",
      `Apify maxResponseBytes cannot exceed ${DEFAULT_MAX_RESPONSE_BYTES}.`,
    );
  }

  const fetchImpl = options.fetchImpl ?? fetch;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const authHeaders = {
    Authorization: `Bearer ${token}`,
    Accept: "application/json",
  };

  const requestJson = async (
    url: string,
    init: RequestInit = {},
  ): Promise<unknown> => {
    let response: Response | undefined;
    let rawBody = "";
    let readingBody = false;
    try {
      response = await fetchImpl(url, {
        ...init,
        headers: {
          ...authHeaders,
          ...(init.headers ?? {}),
        },
        signal: controller.signal,
      });
      readingBody = true;
      rawBody = await readBoundedResponseText(response, maxResponseBytes);
    } catch (error) {
      if (error instanceof ApifyRestError) throw error;
      if (
        controller.signal.aborted ||
        (error instanceof DOMException && error.name === "AbortError")
      ) {
        throw new ApifyRestError(
          "TIMEOUT",
          `Apify operation timed out after ${timeoutMs}ms.`,
        );
      }
      const detail =
        error instanceof Error
          ? `: ${redactApifySecrets(error.message, token).slice(0, 500)}`
          : "";
      throw new ApifyRestError(
        readingBody ? "INVALID_RESPONSE" : "NETWORK_ERROR",
        readingBody
          ? "Apify returned a response body that could not be read."
          : `Apify request could not reach the service${detail}`,
        { status: response?.status },
      );
    }

    let payload: unknown = null;
    if (rawBody) {
      try {
        payload = JSON.parse(rawBody) as unknown;
      } catch {
        if (response.ok) {
          throw new ApifyRestError(
            "INVALID_RESPONSE",
            "Apify returned invalid JSON.",
            { status: response.status },
          );
        }
      }
    }
    if (!response.ok) {
      const detail = responseDetail(payload, token);
      throw new ApifyRestError(
        "HTTP_ERROR",
        `Apify request failed with HTTP ${response.status}${
          detail ? `: ${detail}` : "."
        }`,
        { status: response.status },
      );
    }
    return payload;
  };

  try {
    const runUrl = new URL(APIFY_RUN_ENDPOINT);
    runUrl.searchParams.set("timeout", String(actorTimeoutSeconds));
    runUrl.searchParams.set(
      "maxTotalChargeUsd",
      maxTotalChargeUsd.toFixed(2),
    );
    runUrl.searchParams.set("waitForFinish", String(DEFAULT_WAIT_SECONDS));
    runUrl.searchParams.set("forcePermissionLevel", "LIMITED_PERMISSIONS");

    let run = parseRunEnvelope(
      await requestJson(runUrl.toString(), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(crawlerInput(requestedUrl)),
      }),
    );
    const runId = validateId(run.id, "Actor run ID");
    let status = actorStatus(run);

    const maxStatusReads =
      Math.ceil(actorTimeoutSeconds / DEFAULT_WAIT_SECONDS) + 1;
    for (
      let statusRead = 0;
      !TERMINAL_STATUSES.has(status) && statusRead < maxStatusReads;
      statusRead += 1
    ) {
      const statusUrl = new URL(
        `/v2/actor-runs/${encodeURIComponent(runId)}`,
        APIFY_API_ORIGIN,
      );
      statusUrl.searchParams.set(
        "waitForFinish",
        String(DEFAULT_WAIT_SECONDS),
      );
      run = parseRunEnvelope(await requestJson(statusUrl.toString()));
      if (validateId(run.id, "Actor run ID") !== runId) {
        throw new ApifyRestError(
          "INVALID_RESPONSE",
          "Apify returned a different Actor run while polling.",
        );
      }
      status = actorStatus(run);
    }

    if (!TERMINAL_STATUSES.has(status)) {
      throw new ApifyRestError(
        "TIMEOUT",
        "Apify Actor did not finish inside the bounded polling window.",
      );
    }
    if (status !== "SUCCEEDED") {
      const message =
        typeof run.statusMessage === "string"
          ? `: ${redactApifySecrets(run.statusMessage, token).slice(0, 300)}`
          : "";
      throw new ApifyRestError(
        "ACTOR_FAILED",
        `Apify Actor ended with ${status}${message}`,
      );
    }

    const datasetId = validateId(run.defaultDatasetId, "dataset ID");
    const datasetUrl = new URL(
      `/v2/datasets/${encodeURIComponent(datasetId)}/items`,
      APIFY_API_ORIGIN,
    );
    datasetUrl.searchParams.set("format", "json");
    datasetUrl.searchParams.set("clean", "1");
    datasetUrl.searchParams.set("limit", "1");
    const datasetPayload = await requestJson(datasetUrl.toString());
    if (!Array.isArray(datasetPayload) || datasetPayload.length !== 1) {
      throw new ApifyRestError(
        "INVALID_RESPONSE",
        "Apify did not return exactly one crawler result.",
      );
    }

    const item = asRecord(datasetPayload[0]) as CrawlerDatasetItem;
    if (typeof item.markdown !== "string" || !item.markdown.trim()) {
      throw new ApifyRestError(
        "INVALID_RESPONSE",
        "Apify crawler result did not contain non-empty Markdown.",
      );
    }
    const crawl = asRecord(item.crawl);
    const finalUrl = crawl.loadedUrl;
    if (typeof finalUrl !== "string" || !finalUrl) {
      throw new ApifyRestError(
        "INVALID_RESPONSE",
        "Apify crawler result did not report its final loaded URL.",
      );
    }
    try {
      validateFirecrawlPublicUrl(finalUrl, { allowHttp });
    } catch {
      throw new ApifyRestError(
        "INVALID_RESPONSE",
        "Apify reported an invalid or non-public final URL.",
      );
    }

    const usageTotalUsd =
      typeof run.usageTotalUsd === "number" &&
      Number.isFinite(run.usageTotalUsd) &&
      run.usageTotalUsd >= 0
        ? run.usageTotalUsd
        : undefined;
    return {
      requestedUrl,
      finalUrl,
      text: item.markdown,
      markdown: item.markdown,
      links: extractMarkdownLinks(item.markdown, item.links),
      metadata: {
        ...asRecord(item.metadata),
        crawl: {
          loadedUrl: finalUrl,
          httpStatusCode: crawl.httpStatusCode,
        },
      },
      runId,
      datasetId,
      ...(usageTotalUsd === undefined ? {} : { usageTotalUsd }),
    };
  } finally {
    clearTimeout(timer);
  }
}
