/**
 * Outbound-only production health monitor for a Synology NAS.
 *
 * The monitor reads the public Frederick Radius health endpoint, treats the
 * JSON status as authoritative even when HTTP is 200, and stores only a small
 * local state file under the gitignored scripts/reports directory. It has no
 * production credentials and never writes to Frederick Radius.
 *
 * Exit codes:
 *   0 = no owner notification is due, or Slack accepted the notification
 *   1 = the monitor itself could not persist state
 *   2 = an outage, bounded reminder, or recovery needs DSM fallback delivery
 */
import { randomUUID } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const PRODUCTION_HEALTH_URL = "https://frederickradius.app/api/health";
export const DEFAULT_MONITOR_STATE_PATH = resolve(
  "scripts/reports/nas-production-monitor-state.json",
);
export const UNHEALTHY_CHECKS_BEFORE_ALERT = 2;
export const REMINDER_INTERVAL_MS = 6 * 60 * 60 * 1_000;
export const DSM_FALLBACK_EXIT_CODE = 2;
export const HEALTH_PAYLOAD_MAX_AGE_MS = 10 * 60 * 1_000;

const HEALTH_TIMEOUT_MS = 12_000;
const SLACK_TIMEOUT_MS = 8_000;
const MAX_HEALTH_BODY_BYTES = 128 * 1_024;
const HEALTH_PAYLOAD_MAX_FUTURE_MS = 2 * 60 * 1_000;

export type MonitorMode = "unknown" | "healthy" | "unhealthy";
export type MonitorAlertKind = "outage" | "reminder" | "recovery";
export type MonitorDelivery = "slack" | "slack-failed" | "dsm-fallback";

export type HealthObservation = {
  healthy: boolean;
  status: string;
  reason: string;
  summary: string;
  checkedAt: string;
  httpStatus: number | null;
  revision: string | null;
};

export type NasProductionMonitorState = {
  schemaVersion: 1;
  mode: MonitorMode;
  consecutiveUnhealthy: number;
  incidentStartedAt: string | null;
  lastCheckAt: string | null;
  lastAlertAt: string | null;
  lastAlertKind: MonitorAlertKind | null;
  lastDelivery: MonitorDelivery | null;
  lastObservation: HealthObservation | null;
};

export type MonitorDecision = {
  state: NasProductionMonitorState;
  alert: MonitorAlertKind | null;
};

export type MonitorRunResult = MonitorDecision & {
  exitCode: number;
  delivery: MonitorDelivery | null;
};

type JsonRecord = Record<string, unknown>;
type FetchLike = typeof fetch;

export function initialNasProductionMonitorState(): NasProductionMonitorState {
  return {
    schemaVersion: 1,
    mode: "unknown",
    consecutiveUnhealthy: 0,
    incidentStartedAt: null,
    lastCheckAt: null,
    lastAlertAt: null,
    lastAlertKind: null,
    lastDelivery: null,
    lastObservation: null,
  };
}

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function finiteCount(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) && value >= 0
    ? Math.floor(value)
    : null;
}

