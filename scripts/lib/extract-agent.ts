import { cleanFeedText } from "../../src/lib/format/text";
import { clampDescription } from "../../src/lib/events/normalize";
import {
  extractPageAnchors,
  normalizePageAnchor,
  type PageAnchor,
} from "./official-commerce-links";
import {
  assertSuccessfulFirecrawlTargetStatus,
  fetchFirecrawlPage,
  FirecrawlRestError,
} from "./firecrawl-rest";

/**
 * Extraction engine — the shared core behind every "go get the buried
 * data" agent (civic contacts, venue events, specials, hours, …).
 *
 * The pattern, once, for all of them:
 *   fetchPageText(url)            → clean text from any public page
 *   extractWithClaude(prompt)     → strict JSON, "omit what isn't there"
 *
 * Each agent (scripts/ingest-*.ts) supplies a source registry + an
 * extraction shape; this module does the fetching and the model call.
 * Plain fetch to the Anthropic Messages API — no SDK dependency.
 *
 * Hard rules baked in:
 *  - Never fabricate: the prompt template forbids guessing; a failed
 *    fetch returns null and the caller leaves prior data untouched.
 *  - Always cheap: text is capped before the model sees it.
 *  - Always attributable: callers stamp { url, fetchedAt } on records.
 */

const API_KEY = process.env.ANTHROPIC_API_KEY;
const DEFAULT_MODEL = process.env.EXTRACT_MODEL || "claude-haiku-4-5-20251001";
const UA = "FrederickRadius/1.0 (+civic data ingest)";
const DEFAULT_FIRECRAWL_FALLBACK_LIMIT = 1;
const ABSOLUTE_FIRECRAWL_FALLBACK_LIMIT = 2;
const ANTHROPIC_MESSAGES_URL = "https://api.anthropic.com/v1/messages";
const DEFAULT_ANTHROPIC_RETRIES = 2;
const DEFAULT_ANTHROPIC_RETRY_DELAY_MS = 750;
const MAX_ANTHROPIC_RETRY_DELAY_MS = 15_000;

function htmlToText(html: string, maxChars: number): string {
  return html
    .replace(/<(script|style|noscript)[^>]*>[\s\S]*?<\/\1>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxChars);
}

export type PageSnapshot = {
  text: string;
  links: PageAnchor[];
  /** URL exactly requested by the extraction profile. */
  requestedUrl: string;
  /** Final URL after redirects; this is the page on which links were found. */
  finalUrl: string;
};

export type FirecrawlFallbackUsage = {
  limit: number;
  attempted: number;
  succeeded: number;
  failed: number;
  deniedByLimit: number;
};

export type FetchPageSnapshotOptions = {
  render?: boolean;
  maxChars?: number;
  /** Explicit opt-out for sources that must never use the external fallback. */
  firecrawlFallback?: boolean;
  /** Exact reviewed destination hosts; same-host redirects are always allowed. */
  allowedRedirectHosts?: readonly string[];
  /** Reviewed exception for a source that genuinely has no HTTPS endpoint. */
  firecrawlAllowHttp?: boolean;
};

let firecrawlFallbackUsage: FirecrawlFallbackUsage | null = null;

function configuredFirecrawlFallbackLimit(): number {
  const parsed = Number.parseInt(
    process.env.FIRECRAWL_FALLBACK_MAX_REQUESTS ?? "",
    10,
  );
  const requested = Number.isInteger(parsed)
    ? parsed
    : DEFAULT_FIRECRAWL_FALLBACK_LIMIT;
  return Math.max(0, Math.min(requested, ABSOLUTE_FIRECRAWL_FALLBACK_LIMIT));
}

/** Reset the per-process fallback budget at the start of one operator run. */
export function resetFirecrawlFallbackUsage(limit?: number): void {
  const requested =
    limit === undefined || !Number.isFinite(limit)
      ? configuredFirecrawlFallbackLimit()
      : Math.trunc(limit);
  firecrawlFallbackUsage = {
    limit: Math.max(0, Math.min(requested, ABSOLUTE_FIRECRAWL_FALLBACK_LIMIT)),
    attempted: 0,
    succeeded: 0,
    failed: 0,
    deniedByLimit: 0,
  };
}

function mutableFirecrawlFallbackUsage(): FirecrawlFallbackUsage {
  if (!firecrawlFallbackUsage) resetFirecrawlFallbackUsage();
  return firecrawlFallbackUsage!;
}

export function getFirecrawlFallbackUsage(): FirecrawlFallbackUsage {
  return { ...mutableFirecrawlFallbackUsage() };
}

