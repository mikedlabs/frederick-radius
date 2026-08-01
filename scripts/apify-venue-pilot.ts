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
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { config as loadEnvironment } from "dotenv";
import {
  ApifyRestError,
  fetchApifyPage,
  redactApifySecrets,
  type ApifyPageSnapshot,
  type ApifyRestOptions,
} from "./lib/apify-rest";
import { validateFirecrawlPublicUrl } from "./lib/firecrawl-rest";

loadEnvironment({ path: resolve(".env.local"), quiet: true });
loadEnvironment({ quiet: true });

const DEFAULT_CONFIG_PATH = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "../config/apify-venue-pilot.json",
);
const DEFAULT_REPORT_DIRECTORY = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "reports/apify-venue-pilot",
);
const ABSOLUTE_MAX_SOURCES_PER_RUN = 1;
const ABSOLUTE_MAX_RUNS_PER_MONTH = 4;
const ABSOLUTE_MAX_CHARGE_USD_PER_RUN = 0.25;
const ABSOLUTE_MAX_RESERVED_CHARGE_USD_PER_MONTH = 1;
const ABSOLUTE_TIMEOUT_MS = 240_000;
const LOCK_STALE_MS = 30 * 60 * 1_000;

export type ApifyVenuePilotSource = {
  id: string;
  venueSlug: string;
  name: string;
  url: string;
  purpose: string;
  rightsPosture: string;
};

export type ApifyVenuePilotConfig = {
  version: 1;
  mode: "candidate-only";
  limits: {
    maxSourcesPerRun: number;
    maxRunsPerMonth: number;
    maxChargeUsdPerRun: number;
    maxReservedChargeUsdPerMonth: number;
    timeoutMs: number;
  };
  sources: ApifyVenuePilotSource[];
};

type ApifyVenuePilotState = {
  version: 1;
  budget: {
    months: Record<
      string,
      {
        attemptedRuns: number;
        reservedMaxChargeUsd: number;
        lastReservedAt?: string;
      }
    >;
  };
};

export type ApifyVenuePilotReport = {
  schemaVersion: 1;
  kind: "candidate-only";
  generatedAt: string;
  notice: string;
  status: "succeeded" | "error";
  source: ApifyVenuePilotSource;
  provider: {
    name: "apify";
    actor: "apify/website-content-crawler";
    runId?: string;
    datasetId?: string;
    consoleRunUrl?: string;
    usageTotalUsd?: number;
  };
  budget: {
    month: string;
    attemptedRunsThisMonth: number;
    maxRunsPerMonth: number;
    reservedMaxChargeUsdThisRun: number;
    reservedMaxChargeUsdThisMonth: number;
    maxReservedChargeUsdPerMonth: number;
  };
  observation?: {
    requestedUrl: string;
    finalUrl: string;
    contentHash: string;
    textLength: number;
    sameHostLinks: string[];
    signals: {
      dateMentions: number;
      timeMentions: number;
      eventLikeLinks: number;
    };
    metadata: Record<string, unknown>;
  };
  error?: {
    code: string;
    message: string;
    httpStatus?: number;
  };
};

type ApifyPageFetcher = (
  url: string,
  options?: ApifyRestOptions,
) => Promise<ApifyPageSnapshot>;

export type RunApifyVenuePilotOptions = {
  config?: ApifyVenuePilotConfig;
  configPath?: string;
  reportDirectory?: string;
  sourceId: string;
  fetchPage?: ApifyPageFetcher;
  now?: () => Date;
};

export type ApifyVenuePilotCliArgs = {
  live: boolean;
  confirmed: boolean;
  sourceIds: string[];
};

export class ApifyVenuePilotError extends Error {
  readonly code:
    | "INVALID_CONFIG"
    | "LIVE_CONFIRMATION_REQUIRED"
    | "RUN_CAP_EXCEEDED"
    | "MONTHLY_CAP_EXCEEDED"
    | "RUN_IN_PROGRESS"
    | "INVALID_STATE";