function stringValue(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function compactSummary(payload: JsonRecord, status: string): string {
  const parts = [status];
  const database = isRecord(payload.database)
    ? stringValue(payload.database.status)
    : null;
  if (database) parts.push(`database ${database}`);

  const data = isRecord(payload.data) ? payload.data : null;
  const current = data ? finiteCount(data.current) : null;
  const tracked = data ? finiteCount(data.tracked) : null;
  if (current !== null && tracked !== null) {
    parts.push(`${current}/${tracked} sources current`);
  }

  const products = isRecord(payload.products) ? payload.products : null;
  const hours = products && isRecord(products.hours) ? products.hours : null;
  const hoursStatus = hours ? stringValue(hours.status) : null;
  const hoursCurrent = hours ? finiteCount(hours.current) : null;
  const hoursExpected = hours ? finiteCount(hours.expected) : null;
  if (hoursStatus === "policy_hold") {
    parts.push("hours refresh on policy hold");
  } else if (hoursCurrent !== null && hoursExpected !== null) {
    parts.push(`${hoursCurrent}/${hoursExpected} hours current`);
  }
  return parts.join("; ").slice(0, 400);
}

function contractFailure(
  payload: JsonRecord,
  status: string,
  reason: string,
  checkedAt: string,
  httpStatus: number,
  revision: string | null,
): HealthObservation {
  return {
    healthy: false,
    status,
    reason,
    summary: `${compactSummary(payload, status)}; contract ${reason.replaceAll("-", " ")}`,
    checkedAt,
    httpStatus,
    revision,
  };
}

function readySurface(value: unknown): boolean {
  return isRecord(value) && value.status === "ready";
}

function policyHoldSurface(value: unknown): boolean {
  if (!isRecord(value) || value.status !== "partial") return false;
  if (!Array.isArray(value.reasons) || value.reasons.length === 0) return false;
  return value.reasons.every((reason) => reason === "current_hours_policy_hold");
}

function operationalContractReason(
  payload: JsonRecord,
  checkedAt: string,
): string | null {
  if (payload.service !== "frederick-radius") return "service-mismatch";

  const deployment = isRecord(payload.deployment) ? payload.deployment : null;
  if (deployment?.environment !== "production") return "not-production";

  const generatedAt = stringValue(payload.generatedAt);
  const generatedMs = generatedAt ? Date.parse(generatedAt) : Number.NaN;
  const checkedMs = Date.parse(checkedAt);
  if (!Number.isFinite(generatedMs) || !Number.isFinite(checkedMs)) {
    return "invalid-generated-at";
  }
  if (checkedMs - generatedMs > HEALTH_PAYLOAD_MAX_AGE_MS) {
    return "stale-generated-at";
  }
  if (generatedMs - checkedMs > HEALTH_PAYLOAD_MAX_FUTURE_MS) {
    return "future-generated-at";
  }

  const database = isRecord(payload.database) ? payload.database : null;
  if (database?.status !== "reachable") return "database-unavailable";

  const data = isRecord(payload.data) ? payload.data : null;
  const tracked = data ? finiteCount(data.tracked) : null;
  const current = data ? finiteCount(data.current) : null;
  if (
    data?.status !== "current" ||
    tracked === null ||
    tracked === 0 ||
    current !== tracked
  ) {
    return "data-not-current";
  }

  const readiness = isRecord(payload.readiness) ? payload.readiness : null;
  const migrations =
    readiness && isRecord(readiness.migrations) ? readiness.migrations : null;
  if (
    migrations?.status !== "ready" ||
    migrations.hours !== "ready" ||
    migrations.search !== "ready" ||
    migrations.eventArchive !== "ready" ||
    migrations.sourceHealth !== "ready" ||
    migrations.dataTruth !== "ready"
  ) {
    return "migrations-not-ready";
  }
  const heartbeats =
    readiness && isRecord(readiness.heartbeats) ? readiness.heartbeats : null;
  if (
    heartbeats?.status !== "current" ||
    heartbeats.feeds !== "current" ||
    heartbeats.eventArchive !== "current"
  ) {
    return "heartbeats-not-current";
  }
  const searchIndex =
    readiness && isRecord(readiness.searchIndex) ? readiness.searchIndex : null;
  if (searchIndex?.status !== "current") return "search-index-not-current";

  const products = isRecord(payload.products) ? payload.products : null;
  const hours = products && isRecord(products.hours) ? products.hours : null;
  const surfaces =
    readiness && isRecord(readiness.surfaces) ? readiness.surfaces : null;
  if (!hours || !surfaces) return "missing-product-readiness";
  const hoursCurrent = finiteCount(hours.current);
  const hoursExpected = finiteCount(hours.expected);
  if (
    hoursCurrent === null ||
    hoursExpected === null ||
    hoursExpected === 0 ||
    hoursCurrent > hoursExpected
  ) {
    return "invalid-hours-counts";
  }

  if (hours.status === "policy_hold" && hours.mode === "policy_hold") {
    const capabilities =
      readiness && isRecord(readiness.capabilities)
        ? readiness.capabilities
        : null;
    const currentHours =
      capabilities && isRecord(capabilities.currentHours)
        ? capabilities.currentHours
        : null;
    if (
      readiness?.status !== "partial" ||
      currentHours?.status !== "policy_hold" ||
      !stringValue(hours.operatorMessage) ||
      !policyHoldSurface(surfaces.today) ||
      !policyHoldSurface(surfaces.ask) ||
      !policyHoldSurface(surfaces.map) ||
      !readySurface(surfaces.events)
    ) {
      return "invalid-policy-hold";
    }
    return null;
  }

  if (hours.status !== "current" || hours.mode !== "active_refresh") {
    return "hours-not-current";
  }
  if (
    readiness?.status !== "ready" ||
    !readySurface(surfaces.today) ||
    !readySurface(surfaces.ask) ||
    !readySurface(surfaces.map) ||
    !readySurface(surfaces.events)
  ) {
    return "surfaces-not-ready";
  }
  return null;
}

export function observeHealthPayload(
  payload: unknown,
  httpStatus: number,
  checkedAt: string,
): HealthObservation {
  if (httpStatus < 200 || httpStatus >= 300) {
    return {
      healthy: false,
      status: "unreachable",
      reason: `http-${httpStatus}`,
      summary: `health endpoint returned HTTP ${httpStatus}`,
      checkedAt,
      httpStatus,
      revision: null,
    };
  }
  if (!isRecord(payload)) {
    return {
      healthy: false,
      status: "invalid",
      reason: "invalid-json-shape",
      summary: "health endpoint returned an invalid JSON object",
      checkedAt,
      httpStatus,
      revision: null,
    };
  }

  const status = stringValue(payload.status);
  const deployment = isRecord(payload.deployment) ? payload.deployment : null;
  const revision = deployment ? stringValue(deployment.revision) : null;
  if (!status) {
    return {
      healthy: false,
      status: "invalid",
      reason: "missing-status",
      summary: "health endpoint JSON did not include a status",
      checkedAt,
      httpStatus,
      revision,
    };
  }
  if (status !== "operational") {
    return {
      healthy: false,
      status,
      reason: `status-${status}`,
      summary: compactSummary(payload, status),
      checkedAt,
      httpStatus,
      revision,
    };
  }
  const contractReason = operationalContractReason(payload, checkedAt);
  if (contractReason) {
    return contractFailure(
      payload,
      status,
      contractReason,
      checkedAt,
      httpStatus,
      revision,
    );
  }
  return {
    healthy: true,
    status,
    reason: "operational",
    summary: compactSummary(payload, status),
    checkedAt,
    httpStatus,
    revision,
  };
}

export function unreachableObservation(
  checkedAt: string,
  reason: "request-failed" | "request-timeout" | "invalid-json" | "response-too-large",
): HealthObservation {
  const summaries: Record<typeof reason, string> = {
    "request-failed": "health endpoint request failed",
    "request-timeout": "health endpoint request timed out",
    "invalid-json": "health endpoint returned invalid JSON",
    "response-too-large": "health endpoint response exceeded the safety limit",
  };
  return {
    healthy: false,
    status: "unreachable",
    reason,
    summary: summaries[reason],
    checkedAt,
    httpStatus: null,
    revision: null,
  };
}

export function decideNasProductionMonitor(
  previous: NasProductionMonitorState,
  observation: HealthObservation,
  nowMs: number,
  reminderIntervalMs = REMINDER_INTERVAL_MS,
): MonitorDecision {
  const checkedAt = observation.checkedAt;
  if (observation.healthy) {
    const alert = previous.mode === "unhealthy" ? "recovery" : null;
    return {
      alert,
      state: {
        ...previous,
        mode: "healthy",
        consecutiveUnhealthy: 0,
        incidentStartedAt: null,
        lastCheckAt: checkedAt,
        lastAlertAt: alert ? checkedAt : previous.lastAlertAt,
        lastAlertKind: alert ?? previous.lastAlertKind,
        lastObservation: observation,
      },
    };
  }

  const consecutiveUnhealthy = Math.min(
    999,
    previous.consecutiveUnhealthy + 1,
  );
  if (previous.mode !== "unhealthy") {
    const confirmed = consecutiveUnhealthy >= UNHEALTHY_CHECKS_BEFORE_ALERT;
    return {
      alert: confirmed ? "outage" : null,
      state: {
        ...previous,
        mode: confirmed ? "unhealthy" : previous.mode,
        consecutiveUnhealthy,
        incidentStartedAt: confirmed ? checkedAt : null,
        lastCheckAt: checkedAt,
        lastAlertAt: confirmed ? checkedAt : previous.lastAlertAt,
        lastAlertKind: confirmed ? "outage" : previous.lastAlertKind,
        lastObservation: observation,
      },
    };
  }

  const lastAlertMs = previous.lastAlertAt
    ? Date.parse(previous.lastAlertAt)
    : Number.NaN;
  const reminderDue =
    !Number.isFinite(lastAlertMs) || nowMs - lastAlertMs >= reminderIntervalMs;
  return {
    alert: reminderDue ? "reminder" : null,
    state: {
      ...previous,
      mode: "unhealthy",
      consecutiveUnhealthy,
      lastCheckAt: checkedAt,
      lastAlertAt: reminderDue ? checkedAt : previous.lastAlertAt,
      lastAlertKind: reminderDue ? "reminder" : previous.lastAlertKind,
      lastObservation: observation,
    },
  };
}

function nullableIso(value: unknown): boolean {
  return value === null ||
    (typeof value === "string" && Number.isFinite(Date.parse(value)));
}

function validObservation(value: unknown): value is HealthObservation {
  if (!isRecord(value)) return false;
  const httpStatus = value.httpStatus;
  const revision = value.revision;
  return (
    typeof value.healthy === "boolean" &&
    stringValue(value.status) !== null &&
    stringValue(value.reason) !== null &&
    stringValue(value.summary) !== null &&
    typeof value.checkedAt === "string" &&
    nullableIso(value.checkedAt) &&
    (httpStatus === null ||
      (typeof httpStatus === "number" &&
        Number.isInteger(httpStatus) &&
        httpStatus >= 100 &&
        httpStatus <= 599)) &&
    (revision === null || stringValue(revision) !== null)
  );
}

function validState(value: unknown): value is NasProductionMonitorState {
  if (!isRecord(value) || value.schemaVersion !== 1) return false;
  if (!["unknown", "healthy", "unhealthy"].includes(String(value.mode))) {
    return false;
  }
  if (
    typeof value.consecutiveUnhealthy !== "number" ||
    !Number.isInteger(value.consecutiveUnhealthy) ||
    value.consecutiveUnhealthy < 0 ||
    value.consecutiveUnhealthy > 999
  ) {
    return false;
  }
  if (
    !nullableIso(value.incidentStartedAt) ||
    !nullableIso(value.lastCheckAt) ||
    !nullableIso(value.lastAlertAt)
  ) {
    return false;
  }
  if (
    value.lastAlertKind !== null &&
    !["outage", "reminder", "recovery"].includes(String(value.lastAlertKind))
  ) {
    return false;
  }
  if (
    value.lastDelivery !== null &&
    !["slack", "slack-failed", "dsm-fallback"].includes(
      String(value.lastDelivery),
    )
  ) {
    return false;
  }
  if (
    (value.lastAlertAt === null) !== (value.lastAlertKind === null) ||
    (value.lastAlertKind === null && value.lastDelivery !== null)
  ) {
    return false;
  }
  if (value.lastObservation !== null && !validObservation(value.lastObservation)) {
    return false;
  }
  if (
    value.lastObservation !== null &&
    value.lastCheckAt !== value.lastObservation.checkedAt
  ) {
    return false;
  }
  if (value.mode === "unknown") {
    return (
      value.consecutiveUnhealthy <= 1 &&
      value.incidentStartedAt === null &&
      value.lastAlertAt === null &&
      value.lastAlertKind === null &&
      value.lastDelivery === null &&
      (value.consecutiveUnhealthy === 0
        ? value.lastObservation === null
        : value.lastObservation?.healthy === false)
    );
  }
  if (value.mode === "unhealthy") {
    return (
      value.consecutiveUnhealthy >= UNHEALTHY_CHECKS_BEFORE_ALERT &&
      value.incidentStartedAt !== null &&
      value.lastAlertAt !== null &&
      (value.lastAlertKind === "outage" ||
        value.lastAlertKind === "reminder") &&
      value.lastDelivery !== null &&
      value.lastObservation?.healthy === false
    );
  }
  return (
    value.consecutiveUnhealthy <= 1 &&
    value.incidentStartedAt === null &&
    (value.consecutiveUnhealthy === 0
      ? value.lastObservation?.healthy === true
      : value.lastObservation?.healthy === false)
  );
}

async function readMonitorState(path: string): Promise<NasProductionMonitorState> {
  try {
    const value = JSON.parse(await readFile(path, "utf8")) as unknown;
    return validState(value) ? value : initialNasProductionMonitorState();
  } catch {
    return initialNasProductionMonitorState();
  }
}

async function writeMonitorState(
  path: string,
  state: NasProductionMonitorState,
): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  const temporary = `${path}.${process.pid}.${randomUUID()}.tmp`;
  await writeFile(temporary, `${JSON.stringify(state, null, 2)}\n`, {
    encoding: "utf8",
    mode: 0o600,
  });
  await rename(temporary, path);
}