export function formatFirecrawlFallbackUsageSummary(): string {
  const usage = getFirecrawlFallbackUsage();
  return (
    `Firecrawl fallback: ${usage.attempted}/${usage.limit} request(s); ` +
    `${usage.succeeded} succeeded, ${usage.failed} failed, ` +
    `${usage.deniedByLimit} blocked by the run ceiling.`
  );
}

function canonicalHost(value: string): string | null {
  try {
    return new URL(value).hostname
      .toLowerCase()
      .replace(/\.$/, "")
      .replace(/^www\./, "");
  } catch {
    return null;
  }
}

function configuredRedirectHost(value: string): string | null {
  const candidate = value.trim().toLowerCase().replace(/\.$/, "");
  if (!candidate || candidate.includes("/") || candidate.includes("@")) {
    return null;
  }
  return candidate.replace(/^www\./, "");
}

function isAllowedRedirectHost(
  requestedUrl: string,
  finalUrl: string,
  allowedRedirectHosts: readonly string[],
): boolean {
  const requestedHost = canonicalHost(requestedUrl);
  const finalHost = canonicalHost(finalUrl);
  if (!requestedHost || !finalHost) return false;
  if (requestedHost === finalHost) return true;
  return allowedRedirectHosts
    .map(configuredRedirectHost)
    .some((host) => host === finalHost);
}

async function fetchFirecrawlFallback(
  url: string,
  maxChars: number,
  opts: Pick<
    FetchPageSnapshotOptions,
    "allowedRedirectHosts" | "firecrawlAllowHttp"
  >,
): Promise<PageSnapshot | null> {
  if (
    process.env.FIRECRAWL_FETCH_FALLBACK !== "1" ||
    !process.env.FIRECRAWL_API_KEY
  ) {
    return null;
  }

  const usage = mutableFirecrawlFallbackUsage();
  if (usage.attempted >= usage.limit) {
    usage.deniedByLimit += 1;
    console.log(`  – ${url} (Firecrawl fallback run ceiling reached)`);
    return null;
  }
  usage.attempted += 1;

  try {
    const snapshot = await fetchFirecrawlPage(url, {
      allowHttp: opts.firecrawlAllowHttp === true,
      requireReportedFinalUrl: true,
      // Recovery needs the page as it exists now. Avoid Firecrawl's default
      // cache window and do not retain source content in provider storage.
      maxAgeMs: 0,
      storeInCache: false,
      // A reserved fallback attempt must remain a single-credit scrape.
      proxy: "basic",
    });
    if (
      !isAllowedRedirectHost(
        snapshot.requestedUrl,
        snapshot.finalUrl,
        opts.allowedRedirectHosts ?? [],
      )
    ) {
      usage.failed += 1;
      console.log(`  ✗ ${url} (Firecrawl fallback: CROSS_HOST_REDIRECT)`);
      return null;
    }
    assertSuccessfulFirecrawlTargetStatus(snapshot.metadata);
    const text = snapshot.text.replace(/\s+/g, " ").trim().slice(0, maxChars);
    if (!text) {
      usage.failed += 1;
      console.log(`  ✗ ${url} (Firecrawl fallback: EMPTY_RESPONSE)`);
      return null;
    }
    const links = snapshot.links
      .slice(0, 500)
      .map((href) => normalizePageAnchor(href, "", snapshot.finalUrl))
      .filter((link): link is PageAnchor => link !== null);
    usage.succeeded += 1;
    console.log(`  ✓ ${url} (Firecrawl fallback)`);
    return {
      text,
      links,
      requestedUrl: snapshot.requestedUrl,
      finalUrl: snapshot.finalUrl,
    };
  } catch (error) {
    usage.failed += 1;
    const code =
      error instanceof FirecrawlRestError ? error.code : "UNKNOWN_ERROR";
    console.log(`  ✗ ${url} (Firecrawl fallback: ${code})`);
    return null;
  }
}

async function fetchRenderedPage(
  url: string,
  maxChars: number,
): Promise<PageSnapshot | null> {
  let browser: Awaited<
    ReturnType<(typeof import("@playwright/test"))["chromium"]["launch"]>
  > | null = null;
  try {
    const { chromium } = await import("@playwright/test");
    browser = await chromium.launch();
    const page = await browser.newPage({
      userAgent: UA,
      // Opt-in escape hatch for environments behind a TLS-intercepting
      // proxy whose CA the bundled Chromium does not trust (render would
      // otherwise fail ERR_CERT_AUTHORITY_INVALID on every page). Off by
      // default, so production and CI keep full certificate validation.
      ignoreHTTPSErrors: process.env.PLAYWRIGHT_IGNORE_HTTPS_ERRORS === "1",
    });
    await page.goto(url, { waitUntil: "networkidle", timeout: 30_000 });
    await page.waitForTimeout(1200); // let late calendar widgets settle
    const text = (await page.innerText("body"))
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, maxChars);
    if (!text) return null;
    const finalUrl = page.url();
    const rawLinks = await page.locator("a[href]").evaluateAll((nodes) =>
      nodes.slice(0, 500).map((node) => ({
        href: (node as HTMLAnchorElement).getAttribute("href") ?? "",
        text: (node as HTMLAnchorElement).innerText ?? "",
      })),
    );
    const links = rawLinks
      .map((link) => normalizePageAnchor(link.href, link.text, finalUrl))
      .filter((link): link is PageAnchor => link !== null);
    return { text, links, requestedUrl: url, finalUrl };
  } catch (error) {
    const message = error instanceof Error ? error.message : "unknown error";
    console.log(`  ✗ ${url} (render) → ${message}`);
    return null;
  } finally {
    await browser?.close();
  }
}

