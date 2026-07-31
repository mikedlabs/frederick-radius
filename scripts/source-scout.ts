/**
 * Radius Source Scout
 *
 * A small, budget-capped Tavily sweep for source candidates. It writes only
 * ignored review artifacts under scripts/reports. It never mutates app data,
 * publishes facts, or treats search-result prose as verified. Search snippets
 * are used transiently and stripped from both the report and cache.
 *
 *   npx tsx --tsconfig tsconfig.json scripts/source-scout.ts
 *   npx tsx --tsconfig tsconfig.json scripts/source-scout.ts --live --confirm
 *   npx tsx --tsconfig tsconfig.json scripts/source-scout.ts --live --confirm --profile food-truck-schedules
 */

import { createHash, randomUUID } from "node:crypto";
import {
  mkdir,
  open,
  readFile,
  rename,
  stat,
  unlink,
  writeFile,
} from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  searchTavilyCandidates,
  TavilySearchError,
  type TavilyCandidateSearchOptions,
  type TavilyCandidateSearchResult,
  type TavilySearchCandidate,
  type TavilySearchDepth,
} from "./lib/tavily-search";

const DEFAULT_CONFIG_PATH = resolve("config/source-scout.json");
const DEFAULT_REPORTS_DIR = resolve("scripts/reports");
const REPORT_NAME = "source-scout-latest.json";
const CACHE_NAME = "source-scout-cache.json";
const USAGE_NAME = "source-scout-usage.json";
const LOCK_NAME = "source-scout.lock";

type SourceScoutLimits = {
  maxRequestsPerRun: number;
  maxCreditsPerRun: number;
  maxAttemptedCreditsPerDay: number;
  maxAttemptedCreditsPerMonth: number;
  lockStaleMinutes: number;
  requestTimeoutMs: number;
  maxResultsPerQuery: number;
  defaultCacheTtlHours: number;
};

type SourceScoutQuery = {
  id: string;
  text: string;
  allowedDomains: string[];
  openDiscovery?: boolean;
  reviewFor: string[];
};

type SourceScoutProfile = {
  id: string;
  label: string;
  purpose: string;
  enabled: boolean;
  searchDepth: TavilySearchDepth;
  maxQueriesPerRun: number;
  cacheTtlHours?: number;
  queries: SourceScoutQuery[];
};

export type SourceScoutConfig = {
  version: 1;
  limits: SourceScoutLimits;
  blockedDomains: string[];
  profiles: SourceScoutProfile[];
};

type PersistedScoutCandidate = Pick<
  TavilySearchCandidate,
  "url" | "title" | "score"
>;

type PersistedScoutSearchResult = Omit<
  TavilyCandidateSearchResult,
  "candidates"
> & {
  candidates: PersistedScoutCandidate[];
};

export type ScoutCandidate = PersistedScoutCandidate & {
  reviewState: "candidate";
  originalSourceUrl: string;
  sourceDomain: string;
  observedAt: string;
  profileId: string;
  queryId: string;
  queryText: string;
  reviewFor: string[];
};

type QueryRunStatus =
  | "planned"
  | "fetched"
  | "cache"
  | "error"
  | "skipped-budget"
  | "skipped-terminal-error";

export type SourceScoutQueryRun = {
  profileId: string;
  profileLabel: string;
  profilePurpose: string;
  queryId: string;
  queryText: string;
  allowedDomains: string[];
  domainControl: "allowlist" | "open-review";
  reviewFor: string[];
  status: QueryRunStatus;
  estimatedCredits: number;
  requestId: string | null;
  responseTime: string | number | null;
  apiReportedCredits: number | null;
  candidates: ScoutCandidate[];
  error: {
    code: string;
    message: string;
    status: number | null;
    retryAfter: string | null;
    requestId: string | null;
  } | null;
};

export type SourceScoutReport = {
  schemaVersion: 1;
  reviewOnly: true;
  noPublicWrites: true;
  generatedAt: string;
  mode: "plan" | "live";
  selectedProfile: string | null;
  configPath: string;
  outputPolicy: string;
  budget: {
    maxRequests: number;
    maxCredits: number;
    plannedQueries: number;
    requestsMade: number;
    creditsCommitted: number;
    creditsReportedByApi: number;
    cacheHits: number;
    usageTimezone: "UTC";
    dailyKey: string;
    monthlyKey: string;
    maxAttemptedCreditsPerDay: number;
    maxAttemptedCreditsPerMonth: number;
    dailyAttemptedCreditsBefore: number | null;
    dailyAttemptedCreditsAfter: number | null;
    monthlyAttemptedCreditsBefore: number | null;
    monthlyAttemptedCreditsAfter: number | null;
  };
  summary: {
    fetched: number;
    cached: number;
    errors: number;
    skipped: number;
    candidates: number;
  };
  queries: SourceScoutQueryRun[];
};

