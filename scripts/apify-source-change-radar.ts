import { randomUUID } from "node:crypto";
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
  validateApifyVenuePilotConfig,
  type ApifyVenuePilotConfig,
  type ApifyVenuePilotSource,
} from "./apify-venue-pilot";
import {
  ApifyRestError,
  fetchApifyPage,
  redactApifySecrets,
  type ApifyPageSnapshot,
  type ApifyRestOptions,
} from "./lib/apify-rest";
import {
  changedApifySourceFingerprintFields,
  fingerprintApifySource,
  type ApifySourceFingerprintField,
  type ApifySourceSignalFingerprint,
} from "./lib/apify-source-signals";

loadEnvironment({ path: resolve(".env.local"), quiet: true });
loadEnvironment({ quiet: true });

const SCRIPT_DIRECTORY = dirname(fileURLToPath(import.meta.url));
const DEFAULT_CONFIG_PATH = resolve(
  SCRIPT_DIRECTORY,
  "../config/apify-source-change-radar.json",
);
const DEFAULT_ALLOWLIST_PATH = resolve(
  SCRIPT_DIRECTORY,
  "../config/apify-venue-pilot.json",
);
const DEFAULT_VENUE_REGISTRY_PATH = resolve(
  SCRIPT_DIRECTORY,
  "../config/venue-sources.json",
);
const DEFAULT_CANONICAL_EVENTS_PATH = resolve(
  SCRIPT_DIRECTORY,
  "../src/data/venue-events.json",
);
const DEFAULT_REPORT_DIRECTORY = resolve(
  SCRIPT_DIRECTORY,
  "reports/apify-source-change-radar",
);
const ABSOLUTE_MAX_SOURCES_PER_RUN = 3;
const ABSOLUTE_MAX_RUNS_PER_MONTH = 6;
const ABSOLUTE_MAX_CHARGE_USD_PER_SOURCE = 0.05;
const ABSOLUTE_MAX_RESERVED_CHARGE_USD_PER_RUN = 0.15;
const ABSOLUTE_MAX_RESERVED_CHARGE_USD_PER_MONTH = 0.9;
const ABSOLUTE_TIMEOUT_MS = 240_000;
const LOCK_STALE_MS = 30 * 60 * 1_000;

export type ApifySourceChangeRadarStatus =
  "baseline" | "unchanged" | "cosmetic" | "changed" | "error";

export type ApifySourceChangeConfidence = "low" | "medium" | "high";

export type ApifySourceCanonicalCheck = {
  venueSlug: string;
  venueRegistryMatched: true;
  exactSourceUrlMatched: true;
  committedVenueEventCount: number;
  committedExactSourceEventCount: number;
  disposition: "review-required-no-event-candidate";
};

export type ApifySourceChangeRadarConfig = {
  version: 1;
  mode: "private-change-radar";
  limits: {
    maxSourcesPerRun: number;
    maxRunsPerMonth: number;
    maxChargeUsdPerSource: number;
    maxReservedChargeUsdPerRun: number;
    maxReservedChargeUsdPerMonth: number;
    timeoutMs: number;
    contentOnlyAlertAfterConsecutiveRuns: number;
  };
  sourceIds: string[];
};

type StoredObservation = {
  sourceUrl: string;
  status: ApifySourceChangeRadarStatus;
  lastCheckedAt: string;
  lastSuccessfulAt?: string;
  lastChangedAt?: string;
  fingerprint?: ApifySourceSignalFingerprint;
  consecutiveFailures: number;
  errorCode?: string;
  httpStatus?: number;
  consecutiveContentOnlyChanges: number;
};

type ApifySourceChangeRadarState = {
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
  observations: Record<string, StoredObservation>;
};

type RadarErrorEvidence = {
  code: string;
  message: string;
  httpStatus?: number;
};

export type ApifySourceChangeRadarResult = {
  source: ApifyVenuePilotSource;
  status: ApifySourceChangeRadarStatus;
  collectedAt: string;
  actor: "apify/website-content-crawler";
  town: string;
  confidence: ApifySourceChangeConfidence;
  parsingWarnings: string[];
  canonicalCheck: ApifySourceCanonicalCheck;
  finalUrl?: string;
  changedFields: ApifySourceFingerprintField[];
  previousFingerprint?: ApifySourceSignalFingerprint;
  fingerprint?: ApifySourceSignalFingerprint;
  provider?: {
    runId: string;
    datasetId: string;
    consoleRunUrl: string;
    usageTotalUsd?: number;
  };
  error?: RadarErrorEvidence;
};

export type ApifySourceChangeRadarReport = {
  schemaVersion: 1;
  kind: "private-change-radar";
  generatedAt: string;
  notice: string;
  reviewQueue: {
    automaticPublishing: false;
    expiresAt: string;
  };
  provider: {
    name: "apify";
    actor: "apify/website-content-crawler";
  };
  budget: {
    month: string;
    attemptedRunsThisMonth: number;
    maxRunsPerMonth: number;
    sourcesThisRun: number;
    maxSourcesPerRun: number;
    reservedMaxChargeUsdThisRun: number;
    maxReservedChargeUsdPerRun: number;
    reservedMaxChargeUsdThisMonth: number;
    maxReservedChargeUsdPerMonth: number;
  };
  summary: Record<ApifySourceChangeRadarStatus, number>;
  results: ApifySourceChangeRadarResult[];
};