/**
 * Fetch a public page as model-friendly text plus the real anchors needed by
 * deterministic extractors. Keeping href collection here means every profile
 * gets the same redirect handling, scheme validation, and render fallback.
 *
 * Real-world reality (learned by testing actual venue sites): many
 * calendars are JS-rendered (events aren't in the static HTML) or the
 * server 403s a bare fetch. Pass `render: true` to load the page in a
 * real headless browser (Playwright, already a project dep) so those
 * sources work too. Plain fetch is the fast default for static pages.
 */
export async function fetchPageSnapshot(
  url: string,
  opts: FetchPageSnapshotOptions = {},
): Promise<PageSnapshot | null> {
  const maxChars = opts.maxChars ?? 18_000;
  const allowFirecrawl = opts.firecrawlFallback !== false;

  if (opts.render) {
    const rendered = await fetchRenderedPage(url, maxChars);
    if (
      rendered &&
      (opts.allowedRedirectHosts === undefined ||
        isAllowedRedirectHost(
          rendered.requestedUrl,
          rendered.finalUrl,
          opts.allowedRedirectHosts,
        ))
    ) {
      return rendered;
    }
    if (rendered) {
      console.log(`  ✗ ${url} (render: CROSS_HOST_REDIRECT)`);
    }
    return allowFirecrawl
      ? await fetchFirecrawlFallback(url, maxChars, opts)
      : null;
  }

  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 20_000);
    const { response: r, html } = await (async () => {
      try {
        const response = await fetch(url, {
          headers: { "User-Agent": UA },
          redirect: "follow",
          signal: ctrl.signal,
        });
        return {
          response,
          html: response.ok ? await response.text() : "",
        };
      } finally {
        clearTimeout(timer);
      }
    })();
    if (!r.ok) {
      console.log(
        `  ✗ ${url} → HTTP ${r.status}${
          r.status === 403 ? " (try render:true)" : ""
        }`,
      );
      return allowFirecrawl
        ? await fetchFirecrawlFallback(url, maxChars, opts)
        : null;
    }
    const finalUrl = r.url || url;
    const text = htmlToText(html, maxChars);
    if (!text) {
      return allowFirecrawl
        ? await fetchFirecrawlFallback(url, maxChars, opts)
        : null;
    }
    if (
      opts.allowedRedirectHosts !== undefined &&
      !isAllowedRedirectHost(url, finalUrl, opts.allowedRedirectHosts)
    ) {
      console.log(`  ✗ ${url} (fetch: CROSS_HOST_REDIRECT)`);
      return allowFirecrawl
        ? await fetchFirecrawlFallback(url, maxChars, opts)
        : null;
    }
    return {
      text,
      links: extractPageAnchors(html, finalUrl),
      requestedUrl: url,
      finalUrl,
    };
  } catch (err) {
    console.log(`  ✗ ${url} → ${(err as Error).message}`);
    return allowFirecrawl
      ? await fetchFirecrawlFallback(url, maxChars, opts)
      : null;
  }
}

/** Backward-compatible text-only view used by existing extraction profiles. */
export async function fetchPageText(
  url: string,
  opts: FetchPageSnapshotOptions = {},
): Promise<string | null> {
  return (await fetchPageSnapshot(url, opts))?.text ?? null;
}

/**
 * A normalized event as pulled from a structured feed (no model call).
 * Mirrors the shape the venue agent already writes, minus the per-venue
 * stamping the caller adds (venue_slug, venue_name, source).
 */
export type FeedEvent = {
  title: string;
  starts_at: string; // ISO 8601
  ends_at?: string;
  description?: string;
  /** Publisher prose copied from the structured venue feed. */
  description_origin?: "source-excerpt";
  ticket_url?: string;
};

export type SquarespaceEventsFetchResult =
  | { status: "success"; events: FeedEvent[] }
  | { status: "failure"; events: [] };

