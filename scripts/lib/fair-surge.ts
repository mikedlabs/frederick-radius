import { createHash } from "node:crypto";
import { lookup } from "node:dns/promises";
import http, { type IncomingHttpHeaders } from "node:http";
import https from "node:https";
import { isIP } from "node:net";

export const FAIR_CANONICAL_PATH =
  "/moments/great-frederick-fair-2026" as const;
export const FAIR_POINTER_PATH = "/fair/2026/current.json" as const;

export const FAIR_SURGE_MARKERS = Object.freeze([
  'data-fair-app="true"',
  "great-frederick-fair-2026",
  "Fair Day · Frederick Radius",
]);

export type FairSurgeStage = {
  users: 100 | 500 | 1000;
  maxConcurrency: number;
  rampMs: number;
  dwellAfterMs: number;
  stageTimeoutMs: number;
  p95BudgetMs: number;
  p99BudgetMs: number;
};

/**
 * Fixed on purpose. The command accepts no user, concurrency, ramp, or timeout
 * overrides, so an accidental invocation cannot turn into an open-ended load
 * generator.
 */
export const FAIR_SURGE_STAGES: readonly FairSurgeStage[] = Object.freeze([
  Object.freeze({
    users: 100,
    maxConcurrency: 10,
    rampMs: 5_000,
    dwellAfterMs: 3_000,
    stageTimeoutMs: 30_000,
    p95BudgetMs: 250,
    p99BudgetMs: 500,
  }),
  Object.freeze({
    users: 500,
    maxConcurrency: 25,
    rampMs: 15_000,
    dwellAfterMs: 5_000,
    stageTimeoutMs: 60_000,
    p95BudgetMs: 250,
    p99BudgetMs: 500,
  }),
  Object.freeze({
    users: 1000,
    maxConcurrency: 50,
    rampMs: 30_000,
    dwellAfterMs: 0,
    stageTimeoutMs: 120_000,
    p95BudgetMs: 250,
    p99BudgetMs: 500,
  }),
]);

export const MAX_CRITICAL_RESOURCES = 12;
export const FAIR_SURGE_USER_REQUESTS = FAIR_SURGE_STAGES.reduce(
  (total, stage) => total + stage.users,
  0,
);
export const HARD_REQUEST_CAP =
  FAIR_SURGE_USER_REQUESTS + 1 + MAX_CRITICAL_RESOURCES;
export const REQUEST_TIMEOUT_MS = 5_000;
export const MAX_RESPONSE_BYTES = 8 * 1024 * 1024;

export const FAIR_SURGE_HTTP_METHOD = "GET" as const;
export const FAIR_SURGE_REQUEST_HEADERS = Object.freeze({
  "accept-language": "en-US,en;q=0.8",
  "user-agent": "FrederickRadius-FairSurge/1.0 (loopback-only)",
});

export type ResolvedLoopbackTarget = {
  origin: string;
  protocol: "http:" | "https:";
  hostHeader: string;
  address: string;
  family: 4 | 6;
  port: number;
};

export type ResolveAddress = {
  address: string;
  family: number;
};

export type HostResolver = (
  hostname: string,
) => Promise<readonly ResolveAddress[]>;

const PUBLIC_HOST_SUFFIXES = [
  "frederickradius.app",
  "vercel.app",
  "vercel.com",
  "etix.com",
  "eventhub-floorplan.net",
] as const;

function unbracket(hostname: string): string {
  return hostname.startsWith("[") && hostname.endsWith("]")
    ? hostname.slice(1, -1)
    : hostname;
}

function publicHostname(hostname: string): boolean {
  const normalized = unbracket(hostname).toLowerCase();
  return PUBLIC_HOST_SUFFIXES.some(
    (suffix) => normalized === suffix || normalized.endsWith(`.${suffix}`),
  );
}

export function isLoopbackAddress(address: string): boolean {
  const normalized = unbracket(address).toLowerCase();
  if (isIP(normalized) === 4) {
    return normalized.startsWith("127.");
  }
  if (isIP(normalized) === 6) {
    return normalized === "::1" || normalized.startsWith("::ffff:127.");
  }
  return false;
}