export type ApifySourceChangeRadarIssueSignal = {
  schemaVersion: 1;
  marker: "<!-- apify-source-change-radar -->";
  title: "[source-radar] First-party venue pages need review";
  generatedAt: string;
  expiresAt: string;
  summary: Record<ApifySourceChangeRadarStatus, number>;
  actionable: boolean;
  items: Array<{
    sourceId: string;
    sourceName: string;
    sourceUrl: string;
    collectedAt: string;
    actor: "apify/website-content-crawler";
    town: string;
    confidence: ApifySourceChangeConfidence;
    parsingWarnings: string[];
    canonicalCheck: ApifySourceCanonicalCheck;
    status: "changed" | "error" | "warning";
    changedFields?: ApifySourceFingerprintField[];
    contentHashPrefix?: string;
    dateCount?: number;
    timeCount?: number;
    eventLinkCount?: number;
    errorCode?: string;
    httpStatus?: number;
  }>;
};

type ApifyPageFetcher = (
  url: string,
  options?: ApifyRestOptions,
) => Promise<ApifyPageSnapshot>;

export type RunApifySourceChangeRadarOptions = {
  config?: ApifySourceChangeRadarConfig;
  configPath?: string;
  allowlist?: ApifyVenuePilotConfig;
  allowlistPath?: string;
  venueRegistry?: CanonicalVenueRegistry;
  venueRegistryPath?: string;
  canonicalEvents?: CanonicalVenueEvent[];
  canonicalEventsPath?: string;
  reportDirectory?: string;
  sourceIds?: readonly string[];
  fetchPage?: ApifyPageFetcher;
  now?: () => Date;
  allowInitializeState?: boolean;
};

export type CanonicalVenueRegistry = {
  venues: Array<{
    slug: string;
    urls: string[];
  }>;
};

export type CanonicalVenueEvent = {
  venue_slug?: string;
  source?: {
    url?: string;
    requestedUrl?: string;
    finalUrl?: string;
  };
};

export type ApifySourceChangeRadarCliArgs = {
  live: boolean;
  confirmed: boolean;
  initializeState: boolean;
  sourceIds: string[];
};

export class ApifySourceChangeRadarError extends Error {
  readonly code:
    | "INVALID_CONFIG"
    | "LIVE_CONFIRMATION_REQUIRED"
    | "RUN_CAP_EXCEEDED"
    | "MONTHLY_CAP_EXCEEDED"
    | "RUN_IN_PROGRESS"
    | "STATE_REQUIRED"
    | "INVALID_STATE";

  constructor(code: ApifySourceChangeRadarError["code"], message: string) {
    super(message);
    this.name = "ApifySourceChangeRadarError";
    this.code = code;
  }
}

function invalidConfig(message: string): never {
  throw new ApifySourceChangeRadarError(
    "INVALID_CONFIG",
    `Apify source change radar config: ${message}`,
  );
}

function positiveInteger(value: unknown): value is number {
  return Number.isInteger(value) && Number(value) > 0;
}

function positiveMoney(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value > 0;
}