/**
 * Parse a Squarespace events collection (the `?format=json` response) to
 * normalized events — deterministically, with no model call. Squarespace
 * exposes every events page as JSON at `<collection-url>?format=json`,
 * with an `upcoming` array of items carrying `title`, `startDate` /
 * `endDate` (millisecond epoch integers), `excerpt`, and `fullUrl`.
 *
 * This is the preferred collector for any Squarespace venue: it is exact
 * (no scraping, no guessing), cheap (no token cost), and stable across
 * site redesigns. Falls back to nothing — a caller that gets [] should
 * try the render+model path.
 *
 * No fabrication: an item with no title or no parseable start date is
 * dropped rather than invented. `baseUrl` (the site origin) turns the
 * relative `fullUrl` into an absolute ticket/detail link when present.
 */
export function parseSquarespaceEvents(
  json: unknown,
  baseUrl?: string,
): FeedEvent[] {
  const root = json as { upcoming?: unknown } | null;
  const items = root && Array.isArray(root.upcoming) ? root.upcoming : [];
  const origin = (() => {
    if (!baseUrl) return "";
    try {
      return new URL(baseUrl).origin;
    } catch {
      return "";
    }
  })();

  const out: FeedEvent[] = [];
  for (const raw of items) {
    const it = raw as {
      title?: unknown;
      startDate?: unknown;
      endDate?: unknown;
      excerpt?: unknown;
      fullUrl?: unknown;
    };
    const title = typeof it.title === "string" ? it.title.trim() : "";
    const startMs = typeof it.startDate === "number" ? it.startDate : NaN;
    if (!title || !Number.isFinite(startMs)) continue; // never invent

    const ev: FeedEvent = {
      title,
      starts_at: new Date(startMs).toISOString(),
    };
    if (typeof it.endDate === "number" && Number.isFinite(it.endDate)) {
      ev.ends_at = new Date(it.endDate).toISOString();
    }
    // Excerpt is publisher-authored HTML. Clean markup and entities, then use
    // the shared sentence-aware cap rather than cutting the organizer's prose
    // in the middle of a word or clause.
    if (typeof it.excerpt === "string" && it.excerpt.trim()) {
      const plain = cleanFeedText(it.excerpt);
      if (plain) {
        ev.description = clampDescription(plain, 280);
        ev.description_origin = "source-excerpt";
      }
    }
    if (typeof it.fullUrl === "string" && it.fullUrl) {
      ev.ticket_url = origin ? `${origin}${it.fullUrl}` : it.fullUrl;
    }
    out.push(ev);
  }
  return out;
}

/**
 * Fetch a Squarespace collection's JSON feed and parse it to events while
 * preserving the distinction between a verified empty feed and a failed or
 * malformed response. Venue promotion needs that distinction: an empty,
 * successfully read source may replace old inventory, while a failed read
 * must retain the last-known-good rows.
 */