  constructor(code: ApifyVenuePilotError["code"], message: string) {
    super(message);
    this.name = "ApifyVenuePilotError";
    this.code = code;
  }
}

function invalidConfig(message: string): never {
  throw new ApifyVenuePilotError(
    "INVALID_CONFIG",
    `Apify venue pilot config: ${message}`,
  );
}

function isPositiveInteger(value: unknown): value is number {
  return Number.isInteger(value) && Number(value) > 0;
}

export function validateApifyVenuePilotConfig(
  value: ApifyVenuePilotConfig,
): ApifyVenuePilotConfig {
  if (!value || typeof value !== "object") invalidConfig("root is required.");
  if (value.version !== 1) invalidConfig("version must be 1.");
  if (value.mode !== "candidate-only") {
    invalidConfig('mode must be "candidate-only".');
  }
  if (!value.limits || typeof value.limits !== "object") {
    invalidConfig("limits are required.");
  }
  if (
    !isPositiveInteger(value.limits.maxSourcesPerRun) ||
    value.limits.maxSourcesPerRun > ABSOLUTE_MAX_SOURCES_PER_RUN
  ) {
    invalidConfig("maxSourcesPerRun must be 1.");
  }
  if (
    !isPositiveInteger(value.limits.maxRunsPerMonth) ||
    value.limits.maxRunsPerMonth > ABSOLUTE_MAX_RUNS_PER_MONTH
  ) {
    invalidConfig(
      `maxRunsPerMonth cannot exceed ${ABSOLUTE_MAX_RUNS_PER_MONTH}.`,
    );
  }
  if (
    !Number.isFinite(value.limits.maxChargeUsdPerRun) ||
    value.limits.maxChargeUsdPerRun <= 0 ||
    value.limits.maxChargeUsdPerRun > ABSOLUTE_MAX_CHARGE_USD_PER_RUN
  ) {
    invalidConfig(
      `maxChargeUsdPerRun cannot exceed $${ABSOLUTE_MAX_CHARGE_USD_PER_RUN.toFixed(2)}.`,
    );
  }
  if (
    !Number.isFinite(value.limits.maxReservedChargeUsdPerMonth) ||
    value.limits.maxReservedChargeUsdPerMonth <= 0 ||
    value.limits.maxReservedChargeUsdPerMonth >
      ABSOLUTE_MAX_RESERVED_CHARGE_USD_PER_MONTH
  ) {
    invalidConfig(
      `maxReservedChargeUsdPerMonth cannot exceed $${ABSOLUTE_MAX_RESERVED_CHARGE_USD_PER_MONTH.toFixed(2)}.`,
    );
  }
  if (
    value.limits.maxRunsPerMonth * value.limits.maxChargeUsdPerRun >
    value.limits.maxReservedChargeUsdPerMonth + Number.EPSILON
  ) {
    invalidConfig(
      "monthly run and per-run limits exceed maxReservedChargeUsdPerMonth.",
    );
  }
  if (
    !isPositiveInteger(value.limits.timeoutMs) ||
    value.limits.timeoutMs > ABSOLUTE_TIMEOUT_MS
  ) {
    invalidConfig(`timeoutMs cannot exceed ${ABSOLUTE_TIMEOUT_MS}.`);
  }
  if (!Array.isArray(value.sources) || value.sources.length !== 3) {
    invalidConfig("sources must contain exactly three reviewed venue pages.");
  }

  const ids = new Set<string>();
  const venueSlugs = new Set<string>();
  const urls = new Set<string>();
  for (const [index, source] of value.sources.entries()) {
    const prefix = `sources[${index}]`;
    if (!source || typeof source !== "object") {
      invalidConfig(`${prefix} must be an object.`);
    }
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(source.id ?? "")) {
      invalidConfig(`${prefix}.id must be lowercase kebab-case.`);
    }
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(source.venueSlug ?? "")) {
      invalidConfig(`${prefix}.venueSlug must be lowercase kebab-case.`);
    }
    if (ids.has(source.id)) invalidConfig(`${prefix}.id is duplicated.`);
    if (venueSlugs.has(source.venueSlug)) {
      invalidConfig(`${prefix}.venueSlug is duplicated.`);
    }
    ids.add(source.id);
    venueSlugs.add(source.venueSlug);

    try {
      validateFirecrawlPublicUrl(source.url);
    } catch {
      invalidConfig(`${prefix}.url must be an exact public HTTPS URL.`);
    }
    if (urls.has(source.url)) invalidConfig(`${prefix}.url is duplicated.`);
    urls.add(source.url);
    for (const field of ["name", "purpose", "rightsPosture"] as const) {
      if (typeof source[field] !== "string" || !source[field].trim()) {
        invalidConfig(`${prefix}.${field} is required.`);
      }
    }
  }

  return value;
}

