import { isIP } from "node:net";

const FIRECRAWL_SCRAPE_ENDPOINT = "https://api.firecrawl.dev/v2/scrape";
const DEFAULT_TIMEOUT_MS = 20_000;

export type FirecrawlFetch = (
  input: string | URL | Request,
  init?: RequestInit,
) => Promise<Response>;

export type FirecrawlPageSnapshot = {
  /** The URL exactly as supplied by the caller. */
  requestedUrl: string;
  /** The final page URL reported by Firecrawl after redirects. */
  finalUrl: string;
  /** Model-friendly page text. Firecrawl currently supplies this as Markdown. */
  text: string;
  markdown: string;
  links: string[];
  metadata: Record<string, unknown>;
};

export type FirecrawlRestOptions = {
  /** Defaults to FIRECRAWL_API_KEY at call time. */
  apiKey?: string;
  timeoutMs?: number;
  /** Reviewed exception for a source that genuinely has no HTTPS endpoint. */
  allowHttp?: boolean;
  /** Test seam; production callers use the global server-side fetch. */
  fetchImpl?: FirecrawlFetch;
};

export type FirecrawlPublicUrlOptions = {
  /** HTTPS is required unless a caller records and passes a reviewed exception. */
  allowHttp?: boolean;
};

export type FirecrawlRestErrorCode =
  | "INVALID_URL"
  | "MISSING_API_KEY"
  | "INVALID_TIMEOUT"
  | "TIMEOUT"
  | "NETWORK_ERROR"
  | "HTTP_ERROR"
  | "INVALID_RESPONSE";

export class FirecrawlRestError extends Error {
  readonly code: FirecrawlRestErrorCode;
  readonly status?: number;

  constructor(
    code: FirecrawlRestErrorCode,
    message: string,
    options: { status?: number } = {},
  ) {
    super(message);
    this.name = "FirecrawlRestError";
    this.code = code;
    this.status = options.status;
  }
}

type FirecrawlResponseBody = {
  success?: unknown;
  error?: unknown;
  message?: unknown;
  data?: {
    markdown?: unknown;
    links?: unknown;
    metadata?: unknown;
  };
};

function unbracketHostname(hostname: string): string {
  const normalized = hostname.toLowerCase().replace(/\.$/, "");
  return normalized.startsWith("[") && normalized.endsWith("]")
    ? normalized.slice(1, -1)
    : normalized;
}

function isReservedIpv4(hostname: string): boolean {
  const parts = hostname.split(".").map(Number);
  if (
    parts.length !== 4 ||
    parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)
  ) {
    return true;
  }
  const [a, b, c] = parts;
  return (
    a === 0 ||
    a === 10 ||
    (a === 100 && b >= 64 && b <= 127) ||
    a === 127 ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 0 && c === 0) ||
    (a === 192 && b === 0 && c === 2) ||
    (a === 192 && b === 88 && c === 99) ||
    (a === 192 && b === 168) ||
    (a === 198 && (b === 18 || b === 19)) ||
    (a === 198 && b === 51 && c === 100) ||
    (a === 203 && b === 0 && c === 113) ||
    a >= 224
  );
}

function isReservedIpv6(hostname: string): boolean {
  const value = hostname.toLowerCase();
  if (
    value === "::" ||
    value === "::1" ||
    value.startsWith("::ffff:") ||
    value.startsWith("2001:db8:") ||
    value === "2001:db8::" ||
    value.startsWith("2001:2:") ||
    value === "2001:2::" ||
    value.startsWith("100:")
  ) {
    return true;
  }

  const firstHextet = Number.parseInt(value.split(":")[0] || "0", 16);
  return (
    (firstHextet >= 0xfc00 && firstHextet <= 0xfdff) ||
    (firstHextet >= 0xfe80 && firstHextet <= 0xfebf) ||
    firstHextet >= 0xff00
  );
}

function isPrivateOrReservedHost(hostname: string): boolean {
  const normalized = unbracketHostname(hostname);
  if (
    normalized === "localhost" ||
    normalized.endsWith(".localhost") ||
    normalized.endsWith(".local")
  ) {
    return true;
  }

  const version = isIP(normalized);
  if (version === 4) return isReservedIpv4(normalized);
  if (version === 6) return isReservedIpv6(normalized);
  return false;
}

/**
 * Validate a URL before handing it to a remote retrieval provider.
 *
 * This blocks direct localhost, private, link-local, documentation, multicast,
 * and other reserved network targets. It intentionally does not pretend to
 * solve DNS rebinding; provider egress policy remains a required second layer.
 */
export function validateFirecrawlPublicUrl(
  url: string,
  options: FirecrawlPublicUrlOptions = {},
): URL {
  if (!url || url !== url.trim()) {
    throw new FirecrawlRestError(
      "INVALID_URL",
      "Firecrawl requires an exact, non-empty URL without surrounding whitespace.",
    );
  }

  try {
    const parsed = new URL(url);
    const protocolAllowed =
      parsed.protocol === "https:" ||
      (options.allowHttp === true && parsed.protocol === "http:");
    if (
      !protocolAllowed ||
      parsed.username ||
      parsed.password ||
      parsed.hash ||
      !parsed.hostname ||
      isPrivateOrReservedHost(parsed.hostname)
    ) {
      throw new Error("unsafe public URL");
    }
    return parsed;
  } catch {
    throw new FirecrawlRestError(
      "INVALID_URL",
      options.allowHttp
        ? "Firecrawl requires a valid public HTTP(S) URL without credentials or a fragment."
        : "Firecrawl requires a valid public HTTPS URL without credentials or a fragment.",
    );
  }
}