export async function fetchSquarespaceEventsResult(
  collectionUrl: string,
  opts: {
    fetchImpl?: typeof fetch;
    timeoutMs?: number;
  } = {},
): Promise<SquarespaceEventsFetchResult> {
  const sep = collectionUrl.includes("?") ? "&" : "?";
  const url = `${collectionUrl}${sep}format=json`;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), opts.timeoutMs ?? 20_000);
  try {
    const r = await (opts.fetchImpl ?? fetch)(url, {
      headers: { "User-Agent": UA },
      redirect: "follow",
      signal: ctrl.signal,
    });
    if (!r.ok) {
      console.log(`  ✗ ${url} → HTTP ${r.status}`);
      return { status: "failure", events: [] };
    }
    const json = JSON.parse(await r.text()) as { upcoming?: unknown } | null;
    if (!json || !Array.isArray(json.upcoming)) {
      console.log(`  ✗ ${url} (feed) → missing upcoming[]`);
      return { status: "failure", events: [] };
    }
    const events = parseSquarespaceEvents(json, collectionUrl);
    if (json.upcoming.length > 0 && events.length === 0) {
      console.log(`  ✗ ${url} (feed) → no valid upcoming rows`);
      return { status: "failure", events: [] };
    }
    return { status: "success", events };
  } catch (err) {
    console.log(`  ✗ ${url} (feed) → ${(err as Error).message}`);
    return { status: "failure", events: [] };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Backward-compatible event-array view for callers that do not promote a
 * stored inventory and therefore do not need success/failure metadata.
 * `collectionUrl` is the human events page (e.g. ".../livemusic"); this
 * appends `?format=json`. Returns [] on any fetch/parse failure so the
 * caller can fall back to render+model without a thrown error.
 */
export async function fetchSquarespaceEvents(
  collectionUrl: string,
): Promise<FeedEvent[]> {
  return (await fetchSquarespaceEventsResult(collectionUrl)).events;
}

/**
 * Ask Claude to extract structured JSON. `instructions` describes the
 * shape + rules; `content` is the page text. Returns parsed JSON (object
 * or array) or null. Enforces the "omit what isn't on the page" rule via
 * the shared preamble so no agent can drift into guessing.
 */
export async function extractJson<T = unknown>(
  instructions: string,
  content: string,
  opts: {
    model?: string;
    maxTokens?: number;
    fetchImpl?: typeof fetch;
    timeoutMs?: number;
    /** Test seam. Production callers use the process environment. */
    apiKey?: string;
  } = {},
): Promise<T | null> {
  const apiKey = opts.apiKey ?? API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY not set");
  const preamble =
    "You extract structured data from a public webpage's text. Return ONLY JSON — no prose. " +
    "Critically: include ONLY facts clearly present in the text. Never invent phone numbers, " +
    "dates, prices, or hours. If you can't find something, omit it. When a requested field contains " +
    "reader-facing prose, write a complete sentence without fragments, slogans, or a padded three-part list. " +
    "If nothing applies, return an empty result.\n\n";

  const ctrl = new AbortController();
  const timeoutMs = opts.timeoutMs ?? 30_000;
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const r = await (opts.fetchImpl ?? fetch)(
      "https://api.anthropic.com/v1/messages",
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-api-key": apiKey,
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify({
          model: opts.model || DEFAULT_MODEL,
          max_tokens: opts.maxTokens ?? 1500,
          messages: [
            {
              role: "user",
              content: `${preamble}${instructions}\n\nPAGE TEXT:\n${content}`,
            },
          ],
        }),
        signal: ctrl.signal,
      },
    );
    if (!r.ok) {
      console.log(
        `  ✗ Claude → HTTP ${r.status}: ${(await r.text()).slice(0, 200)}`,
      );
      return null;
    }
    const data = (await r.json()) as { content?: { text?: string }[] };
    const raw = data.content?.[0]?.text ?? "";
    const match = raw.match(/[[{][\s\S]*[\]}]/);
    if (!match) return null;
    try {
      return JSON.parse(match[0]) as T;
    } catch {
      console.log("  ✗ Claude returned non-JSON");
      return null;
    }
  } catch (error) {
    const timedOut =
      ctrl.signal.aborted ||
      (error instanceof Error && error.name === "AbortError");
    console.log(
      timedOut
        ? `  ✗ Claude request timed out after ${timeoutMs}ms`
        : "  ✗ Claude request did not return a complete response",
    );
    return null;
  } finally {
    clearTimeout(timer);
  }
}

export type AnthropicProviderFailureKind =
  | "authentication"
  | "rate-limit"
  | "provider"
  | "request"
  | "timeout"
  | "network"
  | "response";

/**
 * A request-level Anthropic failure. Civic ingestion treats these as run
 * failures rather than silently preserving old data and reporting green.
 */
export class AnthropicProviderError extends Error {
  readonly kind: AnthropicProviderFailureKind;
  readonly status: number | null;
  readonly attempts: number;
  readonly responseBody: string;

  constructor(
    message: string,
    options: {
      kind: AnthropicProviderFailureKind;
      status?: number | null;
      attempts: number;
      responseBody?: string;
      cause?: unknown;
    },
  ) {
    super(message, { cause: options.cause });
    this.name = "AnthropicProviderError";
    this.kind = options.kind;
    this.status = options.status ?? null;
    this.attempts = options.attempts;
    this.responseBody = options.responseBody ?? "";
  }
}

type AnthropicRequestOptions = {
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
  maxRetries?: number;
  maxRetryDelayMs?: number;
  /** Test seam. Production callers use a real bounded delay. */
  sleepImpl?: (delayMs: number) => Promise<void>;
};

function isRetryableAnthropicStatus(status: number): boolean {
  return status === 429 || (status >= 500 && status <= 599);
}

function anthropicFailureKind(status: number): AnthropicProviderFailureKind {
  if (status === 401 || status === 403) return "authentication";
  if (status === 429) return "rate-limit";
  if (status >= 500 && status <= 599) return "provider";
  return "request";
}

function retryAfterDelayMs(
  retryAfter: string | null,
  fallbackMs: number,
  maxDelayMs: number,
): number | null {
  if (!retryAfter) return Math.min(fallbackMs, maxDelayMs);
  const seconds = Number(retryAfter);
  if (Number.isFinite(seconds) && seconds >= 0) {
    const requestedDelayMs = Math.ceil(seconds * 1_000);
    return requestedDelayMs <= maxDelayMs ? requestedDelayMs : null;
  }
  const retryAt = Date.parse(retryAfter);
  if (Number.isFinite(retryAt)) {
    const requestedDelayMs = Math.max(0, retryAt - Date.now());
    return requestedDelayMs <= maxDelayMs ? requestedDelayMs : null;
  }
  return Math.min(fallbackMs, maxDelayMs);
}