export function validateApifySourceChangeRadarConfig(
  value: ApifySourceChangeRadarConfig,
): ApifySourceChangeRadarConfig {
  if (!value || typeof value !== "object") invalidConfig("root is required.");
  if (value.version !== 1) invalidConfig("version must be 1.");
  if (value.mode !== "private-change-radar") {
    invalidConfig('mode must be "private-change-radar".');
  }
  if (!value.limits || typeof value.limits !== "object") {
    invalidConfig("limits are required.");
  }
  if (
    !positiveInteger(value.limits.maxSourcesPerRun) ||
    value.limits.maxSourcesPerRun > ABSOLUTE_MAX_SOURCES_PER_RUN
  ) {
    invalidConfig(
      `maxSourcesPerRun cannot exceed ${ABSOLUTE_MAX_SOURCES_PER_RUN}.`,
    );
  }
  if (
    !positiveInteger(value.limits.maxRunsPerMonth) ||
    value.limits.maxRunsPerMonth > ABSOLUTE_MAX_RUNS_PER_MONTH
  ) {
    invalidConfig(
      `maxRunsPerMonth cannot exceed ${ABSOLUTE_MAX_RUNS_PER_MONTH}.`,
    );
  }
  if (
    !positiveMoney(value.limits.maxChargeUsdPerSource) ||
    value.limits.maxChargeUsdPerSource < 0.01 ||
    value.limits.maxChargeUsdPerSource > ABSOLUTE_MAX_CHARGE_USD_PER_SOURCE
  ) {
    invalidConfig(
      `maxChargeUsdPerSource must be between $0.01 and $${ABSOLUTE_MAX_CHARGE_USD_PER_SOURCE.toFixed(2)}.`,
    );
  }
  if (
    !positiveMoney(value.limits.maxReservedChargeUsdPerRun) ||
    value.limits.maxReservedChargeUsdPerRun >
      ABSOLUTE_MAX_RESERVED_CHARGE_USD_PER_RUN
  ) {
    invalidConfig(
      `maxReservedChargeUsdPerRun cannot exceed $${ABSOLUTE_MAX_RESERVED_CHARGE_USD_PER_RUN.toFixed(2)}.`,
    );
  }
  if (
    !positiveMoney(value.limits.maxReservedChargeUsdPerMonth) ||
    value.limits.maxReservedChargeUsdPerMonth >
      ABSOLUTE_MAX_RESERVED_CHARGE_USD_PER_MONTH
  ) {
    invalidConfig(
      `maxReservedChargeUsdPerMonth cannot exceed $${ABSOLUTE_MAX_RESERVED_CHARGE_USD_PER_MONTH.toFixed(2)}.`,
    );
  }
  if (
    value.limits.maxRunsPerMonth * value.limits.maxReservedChargeUsdPerRun >
    value.limits.maxReservedChargeUsdPerMonth + Number.EPSILON
  ) {
    invalidConfig(
      "monthly runs multiplied by the per-run reservation exceed the monthly reservation cap.",
    );
  }
  if (
    !positiveInteger(value.limits.timeoutMs) ||
    value.limits.timeoutMs > ABSOLUTE_TIMEOUT_MS
  ) {
    invalidConfig(`timeoutMs cannot exceed ${ABSOLUTE_TIMEOUT_MS}.`);
  }
  if (
    !positiveInteger(value.limits.contentOnlyAlertAfterConsecutiveRuns) ||
    value.limits.contentOnlyAlertAfterConsecutiveRuns > 3
  ) {
    invalidConfig(
      "contentOnlyAlertAfterConsecutiveRuns must be an integer from 1 through 3.",
    );
  }
  if (
    !Array.isArray(value.sourceIds) ||
    value.sourceIds.length < 1 ||
    value.sourceIds.length > value.limits.maxSourcesPerRun
  ) {
    invalidConfig(
      `sourceIds must contain 1-${value.limits.maxSourcesPerRun} reviewed ids.`,
    );
  }
  const uniqueIds = new Set<string>();
  for (const [index, sourceId] of value.sourceIds.entries()) {
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(sourceId ?? "")) {
      invalidConfig(`sourceIds[${index}] must be lowercase kebab-case.`);
    }
    if (uniqueIds.has(sourceId)) {
      invalidConfig(`sourceIds[${index}] is duplicated.`);
    }
    uniqueIds.add(sourceId);
  }
  const configuredRunReservation = Number(
    (value.sourceIds.length * value.limits.maxChargeUsdPerSource).toFixed(2),
  );
  if (
    configuredRunReservation >
    value.limits.maxReservedChargeUsdPerRun + Number.EPSILON
  ) {
    invalidConfig(
      "the reviewed source count exceeds maxReservedChargeUsdPerRun.",
    );
  }
  return value;
}

async function readJson(path: string, label: string): Promise<unknown> {
  try {
    return JSON.parse(await readFile(path, "utf8")) as unknown;
  } catch (error) {
    const message = error instanceof Error ? error.message : "unknown error";
    throw new ApifySourceChangeRadarError(
      "INVALID_CONFIG",
      `Could not read ${label}: ${message}`,
    );
  }
}

async function loadConfig(path: string): Promise<ApifySourceChangeRadarConfig> {
  return validateApifySourceChangeRadarConfig(
    (await readJson(
      path,
      "Apify source change radar config",
    )) as ApifySourceChangeRadarConfig,
  );
}

async function loadAllowlist(path: string): Promise<ApifyVenuePilotConfig> {
  try {
    return validateApifyVenuePilotConfig(
      (await readJson(path, "Apify venue allowlist")) as ApifyVenuePilotConfig,
    );
  } catch (error) {
    if (error instanceof ApifySourceChangeRadarError) throw error;
    const message = error instanceof Error ? error.message : "unknown error";
    invalidConfig(`venue allowlist is invalid: ${message}`);
  }
}

async function loadVenueRegistry(
  path: string,
): Promise<CanonicalVenueRegistry> {
  const value = await readJson(path, "canonical venue registry");
  if (!value || typeof value !== "object") {
    invalidConfig("canonical venue registry root is invalid.");
  }
  const registry = value as CanonicalVenueRegistry;
  if (!Array.isArray(registry.venues)) {
    invalidConfig("canonical venue registry must contain venues.");
  }
  for (const [index, venue] of registry.venues.entries()) {
    if (
      !venue ||
      typeof venue.slug !== "string" ||
      !Array.isArray(venue.urls) ||
      venue.urls.some((url) => typeof url !== "string")
    ) {
      invalidConfig(`canonical venue registry venues[${index}] is invalid.`);
    }
  }
  return registry;
}

async function loadCanonicalEvents(
  path: string,
): Promise<CanonicalVenueEvent[]> {
  const value = await readJson(path, "canonical venue events");
  if (!Array.isArray(value)) {
    invalidConfig("canonical venue events must be an array.");
  }
  return value as CanonicalVenueEvent[];
}