async function readBoundedBody(response: Response): Promise<string> {
  const declared = Number(response.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > MAX_HEALTH_BODY_BYTES) {
    throw new Error("response-too-large");
  }
  if (!response.body) return "";

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > MAX_HEALTH_BODY_BYTES) {
      await reader.cancel();
      throw new Error("response-too-large");
    }
    chunks.push(value);
  }
  const body = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder().decode(body);
}

export async function fetchProductionHealth(
  checkedAt: string,
  fetchImpl: FetchLike = fetch,
): Promise<HealthObservation> {
  try {
    const response = await fetchImpl(PRODUCTION_HEALTH_URL, {
      method: "GET",
      headers: {
        Accept: "application/json",
        "User-Agent": "FrederickRadiusNASMonitor/1.0",
      },
      redirect: "error",
      signal: AbortSignal.timeout(HEALTH_TIMEOUT_MS),
    });
    if (!response.ok) {
      return observeHealthPayload(null, response.status, checkedAt);
    }
    const body = await readBoundedBody(response);
    let payload: unknown;
    try {
      payload = JSON.parse(body) as unknown;
    } catch {
      return unreachableObservation(checkedAt, "invalid-json");
    }
    return observeHealthPayload(payload, response.status, checkedAt);
  } catch (error) {
    if (error instanceof Error && error.message === "response-too-large") {
      return unreachableObservation(checkedAt, "response-too-large");
    }
    const name = error instanceof Error ? error.name : "";
    return unreachableObservation(
      checkedAt,
      name === "AbortError" || name === "TimeoutError"
        ? "request-timeout"
        : "request-failed",
    );
  }
}

