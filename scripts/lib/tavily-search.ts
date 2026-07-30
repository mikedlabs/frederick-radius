/**
 * Narrow Tavily Search REST adapter for candidate discovery.
 *
 * This module intentionally returns source evidence only. It disables Tavily's
 * generated answer and exposes the result URL, title, content, and relevance
 * score so a caller can validate candidates against Radius's own source,
 * freshness, and confidence rules.
 */

const TAVILY_SEARCH_ENDPOINT = "https://api.tavily.com/search";
const DEFAULT_TIMEOUT_MS = 10_000;
const DEFAULT_MAX_RESULTS = 10;

export type TavilySearchDepth =
  | "ultra-fast"
  | "fast"
  | "basic"
  | "advanced";

export type TavilySearchErrorCode =
  | "configuration"
  | "timeout"
  | "network_error"
  | "bad_request"
  | "unauthorized"
  | "rate_limited"
  | "plan_limit_exceeded"
  | "payg_limit_exceeded"
  | "api_error"
  | "invalid_response";

export type TavilySearchCandidate = {
  /** The source URL exactly as returned by Tavily. */
  url: string;
  /** The source title exactly as returned by Tavily. */
  title: string;
  /** Tavily's source-derived summary or chunks, not its generated answer. */
  content: string;
  /** Tavily's relevance score exactly as returned by the API. */
  score: number;
};

export type TavilyCandidateSearchResult = {
  query: string;
  candidates: TavilySearchCandidate[];
  requestId: string | null;
  responseTime: string | number | null;
  credits: number | null;
};

type FetchLike = (
  input: string | URL | Request,
  init?: RequestInit,
) => Promise<Response>;

export type TavilyCandidateSearchOptions = {
  /**
   * Tavily key. When omitted, TAVILY_API_KEY is read at call time.
   * The key is used only in the Authorization header and is never logged.
   */
  apiKey?: string;
  /**
   * Optional source allowlist. Results are restricted in the API request and
   * checked again locally. A domain also allows its subdomains.
   */
  allowedDomains?: readonly string[];
  searchDepth?: TavilySearchDepth;
  maxResults?: number;
  timeoutMs?: number;
  /** Test seam; production callers use global fetch. */
  fetchImpl?: FetchLike;
};

type TavilyApiResult = {
  url?: unknown;
  title?: unknown;
  content?: unknown;
  score?: unknown;
};

type TavilyApiPayload = {
  query?: unknown;
  results?: unknown;
  response_time?: unknown;
  request_id?: unknown;
  usage?: {
    credits?: unknown;
  };
};

export class TavilySearchError extends Error {
  readonly code: TavilySearchErrorCode;
  readonly status: number | null;
  readonly retryAfter: string | null;
  readonly requestId: string | null;

  constructor(
    message: string,
    options: {
      code: TavilySearchErrorCode;
      status?: number | null;
      retryAfter?: string | null;
      requestId?: string | null;
    },
  ) {
    super(message);
    this.name = "TavilySearchError";
    this.code = options.code;
    this.status = options.status ?? null;
    this.retryAfter = options.retryAfter ?? null;
    this.requestId = options.requestId ?? null;
  }
}

function configurationError(message: string): TavilySearchError {
  return new TavilySearchError(message, { code: "configuration" });
}

function normalizeAllowedDomain(value: string): string {
  let domain = value.trim().toLowerCase();
  if (!domain) {
    throw configurationError("Tavily allowed domains cannot be empty.");
  }

  if (/^https?:\/\//.test(domain)) {
    try {
      const parsed = new URL(domain);
      if (
        parsed.username ||
        parsed.password ||
        (parsed.pathname !== "/" && parsed.pathname !== "") ||
        parsed.search ||
        parsed.hash
      ) {
        throw new Error("not a host-only URL");
      }
      domain = parsed.hostname;
    } catch {
      throw configurationError(
        `Invalid Tavily allowed domain: ${JSON.stringify(value)}.`,
      );
    }
  }

  domain = domain
    .replace(/^\*\./, "")
    .replace(/^www\./, "")
    .replace(/\.$/, "");

  if (
    domain.length > 253 ||
    !domain.includes(".") ||
    !domain
      .split(".")
      .every(
        (label) =>
          label.length > 0 &&
          label.length <= 63 &&
          /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/.test(label),
      )
  ) {
    throw configurationError(
      `Invalid Tavily allowed domain: ${JSON.stringify(value)}.`,
    );
  }

  return domain;
}

function normalizeAllowedDomains(values: readonly string[] | undefined): string[] {
  if (!values) return [];
  if (values.length > 300) {
    throw configurationError(
      "Tavily Search accepts at most 300 allowed domains.",
    );
  }
  return [...new Set(values.map(normalizeAllowedDomain))];
}

function normalizedResultHost(url: string): string | null {
  try {
    return new URL(url).hostname
      .toLowerCase()
      .replace(/^www\./, "")
      .replace(/\.$/, "");
  } catch {
    return null;
  }
}

function isAllowedResultUrl(url: string, allowedDomains: readonly string[]): boolean {
  const host = normalizedResultHost(url);
  if (!host) return false;
  if (allowedDomains.length === 0) return true;
  return allowedDomains.some(
    (domain) => host === domain || host.endsWith(`.${domain}`),
  );
}