type CacheEntry = {
  cacheKey: string;
  fetchedAt: string;
  expiresAt: string;
  result: PersistedScoutSearchResult;
};

type SourceScoutCache = {
  schemaVersion: 1;
  reviewOnly: true;
  entries: Record<string, CacheEntry>;
};

type UsageBucket = {
  attemptedRequests: number;
  attemptedCredits: number;
};

type SourceScoutUsageLedger = {
  schemaVersion: 1;
  timezone: "UTC";
  updatedAt: string;
  days: Record<string, UsageBucket>;
  months: Record<string, UsageBucket>;
};

type SearchFunction = (
  query: string,
  options?: TavilyCandidateSearchOptions,
) => Promise<TavilyCandidateSearchResult>;

export type RunSourceScoutOptions = {
  live?: boolean;
  confirmed?: boolean;
  profileId?: string;
  configPath?: string;
  reportsDir?: string;
};

export type RunSourceScoutDependencies = {
  search?: SearchFunction;
  now?: () => Date;
};

export type RunSourceScoutResult = {
  report: SourceScoutReport;
  reportPath: string;
  cachePath: string;
  usagePath: string;
  lockPath: string;
  wroteFiles: boolean;
};

export type SourceScoutCliArgs = {
  live: boolean;
  confirmed: boolean;
  profileId?: string;
};

function isObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function requireString(value: unknown, path: string): string {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`${path} must be a non-empty string.`);
  }
  return value.trim();
}

function requireBoolean(value: unknown, path: string): boolean {
  if (typeof value !== "boolean") {
    throw new Error(`${path} must be a boolean.`);
  }
  return value;
}

function requireInteger(
  value: unknown,
  path: string,
  min: number,
  max: number,
): number {
  if (
    typeof value !== "number" ||
    !Number.isInteger(value) ||
    value < min ||
    value > max
  ) {
    throw new Error(`${path} must be an integer between ${min} and ${max}.`);
  }
  return value;
}

function requireStringArray(value: unknown, path: string): string[] {
  if (!Array.isArray(value)) {
    throw new Error(`${path} must be an array.`);
  }
  return value.map((entry, index) => requireString(entry, `${path}[${index}]`));
}

function requireSearchDepth(value: unknown, path: string): TavilySearchDepth {
  if (
    value !== "ultra-fast" &&
    value !== "fast" &&
    value !== "basic" &&
    value !== "advanced"
  ) {
    throw new Error(`${path} must be ultra-fast, fast, basic, or advanced.`);
  }
  return value;
}