function selectSources(
  config: ApifySourceChangeRadarConfig,
  allowlist: ApifyVenuePilotConfig,
  requestedIds: readonly string[] | undefined,
): ApifyVenuePilotSource[] {
  const allowlistedById = new Map(
    allowlist.sources.map((source) => [source.id, source] as const),
  );
  for (const id of config.sourceIds) {
    if (!allowlistedById.has(id)) {
      invalidConfig(`unknown venue allowlist source id: ${id}.`);
    }
  }
  const selectedIds = requestedIds?.length
    ? [...new Set(requestedIds)]
    : config.sourceIds;
  if (selectedIds.length > config.limits.maxSourcesPerRun) {
    throw new ApifySourceChangeRadarError(
      "RUN_CAP_EXCEEDED",
      `Selected source count exceeds ${config.limits.maxSourcesPerRun}.`,
    );
  }
  const configuredIds = new Set(config.sourceIds);
  for (const id of selectedIds) {
    if (!configuredIds.has(id)) {
      invalidConfig(`unknown reviewed radar source id: ${id}.`);
    }
  }
  return config.sourceIds
    .filter((id) => selectedIds.includes(id))
    .map((id) => allowlistedById.get(id)!);
}

function buildCanonicalChecks(
  sources: readonly ApifyVenuePilotSource[],
  registry: CanonicalVenueRegistry,
  events: readonly CanonicalVenueEvent[],
): Map<string, ApifySourceCanonicalCheck> {
  const checks = new Map<string, ApifySourceCanonicalCheck>();
  for (const source of sources) {
    const venue = registry.venues.find(({ slug }) => slug === source.venueSlug);
    if (!venue) {
      invalidConfig(
        `${source.id} does not match a committed venue registry record.`,
      );
    }
    if (!venue.urls.includes(source.url)) {
      invalidConfig(
        `${source.id} exact URL is missing from its committed venue registry record.`,
      );
    }
    const venueEvents = events.filter(
      (event) => event.venue_slug === source.venueSlug,
    );
    const exactSourceEvents = venueEvents.filter((event) =>
      [
        event.source?.url,
        event.source?.requestedUrl,
        event.source?.finalUrl,
      ].includes(source.url),
    );
    checks.set(source.id, {
      venueSlug: source.venueSlug,
      venueRegistryMatched: true,
      exactSourceUrlMatched: true,
      committedVenueEventCount: venueEvents.length,
      committedExactSourceEventCount: exactSourceEvents.length,
      disposition: "review-required-no-event-candidate",
    });
  }
  return checks;
}

function emptyState(month: string): ApifySourceChangeRadarState {
  return {
    version: 1,
    budget: {
      months: {
        [month]: { attemptedRuns: 0, reservedMaxChargeUsd: 0 },
      },
    },
    observations: {},
  };
}

function isSha256(value: unknown): value is string {
  return typeof value === "string" && /^[a-f0-9]{64}$/.test(value);
}

function validFingerprint(
  value: unknown,
): value is ApifySourceSignalFingerprint {
  if (!value || typeof value !== "object") return false;
  const fingerprint = value as ApifySourceSignalFingerprint;
  return (
    isSha256(fingerprint.contentHash) &&
    Number.isInteger(fingerprint.contentLength) &&
    fingerprint.contentLength >= 0 &&
    [fingerprint.dates, fingerprint.times, fingerprint.eventLinks].every(
      (signal) =>
        signal &&
        isSha256(signal.hash) &&
        Number.isInteger(signal.count) &&
        signal.count >= 0,
    )
  );
}

function validateState(value: unknown): ApifySourceChangeRadarState {
  if (!value || typeof value !== "object") {
    throw new Error("state root is invalid");
  }
  const state = value as ApifySourceChangeRadarState;
  if (
    state.version !== 1 ||
    !state.budget?.months ||
    typeof state.budget.months !== "object" ||
    !state.observations ||
    typeof state.observations !== "object"
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
  const statuses = new Set<ApifySourceChangeRadarStatus>([
    "baseline",
    "unchanged",
    "cosmetic",
    "changed",
    "error",
  ]);
  for (const observation of Object.values(state.observations)) {
    if (
      !observation ||
      typeof observation.sourceUrl !== "string" ||
      !statuses.has(observation.status) ||
      typeof observation.lastCheckedAt !== "string" ||
      !Number.isInteger(observation.consecutiveFailures) ||
      observation.consecutiveFailures < 0 ||
      !Number.isInteger(observation.consecutiveContentOnlyChanges) ||
      observation.consecutiveContentOnlyChanges < 0 ||
      (observation.fingerprint !== undefined &&
        !validFingerprint(observation.fingerprint))
    ) {
      throw new Error("observation shape is invalid");
    }
  }
  return state;
}

async function readState(
  path: string,
  month: string,
  allowInitialize: boolean,
): Promise<ApifySourceChangeRadarState> {
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
      if (!allowInitialize) {
        throw new ApifySourceChangeRadarError(
          "STATE_REQUIRED",
          "Apify source change radar state is missing. Verify current Apify account usage, then initialize the ledger explicitly.",
        );
      }
      return emptyState(month);
    }
    throw error;
  }
  try {
    const state = validateState(JSON.parse(raw) as unknown);
    state.budget.months[month] ??= {
      attemptedRuns: 0,
      reservedMaxChargeUsd: 0,
    };
    return state;
  } catch (error) {
    if (error instanceof ApifySourceChangeRadarError) throw error;
    const message = error instanceof Error ? error.message : "unknown error";
    throw new ApifySourceChangeRadarError(
      "INVALID_STATE",
      `Apify source change radar state is unreadable; it was not reset: ${message}`,
    );
  }
}

