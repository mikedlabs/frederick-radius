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
  assertSuccessfulFirecrawlTargetStatus,
  fetchFirecrawlPage,
  FirecrawlRestError,
  validateFirecrawlPublicUrl,
  type FirecrawlPageSnapshot,
  type FirecrawlRestOptions,
} from "./lib/firecrawl-rest";

loadEnvironment({ path: resolve(".env.local"), quiet: true });
loadEnvironment({ quiet: true });

const DEFAULT_CONFIG_PATH = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "../config/source-watch.json",
);
const DEFAULT_REPORT_DIRECTORY = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "reports/source-watch",
);
const CREDITS_PER_SOURCE = 1;
const ABSOLUTE_MONTHLY_CREDIT_CAP = 500;
const REVIEW_EXPIRY_MS = 14 * 24 * 60 * 60 * 1_000;

export type SourceWatchStatus =
  "new" | "same" | "changed" | "removed" | "error";

export type SourceWatchSource = {
  id: string;
  name: string;
  url: string;
  category: string;
  provenance: "first-party" | "government";
  purpose: string;
  rightsPosture: string;
  /** Required only when a reviewed source genuinely has no HTTPS endpoint. */
  httpException?: {
    reviewedBy: string;
    reason: string;
  };
};

export type SourceWatchConfig = {
  version: number;
  mode: "candidate-only";
  limits: {
    maxSources: number;
    maxCreditsPerRun: number;
    maxCreditsPerMonth: number;
    timeoutMs: number;
  };
  sources: SourceWatchSource[];
};

type StoredObservation = {
  url: string;
  finalUrl?: string;
  contentHash?: string;
  textLength?: number;
  linkCount?: number;
  firstObservedAt?: string;
  lastChangedAt?: string;
  lastCheckedAt: string;
  status: SourceWatchStatus;
  errorCode?: string;
  httpStatus?: number;
  /** A reviewed id moved to a new exact URL but has not established a baseline. */
  identityResetAt?: string;
};

type SourceWatchState = {
  version: 1;
  budget: {
    months: Record<
      string,
      {
        attemptedCredits: number;
        lastReservedAt?: string;
      }
    >;
  };
  observations: Record<string, StoredObservation>;
};

export type SourceWatchCandidate = {
  source: SourceWatchSource;
  status: Exclude<SourceWatchStatus, "same">;
  checkedAt: string;
  finalUrl?: string;
  previousHash?: string;
  currentHash?: string;
  textLength?: number;
  linkCount?: number;
  links?: string[];
  metadata?: Record<string, unknown>;
  errorCode?: string;
  httpStatus?: number;
  error?: string;
};

export type SourceWatchReport = {
  schemaVersion: 1;
  kind: "candidate-only";
  provider: {
    name: "firecrawl";
  };
  generatedAt: string;
  notice: string;
  budget: {
    month: string;
    attemptedCreditsThisRun: number;
    attemptedCreditsThisMonth: number;
    maxCreditsPerRun: number;
    maxCreditsPerMonth: number;
  };
  summary: Record<SourceWatchStatus, number>;
  sourcesChecked: Array<{ id: string; url: string }>;
  candidates: SourceWatchCandidate[];
};

export type SourceWatchIssueStatus =
  "baseline" | "same" | "changed" | "removed" | "error" | "url-baseline";

export type SourceWatchIssueItem = {
  sourceId: string;
  sourceUrl: string;
  checkedAt: string;
  expiresAt: string;
  status: SourceWatchIssueStatus;
  previousHash?: string;
  currentHash?: string;
  textLength?: number;
  linkCount?: number;
  errorCode?: string;
  httpStatus?: number;
};

export type SourceWatchIssueSignal = {
  schemaVersion: 1;
  generatedAt: string;
  items: SourceWatchIssueItem[];
};

type FirecrawlPageFetcher = (
  requestedUrl: string,
  options?: FirecrawlRestOptions,
) => Promise<FirecrawlPageSnapshot>;

export type RunSourceWatchOptions = {
  config?: SourceWatchConfig;
  configPath?: string;
  reportDirectory?: string;
  fetchPage?: FirecrawlPageFetcher;
  now?: () => Date;
  /** Optional exact source ids from the reviewed allowlist. */
  sourceIds?: readonly string[];
};

export type SourceWatchCliArgs = {
  live: boolean;
  confirmed: boolean;
  sourceIds: string[];
};