async function readConfig(path: string): Promise<ApifyVenuePilotConfig> {
  try {
    return validateApifyVenuePilotConfig(
      JSON.parse(await readFile(path, "utf8")) as ApifyVenuePilotConfig,
    );
  } catch (error) {
    if (error instanceof ApifyVenuePilotError) throw error;
    const message = error instanceof Error ? error.message : "unknown error";
    throw new ApifyVenuePilotError(
      "INVALID_CONFIG",
      `Could not read Apify venue pilot config: ${message}`,
    );
  }
}

function emptyState(month: string): ApifyVenuePilotState {
  return {
    version: 1,
    budget: {
      months: {
        [month]: { attemptedRuns: 0, reservedMaxChargeUsd: 0 },
      },
    },
  };
}

async function readState(
  path: string,
  month: string,
): Promise<ApifyVenuePilotState> {
  let raw: string;
  try {
    raw = await readFile(path, "utf8");
  } catch (error) {
    if (
      error &&
      typeof error === "object" &&
      "code" in error &&
      error.code === "ENOENT"
    ) {
      return emptyState(month);
    }
    throw error;
  }

  try {
    const state = JSON.parse(raw) as ApifyVenuePilotState;
    if (
      state.version !== 1 ||
      !state.budget?.months ||
      typeof state.budget.months !== "object"
    ) {
      throw new Error("state shape is invalid");
    }
    for (const budget of Object.values(state.budget.months)) {
      if (
        !budget ||
        !Number.isInteger(budget.attemptedRuns) ||
        budget.attemptedRuns < 0 ||
        !Number.isFinite(budget.reservedMaxChargeUsd) ||
        budget.reservedMaxChargeUsd < 0
      ) {
        throw new Error("monthly budget shape is invalid");
      }
    }
    state.budget.months[month] ??= {
      attemptedRuns: 0,
      reservedMaxChargeUsd: 0,
    };
    return state;
  } catch (error) {
    const message = error instanceof Error ? error.message : "unknown error";
    throw new ApifyVenuePilotError(
      "INVALID_STATE",
      `Apify venue pilot state is unreadable; budget was not reset: ${message}`,
    );
  }
}

async function writeJsonAtomic(path: string, value: unknown): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  const temporaryPath = `${path}.${process.pid}.${randomUUID()}.tmp`;
  await writeFile(temporaryPath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
  await rename(temporaryPath, path);
}

function errorCode(error: unknown): string | undefined {
  return error && typeof error === "object" && "code" in error
    ? String(error.code)
    : undefined;
}

async function acquireLock(
  path: string,
  now: Date,
): Promise<{ release: () => Promise<void> }> {
  await mkdir(dirname(path), { recursive: true });
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const token = randomUUID();
    const raw = `${JSON.stringify({
      pid: process.pid,
      createdAt: now.toISOString(),
      token,
    })}\n`;
    try {
      const handle = await open(path, "wx");
      try {
        await handle.writeFile(raw, "utf8");
      } finally {
        await handle.close();
      }
      return {
        release: async () => {
          try {
            if ((await readFile(path, "utf8")) === raw) await unlink(path);
          } catch (error) {
            if (errorCode(error) !== "ENOENT") throw error;
          }
        },
      };
    } catch (error) {
      if (errorCode(error) !== "EEXIST") throw error;
      const details = await stat(path);
      if (now.getTime() - details.mtimeMs < LOCK_STALE_MS) {
        throw new ApifyVenuePilotError(
          "RUN_IN_PROGRESS",
          "Another Apify venue pilot is already in progress.",
        );
      }
      await unlink(path);
    }
  }
  throw new ApifyVenuePilotError(
    "RUN_IN_PROGRESS",
    "Another Apify venue pilot acquired the lock during recovery.",
  );
}