async function writeTextAtomic(path: string, value: string): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  const temporaryPath = `${path}.${process.pid}.${randomUUID()}.tmp`;
  await writeFile(temporaryPath, value, "utf8");
  await rename(temporaryPath, path);
}

async function writeJsonAtomic(path: string, value: unknown): Promise<void> {
  await writeTextAtomic(path, `${JSON.stringify(value, null, 2)}\n`);
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
        throw new ApifySourceChangeRadarError(
          "RUN_IN_PROGRESS",
          "Another Apify source change radar run is in progress.",
        );
      }
      await unlink(path);
    }
  }
  throw new ApifySourceChangeRadarError(
    "RUN_IN_PROGRESS",
    "Another Apify source change radar run acquired the lock during recovery.",
  );
}

function sameCanonicalHost(first: string, second: string): boolean {
  try {
    const host = (value: string) =>
      new URL(value).hostname.toLowerCase().replace(/^www\./, "");
    return host(first) === host(second);
  } catch {
    return false;
  }
}

function sameExactPage(first: string, second: string): boolean {
  try {
    return new URL(first).toString() === new URL(second).toString();
  } catch {
    return false;
  }
}

function safeError(error: unknown): RadarErrorEvidence {
  const token = process.env.APIFY_TOKEN ?? "";
  const message = redactApifySecrets(
    error instanceof Error ? error.message : "Unknown Apify radar error.",
    token,
  ).slice(0, 700);
  return {
    code:
      error instanceof ApifyRestError
        ? error.code
        : error instanceof ApifySourceChangeRadarError
          ? error.code
          : "SOURCE_REJECTED",
    message,
    ...(error instanceof ApifyRestError && error.status !== undefined
      ? { httpStatus: error.status }
      : {}),
  };
}

function emptySummary(): Record<ApifySourceChangeRadarStatus, number> {
  return { baseline: 0, unchanged: 0, cosmetic: 0, changed: 0, error: 0 };
}

function reportFileName(now: Date): string {
  return `apify-source-change-radar-${now
    .toISOString()
    .replace(/[:.]/g, "-")}.json`;
}

export function buildApifySourceChangeRadarIssueSignal(
  report: ApifySourceChangeRadarReport,
): ApifySourceChangeRadarIssueSignal {
  const items: ApifySourceChangeRadarIssueSignal["items"] = [];
  for (const result of report.results) {
    const common = {
      sourceId: result.source.id,
      sourceName: result.source.name,
      sourceUrl: result.source.url,
      collectedAt: result.collectedAt,
      actor: result.actor,
      town: result.town,
      confidence: result.confidence,
      parsingWarnings: result.parsingWarnings,
      canonicalCheck: result.canonicalCheck,
    } as const;
    const actionableWarning =
      result.parsingWarnings.includes("same-host-redirect") ||
      result.parsingWarnings.includes("repeated-content-only-drift");
    if (result.status === "changed" && result.fingerprint) {
      items.push({
        ...common,
        status: "changed",
        changedFields: result.changedFields,
        contentHashPrefix: result.fingerprint.contentHash.slice(0, 12),
        dateCount: result.fingerprint.dates.count,
        timeCount: result.fingerprint.times.count,
        eventLinkCount: result.fingerprint.eventLinks.count,
      });
    } else if (result.status === "error") {
      items.push({
        ...common,
        status: "error",
        errorCode: result.error?.code ?? "SOURCE_REJECTED",
        ...(result.error?.httpStatus === undefined
          ? {}
          : { httpStatus: result.error.httpStatus }),
      });
    } else if (actionableWarning) {
      items.push({
        ...common,
        status: "warning",
        changedFields: result.changedFields,
        ...(result.fingerprint
          ? {
              contentHashPrefix: result.fingerprint.contentHash.slice(0, 12),
              dateCount: result.fingerprint.dates.count,
              timeCount: result.fingerprint.times.count,
              eventLinkCount: result.fingerprint.eventLinks.count,
            }
          : {}),
      });
    }
  }
  return {
    schemaVersion: 1,
    marker: "<!-- apify-source-change-radar -->",
    title: "[source-radar] First-party venue pages need review",
    generatedAt: report.generatedAt,
    expiresAt: report.reviewQueue.expiresAt,
    summary: report.summary,
    actionable: items.length > 0,
    items,
  };
}