export function parseLoopbackTarget(raw: string): URL {
  let target: URL;
  try {
    target = new URL(raw);
  } catch {
    throw new Error("Fair surge target must be a complete HTTP(S) URL.");
  }

  if (target.protocol !== "http:" && target.protocol !== "https:") {
    throw new Error("Fair surge target must use HTTP or HTTPS.");
  }
  if (target.username || target.password) {
    throw new Error("Fair surge target cannot contain credentials.");
  }
  if (target.pathname !== "/" || target.search || target.hash) {
    throw new Error(
      "Fair surge target must be an origin only, with no path, query, or fragment.",
    );
  }

  const hostname = unbracket(target.hostname).toLowerCase();
  if (publicHostname(hostname)) {
    throw new Error(`Fair surge refuses public hostname ${hostname}.`);
  }
  if (hostname !== "localhost" && isIP(hostname) === 0) {
    throw new Error(
      "Fair surge accepts only localhost or a numeric loopback address.",
    );
  }
  if (isIP(hostname) !== 0 && !isLoopbackAddress(hostname)) {
    throw new Error(`Fair surge refuses non-loopback address ${hostname}.`);
  }

  return new URL(target.origin);
}

const systemResolver: HostResolver = async (hostname) =>
  await lookup(hostname, { all: true, verbatim: true });

export async function resolveLoopbackTarget(
  raw: string,
  resolver: HostResolver = systemResolver,
): Promise<ResolvedLoopbackTarget> {
  const url = parseLoopbackTarget(raw);
  const hostname = unbracket(url.hostname);
  const directFamily = isIP(hostname);
  const addresses = directFamily === 0
    ? await resolver(hostname)
    : [{ address: hostname, family: directFamily }];

  if (addresses.length === 0) {
    throw new Error(`Fair surge could not resolve ${hostname}.`);
  }
  const unsafe = addresses.find(
    (entry) =>
      (entry.family !== 4 && entry.family !== 6)
      || !isLoopbackAddress(entry.address),
  );
  if (unsafe) {
    throw new Error(
      `Fair surge refuses ${hostname}: it resolved to non-loopback ${unsafe.address}.`,
    );
  }

  const selected = addresses.find((entry) => entry.family === 4) ?? addresses[0];
  const family = selected.family as 4 | 6;
  return {
    origin: url.origin,
    protocol: url.protocol as "http:" | "https:",
    hostHeader: url.host,
    address: unbracket(selected.address),
    family,
    port: url.port ? Number(url.port) : url.protocol === "https:" ? 443 : 80,
  };
}

export class RequestBudget {
  private usedCount = 0;

  constructor(readonly limit: number = HARD_REQUEST_CAP) {
    if (!Number.isSafeInteger(limit) || limit <= 0) {
      throw new Error("Request budget must be a positive safe integer.");
    }
  }

  get used(): number {
    return this.usedCount;
  }

  consume(): void {
    if (this.usedCount >= this.limit) {
      throw new Error(
        `Fair surge hard request cap reached (${this.limit}); no request was sent.`,
      );
    }
    this.usedCount += 1;
  }
}

function isAllowedRequestPath(pathname: string): boolean {
  return (
    pathname === FAIR_CANONICAL_PATH
    || pathname === FAIR_POINTER_PATH
    || /^\/fair\/2026\/releases\/[a-f0-9]{64}\.json$/.test(pathname)
    || pathname.startsWith("/_next/static/")
    || pathname.startsWith("/images/fair/")
  );
}

export function safeRequestUrl(
  target: Pick<ResolvedLoopbackTarget, "origin">,
  path: string,
): URL {
  const url = new URL(path, target.origin);
  if (url.origin !== target.origin) {
    throw new Error(`Fair surge refuses cross-origin resource ${url.origin}.`);
  }
  if (url.username || url.password || url.search || url.hash) {
    throw new Error("Fair surge requests cannot contain credentials, query, or fragment.");
  }
  if (!isAllowedRequestPath(url.pathname)) {
    throw new Error(`Fair surge refuses non-Fair resource ${url.pathname}.`);
  }
  return url;
}