export function isApprovedSlackWebhook(value: string | undefined): boolean {
  if (!value) return false;
  try {
    const url = new URL(value);
    return (
      url.protocol === "https:" &&
      url.hostname === "hooks.slack.com" &&
      url.pathname.startsWith("/services/")
    );
  } catch {
    return false;
  }
}

export function formatMonitorAlert(
  kind: MonitorAlertKind,
  state: NasProductionMonitorState,
): string {
  const observation = state.lastObservation;
  const detail = observation?.summary ?? "health status unavailable";
  const revision = observation?.revision
    ? ` Deployment ${observation.revision}.`
    : "";
  if (kind === "recovery") {
    return `Frederick Radius production recovered. ${detail}.${revision} ${PRODUCTION_HEALTH_URL}`;
  }
  if (kind === "reminder") {
    return `Frederick Radius production is still unhealthy. ${detail}.${revision} ${PRODUCTION_HEALTH_URL}`;
  }
  return `Frederick Radius production is unhealthy after ${UNHEALTHY_CHECKS_BEFORE_ALERT} consecutive checks. ${detail}.${revision} ${PRODUCTION_HEALTH_URL}`;
}

async function postSlack(
  webhook: string | undefined,
  text: string,
  fetchImpl: FetchLike,
): Promise<"slack" | "slack-failed" | "dsm-fallback"> {
  if (!webhook) return "dsm-fallback";
  if (!isApprovedSlackWebhook(webhook)) return "slack-failed";
  try {
    const response = await fetchImpl(webhook, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text }),
      redirect: "error",
      signal: AbortSignal.timeout(SLACK_TIMEOUT_MS),
    });
    return response.ok ? "slack" : "slack-failed";
  } catch {
    return "slack-failed";
  }
}