async function responseText(response: Response): Promise<string> {
  try {
    return (await response.text()).slice(0, 500);
  } catch {
    return "";
  }
}

/**
 * Send one Anthropic Messages request with a deliberately narrow retry
 * policy. Authentication, malformed requests, timeouts, and network errors
 * are never retried. Only provider/rate-limit statuses are retried, and
 * Retry-After is respected within a hard delay ceiling.
 */
async function requestAnthropicMessage(
  apiKey: string,
  body: Record<string, unknown>,
  options: AnthropicRequestOptions = {},
): Promise<Response> {
  const fetchImpl = options.fetchImpl ?? fetch;
  const timeoutMs = options.timeoutMs ?? 30_000;
  const maxRetries = Math.max(
    0,
    Math.min(options.maxRetries ?? DEFAULT_ANTHROPIC_RETRIES, 4),
  );
  const maxRetryDelayMs = Math.max(
    0,
    Math.min(
      options.maxRetryDelayMs ?? MAX_ANTHROPIC_RETRY_DELAY_MS,
      MAX_ANTHROPIC_RETRY_DELAY_MS,
    ),
  );
  const sleepImpl =
    options.sleepImpl ??
    ((delayMs: number) =>
      new Promise<void>((resolve) => setTimeout(resolve, delayMs)));

  for (let attempt = 1; attempt <= maxRetries + 1; attempt += 1) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeoutMs);
    let response: Response;
    try {
      response = await fetchImpl(ANTHROPIC_MESSAGES_URL, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-api-key": apiKey,
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify(body),
        signal: ctrl.signal,
      });
    } catch (error) {
      const timedOut =
        ctrl.signal.aborted ||
        (error instanceof Error && error.name === "AbortError");
      throw new AnthropicProviderError(
        timedOut
          ? `Anthropic request timed out after ${timeoutMs}ms`
          : "Anthropic request could not reach the service",
        {
          kind: timedOut ? "timeout" : "network",
          attempts: attempt,
          cause: error,
        },
      );
    } finally {
      clearTimeout(timer);
    }

    // Only an actual 2xx response is accepted. Redirects and every 4xx/5xx
    // remain failures even if a caller supplied a custom fetch implementation.
    if (response.status >= 200 && response.status <= 299) return response;

    const bodyText = await responseText(response);
    const canRetry =
      isRetryableAnthropicStatus(response.status) && attempt <= maxRetries;
    if (!canRetry) {
      throw new AnthropicProviderError(
        `Anthropic request failed with HTTP ${response.status}`,
        {
          kind: anthropicFailureKind(response.status),
          status: response.status,
          attempts: attempt,
          responseBody: bodyText,
        },
      );
    }

    const fallbackDelayMs =
      DEFAULT_ANTHROPIC_RETRY_DELAY_MS * 2 ** (attempt - 1);
    const delayMs = retryAfterDelayMs(
      response.headers.get("retry-after"),
      fallbackDelayMs,
      maxRetryDelayMs,
    );
    if (delayMs === null) {
      throw new AnthropicProviderError(
        `Anthropic requested a retry delay beyond the ${maxRetryDelayMs}ms run ceiling`,
        {
          kind: anthropicFailureKind(response.status),
          status: response.status,
          attempts: attempt,
          responseBody: bodyText,
        },
      );
    }
    console.log(
      `  – Claude HTTP ${response.status}; retrying in ${delayMs}ms ` +
        `(attempt ${attempt + 1}/${maxRetries + 1})`,
    );
    await sleepImpl(delayMs);
  }

  throw new AnthropicProviderError("Anthropic retry policy exhausted", {
    kind: "provider",
    attempts: maxRetries + 1,
  });
}

/**
 * Strict extraction for scheduled jobs whose provider failures must turn the
 * run red. A valid 2xx model response may still return null when it contains
 * no usable JSON; HTTP/auth/network/transport failures throw.
 */