function parseCandidate(
  value: unknown,
  allowedDomains: readonly string[],
): TavilySearchCandidate | null {
  if (!value || typeof value !== "object") return null;
  const result = value as TavilyApiResult;
  if (
    typeof result.url !== "string" ||
    typeof result.title !== "string" ||
    typeof result.content !== "string" ||
    typeof result.score !== "number" ||
    !Number.isFinite(result.score) ||
    !isAllowedResultUrl(result.url, allowedDomains)
  ) {
    return null;
  }
  return {
    url: result.url,
    title: result.title,
    content: result.content,
    score: result.score,
  };
}

function apiErrorCode(status: number): TavilySearchErrorCode {
  switch (status) {
    case 400:
      return "bad_request";
    case 401:
      return "unauthorized";
    case 429:
      return "rate_limited";
    case 432:
      return "plan_limit_exceeded";
    case 433:
      return "payg_limit_exceeded";
    default:
      return "api_error";
  }
}

function readApiErrorMessage(payload: unknown): string | null {
  if (!payload || typeof payload !== "object") return null;
  const root = payload as Record<string, unknown>;
  if (typeof root.error === "string") return root.error;
  if (typeof root.detail === "string") return root.detail;
  if (root.detail && typeof root.detail === "object") {
    const detail = root.detail as Record<string, unknown>;
    if (typeof detail.error === "string") return detail.error;
  }
  return null;
}

function readRequestId(payload: unknown): string | null {
  if (!payload || typeof payload !== "object") return null;
  const requestId = (payload as Record<string, unknown>).request_id;
  return typeof requestId === "string" && requestId ? requestId : null;
}

function redactSecret(value: string, apiKey: string): string {
  return value.includes(apiKey) ? value.split(apiKey).join("[REDACTED]") : value;
}

async function parseResponseBody(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

/**
 * Discover candidate web sources with Tavily Search.
 *
 * Returned candidates are evidence for a later verification step. This
 * function does not treat Tavily's generated prose as authoritative and does
 * not expose the API's optional `answer` field.
 */
export async function searchTavilyCandidates(
  query: string,
  options: TavilyCandidateSearchOptions = {},
): Promise<TavilyCandidateSearchResult> {
  const normalizedQuery = query.trim();
  if (!normalizedQuery) {
    throw configurationError("A non-empty Tavily search query is required.");
  }

  const apiKey = (options.apiKey ?? process.env.TAVILY_API_KEY ?? "").trim();
  if (!apiKey) {
    throw configurationError(
      "TAVILY_API_KEY is required for Tavily candidate discovery.",
    );
  }

  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
    throw configurationError("Tavily timeoutMs must be greater than zero.");
  }

  const maxResults = options.maxResults ?? DEFAULT_MAX_RESULTS;
  if (!Number.isInteger(maxResults) || maxResults < 1 || maxResults > 20) {
    throw configurationError(
      "Tavily maxResults must be an integer between 1 and 20.",
    );
  }

  const allowedDomains = normalizeAllowedDomains(options.allowedDomains);
  const fetchImpl = options.fetchImpl ?? globalThis.fetch;
  if (!fetchImpl) {
    throw configurationError("A fetch implementation is required.");
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  let response: Response;
  let payload: unknown;
  try {
    response = await fetchImpl(TAVILY_SEARCH_ENDPOINT, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        query: normalizedQuery,
        search_depth: options.searchDepth ?? "basic",
        max_results: maxResults,
        topic: "general",
        include_answer: false,
        include_raw_content: false,
        include_images: false,
        include_favicon: false,
        include_domains: allowedDomains,
        include_usage: true,
      }),
      signal: controller.signal,
    });
    payload = await parseResponseBody(response);
  } catch {
    if (controller.signal.aborted) {
      throw new TavilySearchError(
        `Tavily search timed out after ${timeoutMs}ms.`,
        { code: "timeout" },
      );
    }
    throw new TavilySearchError(
      "Tavily search failed before a response was received.",
      { code: "network_error" },
    );
  } finally {
    clearTimeout(timeout);
  }

  const headerRequestId =
    response.headers.get("x-request-id") ??
    response.headers.get("x-tavily-request-id");
  const requestId = readRequestId(payload) ?? headerRequestId;

  if (!response.ok) {
    const exactMessage = readApiErrorMessage(payload);
    const message = exactMessage
      ? redactSecret(exactMessage, apiKey)
      : `Tavily Search API returned HTTP ${response.status}.`;
    throw new TavilySearchError(message, {
      code: apiErrorCode(response.status),
      status: response.status,
      retryAfter: response.headers.get("retry-after"),
      requestId,
    });
  }

  if (!payload || typeof payload !== "object") {
    throw new TavilySearchError(
      "Tavily Search API returned an invalid JSON response.",
      {
        code: "invalid_response",
        status: response.status,
        requestId,
      },
    );
  }

  const body = payload as TavilyApiPayload;
  if (!Array.isArray(body.results)) {
    throw new TavilySearchError(
      "Tavily Search API response did not contain a results array.",
      {
        code: "invalid_response",
        status: response.status,
        requestId,
      },
    );
  }

  return {
    query:
      typeof body.query === "string" && body.query
        ? body.query
        : normalizedQuery,
    candidates: body.results
      .map((result) => parseCandidate(result, allowedDomains))
      .filter((result): result is TavilySearchCandidate => result !== null),
    requestId,
    responseTime:
      typeof body.response_time === "string" ||
      typeof body.response_time === "number"
        ? body.response_time
        : null,
    credits:
      typeof body.usage?.credits === "number" &&
      Number.isFinite(body.usage.credits)
        ? body.usage.credits
        : null,
  };
}