export class SourceWatchError extends Error {
  readonly code:
    | "INVALID_CONFIG"
    | "RUN_CAP_EXCEEDED"
    | "MONTHLY_CAP_EXCEEDED"
    | "RUN_IN_PROGRESS"
    | "INVALID_STATE";

  constructor(code: SourceWatchError["code"], message: string) {
    super(message);
    this.name = "SourceWatchError";
    this.code = code;
  }
}

export function normalizeSourceWatchContent(text: string): string {
  return text
    .normalize("NFKC")
    .replace(/\r\n?/g, "\n")
    .replace(/\u00a0/g, " ")
    .replace(/[\u200B-\u200D\uFEFF]/g, "")
    .split("\n")
    .map((line) => line.trim().replace(/[ \t]+/g, " "))
    .filter(Boolean)
    .join("\n");
}

export function hashSourceWatchContent(text: string): string {
  return createHash("sha256")
    .update(normalizeSourceWatchContent(text))
    .digest("hex");
}

export function classifySourceWatchHash(
  previousHash: string | undefined,
  currentHash: string,
): "new" | "same" | "changed" {
  if (!previousHash) return "new";
  return previousHash === currentHash ? "same" : "changed";
}

function invalidConfig(message: string): never {
  throw new SourceWatchError(
    "INVALID_CONFIG",
    `Source Watch config: ${message}`,
  );
}

function assertPositiveInteger(
  value: unknown,
  label: string,
): asserts value is number {
  if (!Number.isInteger(value) || Number(value) <= 0) {
    invalidConfig(`${label} must be a positive integer.`);
  }
}

function validateExactPublicUrl(
  value: unknown,
  label: string,
  allowHttp: boolean,
): string {
  if (typeof value !== "string" || !value || value !== value.trim()) {
    invalidConfig(
      `${label} must be an exact URL without surrounding whitespace.`,
    );
  }

  try {
    validateFirecrawlPublicUrl(value, { allowHttp });
  } catch (error) {
    if (error instanceof SourceWatchError) throw error;
    invalidConfig(
      `${label} must be a public ${allowHttp ? "HTTP(S)" : "HTTPS"} URL without credentials or a fragment.`,
    );
  }

  return value;
}