function canonicalHost(url: string): string {
  return new URL(url).hostname.toLowerCase().replace(/^www\./, "");
}

function sameCanonicalHost(first: string, second: string): boolean {
  try {
    return canonicalHost(first) === canonicalHost(second);
  } catch {
    return false;
  }
}

function normalizeContent(value: string): string {
  return value
    .normalize("NFKC")
    .replace(/\r\n?/g, "\n")
    .replace(/\u00a0/g, " ")
    .replace(/[\u200B-\u200D\uFEFF]/g, "")
    .split("\n")
    .map((line) => line.trim().replace(/[ \t]+/g, " "))
    .filter(Boolean)
    .join("\n");
}

function safeSameHostLinks(links: readonly string[], sourceUrl: string): string[] {
  const kept = new Set<string>();
  for (const value of links) {
    try {
      const parsed = new URL(value, sourceUrl);
      if (
        parsed.protocol !== "https:" ||
        !sameCanonicalHost(sourceUrl, parsed.toString())
      ) {
        continue;
      }
      parsed.search = "";
      parsed.hash = "";
      kept.add(parsed.toString());
    } catch {
      // Malformed supporting links are omitted from the private report.
    }
  }
  return [...kept].slice(0, 20);
}

function safeMetadata(value: Record<string, unknown>): Record<string, unknown> {
  const allowed = ["title", "language"];
  const out: Record<string, unknown> = Object.fromEntries(
    allowed
      .filter((key) => typeof value[key] === "string")
      .map((key) => [key, String(value[key]).slice(0, 300)]),
  );
  const crawl =
    value.crawl && typeof value.crawl === "object" && !Array.isArray(value.crawl)
      ? (value.crawl as Record<string, unknown>)
      : {};
  if (typeof crawl.httpStatusCode === "number") {
    out.httpStatusCode = crawl.httpStatusCode;
  }
  return out;
}

