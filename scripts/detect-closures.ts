/**
 * detect-closures.ts — review-only closure detector using Tavily Search.
 *
 * Why: a local guide loses trust the moment it lists a place that has closed
 * (see the Idiom Brewing example). The paid path (refresh:business-status)
 * costs a Google Place Details call per place; this is the lower-cost
 * complement — a web search per place that reads the open web (the business's
 * own site, the Frederick News-Post, MoCo Show, MapQuest, etc.) for closure
 * language and produces a REVIEW-READY candidate list. It maps straight onto
 * KNOWN_CLOSED_CANONICAL in src/lib/integrations/closures.ts (name + source
 * URL + date + quote).
 *
 * DRY RUN BY DESIGN. This script NEVER writes to places, overrides, or the
 * closures denylist. It writes only a candidate report you skim; you then add
 * confirmed closures to KNOWN_CLOSED_CANONICAL by hand. Human corrections win
 * (CLAUDE.md).
 *
 * BUDGET. Web-search credits are finite. The full PLACES
 * catalog is ~2450 (seed/manual/fc-gis curated + the dfp/discovered long
 * tail), so a full sweep would blow the budget AND is noisy (the long tail is
 * realtors, agents, and LLCs whose pages say "closed 400 transactions" or
 * carry directory chrome). Therefore the DEFAULT is the ~100 curated editorial
 * places only. The long tail is opt-in via --all --confirm-all. Ordinary runs
 * are plans and make zero provider calls even when a key exists. A paid run
 * requires both --live and --confirm, then observes immutable 10-credit run,
 * 20-credit UTC-day, and 100-credit UTC-month ceilings. Failed attempts count.
 *
 * CACHING. Every raw response is cached to scripts/reports/closure-raw.json.
 * Re-run with --rescore to re-evaluate the heuristics against the cache with
 * ZERO API calls. Cached places are searched again only with --refresh.
 *
 * Setup: put your key in .env.local (gitignored):
 *   TAVILY_API_KEY=tvly-...
 *
 * Usage:
 *   npm run closures:detect                    # zero-cost curated plan
 *   npm run closures:detect -- --live --confirm --limit 5
 *   npm run closures:detect -- --live --confirm --slug some-slug
 *   npm run closures:detect -- --live --confirm --refresh --limit 5
 *   npm run closures:detect -- --rescore       # re-score cache, no API calls
 *   npm run closures:detect -- --all --confirm-all # zero-cost long-tail plan
 *   npm run closures:detect -- --min medium    # report medium+ only
 *
 * Output: scripts/reports/closure-candidates.json (+ closure-raw.json cache),
 * both gitignored, plus a console summary sorted by confidence.
 */
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { PLACES } from "@/data/places";
import { isKnownClosed } from "@/lib/integrations/closures";
import {
  searchTavilyCandidates,
  TavilySearchError,
} from "./lib/tavily-search";
import {
  acquireExclusiveLock,
  readUsageLedger,
  reserveUsage,
  type UsageLedger,
  usageBucket,
  usageBudgetDecision,
  type UsageBudgetDecision,
  writeJsonAtomic,
} from "./lib/persistent-usage-budget";

const ANYSEARCH_ENDPOINT = "https://api.anysearch.com/mcp";
const REPORT_DIR = resolve("scripts/reports");

// ── CLI args ────────────────────────────────────────────────────────────────
export const MAX_CLOSURE_REQUESTS_PER_RUN = 10;
export const MAX_CLOSURE_CREDITS_PER_RUN = 10;
export const MAX_CLOSURE_ATTEMPTED_CREDITS_PER_DAY = 20;
export const MAX_CLOSURE_ATTEMPTED_CREDITS_PER_MONTH = 100;
export const CLOSURE_SEARCH_TIMEOUT_MS = 20_000;

export type ClosureDetectorPaths = {
  reportsDir: string;
  rawPath: string;
  outPath: string;
  usagePath: string;
  lockPath: string;
};

function closureDetectorPaths(reportsDir = REPORT_DIR): ClosureDetectorPaths {
  const resolvedReportsDir = resolve(reportsDir);
  return {
    reportsDir: resolvedReportsDir,
    rawPath: resolve(resolvedReportsDir, "closure-raw.json"),
    outPath: resolve(resolvedReportsDir, "closure-candidates.json"),
    usagePath: resolve(resolvedReportsDir, "closure-usage.json"),
    lockPath: resolve(resolvedReportsDir, "closure-detector.lock"),
  };
}