export type LoopbackResponse = {
  path: string;
  status: number;
  headers: IncomingHttpHeaders;
  body: Buffer;
  durationMs: number;
};

export type LoopbackGet = (
  path: string,
  accept: "text/html" | "application/json" | "*/*",
) => Promise<LoopbackResponse>;

export function createLoopbackRequester(
  target: ResolvedLoopbackTarget,
  budget: RequestBudget,
): { get: LoopbackGet; close: () => void } {
  const httpAgent = target.protocol === "http:"
    ? new http.Agent({ keepAlive: true, maxSockets: 50 })
    : null;
  const httpsAgent = target.protocol === "https:"
    ? new https.Agent({ keepAlive: true, maxSockets: 50 })
    : null;

  const get: LoopbackGet = async (path, accept) => {
    const url = safeRequestUrl(target, path);
    budget.consume();
    const started = performance.now();

    return await new Promise<LoopbackResponse>((resolve, reject) => {
      const options: http.RequestOptions = {
        hostname: target.address,
        family: target.family,
        port: target.port,
        path: url.pathname,
        method: FAIR_SURGE_HTTP_METHOD,
        headers: {
          ...FAIR_SURGE_REQUEST_HEADERS,
          accept,
          host: target.hostHeader,
        },
      };
      const handleResponse = (response: http.IncomingMessage) => {
        const chunks: Buffer[] = [];
        let bytes = 0;
        let settled = false;

        const fail = (error: Error) => {
          if (settled) return;
          settled = true;
          response.destroy();
          reject(error);
        };

        const declaredLength = Number(response.headers["content-length"] ?? 0);
        if (declaredLength > MAX_RESPONSE_BYTES) {
          fail(new Error(
            `${url.pathname} declared ${declaredLength} bytes, above the response cap.`,
          ));
          return;
        }

        response.on("data", (chunk: Buffer | string) => {
          const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
          bytes += buffer.length;
          if (bytes > MAX_RESPONSE_BYTES) {
            fail(new Error(
              `${url.pathname} exceeded the ${MAX_RESPONSE_BYTES}-byte response cap.`,
            ));
            return;
          }
          chunks.push(buffer);
        });
        response.on("end", () => {
          if (settled) return;
          settled = true;
          resolve({
            path: url.pathname,
            status: response.statusCode ?? 0,
            headers: response.headers,
            body: Buffer.concat(chunks),
            durationMs: performance.now() - started,
          });
        });
        response.on("error", fail);
      };
      const request = target.protocol === "http:"
        ? http.request({
            ...options,
            agent: httpAgent ?? undefined,
          }, handleResponse)
        : https.request({
            ...options,
            agent: httpsAgent ?? undefined,
            servername: unbracket(new URL(target.origin).hostname),
          }, handleResponse);

      request.setTimeout(REQUEST_TIMEOUT_MS, () => {
        request.destroy(new Error(
          `${url.pathname} timed out after ${REQUEST_TIMEOUT_MS}ms.`,
        ));
      });
      request.on("error", reject);
      request.end();
    });
  };

  return {
    get,
    close: () => {
      httpAgent?.destroy();
      httpsAgent?.destroy();
    },
  };
}

function decodeHtmlAttribute(value: string): string {
  return value.replaceAll("&amp;", "&");
}

export function extractCriticalResourcePaths(
  html: string,
  origin: string,
): string[] {
  const paths = new Set<string>();
  const attributePattern = /\b(?:src|href)=["']([^"'<>]+)["']/gi;
  for (const match of html.matchAll(attributePattern)) {
    let url: URL;
    try {
      url = new URL(decodeHtmlAttribute(match[1]), origin);
    } catch {
      continue;
    }
    if (
      url.origin !== origin
      || url.search
      || url.hash
      || !(
        url.pathname.startsWith("/_next/static/")
        || url.pathname.startsWith("/images/fair/")
      )
    ) {
      continue;
    }
    paths.add(url.pathname);
  }
  return [...paths].sort();
}