function contentSignals(markdown: string, links: readonly string[]) {
  return {
    dateMentions: (markdown.match(
      /\b(?:jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:tember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\s+\d{1,2}\b/gi,
    ) ?? []).length,
    timeMentions: (markdown.match(/\b\d{1,2}(?::\d{2})?\s*(?:a\.?m\.?|p\.?m\.?)\b/gi) ?? [])
      .length,
    eventLikeLinks: links.filter((link) =>
      /\/(?:event|events|calendar|performance|performances|tickets?)(?:\/|$)/i.test(
        new URL(link).pathname,
      ),
    ).length,
  };
}

function safeError(error: unknown): ApifyVenuePilotReport["error"] {
  const token = process.env.APIFY_TOKEN ?? "";
  const message = redactApifySecrets(
    error instanceof Error ? error.message : "Unknown Apify pilot error.",
    token,
  ).slice(0, 700);
  return {
    code:
      error instanceof ApifyRestError
        ? error.code
        : error instanceof ApifyVenuePilotError
          ? error.code
          : "UNKNOWN_ERROR",
    message,
    ...(error instanceof ApifyRestError && error.status !== undefined
      ? { httpStatus: error.status }
      : {}),
  };
}

function reportFileName(now: Date): string {
  return `apify-venue-pilot-${now.toISOString().replace(/[:.]/g, "-")}.json`;
}

export async function runApifyVenuePilot(
  options: RunApifyVenuePilotOptions,
): Promise<{
  reportPath: string;
  statePath: string;
  report: ApifyVenuePilotReport;
}> {
  const now = options.now?.() ?? new Date();
  if (Number.isNaN(now.getTime())) invalidConfig("clock is invalid.");
  const generatedAt = now.toISOString();
  const month = generatedAt.slice(0, 7);
  const config = validateApifyVenuePilotConfig(
    options.config ??
      (await readConfig(options.configPath ?? DEFAULT_CONFIG_PATH)),
  );
  const source = config.sources.find(({ id }) => id === options.sourceId);
  if (!source) invalidConfig(`unknown reviewed source id: ${options.sourceId}.`);

  const reportDirectory = options.reportDirectory ?? DEFAULT_REPORT_DIRECTORY;
  const statePath = join(reportDirectory, "state.json");
  const lock = await acquireLock(join(reportDirectory, ".run.lock"), now);
  try {
    const state = await readState(statePath, month);
    const budget = state.budget.months[month]!;
    if (1 > config.limits.maxSourcesPerRun) {
      throw new ApifyVenuePilotError(
        "RUN_CAP_EXCEEDED",
        "Apify venue pilot source cap would be exceeded.",
      );
    }
    if (budget.attemptedRuns + 1 > config.limits.maxRunsPerMonth) {
      throw new ApifyVenuePilotError(
        "MONTHLY_CAP_EXCEEDED",
        `Apify venue pilot monthly run cap would be exceeded (${budget.attemptedRuns} used + 1 planned > ${config.limits.maxRunsPerMonth}).`,
      );
    }
    if (
      budget.reservedMaxChargeUsd + config.limits.maxChargeUsdPerRun >
      config.limits.maxReservedChargeUsdPerMonth + Number.EPSILON
    ) {
      throw new ApifyVenuePilotError(
        "MONTHLY_CAP_EXCEEDED",
        "Apify venue pilot monthly reserved-charge cap would be exceeded.",
      );
    }

    // Reserve before the paid request. Failures count while this advisory
    // state remains available. GitHub caches are evictable, so the provider's
    // per-run cap and account spending limit remain authoritative.
    budget.attemptedRuns += 1;
    budget.reservedMaxChargeUsd = Number(
      (budget.reservedMaxChargeUsd + config.limits.maxChargeUsdPerRun).toFixed(
        2,
      ),
    );
    budget.lastReservedAt = generatedAt;
    await writeJsonAtomic(statePath, state);

    const baseReport: Omit<ApifyVenuePilotReport, "status"> = {
      schemaVersion: 1,
      kind: "candidate-only",
      generatedAt,
      notice:
        "Private retrieval-quality evidence only. The original publisher remains the source; no Radius event or place data was changed or published.",
      source,
      provider: {
        name: "apify",
        actor: "apify/website-content-crawler",
      },
      budget: {
        month,
        attemptedRunsThisMonth: budget.attemptedRuns,
        maxRunsPerMonth: config.limits.maxRunsPerMonth,
        reservedMaxChargeUsdThisRun: config.limits.maxChargeUsdPerRun,
        reservedMaxChargeUsdThisMonth: budget.reservedMaxChargeUsd,
        maxReservedChargeUsdPerMonth:
          config.limits.maxReservedChargeUsdPerMonth,
      },
    };

    let report: ApifyVenuePilotReport;
    try {
      const snapshot = await (options.fetchPage ?? fetchApifyPage)(source.url, {
        timeoutMs: config.limits.timeoutMs,
        maxTotalChargeUsd: config.limits.maxChargeUsdPerRun,
      });
      if (!sameCanonicalHost(source.url, snapshot.finalUrl)) {
        throw new ApifyRestError(
          "INVALID_RESPONSE",
          `Apify reported an unexpected cross-host final URL: ${snapshot.finalUrl}`,
        );
      }
      const normalized = normalizeContent(snapshot.markdown);
      const sameHostLinks = safeSameHostLinks(snapshot.links, source.url);
      report = {
        ...baseReport,
        status: "succeeded",
        provider: {
          ...baseReport.provider,
          runId: snapshot.runId,
          datasetId: snapshot.datasetId,
          consoleRunUrl: `https://console.apify.com/actors/runs/${snapshot.runId}`,
          ...(snapshot.usageTotalUsd === undefined
            ? {}
            : { usageTotalUsd: snapshot.usageTotalUsd }),
        },
        observation: {
          requestedUrl: snapshot.requestedUrl,
          finalUrl: snapshot.finalUrl,
          contentHash: createHash("sha256").update(normalized).digest("hex"),
          textLength: normalized.length,
          sameHostLinks,
          signals: contentSignals(snapshot.markdown, sameHostLinks),
          metadata: safeMetadata(snapshot.metadata),
        },
      };
    } catch (error) {
      report = {
        ...baseReport,
        status: "error",
        error: safeError(error),
      };
    }

    const reportPath = join(reportDirectory, reportFileName(now));
    await writeJsonAtomic(reportPath, report);
    return { reportPath, statePath, report };
  } finally {
    await lock.release();
  }
}

export function parseApifyVenuePilotCliArgs(
  args: readonly string[],
): ApifyVenuePilotCliArgs {
  let live = false;
  let confirmed = false;
  const sourceIds: string[] = [];
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index]!;
    if (argument === "--live") {
      live = true;
      continue;
    }
    if (argument === "--confirm") {
      confirmed = true;
      continue;
    }
    if (argument === "--source") {
      const sourceId = args[index + 1];
      if (!sourceId || sourceId.startsWith("--")) {
        throw new Error("--source requires a reviewed source id.");
      }
      sourceIds.push(sourceId);
      index += 1;
      continue;
    }
    if (argument.startsWith("--source=")) {
      const sourceId = argument.slice("--source=".length);
      if (!sourceId) throw new Error("--source requires a reviewed source id.");
      sourceIds.push(sourceId);
      continue;
    }
    throw new Error(`Unknown Apify venue pilot argument: ${argument}`);
  }
  return { live, confirmed, sourceIds: [...new Set(sourceIds)] };
}