function readRawCache(path: string): Record<string, string> {
  if (!existsSync(path)) return {};
  try {
    const parsed = JSON.parse(readFileSync(path, "utf8")) as unknown;
    if (
      parsed &&
      typeof parsed === "object" &&
      !Array.isArray(parsed) &&
      Object.values(parsed).every((value) => typeof value === "string")
    ) {
      return parsed as Record<string, string>;
    }
    throw new Error("invalid schema");
  } catch (error) {
    throw new Error(
      `Closure detector raw cache is invalid at ${path}; no API calls were made.`,
      { cause: error },
    );
  }
}

export type ClosureDetectorCliOptions = {
  onlySlug?: string;
  limit?: number;
  live: boolean;
  confirmed: boolean;
  refreshCache: boolean;
  includeLongTail: boolean;
  confirmedLongTail: boolean;
  rescore: boolean;
  minConfidence: "low" | "medium" | "high";
};

function singleFlagValue(
  args: readonly string[],
  name: string,
): string | undefined {
  const flag = `--${name}`;
  const indexes = args.flatMap((argument, index) =>
    argument === flag ? [index] : [],
  );
  if (indexes.length > 1) {
    throw new Error(`${flag} may be provided only once.`);
  }
  const index = indexes[0];
  if (index === undefined) return undefined;
  const value = args[index + 1];
  if (!value || value.startsWith("--")) {
    throw new Error(`${flag} requires a value.`);
  }
  return value;
}

export function parseClosureDetectorArgs(
  args: readonly string[],
): ClosureDetectorCliOptions {
  const limitValue = singleFlagValue(args, "limit");
  let limit: number | undefined;
  if (limitValue !== undefined) {
    if (!/^[1-9]\d*$/.test(limitValue)) {
      throw new Error("--limit must be a positive whole number.");
    }
    limit = Number(limitValue);
    if (
      !Number.isSafeInteger(limit) ||
      limit > MAX_CLOSURE_REQUESTS_PER_RUN
    ) {
      throw new Error(
        `--limit cannot exceed the immutable ${MAX_CLOSURE_REQUESTS_PER_RUN}-request run ceiling.`,
      );
    }
  }

  const minValue = singleFlagValue(args, "min") ?? "low";
  if (!["low", "medium", "high"].includes(minValue)) {
    throw new Error("--min must be low, medium, or high.");
  }
  const onlySlug = singleFlagValue(args, "slug");
  const live = args.includes("--live");
  const confirmed = args.includes("--confirm");
  const refreshCache = args.includes("--refresh");
  const includeLongTail = args.includes("--all");
  const confirmedLongTail = args.includes("--confirm-all");
  if (includeLongTail && !confirmedLongTail) {
    throw new Error(
      "--all requires --confirm-all. The immutable run ceiling still applies.",
    );
  }
  if (!includeLongTail && confirmedLongTail) {
    throw new Error("--confirm-all is valid only with --all.");
  }
  if (live && !confirmed) {
    throw new Error(
      "Live closure detection requires both --live and --confirm.",
    );
  }
  if (!live && confirmed) {
    throw new Error("--confirm is valid only with --live.");
  }
  const rescore = args.includes("--rescore");
  if (rescore && (live || confirmed)) {
    throw new Error("--rescore is zero-cost and cannot be combined with --live.");
  }
  if (rescore && refreshCache) {
    throw new Error("--rescore cannot be combined with --refresh.");
  }

  return {
    ...(onlySlug ? { onlySlug } : {}),
    ...(limit === undefined ? {} : { limit }),
    live,
    confirmed,
    refreshCache,
    includeLongTail,
    confirmedLongTail,
    rescore,
    minConfidence: minValue as ClosureDetectorCliOptions["minConfidence"],
  };
}
const CONF_RANK = { low: 0, medium: 1, high: 2 } as const;

// Sources that make up the curated editorial catalog (everything that isn't
// the dfp / discovered long tail).
const CURATED = new Set(["seed", "manual", "fc-gis", "arcgis", "yelp", "google"]);