export function renderApifySourceChangeRadarSummary(
  report: ApifySourceChangeRadarReport,
): string {
  const lines = [
    "## Apify source change radar",
    "",
    "Private fingerprints only. No publisher prose, HTML, images, or social content was retained or published.",
    "",
    `Checked ${report.results.length} exact reviewed page(s): ${report.summary.baseline} baseline, ${report.summary.unchanged} unchanged/skipped, ${report.summary.cosmetic} cosmetic, ${report.summary.changed} schedule-signal changed, ${report.summary.error} failed.`,
    "",
    `Reserved provider ceiling: $${report.budget.reservedMaxChargeUsdThisRun.toFixed(2)} this run; $${report.budget.reservedMaxChargeUsdThisMonth.toFixed(2)}/$${report.budget.maxReservedChargeUsdPerMonth.toFixed(2)} this UTC month.`,
    "",
    `Review queue expires ${report.reviewQueue.expiresAt}; automatic publishing is disabled.`,
    "",
    "| Source | Town | Result | Confidence | Safe signal | Canonical check |",
    "| --- | --- | --- | --- | --- | --- |",
  ];
  for (const result of report.results) {
    let signal: string;
    if (result.status === "error") {
      signal = `${result.error?.code ?? "SOURCE_REJECTED"}${
        result.error?.httpStatus === undefined
          ? ""
          : ` (HTTP ${result.error.httpStatus})`
      }`;
    } else if (result.status === "changed") {
      signal = `changed: ${result.changedFields.join(", ")}`;
    } else if (result.status === "cosmetic") {
      signal = result.parsingWarnings.includes("repeated-content-only-drift")
        ? "repeated content-only drift; review requested"
        : "content-only drift; alert held";
    } else if (result.status === "unchanged") {
      signal = "fingerprints matched; review alert skipped";
    } else {
      signal = "private baseline stored; no change alert";
    }
    lines.push(
      `| [${result.source.name}](${result.source.url}) | ${result.town} | ${result.status} | ${result.confidence} | ${signal} | ${result.canonicalCheck.committedVenueEventCount} committed venue event(s) checked |`,
    );
  }
  lines.push("");
  return `${lines.join("\n")}\n`;
}