function validateConfig(value: unknown): SourceScoutConfig {
  if (!isObject(value))
    throw new Error("Source Scout config must be an object.");
  if (value.version !== 1) {
    throw new Error("Source Scout config version must be 1.");
  }
  if (!isObject(value.limits)) {
    throw new Error("Source Scout config limits must be an object.");
  }

  const limits: SourceScoutLimits = {
    maxRequestsPerRun: requireInteger(
      value.limits.maxRequestsPerRun,
      "limits.maxRequestsPerRun",
      1,
      50,
    ),
    maxCreditsPerRun: requireInteger(
      value.limits.maxCreditsPerRun,
      "limits.maxCreditsPerRun",
      1,
      100,
    ),
    maxAttemptedCreditsPerDay: requireInteger(
      value.limits.maxAttemptedCreditsPerDay,
      "limits.maxAttemptedCreditsPerDay",
      1,
      10_000,
    ),
    maxAttemptedCreditsPerMonth: requireInteger(
      value.limits.maxAttemptedCreditsPerMonth,
      "limits.maxAttemptedCreditsPerMonth",
      1,
      100_000,
    ),
    lockStaleMinutes: requireInteger(
      value.limits.lockStaleMinutes,
      "limits.lockStaleMinutes",
      1,
      1_440,
    ),
    requestTimeoutMs: requireInteger(
      value.limits.requestTimeoutMs,
      "limits.requestTimeoutMs",
      500,
      60_000,
    ),
    maxResultsPerQuery: requireInteger(
      value.limits.maxResultsPerQuery,
      "limits.maxResultsPerQuery",
      1,
      20,
    ),
    defaultCacheTtlHours: requireInteger(
      value.limits.defaultCacheTtlHours,
      "limits.defaultCacheTtlHours",
      1,
      720,
    ),
  };
  if (limits.maxAttemptedCreditsPerDay > limits.maxAttemptedCreditsPerMonth) {
    throw new Error(
      "limits.maxAttemptedCreditsPerDay cannot exceed limits.maxAttemptedCreditsPerMonth.",
    );
  }

  const blockedDomains = requireStringArray(
    value.blockedDomains,
    "blockedDomains",
  );
  if (!Array.isArray(value.profiles) || value.profiles.length === 0) {
    throw new Error("Source Scout config profiles must be a non-empty array.");
  }

  const profileIds = new Set<string>();
  const profiles = value.profiles.map((rawProfile, profileIndex) => {
    const path = `profiles[${profileIndex}]`;
    if (!isObject(rawProfile)) throw new Error(`${path} must be an object.`);
    const id = requireString(rawProfile.id, `${path}.id`);
    if (profileIds.has(id))
      throw new Error(`Duplicate Source Scout profile: ${id}.`);
    profileIds.add(id);
    if (!Array.isArray(rawProfile.queries) || rawProfile.queries.length === 0) {
      throw new Error(`${path}.queries must be a non-empty array.`);
    }

    const queryIds = new Set<string>();
    const queries = rawProfile.queries.map((rawQuery, queryIndex) => {
      const queryPath = `${path}.queries[${queryIndex}]`;
      if (!isObject(rawQuery)) {
        throw new Error(`${queryPath} must be an object.`);
      }
      const queryId = requireString(rawQuery.id, `${queryPath}.id`);
      if (queryIds.has(queryId)) {
        throw new Error(`Duplicate query ${queryId} in profile ${id}.`);
      }
      queryIds.add(queryId);
      const allowedDomains = requireStringArray(
        rawQuery.allowedDomains,
        `${queryPath}.allowedDomains`,
      );
      const openDiscovery =
        rawQuery.openDiscovery === undefined
          ? false
          : requireBoolean(
              rawQuery.openDiscovery,
              `${queryPath}.openDiscovery`,
            );
      if (allowedDomains.length === 0 && !openDiscovery) {
        throw new Error(
          `${queryPath} must have allowedDomains or explicitly set openDiscovery=true.`,
        );
      }
      if (allowedDomains.length > 0 && openDiscovery) {
        throw new Error(
          `${queryPath} cannot combine allowedDomains with openDiscovery=true.`,
        );
      }
      return {
        id: queryId,
        text: requireString(rawQuery.text, `${queryPath}.text`),
        allowedDomains,
        ...(openDiscovery ? { openDiscovery: true } : {}),
        reviewFor: requireStringArray(
          rawQuery.reviewFor,
          `${queryPath}.reviewFor`,
        ),
      } satisfies SourceScoutQuery;
    });

    return {
      id,
      label: requireString(rawProfile.label, `${path}.label`),
      purpose: requireString(rawProfile.purpose, `${path}.purpose`),
      enabled: requireBoolean(rawProfile.enabled, `${path}.enabled`),
      searchDepth: requireSearchDepth(
        rawProfile.searchDepth,
        `${path}.searchDepth`,
      ),
      maxQueriesPerRun: requireInteger(
        rawProfile.maxQueriesPerRun,
        `${path}.maxQueriesPerRun`,
        1,
        20,
      ),
      ...(rawProfile.cacheTtlHours === undefined
        ? {}
        : {
            cacheTtlHours: requireInteger(
              rawProfile.cacheTtlHours,
              `${path}.cacheTtlHours`,
              1,
              720,
            ),
          }),
      queries,
    } satisfies SourceScoutProfile;
  });

  return { version: 1, limits, blockedDomains, profiles };
}

export async function loadSourceScoutConfig(
  configPath = DEFAULT_CONFIG_PATH,
): Promise<SourceScoutConfig> {
  const raw = await readFile(configPath, "utf8");
  return validateConfig(JSON.parse(raw));
}