// Hosts that report closures reliably enough to trust a single hit.
const TRUSTED =
  /(mapquest|menupix|mocoshow|fredericknewspost|guidestar|yelp|tripadvisor|sirved|restaurantji)\.com/i;

// ── Closure language ────────────────────────────────────────────────────────
// HIGH: only appears when a business has actually, permanently closed.
const HIGH: RegExp[] = [
  /permanently closed/i,
  /closed permanently/i,
  /closed (its|their) doors for good/i,
  /closed for good/i,
  /out of business/i,
  /ceased operations/i,
  /no longer in business/i,
  /final day of (operation|business)/i,
  /has shut down/i,
  /reported as (permanently )?closed/i,
];
// SOFT: an announced future closure. Narrow on purpose (bare "will close" is
// hours; bare "have closed" is realtor transactions).
const SOFT: RegExp[] = [
  /will permanently close/i,
  /announced (it|they|its|the) .{0,30}(will |would )?(permanently )?clos/i,
  /(is|are) closing (its|their) doors/i,
  /will close (its|their) doors/i,
  /set to (permanently )?close/i,
];
const TEMP: RegExp[] = [/temporarily closed/i, /closed (for|due to) (renovation|repairs)/i];

// Strip benign / misleading "close(d)" before matching.
function scrub(text: string): string {
  return (
    text
      // real-estate / mortgage / title "closed" (transaction sense)
      .replace(/(have|has|had|they've|we've|i've)\s+closed\s+(over |more than )?\d[\d,]*/gi, " ")
      .replace(/closed\s+(over |more than )?\d[\d,]*\s+(transactions|deals|loans|homes|properties|sales)/gi, " ")
      .replace(/closed\s+(on\s+|with\s+)?(our|their|your|my|his|her)\s+(home|loan|house|deal|property)/gi, " ")
      .replace(/closed\s+thousands/gi, " ")
      .replace(/(have|has)\s+closed\s+with/gi, " ")
      // hours: "will close at 5:00 p.m." / "closes at noon" / "close by 9"
      .replace(/(will\s+|to\s+)?closes?\s+(at|by)\s+(\d{1,2}(:\d{2})?\s*(a\.?m\.?|p\.?m\.?)?|noon|midnight)/gi, " ")
      // benign day/season/holiday hours
      .replace(/closed\s+(on\s+)?(mon|tue|wed|thu|fri|sat|sun|today|now)\b/gi, " ")
      .replace(/closed\s+for\s+(lunch|the day|the holiday|the season|the night|the winter)/gi, " ")
      // directory UI boilerplate
      .replace(/mark the business as closed[^.]*/gi, " ")
      // the "Temporarily closed  Permanently closed" LABEL PAIR (chrome, not status)
      .replace(/temporarily\s+closed\s+permanently\s+closed/gi, " ")
      .replace(/permanently\s+closed\s+temporarily\s+closed/gi, " ")
  );
}

type Hit = { host: string; url: string; phrase: string; snippet: string; strength: "high" | "soft" | "temp" };
type Candidate = {
  slug: string;
  name: string;
  town: string;
  status: "closed_permanently" | "closed_temporarily";
  confidence: "low" | "medium" | "high";
  ownSiteConfirms: boolean;
  hits: Hit[];
};

function host(u: string): string {
  try {
    return new URL(u).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
}
function titleCase(s: string): string {
  return s.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}
function snippetAround(text: string, re: RegExp): string {
  const m = text.match(re);
  if (!m || m.index == null) return "";
  return text
    .slice(Math.max(0, m.index - 90), Math.min(text.length, m.index + m[0].length + 90))
    .replace(/\s+/g, " ")
    .trim();
}

// Preserve the legacy cache shape so old runs still rescore with zero calls.
function parseResults(text: string): Array<{ url: string; content: string }> {
  const out: Array<{ url: string; content: string }> = [];
  for (const block of text.split(/\n(?=###\s*\d+\.)/)) {
    const urlM = block.match(/- \*\*URL\*\*:\s*(\S+)/);
    if (!urlM) continue;
    const after = block.slice(block.indexOf(urlM[0]) + urlM[0].length);
    out.push({ url: urlM[1], content: after.replace(/^\s*-?\s*/, "").trim() });
  }
  return out;
}

function tavilyResultsAsLegacyMarkdown(
  results: Array<{ url: string; title: string; content: string }>,
): string {
  return results
    .map(
      (result, index) =>
        `### ${index + 1}. ${result.title.replace(/\s+/g, " ").trim()}\n` +
        `- **URL**: ${result.url}\n` +
        `- ${result.content.replace(/\s+/g, " ").trim()}`,
    )
    .join("\n");
}

function evaluate(
  place: { slug: string; name: string; town: string; siteHost: string },
  results: Array<{ url: string; content: string }>,
): Candidate | null {
  const hits: Hit[] = [];
  let ownSiteConfirms = false;
  const highHosts = new Set<string>();

  for (const r of results) {
    const h = host(r.url);
    const clean = scrub(r.content);
    const onOwnSite = !!place.siteHost && h === place.siteHost;

    for (const re of HIGH) {
      if (re.test(clean)) {
        hits.push({ host: h, url: r.url, phrase: re.source, snippet: snippetAround(clean, re), strength: "high" });
        highHosts.add(h);
        if (onOwnSite) ownSiteConfirms = true;
      }
    }
    for (const re of SOFT) {
      if (re.test(clean)) {
        hits.push({ host: h, url: r.url, phrase: re.source, snippet: snippetAround(clean, re), strength: "soft" });
        if (onOwnSite || TRUSTED.test(h)) highHosts.add(h);
      }
    }
    for (const re of TEMP) {
      if (re.test(clean)) {
        hits.push({ host: h, url: r.url, phrase: re.source, snippet: snippetAround(clean, re), strength: "temp" });
      }
    }
  }

  const permHits = hits.filter((x) => x.strength === "high" || x.strength === "soft");
  if (permHits.length === 0) {
    if (hits.some((x) => x.strength === "temp")) {
      return {
        slug: place.slug,
        name: place.name,
        town: place.town,
        status: "closed_temporarily",
        confidence: "low",
        ownSiteConfirms: false,
        hits: hits.slice(0, 4),
      };
    }
    return null;
  }

  const trustedPerm = permHits.some((x) => x.strength === "high" && TRUSTED.test(x.host));
  let confidence: Candidate["confidence"];
  if (ownSiteConfirms || highHosts.size >= 2) confidence = "high";
  else if (permHits.some((x) => x.strength === "high") || trustedPerm) confidence = "medium";
  else confidence = "low"; // soft-only, single untrusted source

  return {
    slug: place.slug,
    name: place.name,
    town: place.town,
    status: "closed_permanently",
    confidence,
    ownSiteConfirms,
    hits: [...permHits, ...hits.filter((x) => x.strength === "temp")].slice(0, 5),
  };
}

class ClosureSearchProviderError extends Error {
  readonly status: number | null;
  readonly terminal: boolean;

  constructor(
    message: string,
    options: { status?: number | null; terminal?: boolean } = {},
  ) {
    super(message);
    this.name = "ClosureSearchProviderError";
    this.status = options.status ?? null;
    this.terminal = options.terminal === true;
  }
}

export function isTerminalClosureSearchError(error: unknown): boolean {
  if (error instanceof TavilySearchError) {
    if (
      [
        "configuration",
        "unauthorized",
        "rate_limited",
        "plan_limit_exceeded",
        "payg_limit_exceeded",
      ].includes(error.code) ||
      error.status === 402 ||
      error.status === 403
    ) {
      return true;
    }
  }
  if (error instanceof ClosureSearchProviderError) {
    return error.terminal;
  }
  const message =
    error instanceof Error ? error.message.toLowerCase() : "";
  return /(unauthori[sz]ed|forbidden|rate limit|billing|payment|plan limit|credit limit)/.test(
    message,
  );
}

export function canReserveClosureSearchAttempt(
  attemptedRequests: number,
  attemptedCredits: number,
  estimatedCredits = 1,
): boolean {
  return (
    attemptedRequests + 1 <= MAX_CLOSURE_REQUESTS_PER_RUN &&
    attemptedCredits + estimatedCredits <=
      MAX_CLOSURE_CREDITS_PER_RUN
  );
}

export function readClosureUsageLedger(
  usagePath: string,
  now = new Date(),
): UsageLedger {
  return readUsageLedger(usagePath, now, "Closure detector");
}

export function closureBudgetDecision(input: {
  runRequests: number;
  runCredits: number;
  dailyCredits: number;
  monthlyCredits: number;
  estimatedCredits?: number;
}): UsageBudgetDecision {
  return usageBudgetDecision(input, {
    runRequests: MAX_CLOSURE_REQUESTS_PER_RUN,
    runCredits: MAX_CLOSURE_CREDITS_PER_RUN,
    dailyCredits: MAX_CLOSURE_ATTEMPTED_CREDITS_PER_DAY,
    monthlyCredits: MAX_CLOSURE_ATTEMPTED_CREDITS_PER_MONTH,
  });
}

async function anysearch(query: string, apiKey: string): Promise<string> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), CLOSURE_SEARCH_TIMEOUT_MS);
  let res: Response;
  try {
    res = await fetch(ANYSEARCH_ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json, text/event-stream",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "tools/call",
        params: { name: "search", arguments: { query, max_results: 3 } },
      }),
      signal: controller.signal,
    });
  } catch {
    throw new ClosureSearchProviderError(
      controller.signal.aborted
        ? `AnySearch timed out after ${CLOSURE_SEARCH_TIMEOUT_MS}ms.`
        : "AnySearch failed before a response was received.",
    );
  } finally {
    clearTimeout(timeout);
  }
  if (!res.ok) {
    throw new ClosureSearchProviderError(`HTTP ${res.status}`, {
      status: res.status,
      terminal: [401, 402, 403, 429].includes(res.status),
    });
  }
  const data = (await res.json()) as {
    error?: { message: string };
    result?: { content?: Array<{ text?: string }> };
  };
  if (data.error) {
    const terminal =
      /(unauthori[sz]ed|forbidden|rate limit|billing|payment|plan limit|credit limit)/i.test(
        data.error.message,
      );
    throw new ClosureSearchProviderError(
      `AnySearch: ${data.error.message}`,
      { terminal },
    );
  }
  return data.result?.content?.[0]?.text ?? "";
}