function validateTimeout(timeoutMs: number): void {
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
    throw new FirecrawlRestError(
      "INVALID_TIMEOUT",
      "Firecrawl timeoutMs must be a positive number.",
    );
  }
}

function redact(value: string, apiKey: string): string {
  const withoutKey = apiKey ? value.split(apiKey).join("[redacted]") : value;
  return withoutKey.replace(/\bfc-[A-Za-z0-9_-]+\b/g, "[redacted]");
}

function responseMessage(
  payload: FirecrawlResponseBody | null,
  apiKey: string,
): string | null {
  const candidate =
    typeof payload?.error === "string"
      ? payload.error
      : typeof payload?.message === "string"
        ? payload.message
        : null;
  return candidate ? redact(candidate, apiKey).slice(0, 500) : null;
}

function stringLinks(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter(
    (link): link is string => typeof link === "string" && link.length > 0,
  );
}

function recordMetadata(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? { ...(value as Record<string, unknown>) }
    : {};
}

function reportedFinalUrl(
  metadata: Record<string, unknown>,
  requestedUrl: string,
): string {
  if (typeof metadata.url === "string" && metadata.url) return metadata.url;
  if (typeof metadata.sourceURL === "string" && metadata.sourceURL) {
    return metadata.sourceURL;
  }
  return requestedUrl;
}

/**
 * Fetch one exact public URL through Firecrawl's REST API.
 *
 * This adapter only returns a candidate snapshot. It does not write to a
 * database, merge records, publish content, or log credentials. Callers must
 * validate source authority and changes before using the result elsewhere.
 */
export async function fetchFirecrawlPage(
  requestedUrl: string,
  options: FirecrawlRestOptions = {},
): Promise<FirecrawlPageSnapshot> {
  validateFirecrawlPublicUrl(requestedUrl, {
    allowHttp: options.allowHttp === true,
  });

  const apiKey = options.apiKey ?? process.env.FIRECRAWL_API_KEY ?? "";
  if (!apiKey) {
    throw new FirecrawlRestError(
      "MISSING_API_KEY",
      "FIRECRAWL_API_KEY is required for Firecrawl requests.",
    );
  }

  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  validateTimeout(timeoutMs);

  const fetchImpl = options.fetchImpl ?? fetch;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  let response: Response | undefined;
  let rawBody: string;
  let stage: "request" | "body" = "request";
  try {
    response = await fetchImpl(FIRECRAWL_SCRAPE_ENDPOINT, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        url: requestedUrl,
        formats: ["markdown", "links"],
        onlyMainContent: true,
      }),
      signal: controller.signal,
    });
    stage = "body";
    rawBody = await response.text();
  } catch (error) {
    if (
      controller.signal.aborted ||
      (error instanceof DOMException && error.name === "AbortError")
    ) {
      throw new FirecrawlRestError(
        "TIMEOUT",
        `Firecrawl request timed out after ${timeoutMs}ms.`,
      );
    }

    if (stage === "body") {
      throw new FirecrawlRestError(
        "INVALID_RESPONSE",
        "Firecrawl returned a response body that could not be read.",
        { status: response?.status },
      );
    }

    const detail =
      error instanceof Error
        ? `: ${redact(error.message, apiKey).slice(0, 500)}`
        : "";
    throw new FirecrawlRestError(
      "NETWORK_ERROR",
      `Firecrawl request could not reach the service${detail}`,
    );
  } finally {
    clearTimeout(timer);
  }

  let payload: FirecrawlResponseBody | null = null;
  if (rawBody) {
    try {
      payload = JSON.parse(rawBody) as FirecrawlResponseBody;
    } catch {
      if (response.ok) {
        throw new FirecrawlRestError(
          "INVALID_RESPONSE",
          "Firecrawl returned invalid JSON.",
          { status: response.status },
        );
      }
    }
  }

  if (!response.ok) {
    const detail = responseMessage(payload, apiKey);
    throw new FirecrawlRestError(
      "HTTP_ERROR",
      `Firecrawl request failed with HTTP ${response.status}${
        detail ? `: ${detail}` : "."
      }`,
      { status: response.status },
    );
  }

  if (
    payload?.success !== true ||
    !payload.data ||
    typeof payload.data.markdown !== "string"
  ) {
    const detail = responseMessage(payload, apiKey);
    throw new FirecrawlRestError(
      "INVALID_RESPONSE",
      detail
        ? `Firecrawl did not return a usable page: ${detail}`
        : "Firecrawl did not return the requested Markdown page.",
      { status: response.status },
    );
  }

  const metadata = recordMetadata(payload.data.metadata);
  const markdown = payload.data.markdown;
  const finalUrl = reportedFinalUrl(metadata, requestedUrl);
  try {
    validateFirecrawlPublicUrl(finalUrl, {
      allowHttp: options.allowHttp === true,
    });
  } catch {
    throw new FirecrawlRestError(
      "INVALID_RESPONSE",
      "Firecrawl reported an invalid or non-public final URL.",
      { status: response.status },
    );
  }

  return {
    requestedUrl,
    finalUrl,
    text: markdown,
    markdown,
    links: stringLinks(payload.data.links),
    metadata,
  };
}