function queryCredits(depth: TavilySearchDepth): number {
  return depth === "advanced" ? 2 : 1;
}

function renderQuery(template: string, now: Date): string {
  const month = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    month: "long",
  }).format(now);
  const year = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    year: "numeric",
  }).format(now);
  const today = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
  return template
    .replaceAll("{month}", month)
    .replaceAll("{year}", year)
    .replaceAll("{today}", today);
}

function cacheKeyFor(
  profile: SourceScoutProfile,
  query: SourceScoutQuery,
  queryText: string,
  maxResults: number,
): string {
  return createHash("sha256")
    .update(
      JSON.stringify({
        profileId: profile.id,
        queryId: query.id,
        queryText,
        allowedDomains: [...query.allowedDomains].sort(),
        searchDepth: profile.searchDepth,
        maxResults,
      }),
    )
    .digest("hex");
}

function normalizeHost(host: string): string {
  return host
    .toLowerCase()
    .replace(/^www\./, "")
    .replace(/\.$/, "");
}

function sourceDomain(url: string): string | null {
  try {
    return normalizeHost(new URL(url).hostname);
  } catch {
    return null;
  }
}

function domainMatches(host: string, domain: string): boolean {
  const normalized = normalizeHost(domain);
  return host === normalized || host.endsWith(`.${normalized}`);
}

function isBlockedSource(
  url: string,
  blockedDomains: readonly string[],
): boolean {
  const host = sourceDomain(url);
  return !host || blockedDomains.some((domain) => domainMatches(host, domain));
}

function toScoutCandidates(
  candidates: readonly PersistedScoutCandidate[],
  context: {
    profile: SourceScoutProfile;
    query: SourceScoutQuery;
    queryText: string;
    observedAt: string;
    blockedDomains: readonly string[];
  },
): ScoutCandidate[] {
  const seen = new Set<string>();
  const out: ScoutCandidate[] = [];
  for (const candidate of candidates) {
    if (
      seen.has(candidate.url) ||
      isBlockedSource(candidate.url, context.blockedDomains)
    ) {
      continue;
    }
    const host = sourceDomain(candidate.url);
    if (!host) continue;
    seen.add(candidate.url);
    out.push({
      url: candidate.url,
      title: candidate.title,
      score: candidate.score,
      reviewState: "candidate",
      originalSourceUrl: candidate.url,
      sourceDomain: host,
      observedAt: context.observedAt,
      profileId: context.profile.id,
      queryId: context.query.id,
      queryText: context.queryText,
      reviewFor: [...context.query.reviewFor],
    });
  }
  return out;
}

function withoutContent(
  result: TavilyCandidateSearchResult | PersistedScoutSearchResult,
): PersistedScoutSearchResult {
  return {
    query: result.query,
    candidates: result.candidates.map((candidate) => ({
      url: candidate.url,
      title: candidate.title,
      score: candidate.score,
    })),
    requestId: result.requestId,
    responseTime: result.responseTime,
    credits: result.credits,
  };
}

async function readCache(cachePath: string): Promise<SourceScoutCache> {
  try {
    const parsed = JSON.parse(await readFile(cachePath, "utf8")) as unknown;
    if (
      isObject(parsed) &&
      parsed.schemaVersion === 1 &&
      parsed.reviewOnly === true &&
      isObject(parsed.entries)
    ) {
      const cache = parsed as SourceScoutCache;
      for (const entry of Object.values(cache.entries)) {
        entry.result = withoutContent(entry.result);
      }
      return cache;
    }
  } catch {
    // A missing or invalid cache is a clean cache miss, never a reason to
    // publish stale or partially parsed data.
  }
  return { schemaVersion: 1, reviewOnly: true, entries: {} };
}

async function writeJsonAtomic(path: string, value: unknown): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  const temporary = `${path}.tmp-${process.pid}`;
  await writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, "utf8");
  await rename(temporary, path);
}

function emptyUsageLedger(generatedAt: string): SourceScoutUsageLedger {
  return {
    schemaVersion: 1,
    timezone: "UTC",
    updatedAt: generatedAt,
    days: {},
    months: {},
  };
}

function isUsageBucket(value: unknown): value is UsageBucket {
  return (
    isObject(value) &&
    Number.isInteger(value.attemptedRequests) &&
    Number(value.attemptedRequests) >= 0 &&
    Number.isInteger(value.attemptedCredits) &&
    Number(value.attemptedCredits) >= 0
  );
}