async function searchWeb(
  query: string,
  env: Readonly<Record<string, string | undefined>>,
): Promise<ClosureSearchResponse> {
  const tavilyKey = env.TAVILY_API_KEY?.trim();
  if (tavilyKey) {
    const result = await searchTavilyCandidates(query, {
      apiKey: tavilyKey,
      maxResults: 3,
      searchDepth: "basic",
    });
    return {
      text: tavilyResultsAsLegacyMarkdown(result.candidates),
      reportedCredits: result.credits,
    };
  }
  const anysearchKey = env.ANYSEARCH_API_KEY?.trim();
  if (!anysearchKey) {
    throw new ClosureSearchProviderError(
      "TAVILY_API_KEY or legacy ANYSEARCH_API_KEY is required for a live run.",
      { terminal: true },
    );
  }
  return { text: await anysearch(query, anysearchKey), reportedCredits: null };
}

function targetsFor(options: ClosureDetectorCliOptions) {
  let t = PLACES.filter((p) => {
    if (p.is_operational === "closed_permanently" || p.is_operational === "closed_temporarily") return false;
    if (isKnownClosed(p.name)) return false;
    if (!options.includeLongTail && !options.onlySlug && !CURATED.has(p.source)) return false;
    return true;
  }).map((p) => ({
    slug: p.slug,
    name: p.name,
    town: titleCase(p.municipality),
    siteHost: p.website ? host(p.website) : "",
  }));
  if (options.onlySlug) t = t.filter((x) => x.slug === options.onlySlug);
  if (options.limit) t = t.slice(0, options.limit);
  return t;
}