export function validateSourceWatchConfig(
  value: SourceWatchConfig,
): SourceWatchConfig {
  if (!value || typeof value !== "object")
    invalidConfig("root must be an object.");
  if (value.version !== 1) invalidConfig("version must be 1.");
  if (value.mode !== "candidate-only") {
    invalidConfig('mode must be "candidate-only".');
  }
  if (!value.limits || typeof value.limits !== "object") {
    invalidConfig("limits are required.");
  }

  assertPositiveInteger(value.limits.maxSources, "limits.maxSources");
  assertPositiveInteger(
    value.limits.maxCreditsPerRun,
    "limits.maxCreditsPerRun",
  );
  assertPositiveInteger(
    value.limits.maxCreditsPerMonth,
    "limits.maxCreditsPerMonth",
  );
  assertPositiveInteger(value.limits.timeoutMs, "limits.timeoutMs");

  if (value.limits.maxSources > 15) {
    invalidConfig("limits.maxSources cannot exceed 15.");
  }
  if (value.limits.maxCreditsPerRun > 15) {
    invalidConfig("limits.maxCreditsPerRun cannot exceed 15.");
  }
  if (value.limits.maxCreditsPerMonth > ABSOLUTE_MONTHLY_CREDIT_CAP) {
    invalidConfig(
      `limits.maxCreditsPerMonth cannot exceed the absolute safety ceiling of ${ABSOLUTE_MONTHLY_CREDIT_CAP}.`,
    );
  }
  if (value.limits.timeoutMs > 60_000) {
    invalidConfig("limits.timeoutMs cannot exceed 60000.");
  }
  if (!Array.isArray(value.sources)) invalidConfig("sources must be an array.");
  if (
    value.sources.length < 10 ||
    value.sources.length > value.limits.maxSources
  ) {
    invalidConfig(
      `sources must contain 10-${value.limits.maxSources} allowlisted entries.`,
    );
  }

  const ids = new Set<string>();
  const urls = new Set<string>();
  for (const [index, source] of value.sources.entries()) {
    const prefix = `sources[${index}]`;
    if (!source || typeof source !== "object") {
      invalidConfig(`${prefix} must be an object.`);
    }
    if (
      typeof source.id !== "string" ||
      !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(source.id)
    ) {
      invalidConfig(`${prefix}.id must be a lowercase kebab-case identifier.`);
    }
    if (ids.has(source.id)) invalidConfig(`${prefix}.id is duplicated.`);
    ids.add(source.id);

    const httpException = source.httpException;
    if (
      httpException !== undefined &&
      (!httpException ||
        typeof httpException !== "object" ||
        typeof httpException.reviewedBy !== "string" ||
        !httpException.reviewedBy.trim() ||
        typeof httpException.reason !== "string" ||
        !httpException.reason.trim())
    ) {
      invalidConfig(`${prefix}.httpException requires reviewedBy and reason.`);
    }
    const allowHttp = httpException !== undefined;
    const exactUrl = validateExactPublicUrl(
      source.url,
      `${prefix}.url`,
      allowHttp,
    );
    if (new URL(exactUrl).protocol === "https:" && allowHttp) {
      invalidConfig(
        `${prefix}.httpException is only valid for a reviewed HTTP source.`,
      );
    }
    if (urls.has(exactUrl)) invalidConfig(`${prefix}.url is duplicated.`);
    urls.add(exactUrl);

    if (
      typeof source.name !== "string" ||
      !source.name.trim() ||
      typeof source.category !== "string" ||
      !source.category.trim() ||
      typeof source.purpose !== "string" ||
      !source.purpose.trim() ||
      typeof source.rightsPosture !== "string" ||
      !source.rightsPosture.trim()
    ) {
      invalidConfig(
        `${prefix} requires non-empty name, category, purpose, and rightsPosture.`,
      );
    }
    if (
      source.provenance !== "first-party" &&
      source.provenance !== "government"
    ) {
      invalidConfig(`${prefix}.provenance must be first-party or government.`);
    }
  }

  const plannedCredits = value.sources.length * CREDITS_PER_SOURCE;
  if (plannedCredits > value.limits.maxCreditsPerRun) {
    invalidConfig(
      `the allowlist needs ${plannedCredits} credits, above maxCreditsPerRun ${value.limits.maxCreditsPerRun}.`,
    );
  }
  if (value.limits.maxCreditsPerRun > value.limits.maxCreditsPerMonth) {
    invalidConfig("maxCreditsPerRun cannot exceed maxCreditsPerMonth.");
  }

  return value;
}

export function selectSourceWatchSources(
  config: SourceWatchConfig,
  sourceIds: readonly string[] | undefined,
): SourceWatchConfig {
  const validated = validateSourceWatchConfig(config);
  if (!sourceIds || sourceIds.length === 0) return validated;

  const uniqueIds = [...new Set(sourceIds)];
  for (const id of uniqueIds) {
    if (!id || id !== id.trim()) {
      invalidConfig("selected source ids must be non-empty and trimmed.");
    }
  }

  const sourcesById = new Map(
    validated.sources.map((source) => [source.id, source] as const),
  );
  const unknownIds = uniqueIds.filter((id) => !sourcesById.has(id));
  if (unknownIds.length > 0) {
    invalidConfig(
      `unknown selected source id${unknownIds.length === 1 ? "" : "s"}: ${unknownIds.join(", ")}.`,
    );
  }

  return {
    ...validated,
    sources: uniqueIds.map((id) => sourcesById.get(id)!),
  };
}

async function readConfig(configPath: string): Promise<SourceWatchConfig> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(await readFile(configPath, "utf8"));
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "unknown read error";
    throw new SourceWatchError(
      "INVALID_CONFIG",
      `Could not read Source Watch config: ${message}`,
    );
  }
  return validateSourceWatchConfig(parsed as SourceWatchConfig);
}

function emptyState(month: string): SourceWatchState {
  return {
    version: 1,
    budget: { months: { [month]: { attemptedCredits: 0 } } },
    observations: {},
  };
}