function isUsageBucketMap(
  value: unknown,
): value is Record<string, UsageBucket> {
  return (
    isObject(value) &&
    Object.values(value).every((bucket) => isUsageBucket(bucket))
  );
}

async function readUsageLedger(
  usagePath: string,
  generatedAt: string,
): Promise<SourceScoutUsageLedger> {
  try {
    const parsed = JSON.parse(await readFile(usagePath, "utf8")) as unknown;
    if (
      isObject(parsed) &&
      parsed.schemaVersion === 1 &&
      parsed.timezone === "UTC" &&
      typeof parsed.updatedAt === "string" &&
      isUsageBucketMap(parsed.days) &&
      isUsageBucketMap(parsed.months)
    ) {
      return parsed as SourceScoutUsageLedger;
    }
    throw new Error("invalid schema");
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") {
      return emptyUsageLedger(generatedAt);
    }
    throw new Error(
      `Source Scout usage ledger is invalid at ${usagePath}; no API calls were made.`,
      { cause: error },
    );
  }
}

function usageBucket(
  buckets: Record<string, UsageBucket>,
  key: string,
): UsageBucket {
  return buckets[key] ?? { attemptedRequests: 0, attemptedCredits: 0 };
}

async function acquireRunLock(
  lockPath: string,
  now: Date,
  staleMinutes: number,
): Promise<() => Promise<void>> {
  await mkdir(dirname(lockPath), { recursive: true });
  const ownerToken = randomUUID();

  const createLock = async (): Promise<boolean> => {
    let handle;
    let created = false;
    try {
      handle = await open(lockPath, "wx");
      created = true;
      await handle.writeFile(
        `${JSON.stringify({
          schemaVersion: 1,
          ownerToken,
          pid: process.pid,
          createdAt: now.toISOString(),
          expiresAt: new Date(
            now.getTime() + staleMinutes * 60 * 1000,
          ).toISOString(),
        })}\n`,
        "utf8",
      );
      return true;
    } catch (error) {
      if (
        error instanceof Error &&
        "code" in error &&
        error.code === "EEXIST"
      ) {
        return false;
      }
      if (created) {
        await unlink(lockPath).catch(() => undefined);
      }
      throw error;
    } finally {
      await handle?.close();
    }
  };

  if (!(await createLock())) {
    let stale = false;
    try {
      const parsed = JSON.parse(await readFile(lockPath, "utf8")) as unknown;
      stale =
        isObject(parsed) &&
        typeof parsed.expiresAt === "string" &&
        Date.parse(parsed.expiresAt) <= now.getTime();
    } catch {
      try {
        const details = await stat(lockPath);
        stale = details.mtimeMs <= now.getTime() - staleMinutes * 60 * 1000;
      } catch {
        stale = true;
      }
    }

    if (!stale) {
      throw new Error(
        `Another Source Scout live run holds ${lockPath}. No API calls were made.`,
      );
    }
    await unlink(lockPath).catch((error: unknown) => {
      if (!(
        error instanceof Error &&
        "code" in error &&
        error.code === "ENOENT"
      )) {
        throw error;
      }
    });
    if (!(await createLock())) {
      throw new Error(
        `Another Source Scout live run acquired ${lockPath}. No API calls were made.`,
      );
    }
  }

  return async () => {
    try {
      const parsed = JSON.parse(await readFile(lockPath, "utf8")) as unknown;
      if (!isObject(parsed) || parsed.ownerToken !== ownerToken) {
        return;
      }
    } catch (error) {
      if (
        error instanceof Error &&
        "code" in error &&
        error.code === "ENOENT"
      ) {
        return;
      }
      throw error;
    }
    await unlink(lockPath).catch((error: unknown) => {
      if (!(
        error instanceof Error &&
        "code" in error &&
        error.code === "ENOENT"
      )) {
        throw error;
      }
    });
  };
}