async function main(): Promise<void> {
  const args = parseApifyVenuePilotCliArgs(process.argv.slice(2));
  const config = await readConfig(DEFAULT_CONFIG_PATH);
  const selected = args.sourceIds.length
    ? config.sources.filter((source) => args.sourceIds.includes(source.id))
    : config.sources;
  const unknown = args.sourceIds.filter(
    (id) => !config.sources.some((source) => source.id === id),
  );
  if (unknown.length) invalidConfig(`unknown reviewed source id: ${unknown.join(", ")}.`);

  if (!args.live) {
    console.log(
      `Apify venue pilot plan: ${selected.length} reviewed source(s); live runs are limited to one source and $${config.limits.maxChargeUsdPerRun.toFixed(2)} maximum charge.`,
    );
    for (const source of selected) console.log(`- ${source.id}: ${source.url}`);
    console.log("Plan only. No API request or file was written.");
    console.log(
      "Use --live --confirm --source=<id> after adding APIFY_TOKEN to the offline runner.",
    );
    return;
  }
  if (!args.confirmed) {
    throw new ApifyVenuePilotError(
      "LIVE_CONFIRMATION_REQUIRED",
      "A live Apify venue pilot requires both --live and --confirm.",
    );
  }
  if (args.sourceIds.length !== 1) {
    throw new ApifyVenuePilotError(
      "RUN_CAP_EXCEEDED",
      "A live Apify venue pilot requires exactly one reviewed --source.",
    );
  }
  if (!process.env.APIFY_TOKEN) {
    throw new Error(
      "APIFY_TOKEN is required in the offline runner for a live venue pilot.",
    );
  }

  const result = await runApifyVenuePilot({ sourceId: args.sourceIds[0]! });
  console.log(
    `Apify venue pilot ${result.report.status}: ${result.report.source.id}.`,
  );
  console.log(`Review report: ${result.reportPath}`);
  if (result.report.status !== "succeeded") {
    throw new Error(
      result.report.error?.message ?? "Apify venue pilot did not succeed.",
    );
  }
}

const invokedPath = process.argv[1] ? resolve(process.argv[1]) : "";
if (invokedPath === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(safeError(error)?.message ?? "Apify venue pilot failed.");
    process.exitCode = 1;
  });
}