export async function extractJsonStrict<T = unknown>(
  instructions: string,
  content: string,
  opts: {
    model?: string;
    maxTokens?: number;
    /** Test seam. Production callers use the process environment. */
    apiKey?: string;
  } & AnthropicRequestOptions = {},
): Promise<T | null> {
  const apiKey = opts.apiKey ?? API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY not set");
  const preamble =
    "You extract structured data from a public webpage's text. Return ONLY JSON — no prose. " +
    "Critically: include ONLY facts clearly present in the text. Never invent phone numbers, " +
    "dates, prices, or hours. If you can't find something, omit it. When a requested field contains " +
    "reader-facing prose, write a complete sentence without fragments, slogans, or a padded three-part list. " +
    "If nothing applies, return an empty result.\n\n";

  const response = await requestAnthropicMessage(
    apiKey,
    {
      model: opts.model || DEFAULT_MODEL,
      max_tokens: opts.maxTokens ?? 1500,
      messages: [
        {
          role: "user",
          content: `${preamble}${instructions}\n\nPAGE TEXT:\n${content}`,
        },
      ],
    },
    opts,
  );

  let data: { content?: { text?: string }[] };
  try {
    data = (await response.json()) as { content?: { text?: string }[] };
  } catch (error) {
    throw new AnthropicProviderError(
      "Anthropic returned an unreadable success response",
      {
        kind: "response",
        status: response.status,
        attempts: 1,
        cause: error,
      },
    );
  }
  const raw = data.content?.[0]?.text ?? "";
  const match = raw.match(/[[{][\s\S]*[\]}]/);
  if (!match) return null;
  try {
    return JSON.parse(match[0]) as T;
  } catch {
    console.log("  ✗ Claude returned non-JSON");
    return null;
  }
}

/**
 * Extract structured JSON from an IMAGE using Claude vision. Some venues
 * publish their calendar only as a graphic (e.g. a Wix-hosted PNG), with
 * no text or feed to read. This sends the image URL to the model under
 * the same hard rule as extractJson — include only what is legibly in
 * the image, never invent a date or act — and returns parsed JSON or null.
 *
 * Anthropic fetches the image by URL server-side (type: "url"), so no
 * download is needed here. Vision needs a more capable model than the
 * text default; override with EXTRACT_VISION_MODEL if desired.
 */