export async function runNasProductionMonitor(options: {
  statePath?: string;
  now?: () => Date;
  healthFetch?: FetchLike;
  slackFetch?: FetchLike;
  /** `null` explicitly disables Slack, which keeps tests and dry harnesses
   * independent from a machine-level SLACK_WEBHOOK_URL. */
  slackWebhookUrl?: string | null;
  reminderIntervalMs?: number;
} = {}): Promise<MonitorRunResult> {
  const now = options.now?.() ?? new Date();
  const checkedAt = now.toISOString();
  const statePath = options.statePath ?? DEFAULT_MONITOR_STATE_PATH;
  const previous = await readMonitorState(statePath);
  const observation = await fetchProductionHealth(
    checkedAt,
    options.healthFetch ?? fetch,
  );
  const decision = decideNasProductionMonitor(
    previous,
    observation,
    now.getTime(),
    options.reminderIntervalMs ?? REMINDER_INTERVAL_MS,
  );

  let delivery: MonitorDelivery | null = null;
  let exitCode = 0;
  if (decision.alert) {
    // The decision has already stamped lastAlertAt. Persist that timestamp for
    // every delivery outcome, including a rejected webhook: DSM receives this
    // run's deliberate nonzero fallback, then the six-hour reminder bound keeps
    // a broken optional Slack channel from turning into five-minute DSM spam.
    const webhook = Object.hasOwn(options, "slackWebhookUrl")
      ? options.slackWebhookUrl ?? undefined
      : process.env.SLACK_WEBHOOK_URL;
    delivery = await postSlack(
      webhook,
      formatMonitorAlert(decision.alert, decision.state),
      options.slackFetch ?? fetch,
    );
    decision.state.lastDelivery = delivery;
    if (delivery !== "slack") exitCode = DSM_FALLBACK_EXIT_CODE;
  }

  await writeMonitorState(statePath, decision.state);
  return { ...decision, delivery, exitCode };
}

async function main(): Promise<void> {
  const result = await runNasProductionMonitor();
  const count = result.state.consecutiveUnhealthy;
  if (!result.alert) {
    const prefix = result.state.lastObservation?.healthy
      ? "healthy"
      : `unhealthy observation ${count}/${UNHEALTHY_CHECKS_BEFORE_ALERT}`;
    console.log(`[nas-production-monitor] ${prefix}: ${result.state.lastObservation?.summary ?? "no observation"}`);
  } else if (result.delivery === "slack") {
    console.log(`[nas-production-monitor] ${result.alert} alert delivered to Slack.`);
  } else {
    console.error(
      `[nas-production-monitor] ${result.alert.toUpperCase()}: ${result.state.lastObservation?.summary ?? "health status unavailable"}. DSM fallback notification required.`,
    );
  }
  process.exitCode = result.exitCode;
}

const invokedPath = process.argv[1] ? resolve(process.argv[1]) : "";
if (invokedPath === fileURLToPath(import.meta.url)) {
  void main().catch((error: unknown) => {
    console.error(
      `[nas-production-monitor] monitor failed: ${error instanceof Error ? error.message : "unknown error"}`,
    );
    process.exitCode = 1;
  });
}