async function readState(
  statePath: string,
  month: string,
): Promise<SourceWatchState> {
  let raw: string;
  try {
    raw = await readFile(statePath, "utf8");
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
    const state = JSON.parse(raw) as SourceWatchState;
    if (
      state.version !== 1 ||
      !state.budget ||
      !state.budget.months ||
      typeof state.budget.months !== "object" ||
      !state.observations ||
      typeof state.observations !== "object"
    ) {
      throw new Error("state shape is invalid");
    }
    for (const monthlyBudget of Object.values(state.budget.months)) {
      if (
        !monthlyBudget ||
        !Number.isInteger(monthlyBudget.attemptedCredits) ||
        monthlyBudget.attemptedCredits < 0
      ) {
        throw new Error("monthly budget shape is invalid");
      }
    }
    state.budget.months[month] ??= { attemptedCredits: 0 };
    return state;
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "unknown parse error";
    throw new SourceWatchError(
      "INVALID_STATE",
      `Source Watch state is unreadable; budget was not reset: ${message}`,
    );
  }
}

async function writeJsonAtomic(path: string, value: unknown): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  const temporaryPath = `${path}.${process.pid}.${randomUUID()}.tmp`;
  await writeFile(temporaryPath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
  await rename(temporaryPath, path);
}

function canonicalHost(url: string): string {
  return new URL(url).hostname.toLowerCase().replace(/^www\./, "");
}

function isExpectedFinalHost(requestedUrl: string, finalUrl: string): boolean {
  try {
    return canonicalHost(requestedUrl) === canonicalHost(finalUrl);
  } catch {
    return false;
  }
}

function safeMetadata(
  metadata: Record<string, unknown>,
): Record<string, unknown> {
  const allowedKeys = ["title", "statusCode", "contentType", "language"];
  return Object.fromEntries(
    allowedKeys
      .filter((key) => metadata[key] !== undefined)
      .map((key) => [key, metadata[key]]),
  );
}

export function sanitizeSourceWatchLinks(
  links: readonly string[],
  sourceUrl: string,
  allowHttp = false,
): string[] {
  const source = validateFirecrawlPublicUrl(sourceUrl, { allowHttp });
  const sanitized = new Set<string>();

  for (const rawLink of links) {
    try {
      const parsed = new URL(rawLink, source);
      if (canonicalHost(parsed.href) !== canonicalHost(source.href)) continue;
      parsed.search = "";
      parsed.hash = "";
      validateFirecrawlPublicUrl(parsed.href, { allowHttp });
      sanitized.add(parsed.href);
    } catch {
      // Provider-returned links are optional evidence. Unsafe, malformed, or
      // cross-host values are discarded rather than retained in an artifact.
    }
    if (sanitized.size >= 25) break;
  }

  return [...sanitized];
}

function safeErrorMessage(error: unknown): string {
  const message =
    error instanceof Error ? error.message : "Unknown source error";
  const apiKey = process.env.FIRECRAWL_API_KEY ?? "";
  const redacted = apiKey ? message.split(apiKey).join("[redacted]") : message;
  return redacted.replace(/\bfc-[A-Za-z0-9_-]+\b/g, "[redacted]").slice(0, 500);
}

function emptySummary(): Record<SourceWatchStatus, number> {
  return { new: 0, same: 0, changed: 0, removed: 0, error: 0 };
}

function reportFileName(now: Date): string {
  return `source-watch-${now.toISOString().replace(/[:.]/g, "-")}.json`;
}

const LOCK_STALE_MS = 30 * 60 * 1_000;

type LockRecord = {
  pid: number;
  createdAt: string;
  token: string;
};

function errorCode(error: unknown): string | null {
  return error && typeof error === "object" && "code" in error
    ? String(error.code)
    : null;
}

function processAppearsAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    if (errorCode(error) === "EPERM") return true;
    if (errorCode(error) === "ESRCH") return false;
    return true;
  }
}

async function inspectExistingLock(
  lockPath: string,
  now: Date,
): Promise<{ raw: string; stale: boolean } | null> {
  try {
    const raw = await readFile(lockPath, "utf8");
    try {
      const record = JSON.parse(raw) as Partial<LockRecord>;
      const createdAt =
        typeof record.createdAt === "string"
          ? Date.parse(record.createdAt)
          : Number.NaN;
      if (
        Number.isInteger(record.pid) &&
        Number(record.pid) > 0 &&
        Number.isFinite(createdAt) &&
        typeof record.token === "string" &&
        record.token.length > 0
      ) {
        return {
          raw,
          stale:
            now.getTime() - createdAt >= LOCK_STALE_MS ||
            !processAppearsAlive(Number(record.pid)),
        };
      }
    } catch {
      // A malformed recent lock remains conservative; an old one can recover.
    }
    const details = await stat(lockPath);
    return {
      raw,
      stale: now.getTime() - details.mtimeMs >= LOCK_STALE_MS,
    };
  } catch (error) {
    if (errorCode(error) === "ENOENT") return null;
    throw error;
  }
}

