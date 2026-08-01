const FETCH_TIMEOUT_MS = 30_000;
const MAX_ATTEMPTS = 4;
const MAX_RETRY_DELAY_MS = 30_000;
const MAX_DIAGNOSTIC_BODY_BYTES = 64 * 1024;
const MAX_SUCCESS_BODY_BYTES = 25 * 1024 * 1024;

type FetchLike = (
  input: string | URL | Request,
  init?: RequestInit,
) => Promise<Response>;

type RetryOptions = {
  fetchImpl?: FetchLike;
  sleep?: (delayMs: number) => Promise<void>;
  random?: () => number;
  timeoutMs?: number;
  maxAttempts?: number;
  maxResponseBytes?: number;
};

export type HttpFailureDiagnostic = {
  status: number;
  statusText: string;
  contentType: string | null;
  retryAfter: string | null;
  finalUrl: string;
  body: string;
  bodyTruncated: boolean;
};

export class SourceHttpError extends Error {
  readonly diagnostic: HttpFailureDiagnostic;

  constructor(diagnostic: HttpFailureDiagnostic) {
    super(`HTTP ${diagnostic.status}${diagnostic.statusText ? ` ${diagnostic.statusText}` : ""}`);
    this.name = "SourceHttpError";
    this.diagnostic = diagnostic;
  }
}

export class SourceBodyLimitError extends Error {
  readonly diagnostic: {
    status: number;
    contentType: string | null;
    finalUrl: string;
    limitBytes: number;
  };

  constructor(diagnostic: SourceBodyLimitError["diagnostic"]) {
    super(`HTTP ${diagnostic.status} response exceeded ${diagnostic.limitBytes} bytes`);
    this.name = "SourceBodyLimitError";
    this.diagnostic = diagnostic;
  }
}

function retryableStatus(status: number): boolean {
  return status === 403 || status === 408 || status === 425 || status === 429 || status >= 500;
}

function retryAfterMs(value: string | null, now = Date.now()): number {
  if (!value) return 0;
  const seconds = Number(value);
  if (Number.isFinite(seconds) && seconds >= 0) return seconds * 1000;
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) return 0;
  return Math.max(0, timestamp - now);
}

function backoffMs(
  attempt: number,
  error: unknown,
  random: () => number,
): number | null {
  const base = 1000 * 3 ** Math.max(0, attempt - 1);
  const requested =
    error instanceof SourceHttpError
      ? retryAfterMs(error.diagnostic.retryAfter)
      : 0;
  if (requested > MAX_RETRY_DELAY_MS) return null;
  const jitter = Math.floor(random() * 500);
  return Math.min(MAX_RETRY_DELAY_MS, Math.max(base, requested) + jitter);
}

async function readBoundedBody(
  response: Response,
  limitBytes: number,
): Promise<{ body: string; truncated: boolean }> {
  if (!response.body) return { body: "", truncated: false };

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let stored = 0;
  let truncated = false;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    const remaining = limitBytes - stored;
    if (value.byteLength > remaining) {
      chunks.push(value.subarray(0, remaining));
      stored += remaining;
      truncated = true;
      break;
    }
    chunks.push(value);
    stored += value.byteLength;
  }

  if (truncated) {
    await reader.cancel().catch(() => undefined);
  }

  const joined = new Uint8Array(stored);
  let offset = 0;
  for (const chunk of chunks) {
    joined.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return { body: new TextDecoder().decode(joined), truncated };
}

export async function fetchTextWithRetry(
  url: string,
  options: RetryOptions = {},
): Promise<string> {
  const fetchImpl = options.fetchImpl ?? fetch;
  const sleep = options.sleep ?? ((delayMs) => new Promise((resolve) => setTimeout(resolve, delayMs)));
  const random = options.random ?? Math.random;
  const timeoutMs = options.timeoutMs ?? FETCH_TIMEOUT_MS;
  const maxAttempts = options.maxAttempts ?? MAX_ATTEMPTS;
  const maxResponseBytes = options.maxResponseBytes ?? MAX_SUCCESS_BODY_BYTES;
  let lastError: unknown;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetchImpl(url, {
        signal: controller.signal,
        headers: {
          "User-Agent": "Frederick Radius data pipeline (miked@madproductions.io)",
          Accept: "application/json, application/geo+json;q=0.9, */*;q=0.5",
        },
      });
      if (response.ok) {
        const successBody = await readBoundedBody(response, maxResponseBytes);
        if (successBody.truncated) {
          throw new SourceBodyLimitError({
            status: response.status,
            contentType: response.headers.get("content-type"),
            finalUrl: response.url || url,
            limitBytes: maxResponseBytes,
          });
        }
        return successBody.body;
      }

      const errorBody = await readBoundedBody(response, MAX_DIAGNOSTIC_BODY_BYTES);

      const error = new SourceHttpError({
        status: response.status,
        statusText: response.statusText,
        contentType: response.headers.get("content-type"),
        retryAfter: response.headers.get("retry-after"),
        finalUrl: response.url || url,
        body: errorBody.body,
        bodyTruncated: errorBody.truncated,
      });
      lastError = error;
      if (!retryableStatus(response.status) || attempt === maxAttempts) throw error;
    } catch (error) {
      lastError = error;
      if (
        (error instanceof SourceHttpError && !retryableStatus(error.diagnostic.status)) ||
        error instanceof SourceBodyLimitError ||
        attempt === maxAttempts
      ) {
        throw error;
      }
    } finally {
      clearTimeout(timer);
    }

    const delay = backoffMs(attempt, lastError, random);
    if (delay === null) {
      throw lastError instanceof Error ? lastError : new Error(String(lastError));
    }
    await sleep(delay);
  }

  throw lastError instanceof Error ? lastError : new Error(String(lastError));
}