export type FairHtmlSignature = {
  hash: string;
  revision: string;
  criticalPaths: string[];
};

export function fairHtmlSignature(
  html: string,
  origin: string,
): FairHtmlSignature {
  for (const marker of FAIR_SURGE_MARKERS) {
    if (!html.includes(marker)) {
      throw new Error(`Fair HTML is missing stable marker: ${marker}`);
    }
  }
  const revisions = [...new Set(
    html.match(/sha256:[a-f0-9]{64}/gi)?.map((value) => value.toLowerCase()) ?? [],
  )];
  if (revisions.length !== 1) {
    throw new Error(
      `Fair HTML must expose exactly one stable pack revision; found ${revisions.length}.`,
    );
  }
  const criticalPaths = extractCriticalResourcePaths(html, origin);
  if (!criticalPaths.some((path) => path.startsWith("/_next/static/"))) {
    throw new Error("Fair HTML did not expose a same-origin Next.js static resource.");
  }
  if (!criticalPaths.some((path) => path.startsWith("/images/fair/"))) {
    throw new Error("Fair HTML did not expose a same-origin Fair image.");
  }

  const signatureInput = JSON.stringify({
    markers: FAIR_SURGE_MARKERS,
    revision: revisions[0],
    criticalPaths,
  });
  return {
    hash: `sha256:${createHash("sha256").update(signatureInput).digest("hex")}`,
    revision: revisions[0],
    criticalPaths,
  };
}