async function removeObservedLock(
  lockPath: string,
  observedRaw: string,
): Promise<boolean> {
  try {
    if ((await readFile(lockPath, "utf8")) !== observedRaw) return false;
    await unlink(lockPath);
    return true;
  } catch (error) {
    if (errorCode(error) === "ENOENT") return true;
    throw error;
  }
}

async function acquireLock(
  lockPath: string,
  now: Date,
): Promise<{
  release: () => Promise<void>;
}> {
  await mkdir(dirname(lockPath), { recursive: true });
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const record: LockRecord = {
      pid: process.pid,
      createdAt: now.toISOString(),
      token: randomUUID(),
    };
    const raw = `${JSON.stringify(record)}\n`;
    try {
      const handle = await open(lockPath, "wx");
      try {
        await handle.writeFile(raw, "utf8");
      } catch (error) {
        await unlink(lockPath).catch(() => undefined);
        throw error;
      } finally {
        await handle.close();
      }
      return {
        release: async () => {
          await removeObservedLock(lockPath, raw).catch(() => false);
        },
      };
    } catch (error) {
      if (errorCode(error) !== "EEXIST") throw error;
      const existing = await inspectExistingLock(lockPath, now);
      if (!existing) continue;
      if (!existing.stale) {
        throw new SourceWatchError(
          "RUN_IN_PROGRESS",
          "Another Source Watch run is already in progress.",
        );
      }
      await removeObservedLock(lockPath, existing.raw);
    }
  }
  throw new SourceWatchError(
    "RUN_IN_PROGRESS",
    "Another Source Watch run acquired the lock during stale-lock recovery.",
  );
}