function writeReport(
  candidates: Candidate[],
  attemptedRequests: number,
  attemptedCredits: number,
  checked: number,
  minConfidence: ClosureDetectorCliOptions["minConfidence"],
  context: {
    reportedCredits: number;
    cacheHits: number;
    provider: "Tavily" | "AnySearch" | "cache";
    generatedAt: string;
    paths: ClosureDetectorPaths;
  },
) {
  const rank = CONF_RANK[minConfidence] ?? 0;
  const report = candidates
    .filter((c) => CONF_RANK[c.confidence] >= rank)
    .sort((a, b) => CONF_RANK[b.confidence] - CONF_RANK[a.confidence]);
  writeJsonAtomic(context.paths.outPath, {
    generated_at: context.generatedAt,
    provider: context.provider,
    review_only: true,
    no_public_writes: true,
    api_calls: attemptedRequests,
    api_calls_attempted: attemptedRequests,
    credits_attempted: attemptedCredits,
    credits_reported_by_api: context.reportedCredits,
    cache_hits: context.cacheHits,
    immutable_request_ceiling: MAX_CLOSURE_REQUESTS_PER_RUN,
    immutable_credit_ceiling: MAX_CLOSURE_CREDITS_PER_RUN,
    immutable_daily_credit_ceiling:
      MAX_CLOSURE_ATTEMPTED_CREDITS_PER_DAY,
    immutable_monthly_credit_ceiling:
      MAX_CLOSURE_ATTEMPTED_CREDITS_PER_MONTH,
    usage_timezone: "UTC",
    usage_ledger: context.paths.usagePath,
    checked,
    candidate_count: report.length,
    note: "REVIEW ONLY. Verify each source before adding a confirmed closure to KNOWN_CLOSED_CANONICAL in src/lib/integrations/closures.ts.",
    candidates: report,
  });

  console.log(`\n─────────────────────────────────────────────`);
  console.log(`${context.provider} calls attempted: ${attemptedRequests}`);
  console.log(`Candidates (${minConfidence}+): ${report.length} of ${checked} checked`);
  console.log(`Cache hits: ${context.cacheHits}\n`);
  for (const c of report) {
    const badge = c.status === "closed_permanently" ? "CLOSED" : "TEMP  ";
    console.log(
      `  ${badge} [${c.confidence.padEnd(6)}] ${c.name} — ${c.town}${c.ownSiteConfirms ? " (own site confirms)" : ""}`,
    );
    const ev = c.hits.find((h) => h.strength !== "temp") ?? c.hits[0];
    if (ev) console.log(`         ${ev.host}: "${ev.snippet.slice(0, 100)}${ev.snippet.length > 100 ? "…" : ""}"`);
  }
  console.log(`\nFull report: ${context.paths.outPath}`);
  console.log(`Next: verify each, then add confirmed ones to KNOWN_CLOSED_CANONICAL (src/lib/integrations/closures.ts).`);
}