function record(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${label} must be an object.`);
  }
  return value as Record<string, unknown>;
}

function positiveInteger(value: unknown, label: string): number {
  if (!Number.isSafeInteger(value) || Number(value) <= 0) {
    throw new Error(`${label} must be a positive safe integer.`);
  }
  return Number(value);
}

export type FairPointer = {
  fairId: "great-frederick-fair-2026";
  revision: string;
  assetPath: string;
  byteLength: number;
  dayCount: number;
  itemCount: number;
};

export function parseFairPointer(value: unknown): FairPointer {
  const pointer = record(value, "Fair pointer");
  if (pointer.version !== 1) {
    throw new Error("Fair pointer.version must be 1.");
  }
  if (pointer.fairId !== "great-frederick-fair-2026") {
    throw new Error("Fair pointer has the wrong fairId.");
  }
  if (
    typeof pointer.revision !== "string"
    || !/^sha256:[a-f0-9]{64}$/.test(pointer.revision)
  ) {
    throw new Error("Fair pointer has an invalid revision.");
  }
  if (
    typeof pointer.assetPath !== "string"
    || !/^\/fair\/2026\/releases\/[a-f0-9]{64}\.json$/.test(pointer.assetPath)
  ) {
    throw new Error("Fair pointer has an unsafe assetPath.");
  }
  if (pointer.assetPath.slice(-69, -5) !== pointer.revision.slice(7)) {
    throw new Error("Fair pointer assetPath does not match its revision.");
  }
  return {
    fairId: pointer.fairId,
    revision: pointer.revision,
    assetPath: pointer.assetPath,
    byteLength: positiveInteger(pointer.byteLength, "Fair pointer.byteLength"),
    dayCount: positiveInteger(pointer.dayCount, "Fair pointer.dayCount"),
    itemCount: positiveInteger(pointer.itemCount, "Fair pointer.itemCount"),
  };
}

export function validateFairRelease(
  value: unknown,
  pointer: FairPointer,
): void {
  const release = record(value, "Fair release");
  if (release.fairId !== pointer.fairId || release.revision !== pointer.revision) {
    throw new Error("Fair release identity does not match the pointer.");
  }
  const manifest = record(release.manifest, "Fair release.manifest");
  if (manifest.id !== pointer.fairId) {
    throw new Error("Fair release manifest does not match the pointer.");
  }
  const schedule = record(release.schedule, "Fair release.schedule");
  if (!Array.isArray(schedule.days)) {
    throw new Error("Fair release.schedule.days must be an array.");
  }
  const itemCount = schedule.days.reduce((total, day, index) => {
    const row = record(day, `Fair release.schedule.days[${index}]`);
    if (!Array.isArray(row.items)) {
      throw new Error(`Fair release.schedule.days[${index}].items must be an array.`);
    }
    return total + row.items.length;
  }, 0);
  if (schedule.days.length !== pointer.dayCount || itemCount !== pointer.itemCount) {
    throw new Error(
      "Fair release day/item counts do not match the reviewed pointer.",
    );
  }
}

export type FairStageResult = {
  users: number;
  completed: number;
  requestErrors: number;
  durationMs: number;
  requestsPerSecond: number;
  bytes: number;
  latencyMs: {
    min: number;
    p50: number;
    p95: number;
    p99: number;
    max: number;
  };
  gateFailures: string[];
  passed: boolean;
};

function percentile(values: readonly number[], fraction: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.max(0, Math.ceil(sorted.length * fraction) - 1)];
}

function rounded(value: number): number {
  return Math.round(value * 10) / 10;
}

export function summarizeFairStage(
  stage: FairSurgeStage,
  input: {
    completed: number;
    requestErrors: number;
    durationMs: number;
    bytes: number;
    latenciesMs: readonly number[];
    fatalError?: string | null;
  },
): FairStageResult {
  const p95 = percentile(input.latenciesMs, 0.95);
  const p99 = percentile(input.latenciesMs, 0.99);
  const gateFailures: string[] = [];
  if (input.completed !== stage.users) {
    gateFailures.push(
      `Only ${input.completed} of ${stage.users} one-shot users completed.`,
    );
  }
  if (input.requestErrors !== 0) {
    gateFailures.push(`${input.requestErrors} request(s) failed validation.`);
  }
  if (p95 > stage.p95BudgetMs) {
    gateFailures.push(
      `p95 ${rounded(p95)}ms exceeded the ${stage.p95BudgetMs}ms budget.`,
    );
  }
  if (p99 > stage.p99BudgetMs) {
    gateFailures.push(
      `p99 ${rounded(p99)}ms exceeded the ${stage.p99BudgetMs}ms budget.`,
    );
  }
  if (input.fatalError) gateFailures.push(input.fatalError);

  return {
    users: stage.users,
    completed: input.completed,
    requestErrors: input.requestErrors,
    durationMs: rounded(input.durationMs),
    requestsPerSecond: input.durationMs > 0
      ? rounded((input.completed / input.durationMs) * 1_000)
      : 0,
    bytes: input.bytes,
    latencyMs: {
      min: rounded(
        input.latenciesMs.length > 0 ? Math.min(...input.latenciesMs) : 0,
      ),
      p50: rounded(percentile(input.latenciesMs, 0.5)),
      p95: rounded(p95),
      p99: rounded(p99),
      max: rounded(Math.max(...input.latenciesMs, 0)),
    },
    gateFailures,
    passed: gateFailures.length === 0,
  };
}

export function applyFairScaleGate(
  result: FairStageResult,
  baseline: FairStageResult | undefined,
): FairStageResult {
  if (
    result.users !== 1000
    || !baseline
    || baseline.users !== 100
    || result.latencyMs.p95 <= baseline.latencyMs.p95 * 2
  ) {
    return result;
  }
  const failure =
    `p95 ${result.latencyMs.p95}ms exceeded twice the 100-user baseline (${baseline.latencyMs.p95}ms).`;
  return {
    ...result,
    gateFailures: [...result.gateFailures, failure],
    passed: false,
  };
}

export function criticalContentType(path: string): string {
  if (path.endsWith(".json")) return "application/json";
  if (path.endsWith(".css")) return "text/css";
  if (path.endsWith(".js")) return "javascript";
  if (/\.(?:avif|gif|jpe?g|png|webp)$/i.test(path)) return "image/";
  return "";
}

export function responseContentType(headers: IncomingHttpHeaders): string {
  const value = headers["content-type"];
  return Array.isArray(value) ? (value[0] ?? "") : (value ?? "");
}