export async function runApifySourceChangeRadar(
  options: RunApifySourceChangeRadarOptions = {},
): Promise<{
  reportPath: string;
  statePath: string;
  summaryPath: string;
  issueSignalPath: string;
  report: ApifySourceChangeRadarReport;
  issueSignal: ApifySourceChangeRadarIssueSignal;
}> {
  const now = options.now?.() ?? new Date();
  if (Number.isNaN(now.getTime())) invalidConfig("clock is invalid.");
  const generatedAt = now.toISOString();
  const month = generatedAt.slice(0, 7);
  const config = validateApifySourceChangeRadarConfig(
    options.config ??
      (await loadConfig(options.configPath ?? DEFAULT_CONFIG_PATH)),
  );
  const allowlist = validateApifyVenuePilotConfig(
    options.allowlist ??
      (await loadAllowlist(options.allowlistPath ?? DEFAULT_ALLOWLIST_PATH)),
  );
  const sources = selectSources(config, allowlist, options.sourceIds);
  if (sources.length === 0)
    invalidConfig("at least one reviewed source is required.");
  const venueRegistry =
    options.venueRegistry ??
    (await loadVenueRegistry(
      options.venueRegistryPath ?? DEFAULT_VENUE_REGISTRY_PATH,
    ));
  const canonicalEvents =
    options.canonicalEvents ??
    (await loadCanonicalEvents(
      options.canonicalEventsPath ?? DEFAULT_CANONICAL_EVENTS_PATH,
    ));
  const canonicalChecks = buildCanonicalChecks(
    sources,
    venueRegistry,
    canonicalEvents,
  );
  const expiresAt = new Date(
    now.getTime() + 14 * 24 * 60 * 60 * 1_000,
  ).toISOString();
  const reservedThisRun = Number(
    (sources.length * config.limits.maxChargeUsdPerSource).toFixed(2),
  );
  if (
    reservedThisRun >
    config.limits.maxReservedChargeUsdPerRun + Number.EPSILON
  ) {
    throw new ApifySourceChangeRadarError(
      "RUN_CAP_EXCEEDED",
      "Selected sources exceed the Apify source change radar per-run charge reservation.",
    );
  }

  const reportDirectory = options.reportDirectory ?? DEFAULT_REPORT_DIRECTORY;
  const statePath = join(reportDirectory, "state.json");
  const summaryPath = join(reportDirectory, "github-summary.md");
  const issueSignalPath = join(reportDirectory, "github-issue.json");
  const lock = await acquireLock(join(reportDirectory, ".run.lock"), now);
  try {
    const state = await readState(
      statePath,
      month,
      options.allowInitializeState === true,
    );
    const budget = state.budget.months[month]!;
    if (budget.attemptedRuns + 1 > config.limits.maxRunsPerMonth) {
      throw new ApifySourceChangeRadarError(
        "MONTHLY_CAP_EXCEEDED",
        `Monthly run cap would be exceeded (${budget.attemptedRuns} used + 1 planned > ${config.limits.maxRunsPerMonth}). No provider request was made.`,
      );
    }
    if (
      budget.reservedMaxChargeUsd + reservedThisRun >
      config.limits.maxReservedChargeUsdPerMonth + Number.EPSILON
    ) {
      throw new ApifySourceChangeRadarError(
        "MONTHLY_CAP_EXCEEDED",
        "Monthly reserved-charge cap would be exceeded. No provider request was made.",
      );
    }

    // Reserve the full bounded run before the first provider call. Failed and
    // interrupted requests therefore cannot silently reuse the allowance.
    budget.attemptedRuns += 1;
    budget.reservedMaxChargeUsd = Number(
      (budget.reservedMaxChargeUsd + reservedThisRun).toFixed(2),
    );
    budget.lastReservedAt = generatedAt;
    await writeJsonAtomic(statePath, state);

    const fetchPage = options.fetchPage ?? fetchApifyPage;
    const summary = emptySummary();
    const results: ApifySourceChangeRadarResult[] = [];
    for (const source of sources) {
      const previous = state.observations[source.id];
      const canonicalCheck = canonicalChecks.get(source.id)!;
      try {
        const snapshot = await fetchPage(source.url, {
          timeoutMs: config.limits.timeoutMs,
          maxTotalChargeUsd: config.limits.maxChargeUsdPerSource,
        });
        if (!sameCanonicalHost(source.url, snapshot.finalUrl)) {
          throw new ApifyRestError(
            "INVALID_RESPONSE",
            `Apify reported an unexpected cross-host final URL: ${snapshot.finalUrl}`,
          );
        }
        if (
          snapshot.usageTotalUsd !== undefined &&
          snapshot.usageTotalUsd >
            config.limits.maxChargeUsdPerSource + Number.EPSILON
        ) {
          throw new ApifyRestError(
            "INVALID_RESPONSE",
            "Apify reported usage above the configured per-source provider cap.",
          );
        }
        const fingerprint = fingerprintApifySource(
          snapshot.markdown,
          snapshot.links,
          source.url,
        );
        const changedFields = previous?.fingerprint
          ? changedApifySourceFingerprintFields(
              previous.fingerprint,
              fingerprint,
            )
          : [];
        const contentOnlyChange =
          changedFields.length === 1 && changedFields[0] === "content";
        const consecutiveContentOnlyChanges = contentOnlyChange
          ? (previous?.consecutiveContentOnlyChanges ?? 0) + 1
          : 0;
        const status: Exclude<ApifySourceChangeRadarStatus, "error"> =
          !previous?.fingerprint
            ? "baseline"
            : changedFields.length === 0
              ? "unchanged"
              : contentOnlyChange
                ? "cosmetic"
                : "changed";
        const parsingWarnings: string[] = [];
        if (fingerprint.dates.count === 0) {
          parsingWarnings.push("no-date-signals");
        }
        if (fingerprint.times.count === 0) {
          parsingWarnings.push("no-time-signals");
        }
        if (fingerprint.eventLinks.count === 0) {
          parsingWarnings.push("no-event-link-signals");
        }
        if (snapshot.usageTotalUsd === undefined) {
          parsingWarnings.push("provider-usage-unreported");
        }
        const redirected = !sameExactPage(source.url, snapshot.finalUrl);
        if (redirected) parsingWarnings.push("same-host-redirect");
        if (contentOnlyChange) parsingWarnings.push("content-only-drift");
        if (
          contentOnlyChange &&
          consecutiveContentOnlyChanges >=
            config.limits.contentOnlyAlertAfterConsecutiveRuns
        ) {
          parsingWarnings.push("repeated-content-only-drift");
        }
        const confidence: ApifySourceChangeConfidence = redirected
          ? "medium"
          : status === "changed"
            ? changedFields.includes("dates") || changedFields.includes("times")
              ? "high"
              : "medium"
            : status === "unchanged"
              ? "high"
              : "low";
        summary[status] += 1;
        state.observations[source.id] = {
          sourceUrl: source.url,
          status,
          lastCheckedAt: generatedAt,
          lastSuccessfulAt: generatedAt,
          lastChangedAt:
            status === "baseline" || status === "changed"
              ? generatedAt
              : previous?.lastChangedAt,
          fingerprint,
          consecutiveFailures: 0,
          consecutiveContentOnlyChanges,
        };
        results.push({
          source,
          status,
          collectedAt: generatedAt,
          actor: "apify/website-content-crawler",
          town: source.town,
          confidence,
          parsingWarnings,
          canonicalCheck,
          finalUrl: snapshot.finalUrl,
          changedFields,
          ...(previous?.fingerprint
            ? { previousFingerprint: previous.fingerprint }
            : {}),
          fingerprint,
          provider: {
            runId: snapshot.runId,
            datasetId: snapshot.datasetId,
            consoleRunUrl: `https://console.apify.com/actors/runs/${snapshot.runId}`,
            ...(snapshot.usageTotalUsd === undefined
              ? {}
              : { usageTotalUsd: snapshot.usageTotalUsd }),
          },
        });
      } catch (error) {
        const evidence = safeError(error);
        summary.error += 1;
        state.observations[source.id] = {
          ...previous,
          sourceUrl: source.url,
          status: "error",
          lastCheckedAt: generatedAt,
          consecutiveFailures: (previous?.consecutiveFailures ?? 0) + 1,
          consecutiveContentOnlyChanges:
            previous?.consecutiveContentOnlyChanges ?? 0,
          errorCode: evidence.code,
          ...(evidence.httpStatus === undefined
            ? {}
            : { httpStatus: evidence.httpStatus }),
        };
        results.push({
          source,
          status: "error",
          collectedAt: generatedAt,
          actor: "apify/website-content-crawler",
          town: source.town,
          confidence: "low",
          parsingWarnings: ["source-retrieval-failed"],
          canonicalCheck,
          changedFields: [],
          ...(previous?.fingerprint
            ? { previousFingerprint: previous.fingerprint }
            : {}),
          error: evidence,
        });
      }
      // Preserve both the reservation and each completed observation if a
      // later exact page or the runner fails.
      await writeJsonAtomic(statePath, state);
    }

    const report: ApifySourceChangeRadarReport = {
      schemaVersion: 1,
      kind: "private-change-radar",
      generatedAt,
      notice:
        "Review signal only. Hashes and counts can show that a first-party page changed; they do not verify an event and never publish Radius data.",
      reviewQueue: {
        automaticPublishing: false,
        expiresAt,
      },
      provider: {
        name: "apify",
        actor: "apify/website-content-crawler",
      },
      budget: {
        month,
        attemptedRunsThisMonth: budget.attemptedRuns,
        maxRunsPerMonth: config.limits.maxRunsPerMonth,
        sourcesThisRun: sources.length,
        maxSourcesPerRun: config.limits.maxSourcesPerRun,
        reservedMaxChargeUsdThisRun: reservedThisRun,
        maxReservedChargeUsdPerRun: config.limits.maxReservedChargeUsdPerRun,
        reservedMaxChargeUsdThisMonth: budget.reservedMaxChargeUsd,
        maxReservedChargeUsdPerMonth:
          config.limits.maxReservedChargeUsdPerMonth,
      },
      summary,
      results,
    };
    const issueSignal = buildApifySourceChangeRadarIssueSignal(report);
    const reportPath = join(reportDirectory, reportFileName(now));
    await writeJsonAtomic(reportPath, report);
    await writeTextAtomic(
      summaryPath,
      renderApifySourceChangeRadarSummary(report),
    );
    await writeJsonAtomic(issueSignalPath, issueSignal);
    return {
      reportPath,
      statePath,
      summaryPath,
      issueSignalPath,
      report,
      issueSignal,
    };
  } finally {
    await lock.release();
  }
}