type ClosureSearchResponse = {
  text: string;
  reportedCredits: number | null;
};

type ClosureSearchFunction = (
  query: string,
) => Promise<string | ClosureSearchResponse>;

export type RunClosureDetectorOptions = ClosureDetectorCliOptions & {
  reportsDir?: string;
};

export type RunClosureDetectorDependencies = {
  env?: Readonly<Record<string, string | undefined>>;
  now?: () => Date;
  search?: ClosureSearchFunction;
  sleep?: (milliseconds: number) => Promise<void>;
};

export type RunClosureDetectorResult = {
  mode: "plan" | "rescore" | "live";
  wroteFiles: boolean;
  cacheHits: number;
  attemptedRequests: number;
};

export async function runClosureDetector(
  options: RunClosureDetectorOptions,
  dependencies: RunClosureDetectorDependencies = {},
): Promise<RunClosureDetectorResult> {
  if (options.live && !options.confirmed) {
    throw new Error(
      "Live closure detection requires both --live and --confirm.",
    );
  }
  if (!options.live && options.confirmed) {
    throw new Error("--confirm is valid only with --live.");
  }
  if (options.includeLongTail && !options.confirmedLongTail) {
    throw new Error("Long-tail closure detection requires --confirm-all.");
  }
  if (!options.includeLongTail && options.confirmedLongTail) {
    throw new Error("--confirm-all is valid only with --all.");
  }

  const paths = closureDetectorPaths(options.reportsDir);
  const clock = dependencies.now ?? (() => new Date());
  const startedAt = clock();
  const generatedAt = startedAt.toISOString();
  const dailyKey = generatedAt.slice(0, 10);
  const monthlyKey = generatedAt.slice(0, 7);
  const targets = targetsFor(options);

  if (options.rescore) {
    if (!existsSync(paths.rawPath)) {
      throw new Error(`No cache at ${paths.rawPath}. Complete an explicitly confirmed live fetch first.`);
    }
    const raw = readRawCache(paths.rawPath);
    const bySlug = new Map(PLACES.map((p) => [p.slug, p]));
    const candidates: Candidate[] = [];
    let checked = 0;
    for (const [slug, text] of Object.entries(raw)) {
      const p = bySlug.get(slug);
      if (!p) continue;
      checked++;
      const cand = evaluate(
        { slug: p.slug, name: p.name, town: titleCase(p.municipality), siteHost: p.website ? host(p.website) : "" },
        parseResults(text),
      );
      if (cand) candidates.push(cand);
    }
    console.log(`Re-scored ${checked} cached responses (0 API calls).`);
    writeReport(
      candidates,
      0,
      0,
      checked,
      options.minConfidence,
      { reportedCredits: 0, cacheHits: checked, provider: "cache", generatedAt, paths },
    );
    return {
      mode: "rescore",
      wroteFiles: true,
      cacheHits: checked,
      attemptedRequests: 0,
    };
  }

  if (targets.length === 0) {
    console.log(
      "No targets (check --slug, or everything is already flagged closed).",
    );
    return {
      mode: options.live ? "live" : "plan",
      wroteFiles: false,
      cacheHits: 0,
      attemptedRequests: 0,
    };
  }

  if (!options.live) {
    const raw = readRawCache(paths.rawPath);
    const ledger = readClosureUsageLedger(paths.usagePath, startedAt);
    const cachedTargets = options.refreshCache
      ? 0
      : targets.filter((target) => typeof raw[target.slug] === "string").length;
    const uncachedTargets = targets.length - cachedTargets;
    const dailyRemaining = Math.max(
      0,
      MAX_CLOSURE_ATTEMPTED_CREDITS_PER_DAY -
        usageBucket(ledger.days, dailyKey).attemptedCredits,
    );
    const monthlyRemaining = Math.max(
      0,
      MAX_CLOSURE_ATTEMPTED_CREDITS_PER_MONTH -
        usageBucket(ledger.months, monthlyKey).attemptedCredits,
    );
    const plannedRequests = Math.min(
      uncachedTargets,
      MAX_CLOSURE_REQUESTS_PER_RUN,
      MAX_CLOSURE_CREDITS_PER_RUN,
      dailyRemaining,
      monthlyRemaining,
    );
    const nextTargets = targets
      .filter(
        (target) =>
          options.refreshCache || typeof raw[target.slug] !== "string",
      )
      .slice(0, plannedRequests)
      .map((target) => target.name);
    console.log(
      `Closure detector plan: ${targets.length} eligible; ${cachedTargets} cached; ${uncachedTargets} to fetch.`,
    );
    console.log(
      `Next confirmed run: ${plannedRequests} request(s). Remaining UTC budget: ${dailyRemaining} today, ${monthlyRemaining} this month.`,
    );
    if (nextTargets.length > 0) console.log(`Next targets: ${nextTargets.join(", ")}`);
    console.log("Plan only. No provider request or file write occurred.");
    console.log(
      "Use --live --confirm after reviewing the target and tracked caps.",
    );
    return {
      mode: "plan",
      wroteFiles: false,
      cacheHits: cachedTargets,
      attemptedRequests: 0,
    };
  }

  const env = dependencies.env ?? process.env;
  const provider = env.TAVILY_API_KEY?.trim()
    ? "Tavily"
    : env.ANYSEARCH_API_KEY?.trim()
      ? "AnySearch"
      : null;
  if (!provider) {
    throw new Error(
      "TAVILY_API_KEY or legacy ANYSEARCH_API_KEY is required for an explicitly confirmed live run.",
    );
  }

  if (options.includeLongTail) {
    console.warn(
      `\n⚠  --all confirmed: ${targets.length} places are eligible, but this run will stop at ` +
        `${MAX_CLOSURE_REQUESTS_PER_RUN} requests / ${MAX_CLOSURE_CREDITS_PER_RUN} credits.\n`,
    );
  }
  console.log(
    `Checking ${targets.length} place(s) via ${provider}. ` +
      `At most ${MAX_CLOSURE_REQUESTS_PER_RUN} uncached requests can be attempted.\n`,
  );

  const releaseLock = acquireExclusiveLock(
    paths.lockPath,
    startedAt,
    "closure-detector",
  );
  try {
    const raw = readRawCache(paths.rawPath);
    const ledger = readClosureUsageLedger(paths.usagePath, startedAt);
    const candidates: Candidate[] = [];
    let attemptedRequests = 0;
    let attemptedCredits = 0;
    let reportedCredits = 0;
    let checked = 0;
    let cacheHits = 0;
    const search =
      dependencies.search ?? ((query: string) => searchWeb(query, env));
    const sleep =
      dependencies.sleep ??
      ((milliseconds: number) =>
        new Promise<void>((resolvePromise) =>
          setTimeout(resolvePromise, milliseconds),
        ));

    for (let index = 0; index < targets.length; index += 1) {
      const target = targets[index];
      process.stdout.write(
        `[${index + 1}/${targets.length}] ${target.name} … `,
      );

      const cached = raw[target.slug];
      if (!options.refreshCache && typeof cached === "string") {
        cacheHits += 1;
        checked += 1;
        const candidate = evaluate(target, parseResults(cached));
        if (candidate) candidates.push(candidate);
        console.log(
          candidate ? `cached candidate (${candidate.confidence})` : "cached",
        );
        continue;
      }

      const attemptAt = clock();
      const attemptTimestamp = attemptAt.toISOString();
      const attemptDay = attemptTimestamp.slice(0, 10);
      const attemptMonth = attemptTimestamp.slice(0, 7);
      const dayUsage = usageBucket(ledger.days, attemptDay);
      const monthUsage = usageBucket(ledger.months, attemptMonth);
      const budget = closureBudgetDecision({
        runRequests: attemptedRequests,
        runCredits: attemptedCredits,
        dailyCredits: dayUsage.attemptedCredits,
        monthlyCredits: monthUsage.attemptedCredits,
      });
      if (!budget.allowed) {
        console.log(`skipped (${budget.reason})`);
        console.warn(
          `Closure-detector budget stopped this run at ${attemptedRequests} request(s) / ${attemptedCredits} credit(s).`,
        );
        break;
      }

      attemptedRequests += 1;
      attemptedCredits += 1;
      reserveUsage(ledger, attemptAt);
      writeJsonAtomic(paths.usagePath, ledger);

      try {
        const response = await search(
          `${target.name} ${target.town} Frederick County MD hours closed`,
        );
        const text = typeof response === "string" ? response : response.text;
        if (
          typeof response !== "string" &&
          response.reportedCredits !== null
        ) {
          reportedCredits += response.reportedCredits;
        }
        raw[target.slug] = text;
        writeJsonAtomic(paths.rawPath, raw);
        checked += 1;
        const candidate = evaluate(target, parseResults(text));
        if (candidate) {
          candidates.push(candidate);
          console.log(
            `⚑ ${candidate.status.replace("closed_", "")} (${candidate.confidence})`,
          );
        } else {
          console.log("ok");
        }
      } catch (error) {
        console.log(
          `error: ${error instanceof Error ? error.message : "provider request failed"}`,
        );
        if (isTerminalClosureSearchError(error)) {
          console.warn(
            "Stopping on a terminal authentication, rate, plan, or billing error. Partial review artifacts will be saved.",
          );
          break;
        }
      }
      await sleep(250);
    }

    writeReport(
      candidates,
      attemptedRequests,
      attemptedCredits,
      checked,
      options.minConfidence,
      { reportedCredits, cacheHits, provider, generatedAt, paths },
    );
    return {
      mode: "live",
      wroteFiles: true,
      cacheHits,
      attemptedRequests,
    };
  } finally {
    releaseLock();
  }
}

async function main(): Promise<void> {
  const options = parseClosureDetectorArgs(process.argv.slice(2));
  if (options.live) {
    const { config: loadEnvironment } = await import("dotenv");
    loadEnvironment({ path: ".env.local", quiet: true });
    loadEnvironment({ quiet: true });
  }
  await runClosureDetector(options);
}

const isEntrypoint =
  process.argv[1] !== undefined &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isEntrypoint) {
  main().catch((e) => {
    console.error(e);
    process.exitCode = 1;
  });
}