function plannedRun(
  profile: SourceScoutProfile,
  query: SourceScoutQuery,
  queryText: string,
): SourceScoutQueryRun {
  return {
    profileId: profile.id,
    profileLabel: profile.label,
    profilePurpose: profile.purpose,
    queryId: query.id,
    queryText,
    allowedDomains: [...query.allowedDomains],
    domainControl:
      query.allowedDomains.length > 0 ? "allowlist" : "open-review",
    reviewFor: [...query.reviewFor],
    status: "planned",
    estimatedCredits: queryCredits(profile.searchDepth),
    requestId: null,
    responseTime: null,
    apiReportedCredits: null,
    candidates: [],
    error: null,
  };
}

function safeError(error: unknown): NonNullable<SourceScoutQueryRun["error"]> {
  if (error instanceof TavilySearchError) {
    return {
      code: error.code,
      message: error.message,
      status: error.status,
      retryAfter: error.retryAfter,
      requestId: error.requestId,
    };
  }
  return {
    code: "unexpected_error",
    message: "Unexpected source scout search failure.",
    status: null,
    retryAfter: null,
    requestId: null,
  };
}

function isTerminalApiError(error: SourceScoutQueryRun["error"]): boolean {
  return Boolean(
    error &&
    [
      "configuration",
      "unauthorized",
      "rate_limited",
      "plan_limit_exceeded",
      "payg_limit_exceeded",
    ].includes(error.code),
  );
}

export function sourceScoutReportHasSuccessfulRetrieval(
  report: SourceScoutReport,
): boolean {
  const hasTerminalError = report.queries.some(({ error }) =>
    isTerminalApiError(error),
  );
  return (
    !hasTerminalError && report.summary.fetched + report.summary.cached > 0
  );
}