export async function extractJsonFromImage<T = unknown>(
  instructions: string,
  imageUrl: string,
  opts: {
    model?: string;
    maxTokens?: number;
    fetchImpl?: typeof fetch;
    timeoutMs?: number;
    /** Test seam. Production callers use the process environment. */
    apiKey?: string;
  } = {},
): Promise<T | null> {
  const apiKey = opts.apiKey ?? API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY not set");
  const model =
    opts.model || process.env.EXTRACT_VISION_MODEL || "claude-sonnet-4-6";
  const preamble =
    "You read structured data from an image of a calendar or event flyer. Return ONLY JSON — no prose. " +
    "Critically: include ONLY events legibly shown in the image. Never invent a date, time, or act, and " +
    "never guess at text you cannot read. When a requested field contains reader-facing prose, write a " +
    "complete sentence without fragments, slogans, or a padded three-part list. If the image has no readable " +
    "events, return an empty result.\n\n";

  const ctrl = new AbortController();
  const timeoutMs = opts.timeoutMs ?? 30_000;
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const r = await (opts.fetchImpl ?? fetch)(
      "https://api.anthropic.com/v1/messages",
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-api-key": apiKey,
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify({
          model,
          max_tokens: opts.maxTokens ?? 2000,
          messages: [
            {
              role: "user",
              content: [
                { type: "image", source: { type: "url", url: imageUrl } },
                { type: "text", text: `${preamble}${instructions}` },
              ],
            },
          ],
        }),
        signal: ctrl.signal,
      },
    );
    if (!r.ok) {
      console.log(
        `  ✗ Claude vision → HTTP ${r.status}: ${(await r.text()).slice(0, 200)}`,
      );
      return null;
    }
    const data = (await r.json()) as { content?: { text?: string }[] };
    const raw = data.content?.[0]?.text ?? "";
    const match = raw.match(/[[{][\s\S]*[\]}]/);
    if (!match) return null;
    try {
      return JSON.parse(match[0]) as T;
    } catch {
      console.log("  ✗ Claude vision returned non-JSON");
      return null;
    }
  } catch (error) {
    const timedOut =
      ctrl.signal.aborted ||
      (error instanceof Error && error.name === "AbortError");
    console.log(
      timedOut
        ? `  ✗ Claude vision request timed out after ${timeoutMs}ms`
        : "  ✗ Claude vision request did not return a complete response",
    );
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/** ISO timestamp helper for provenance stamps. */
export const nowISO = () => new Date().toISOString();

/**
 * Preflight: verify the API key exists AND is accepted, with a clear,
 * actionable message — so a missing/invalid key in CI shows an obvious
 * one-liner instead of a buried stack trace. Returns true if good;
 * prints guidance otherwise.
 *
 * In CI a bad key EXITS 1 so the workflow shows RED. The original
 * design returned false and let the caller exit 0 ("nothing to do") —
 * and the business-info agent then ran 49 straight GREEN no-ops over
 * seven weeks with an empty secret before anyone noticed the data had
 * stopped moving. A silent skip is the one failure mode a scheduled
 * agent must not have. Local runs still exit soft.
 */
function failPreflight(msg: string, options: { failInCi: boolean }): boolean {
  console.error(msg);
  if (options.failInCi && process.env.CI) process.exit(1);
  return false;
}

/**
 * The API's own explanation of a failure, which the generic branch below
 * used to discard.
 *
 * `responseBody` was already captured on every AnthropicProviderError, but
 * only the status reached the log, so a nightly failure read "preflight
 * failed (HTTP 400)" and nothing else. That is the one status where the
 * cause is genuinely ambiguous — a well-formed request with a valid key can
 * 400 for an exhausted credit balance, a model the workspace cannot reach,
 * or a request the account is not permitted to make — and Anthropic names
 * which one in the body every time.
 *
 * The body is the API's error JSON. The key travels in a request header and
 * is never echoed back, so this cannot leak it; the raw fallback is bounded
 * anyway so a surprise HTML error page cannot flood the log.
 */
function anthropicFailureDetail(error: AnthropicProviderError): string {
  const raw = error.responseBody?.trim();
  if (!raw) return "";
  try {
    const parsed = JSON.parse(raw) as {
      error?: { type?: string; message?: string };
    };
    const message = parsed.error?.message?.trim();
    if (message) {
      const kind = parsed.error?.type?.trim();
      return kind ? `${kind}: ${message}` : message;
    }
  } catch {
    // Not JSON. Fall through to a bounded excerpt of whatever arrived.
  }
  return raw.length > 300 ? `${raw.slice(0, 300)}…` : raw;
}

export async function preflightKey(
  options: {
    failInCi?: boolean;
    fetchImpl?: typeof fetch;
    timeoutMs?: number;
    maxRetries?: number;
    maxRetryDelayMs?: number;
    /** Test seam. Production callers use a real bounded delay. */
    sleepImpl?: (delayMs: number) => Promise<void>;
    /** Test seam. Production callers use the process environment. */
    apiKey?: string;
  } = {},
): Promise<boolean> {
  const resolved = { failInCi: options.failInCi ?? true };
  const apiKey = options.apiKey ?? API_KEY;
  if (!apiKey) {
    return failPreflight(
      "\n✗ ANTHROPIC_API_KEY is not set.\n" +
        "  → Add it as a GitHub Actions secret in the environment selected by\n" +
        "    the workflow (or as a repository secret), named ANTHROPIC_API_KEY.\n" +
        "  Model-assisted sources cannot be refreshed without it.\n",
      resolved,
    );
  }
  // Cheap liveness ping so an INVALID or out-of-credit key reports
  // precisely, instead of failing 60 times mid-run.
  try {
    await requestAnthropicMessage(
      apiKey,
      {
        model: DEFAULT_MODEL,
        max_tokens: 1,
        messages: [{ role: "user", content: "ping" }],
      },
      {
        fetchImpl: options.fetchImpl,
        timeoutMs: options.timeoutMs ?? 10_000,
        maxRetries: options.maxRetries,
        maxRetryDelayMs: options.maxRetryDelayMs,
        sleepImpl: options.sleepImpl,
      },
    );
    console.log("✓ ANTHROPIC_API_KEY verified — extracting.");
    return true;
  } catch (error) {
    if (error instanceof AnthropicProviderError) {
      if (error.status === 401 || error.status === 403) {
        return failPreflight(
          `\n✗ ANTHROPIC_API_KEY is set but REJECTED (HTTP ${error.status}). ` +
            "The key is wrong, revoked, or cannot access this workspace.\n",
          resolved,
        );
      }
      if (error.status === 429) {
        return failPreflight(
          "\n✗ ANTHROPIC_API_KEY works but is out of credit or still rate-limited " +
            `after ${error.attempts} attempt(s) (HTTP 429).\n`,
          resolved,
        );
      }
      if (error.kind === "timeout") {
        return failPreflight(
          `\n✗ Anthropic API preflight timed out after ${
            options.timeoutMs ?? 10_000
          }ms. Model-assisted sources were not refreshed.\n`,
          resolved,
        );
      }
      if (error.kind === "network") {
        return failPreflight(
          "\n✗ Anthropic API preflight could not reach the service. " +
            "Model-assisted sources were not refreshed.\n",
          resolved,
        );
      }
      const detail = anthropicFailureDetail(error);
      return failPreflight(
        `\n✗ Anthropic API preflight failed (HTTP ${
          error.status ?? "unknown"
        }) after ${error.attempts} attempt(s). Model-assisted sources were not refreshed.\n` +
          (detail ? `  Anthropic said: ${detail}\n` : ""),
        resolved,
      );
    }
    return failPreflight(
      "\n✗ Anthropic API preflight failed unexpectedly. Model-assisted sources were not refreshed.\n",
      resolved,
    );
  }
}
