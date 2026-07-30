/**
 * detect-closures.ts — review-only closure detector using Tavily Search.
 *
 * Why: a local guide loses trust the moment it lists a place that has closed
 * (see the Idiom Brewing example). The paid path (refresh:business-status)
 * costs a Google Place Details call per place; this is the free complement —
 * a web search per place that reads the open web (the business's own site,
 * the Frederick News-Post, MoCo Show, MapQuest, etc.) for closure language
 * and produces a REVIEW-READY candidate list. It maps straight onto
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
 * places only. The long tail is opt-in via --all --confirm-all. Every run has
 * an immutable 125-request / 125-credit ceiling, including failed attempts.
 *
 * CACHING. Every raw response is cached to scripts/reports/closure-raw.json.
 * Re-run with --rescore to re-evaluate the heuristics against the cache with
 * ZERO API calls. Iterate on precision for free; only fetch new places once.
 *
 * Setup: put your key in .env.local (gitignored):
 *   TAVILY_API_KEY=tvly-...
 *
 * Usage:
 *   npm run closures:detect                    # ~100 curated places (safe)
 *   npm run closures:detect -- --limit 5       # cheap smoke test
 *   npm run closures:detect -- --slug some-slug
 *   npm run closures:detect -- --rescore       # re-score cache, no API calls
 *   npm run closures:detect -- --all --confirm-all # capped long-tail review
 *   npm run closures:detect -- --min medium    # report medium+ only
 *
 * Output: scripts/reports/closure-candidates.json (+ closure-raw.json cache),
 * both gitignored, plus a console summary sorted by confidence.
 */
import { config } from "dotenv";
config({ path: ".env.local" });
config();

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { PLACES } from "@/data/places";
import { isKnownClosed } from "@/lib/integrations/closures";
import {
  searchTavilyCandidates,
  TavilySearchError,
} from "./lib/tavily-search";

const ANYSEARCH_ENDPOINT = "https://api.anysearch.com/mcp";
const TAVILY_KEY = process.env.TAVILY_API_KEY;
const ANYSEARCH_KEY = process.env.ANYSEARCH_API_KEY;
const SEARCH_PROVIDER = TAVILY_KEY ? "Tavily" : "AnySearch";
const REPORT_DIR = resolve("scripts/reports");
const RAW_PATH = resolve(REPORT_DIR, "closure-raw.json");
const OUT_PATH = resolve(REPORT_DIR, "closure-candidates.json");

// ── CLI args ────────────────────────────────────────────────────────────────
export const MAX_CLOSURE_REQUESTS_PER_RUN = 125;
export const MAX_CLOSURE_CREDITS_PER_RUN = 125;

export type ClosureDetectorCliOptions = {
  onlySlug?: string;
  limit?: number;
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
  const includeLongTail = args.includes("--all");
  const confirmedLongTail = args.includes("--confirm-all");
  if (includeLongTail && !confirmedLongTail) {
    throw new Error(
      "--all requires --confirm-all. The immutable run ceiling still applies.",
    );
  }

  return {
    ...(onlySlug ? { onlySlug } : {}),
    ...(limit === undefined ? {} : { limit }),
    includeLongTail,
    confirmedLongTail,
    rescore: args.includes("--rescore"),
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
    return [
      "configuration",
      "unauthorized",
      "rate_limited",
      "plan_limit_exceeded",
      "payg_limit_exceeded",
    ].includes(error.code);
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

async function anysearch(query: string): Promise<string> {
  const res = await fetch(ANYSEARCH_ENDPOINT, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json, text/event-stream",
      Authorization: `Bearer ${ANYSEARCH_KEY}`,
    },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "tools/call",
      params: { name: "search", arguments: { query, max_results: 3 } },
    }),
  });
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

async function searchWeb(query: string): Promise<string> {
  if (TAVILY_KEY) {
    const result = await searchTavilyCandidates(query, {
      apiKey: TAVILY_KEY,
      maxResults: 3,
      searchDepth: "basic",
    });
    return tavilyResultsAsLegacyMarkdown(result.candidates);
  }
  return anysearch(query);
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
) {
  const rank = CONF_RANK[minConfidence] ?? 0;
  const report = candidates
    .filter((c) => CONF_RANK[c.confidence] >= rank)
    .sort((a, b) => CONF_RANK[b.confidence] - CONF_RANK[a.confidence]);
  mkdirSync(REPORT_DIR, { recursive: true });
  writeFileSync(
    OUT_PATH,
    JSON.stringify(
      {
        generated_at: new Date().toISOString(),
        provider: SEARCH_PROVIDER,
        review_only: true,
        no_public_writes: true,
        api_calls: attemptedRequests,
        api_calls_attempted: attemptedRequests,
        credits_attempted: attemptedCredits,
        immutable_request_ceiling: MAX_CLOSURE_REQUESTS_PER_RUN,
        immutable_credit_ceiling: MAX_CLOSURE_CREDITS_PER_RUN,
        checked,
        candidate_count: report.length,
        note: "DRY RUN. Verify each, then add confirmed closures to KNOWN_CLOSED_CANONICAL in src/lib/integrations/closures.ts.",
        candidates: report,
      },
      null,
      2,
    ) + "\n",
  );

  console.log(`\n─────────────────────────────────────────────`);
  console.log(`${SEARCH_PROVIDER} calls attempted: ${attemptedRequests}`);
  console.log(`Candidates (${minConfidence}+): ${report.length} of ${checked} checked\n`);
  for (const c of report) {
    const badge = c.status === "closed_permanently" ? "CLOSED" : "TEMP  ";
    console.log(
      `  ${badge} [${c.confidence.padEnd(6)}] ${c.name} — ${c.town}${c.ownSiteConfirms ? " (own site confirms)" : ""}`,
    );
    const ev = c.hits.find((h) => h.strength !== "temp") ?? c.hits[0];
    if (ev) console.log(`         ${ev.host}: "${ev.snippet.slice(0, 100)}${ev.snippet.length > 100 ? "…" : ""}"`);
  }
  console.log(`\nFull report: ${OUT_PATH}`);
  console.log(`Next: verify each, then add confirmed ones to KNOWN_CLOSED_CANONICAL (src/lib/integrations/closures.ts).`);
}