export async function runSourceScout(
  options: RunSourceScoutOptions = {},
  dependencies: RunSourceScoutDependencies = {},
): Promise<RunSourceScoutResult> {
  const configPath = resolve(options.configPath ?? DEFAULT_CONFIG_PATH);
  const reportsDir = resolve(options.reportsDir ?? DEFAULT_REPORTS_DIR);
  const reportPath = resolve(reportsDir, REPORT_NAME);
  const cachePath = resolve(reportsDir, CACHE_NAME);
  const usagePath = resolve(reportsDir, USAGE_NAME);
  const lockPath = resolve(reportsDir, LOCK_NAME);
  const now = dependencies.now?.() ?? new Date();
  const generatedAt = now.toISOString();
  const dailyKey = generatedAt.slice(0, 10);
  const monthlyKey = generatedAt.slice(0, 7);
  const config = await loadSourceScoutConfig(configPath);
  const live = options.live === true;

  if (live && options.confirmed !== true) {
    throw new Error(
      "Live Source Scout runs require both --live and --confirm.",
    );
  }

  let profiles = config.profiles.filter((profile) => profile.enabled);
  if (options.profileId) {
    profiles = profiles.filter((profile) => profile.id === options.profileId);
    if (profiles.length === 0) {
      throw new Error(
        `Unknown or disabled Source Scout profile: ${options.profileId}.`,
      );
    }
  }

  const planned = profiles.flatMap((profile) =>
    profile.queries.slice(0, profile.maxQueriesPerRun).map((query) => ({
      profile,
      query,
      queryText: renderQuery(query.text, now),
    })),
  );
  const report: SourceScoutReport = {
    schemaVersion: 1,
    reviewOnly: true,
    noPublicWrites: true,
    generatedAt,
    mode: live ? "live" : "plan",
    selectedProfile: options.profileId ?? null,
    configPath,
    outputPolicy:
      "Candidate URLs for human review only. No result changes src/data or a public route.",
    budget: {
      maxRequests: config.limits.maxRequestsPerRun,
      maxCredits: config.limits.maxCreditsPerRun,
      plannedQueries: planned.length,
      requestsMade: 0,
      creditsCommitted: 0,
      creditsReportedByApi: 0,
      cacheHits: 0,
      usageTimezone: "UTC",
      dailyKey,
      monthlyKey,
      maxAttemptedCreditsPerDay: config.limits.maxAttemptedCreditsPerDay,
      maxAttemptedCreditsPerMonth: config.limits.maxAttemptedCreditsPerMonth,
      dailyAttemptedCreditsBefore: null,
      dailyAttemptedCreditsAfter: null,
      monthlyAttemptedCreditsBefore: null,
      monthlyAttemptedCreditsAfter: null,
    },
    summary: {
      fetched: 0,
      cached: 0,
      errors: 0,
      skipped: 0,
      candidates: 0,
    },
    queries: planned.map(({ profile, query, queryText }) =>
      plannedRun(profile, query, queryText),
    ),
  };

  if (!live) {
    return {
      report,
      reportPath,
      cachePath,
      usagePath,
      lockPath,
      wroteFiles: false,
    };
  }

  const releaseLock = await acquireRunLock(
    lockPath,
    now,
    config.limits.lockStaleMinutes,
  );
  try {
    const cache = await readCache(cachePath);
    const ledger = await readUsageLedger(usagePath, generatedAt);
    const dayBefore = usageBucket(ledger.days, dailyKey);
    const monthBefore = usageBucket(ledger.months, monthlyKey);
    report.budget.dailyAttemptedCreditsBefore = dayBefore.attemptedCredits;
    report.budget.dailyAttemptedCreditsAfter = dayBefore.attemptedCredits;
    report.budget.monthlyAttemptedCreditsBefore = monthBefore.attemptedCredits;
    report.budget.monthlyAttemptedCreditsAfter = monthBefore.attemptedCredits;

    const search = dependencies.search ?? searchTavilyCandidates;
    let terminalApiFailure = false;

    for (let index = 0; index < planned.length; index += 1) {
      const { profile, query, queryText } = planned[index]!;
      const queryRun = report.queries[index]!;
      const estimatedCredits = queryCredits(profile.searchDepth);
      const cacheKey = cacheKeyFor(
        profile,
        query,
        queryText,
        config.limits.maxResultsPerQuery,
      );
      const cached = cache.entries[cacheKey];
      if (cached && Date.parse(cached.expiresAt) > now.getTime()) {
        queryRun.status = "cache";
        queryRun.requestId = cached.result.requestId;
        queryRun.responseTime = cached.result.responseTime;
        queryRun.apiReportedCredits = cached.result.credits;
        queryRun.candidates = toScoutCandidates(cached.result.candidates, {
          profile,
          query,
          queryText,
          observedAt: cached.fetchedAt,
          blockedDomains: config.blockedDomains,
        });
        report.budget.cacheHits += 1;
        report.summary.cached += 1;
        report.summary.candidates += queryRun.candidates.length;
        continue;
      }

      if (terminalApiFailure) {
        queryRun.status = "skipped-terminal-error";
        report.summary.skipped += 1;
        continue;
      }

      const dayUsage = usageBucket(ledger.days, dailyKey);
      const monthUsage = usageBucket(ledger.months, monthlyKey);
      if (
        report.budget.requestsMade + 1 > config.limits.maxRequestsPerRun ||
        report.budget.creditsCommitted + estimatedCredits >
          config.limits.maxCreditsPerRun ||
        dayUsage.attemptedCredits + estimatedCredits >
          config.limits.maxAttemptedCreditsPerDay ||
        monthUsage.attemptedCredits + estimatedCredits >
          config.limits.maxAttemptedCreditsPerMonth
      ) {
        queryRun.status = "skipped-budget";
        report.summary.skipped += 1;
        continue;
      }

      // Reserve both the per-run and persistent attempted-credit budgets
      // before the network call. A failed request remains reserved.
      report.budget.requestsMade += 1;
      report.budget.creditsCommitted += estimatedCredits;
      ledger.days[dailyKey] = {
        attemptedRequests: dayUsage.attemptedRequests + 1,
        attemptedCredits: dayUsage.attemptedCredits + estimatedCredits,
      };
      ledger.months[monthlyKey] = {
        attemptedRequests: monthUsage.attemptedRequests + 1,
        attemptedCredits: monthUsage.attemptedCredits + estimatedCredits,
      };
      ledger.updatedAt = generatedAt;
      report.budget.dailyAttemptedCreditsAfter =
        ledger.days[dailyKey].attemptedCredits;
      report.budget.monthlyAttemptedCreditsAfter =
        ledger.months[monthlyKey].attemptedCredits;
      await writeJsonAtomic(usagePath, ledger);

      try {
        const result = await search(queryText, {
          allowedDomains:
            query.allowedDomains.length > 0 ? query.allowedDomains : undefined,
          searchDepth: profile.searchDepth,
          maxResults: config.limits.maxResultsPerQuery,
          timeoutMs: config.limits.requestTimeoutMs,
        });
        const candidates = toScoutCandidates(result.candidates, {
          profile,
          query,
          queryText,
          observedAt: generatedAt,
          blockedDomains: config.blockedDomains,
        });
        queryRun.status = "fetched";
        queryRun.requestId = result.requestId;
        queryRun.responseTime = result.responseTime;
        queryRun.apiReportedCredits = result.credits;
        queryRun.candidates = candidates;
        report.summary.fetched += 1;
        report.summary.candidates += candidates.length;
        if (result.credits !== null) {
          report.budget.creditsReportedByApi += result.credits;
        }

        const ttlHours =
          profile.cacheTtlHours ?? config.limits.defaultCacheTtlHours;
        cache.entries[cacheKey] = {
          cacheKey,
          fetchedAt: generatedAt,
          expiresAt: new Date(
            now.getTime() + ttlHours * 60 * 60 * 1000,
          ).toISOString(),
          result: withoutContent(result),
        };
      } catch (error) {
        const queryError = safeError(error);
        queryRun.status = "error";
        queryRun.error = queryError;
        queryRun.requestId = queryError.requestId;
        report.summary.errors += 1;
        terminalApiFailure = isTerminalApiError(queryError);
      }
    }

    await writeJsonAtomic(cachePath, cache);
    await writeJsonAtomic(reportPath, report);
    return {
      report,
      reportPath,
      cachePath,
      usagePath,
      lockPath,
      wroteFiles: true,
    };
  } finally {
    await releaseLock();
  }
}