export async function runSourceWatch(
  options: RunSourceWatchOptions = {},
): Promise<{
  reportPath: string;
  statePath: string;
  issueSignalPath: string;
  report: SourceWatchReport;
  issueSignal: SourceWatchIssueSignal;
}> {
  const now = options.now?.() ?? new Date();
  if (Number.isNaN(now.getTime())) {
    throw new SourceWatchError(
      "INVALID_CONFIG",
      "Source Watch clock is invalid.",
    );
  }
  const checkedAt = now.toISOString();
  const expiresAt = new Date(now.getTime() + REVIEW_EXPIRY_MS).toISOString();
  const month = checkedAt.slice(0, 7);
  const loadedConfig =
    options.config ??
    (await readConfig(options.configPath ?? DEFAULT_CONFIG_PATH));
  const config = selectSourceWatchSources(loadedConfig, options.sourceIds);
  const reportDirectory = options.reportDirectory ?? DEFAULT_REPORT_DIRECTORY;
  const statePath = join(reportDirectory, "state.json");
  const lockPath = join(reportDirectory, ".run.lock");
  const lock = await acquireLock(lockPath, now);

  try {
    const state = await readState(statePath, month);
    const monthlyBudget = state.budget.months[month];
    const attemptedCredits = config.sources.length * CREDITS_PER_SOURCE;
    if (attemptedCredits > config.limits.maxCreditsPerRun) {
      throw new SourceWatchError(
        "RUN_CAP_EXCEEDED",
        `Source Watch needs ${attemptedCredits} credits, above the per-run cap of ${config.limits.maxCreditsPerRun}.`,
      );
    }
    if (
      monthlyBudget.attemptedCredits + attemptedCredits >
      config.limits.maxCreditsPerMonth
    ) {
      throw new SourceWatchError(
        "MONTHLY_CAP_EXCEEDED",
        `Source Watch monthly cap would be exceeded (${monthlyBudget.attemptedCredits} used + ${attemptedCredits} planned > ${config.limits.maxCreditsPerMonth}). No source was requested.`,
      );
    }

    // Reserve conservatively before making network requests. A failed or
    // interrupted run therefore cannot silently spend the same allowance twice.
    monthlyBudget.attemptedCredits += attemptedCredits;
    monthlyBudget.lastReservedAt = checkedAt;
    await writeJsonAtomic(statePath, state);

    const fetchPage = options.fetchPage ?? fetchFirecrawlPage;
    const summary = emptySummary();
    const candidates: SourceWatchCandidate[] = [];
    const issueItems: SourceWatchIssueItem[] = [];

    for (const source of config.sources) {
      const storedPrevious = state.observations[source.id];
      const sourceUrlChanged = Boolean(
        storedPrevious && storedPrevious.url !== source.url,
      );
      // A hash from a different exact page is never comparable. If the first
      // fetch of the new URL fails, identityResetAt keeps the fresh baseline
      // pending until a successful observation can make it review-visible.
      const previous = sourceUrlChanged ? undefined : storedPrevious;
      const identityBaseline = Boolean(
        sourceUrlChanged ||
        (previous?.identityResetAt && !previous.contentHash),
      );
      let observedFinalUrl: string | undefined;
      try {
        const snapshot = await fetchPage(source.url, {
          timeoutMs: config.limits.timeoutMs,
          allowHttp: source.httpException !== undefined,
          requireReportedFinalUrl: true,
          // Change detection must compare a current observation, never
          // Firecrawl's default cached copy, and the provider must not retain
          // the fetched page in its cache.
          maxAgeMs: 0,
          storeInCache: false,
          // Keep each allowlisted source to the single credit reserved above.
          proxy: "basic",
        });
        observedFinalUrl = snapshot.finalUrl;
        if (!isExpectedFinalHost(source.url, snapshot.finalUrl)) {
          throw new Error(
            `Unexpected cross-host redirect to ${snapshot.finalUrl}; candidate was not accepted.`,
          );
        }
        assertSuccessfulFirecrawlTargetStatus(snapshot.metadata);

        const currentHash = hashSourceWatchContent(snapshot.markdown);
        const status = classifySourceWatchHash(
          previous?.contentHash,
          currentHash,
        );
        summary[status] += 1;
        const observation: StoredObservation = {
          url: source.url,
          finalUrl: snapshot.finalUrl,
          contentHash: currentHash,
          textLength: snapshot.markdown.length,
          linkCount: snapshot.links.length,
          firstObservedAt: previous?.firstObservedAt ?? checkedAt,
          lastChangedAt:
            status === "new" || status === "changed"
              ? checkedAt
              : previous?.lastChangedAt,
          lastCheckedAt: checkedAt,
          status,
        };
        state.observations[source.id] = observation;
        issueItems.push({
          sourceId: source.id,
          sourceUrl: source.url,
          checkedAt,
          expiresAt,
          status: identityBaseline
            ? "url-baseline"
            : status === "new"
              ? "baseline"
              : status,
          ...(previous?.contentHash && status === "changed"
            ? { previousHash: previous.contentHash }
            : {}),
          currentHash,
          textLength: snapshot.markdown.length,
          linkCount: snapshot.links.length,
        });

        if (status !== "same") {
          candidates.push({
            source,
            status,
            checkedAt,
            finalUrl: snapshot.finalUrl,
            previousHash: previous?.contentHash,
            currentHash,
            textLength: snapshot.markdown.length,
            linkCount: snapshot.links.length,
            links: sanitizeSourceWatchLinks(
              snapshot.links,
              source.url,
              source.httpException !== undefined,
            ),
            metadata: safeMetadata(snapshot.metadata),
          });
        }
      } catch (error) {
        const httpStatus =
          error instanceof FirecrawlRestError ? error.status : undefined;
        const targetWasRemoved =
          error instanceof FirecrawlRestError &&
          error.code === "TARGET_HTTP_ERROR" &&
          (httpStatus === 404 || httpStatus === 410);
        const status: "removed" | "error" = targetWasRemoved
          ? "removed"
          : "error";
        summary[status] += 1;
        const errorCode =
          error instanceof FirecrawlRestError ? error.code : "SOURCE_REJECTED";
        state.observations[source.id] = {
          ...(sourceUrlChanged ? {} : previous),
          url: source.url,
          lastCheckedAt: checkedAt,
          status,
          errorCode,
          httpStatus,
          ...(identityBaseline
            ? { identityResetAt: previous?.identityResetAt ?? checkedAt }
            : {}),
        };
        issueItems.push({
          sourceId: source.id,
          sourceUrl: source.url,
          checkedAt,
          expiresAt,
          status,
          ...(!sourceUrlChanged && previous?.contentHash
            ? { previousHash: previous.contentHash }
            : {}),
          errorCode,
          ...(httpStatus === undefined ? {} : { httpStatus }),
        });
        candidates.push({
          source,
          status,
          checkedAt,
          // Preserve a provider-reported redirect for review without accepting
          // it into the last-known-good observation state.
          finalUrl: observedFinalUrl ?? previous?.finalUrl,
          previousHash: sourceUrlChanged ? undefined : previous?.contentHash,
          errorCode,
          httpStatus,
          error: safeErrorMessage(error),
        });
      }

      // Persist after every source so an interrupted run keeps completed
      // observations and the already-reserved budget.
      await writeJsonAtomic(statePath, state);
    }

    const report: SourceWatchReport = {
      schemaVersion: 1,
      kind: "candidate-only",
      provider: {
        name: "firecrawl",
      },
      generatedAt: checkedAt,
      notice:
        "Review candidates only. A detected page change is not verified truth and nothing in this report is published automatically.",
      budget: {
        month,
        attemptedCreditsThisRun: attemptedCredits,
        attemptedCreditsThisMonth: monthlyBudget.attemptedCredits,
        maxCreditsPerRun: config.limits.maxCreditsPerRun,
        maxCreditsPerMonth: config.limits.maxCreditsPerMonth,
      },
      summary,
      sourcesChecked: config.sources.map(({ id, url }) => ({ id, url })),
      candidates,
    };
    const reportPath = join(reportDirectory, reportFileName(now));
    const issueSignalPath = join(reportDirectory, "github-issue.json");
    const issueSignal: SourceWatchIssueSignal = {
      schemaVersion: 1,
      generatedAt: checkedAt,
      items: issueItems,
    };
    await writeJsonAtomic(reportPath, report);
    await writeJsonAtomic(issueSignalPath, issueSignal);
    return {
      reportPath,
      statePath,
      issueSignalPath,
      report,
      issueSignal,
    };
  } finally {
    await lock.release();
  }
}