async function main(
  options = parseClosureDetectorArgs(process.argv.slice(2)),
) {
  // ── Re-score mode: no API calls, re-evaluate the cached raw responses. ──
  if (options.rescore) {
    if (!existsSync(RAW_PATH)) {
      console.error(`No cache at ${RAW_PATH}. Run a fetch first (npm run closures:detect).`);
      process.exit(1);
    }
    const raw = JSON.parse(readFileSync(RAW_PATH, "utf8")) as Record<string, string>;
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
    writeReport(candidates, 0, 0, checked, options.minConfidence);
    return;
  }

  if (!TAVILY_KEY && !ANYSEARCH_KEY) {
    console.error(
      "TAVILY_API_KEY is not set. Add a fresh key to .env.local. " +
        "Legacy ANYSEARCH_API_KEY remains supported as a fallback.",
    );
    process.exit(1);
  }

  const targets = targetsFor(options);
  if (targets.length === 0) {
    console.log("No targets (check --slug, or everything is already flagged closed).");
    return;
  }
  if (options.includeLongTail) {
    console.warn(
      `\n⚠  --all confirmed: ${targets.length} places are eligible, but this run will stop at ` +
        `${MAX_CLOSURE_REQUESTS_PER_RUN} requests / ${MAX_CLOSURE_CREDITS_PER_RUN} credits.\n`,
    );
  }
  console.log(
    `Checking ${targets.length} place(s) via ${SEARCH_PROVIDER}. ` +
      `Est. ${Math.ceil((targets.length * 2.2) / 60)} min.\n`,
  );

  // Load any existing cache so repeated runs accumulate instead of refetching.
  const raw: Record<string, string> = existsSync(RAW_PATH)
    ? (JSON.parse(readFileSync(RAW_PATH, "utf8")) as Record<string, string>)
    : {};
  const candidates: Candidate[] = [];
  let attemptedRequests = 0;
  let attemptedCredits = 0;
  let checked = 0;

  const persist = () => {
    mkdirSync(REPORT_DIR, { recursive: true });
    writeFileSync(RAW_PATH, JSON.stringify(raw, null, 2) + "\n");
  };

  for (let i = 0; i < targets.length; i++) {
    const t = targets[i];
    if (
      !canReserveClosureSearchAttempt(
        attemptedRequests,
        attemptedCredits,
      )
    ) {
      console.warn(
        `Immutable run ceiling reached at ${attemptedRequests} requests / ` +
          `${attemptedCredits} credits. Partial review artifacts will be saved.`,
      );
      break;
    }
    process.stdout.write(`[${i + 1}/${targets.length}] ${t.name} … `);
    // Reserve before the network call. Failed calls still count against the
    // immutable ceiling, so retries or error loops cannot spend past it.
    attemptedRequests += 1;
    attemptedCredits += 1;
    try {
      const text = await searchWeb(
        `${t.name} ${t.town} Frederick County MD hours closed`,
      );
      raw[t.slug] = text;
      checked += 1;
      const cand = evaluate(t, parseResults(text));
      if (cand) {
        candidates.push(cand);
        console.log(`⚑ ${cand.status.replace("closed_", "")} (${cand.confidence})`);
      } else {
        console.log("ok");
      }
    } catch (e) {
      console.log(`error: ${(e as Error).message}`);
      if (isTerminalClosureSearchError(e)) {
        console.warn(
          "Stopping on a terminal authentication, rate, plan, or billing error. Partial review artifacts will be saved.",
        );
        break;
      }
    }
    if (attemptedRequests % 20 === 0) persist(); // checkpoint so a crash never loses fetched calls
    await new Promise((r) => setTimeout(r, 250));
  }
  persist();
  writeReport(
    candidates,
    attemptedRequests,
    attemptedCredits,
    checked,
    options.minConfidence,
  );
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