export function parseSourceScoutCliArgs(
  args: readonly string[],
): SourceScoutCliArgs {
  const inlineProfiles = args
    .filter((argument) => argument.startsWith("--profile="))
    .map((argument) => argument.slice("--profile=".length));
  const profileIndexes = args.flatMap((argument, index) =>
    argument === "--profile" ? [index] : [],
  );
  if (profileIndexes.length + inlineProfiles.length > 1) {
    throw new Error("--profile may be provided only once.");
  }

  if (inlineProfiles.length === 1) {
    const profileId = inlineProfiles[0];
    if (!profileId) {
      throw new Error("--profile requires a profile id.");
    }
    return {
      live: args.includes("--live"),
      confirmed: args.includes("--confirm"),
      profileId,
    };
  }

  const profileIndex = profileIndexes[0];
  if (profileIndex === undefined) {
    return {
      live: args.includes("--live"),
      confirmed: args.includes("--confirm"),
    };
  }

  const profileId = args[profileIndex + 1];
  if (!profileId || profileId.startsWith("--")) {
    throw new Error("--profile requires a profile id.");
  }
  return {
    live: args.includes("--live"),
    confirmed: args.includes("--confirm"),
    profileId,
  };
}

async function main(): Promise<void> {
  const { live, confirmed, profileId } = parseSourceScoutCliArgs(
    process.argv.slice(2),
  );
  if (live) {
    const { config: loadEnvironment } = await import("dotenv");
    loadEnvironment({ path: resolve(".env.local"), quiet: true });
  }
  if (live && !process.env.TAVILY_API_KEY) {
    throw new Error("TAVILY_API_KEY is required for a live Source Scout run.");
  }
  const result = await runSourceScout({ live, confirmed, profileId });
  const { report } = result;
  console.log(
    `Source Scout ${report.mode}: ${report.budget.plannedQueries} planned, ` +
      `${report.budget.requestsMade}/${report.budget.maxRequests} requests, ` +
      `${report.budget.creditsCommitted}/${report.budget.maxCredits} credits committed.`,
  );
  if (!live) {
    console.log("Plan only. No API requests or files were written.");
    console.log(
      "Use --live --confirm after reviewing config/source-scout.json.",
    );
    return;
  }
  console.log(
    `${report.summary.candidates} review candidate(s); ` +
      `${report.summary.errors} error(s); ${report.summary.skipped} skipped.`,
  );
  console.log(`Review report: ${result.reportPath}`);
  console.log("No public app data was changed.");
  if (!sourceScoutReportHasSuccessfulRetrieval(report)) {
    throw new Error(
      "Source Scout did not complete a usable provider retrieval. Review the uploaded report for authentication, plan, rate-limit, or budget errors.",
    );
  }
}

const isEntrypoint =
  process.argv[1] !== undefined &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isEntrypoint) {
  main().catch((error: unknown) => {
    const message =
      error instanceof Error ? error.message : "Source Scout failed.";
    console.error(message);
    process.exitCode = 1;
  });
}