export function parseApifySourceChangeRadarCliArgs(
  args: readonly string[],
): ApifySourceChangeRadarCliArgs {
  let live = false;
  let confirmed = false;
  let initializeState = false;
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
    if (argument === "--initialize-state") {
      initializeState = true;
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
    throw new Error(`Unknown Apify source change radar argument: ${argument}`);
  }
  return {
    live,
    confirmed,
    initializeState,
    sourceIds: [...new Set(sourceIds)],
  };
}

async function main(): Promise<void> {
  const args = parseApifySourceChangeRadarCliArgs(process.argv.slice(2));
  const config = await loadConfig(DEFAULT_CONFIG_PATH);
  const allowlist = await loadAllowlist(DEFAULT_ALLOWLIST_PATH);
  const selected = selectSources(config, allowlist, args.sourceIds);
  const reserved = Number(
    (selected.length * config.limits.maxChargeUsdPerSource).toFixed(2),
  );
  if (!args.live) {
    console.log(
      `Apify source change radar plan: ${selected.length} exact reviewed page(s); provider ceiling $${reserved.toFixed(2)} per run and $${config.limits.maxReservedChargeUsdPerMonth.toFixed(2)} per UTC month.`,
    );
    for (const source of selected) console.log(`- ${source.id}: ${source.url}`);
    console.log("Plan only. No provider request or file was written.");
    return;
  }
  if (!args.confirmed) {
    throw new ApifySourceChangeRadarError(
      "LIVE_CONFIRMATION_REQUIRED",
      "A live Apify source change radar run requires --live and --confirm.",
    );
  }
  if (!process.env.APIFY_TOKEN) {
    throw new Error(
      "APIFY_TOKEN is required in the dedicated offline runner environment.",
    );
  }
  const result = await runApifySourceChangeRadar({
    config,
    allowlist,
    sourceIds: args.sourceIds,
    allowInitializeState: args.initializeState,
  });
  console.log(
    `Apify source change radar checked ${result.report.results.length} source(s): ${result.report.summary.unchanged} unchanged/skipped, ${result.report.summary.changed} changed, ${result.report.summary.error} failed.`,
  );
  console.log(`Private report: ${result.reportPath}`);
  if (result.report.summary.error === result.report.results.length) {
    throw new Error(
      "Every reviewed source failed. Review the private radar evidence.",
    );
  }
}

const invokedPath = process.argv[1] ? resolve(process.argv[1]) : "";
if (invokedPath === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(safeError(error).message);
    process.exitCode = 1;
  });
}