export function sourceWatchReportHasSuccessfulRetrieval(
  report: SourceWatchReport,
): boolean {
  return report.sourcesChecked.length > report.summary.error;
}

export function parseSourceWatchCliArgs(
  args: readonly string[],
): SourceWatchCliArgs {
  const sourceIds: string[] = [];
  let live = false;
  let confirmed = false;

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
      if (!sourceId) {
        throw new Error("--source requires a reviewed source id.");
      }
      sourceIds.push(sourceId);
      continue;
    }
    throw new Error(`Unknown Source Watch argument: ${argument}`);
  }

  return { live, confirmed, sourceIds };
}

async function main(): Promise<void> {
  const { live, confirmed, sourceIds } = parseSourceWatchCliArgs(
    process.argv.slice(2),
  );
  const loadedConfig = await readConfig(DEFAULT_CONFIG_PATH);
  const config = selectSourceWatchSources(loadedConfig, sourceIds);

  if (!live) {
    console.log(
      `Source Watch plan: ${config.sources.length} reviewed source(s), ` +
        `${config.sources.length * CREDITS_PER_SOURCE}/${config.limits.maxCreditsPerRun} ` +
        "maximum run credits.",
    );
    for (const source of config.sources) {
      console.log(`- ${source.id}: ${source.url}`);
    }
    console.log("Plan only. No API requests or files were written.");
    console.log(
      "Use --live --confirm after reviewing config/source-watch.json.",
    );
    return;
  }

  if (!confirmed) {
    throw new Error(
      "Live Source Watch runs require both --live and --confirm.",
    );
  }
  if (!process.env.FIRECRAWL_API_KEY) {
    throw new Error(
      "FIRECRAWL_API_KEY is required for a live Source Watch run.",
    );
  }

  const result = await runSourceWatch({
    config: loadedConfig,
    sourceIds,
  });
  const changed =
    result.report.summary.new +
    result.report.summary.changed +
    result.report.summary.removed +
    result.report.summary.error;
  console.log(
    `Source Watch checked ${result.report.sourcesChecked.length} allowlisted sources; ${changed} review candidate(s).`,
  );
  console.log(`Candidate report: ${result.reportPath}`);
  if (!sourceWatchReportHasSuccessfulRetrieval(result.report)) {
    throw new Error(
      "Source Watch did not retrieve any selected source successfully. Review the uploaded candidate report.",
    );
  }
}

const invokedPath = process.argv[1] ? resolve(process.argv[1]) : "";
if (invokedPath === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(safeErrorMessage(error));
    process.exitCode = 1;
  });
}
