import "server-only";
import type { Anomaly } from "@/lib/integrations/feed-snapshot";

/**
 * Optional GitHub-issue delivery for the nightly data-health board.
 *
 * The July 2026 lesson, twice over: detection existed (stale-ingest
 * checks, feed anomalies) but nothing DELIVERED it, so the FCPL ingest
 * stayed dead for two months and the photo pipeline served initials
 * tiles app-wide until a human noticed. Slack delivery exists but
 * requires a webhook the deployment never got. This channel uses the
 * inbox the owner already checks: the repo itself.
 *
 * The durable production-health-alert Actions workflow is the default health
 * channel because its automatic GITHUB_TOKEN does not expire. The data-health
 * route calls this richer personal-token path only when
 * VERCEL_GITHUB_ALERTS_ENABLED=1 after a successful credential probe.
 *
 * Lifecycle, one issue per incident (never issue-per-day spam):
 *   - first red morning  → OPEN one issue titled [data-health] with the
 *     full report;
 *   - still red next day → COMMENT that day's report on the same issue;
 *   - recovery           → COMMENT "all green" and CLOSE it.
 *
 * Fail-soft like every alert path: no delivery error can fail the cron. The
 * result remains compact, but configuration, authentication, rate limiting,
 * GitHub HTTP errors, and network errors are deliberately distinct so a
 * failed alert can be repaired instead of disappearing as generic "skipped".
 */

const API = "https://api.github.com";
const ISSUE_TITLE = "[data-health] Red checks on the nightly board";
const REPO_FALLBACK = "mikedlabs/frederick-radius";

export type HealthGate = { name: string; green: boolean };

export type DeliveryFailureResult =
  | "missing_token"
  | "auth_failed"
  | "rate_limited"
  | "http_failed"
  | "network_failed";

export type DeliveryResult =
  | "created"
  | "commented"
  | "closed"
  | "noop"
  /** Retained for callers that use it as their own deadline fallback. */
  | "skipped"
  | DeliveryFailureResult;

type GitHubOperation =
  | "find_open_issue"
  | "create_issue"
  | "comment_on_issue"
  | "close_issue"
  | "create_weekly_digest";

const FAILURE_ACTION: Record<DeliveryFailureResult, string> = {
  missing_token:
    "Add GITHUB_ALERTS_TOKEN with Issues read/write access to the configured repository.",
  auth_failed:
    "Replace the GitHub token or grant it Issues read/write access to GITHUB_ALERTS_REPO.",
  rate_limited:
    "Wait for the reported GitHub rate-limit reset, then retry delivery.",
  http_failed:
    "Verify GITHUB_ALERTS_REPO and inspect GitHub service status before retrying.",
  network_failed:
    "Retry delivery and inspect the deployment's outbound network or timeout logs.",
};

class GitHubDeliveryError extends Error {
  readonly result: DeliveryFailureResult;
  readonly operation: GitHubOperation;
  readonly status: number | null;
  readonly requestId: string | null;
  readonly rateLimitReset: string | null;
  readonly retryAfter: string | null;
  readonly networkKind: "timeout" | "request_failed" | null;

  constructor(options: {
    result: DeliveryFailureResult;
    operation: GitHubOperation;
    status?: number | null;
    requestId?: string | null;
    rateLimitReset?: string | null;
    retryAfter?: string | null;
    networkKind?: "timeout" | "request_failed" | null;
  }) {
    super(options.result);
    this.name = "GitHubDeliveryError";
    this.result = options.result;
    this.operation = options.operation;
    this.status = options.status ?? null;
    this.requestId = options.requestId ?? null;
    this.rateLimitReset = options.rateLimitReset ?? null;
    this.retryAfter = options.retryAfter ?? null;
    this.networkKind = options.networkKind ?? null;
  }
}

async function responseFailure(
  response: Response,
  operation: GitHubOperation,
): Promise<GitHubDeliveryError> {
  const remaining = response.headers.get("x-ratelimit-remaining");
  const retryAfter = response.headers.get("retry-after");
  // Secondary-limit responses do not always carry Retry-After. Inspect the
  // bounded GitHub error message for classification, but never copy it into
  // logs or returned JSON.
  const responseText = await response.text().catch(() => "");
  const rateLimitMessage = /(?:secondary |api )?rate limit/i.test(
    responseText.slice(0, 4_096),
  );
  const rateLimited =
    response.status === 429
    || (
      response.status === 403
      && (remaining === "0" || retryAfter !== null || rateLimitMessage)
    );
  const result: DeliveryFailureResult = rateLimited
    ? "rate_limited"
    : response.status === 401 || response.status === 403
      ? "auth_failed"
      : "http_failed";
  return new GitHubDeliveryError({
    result,
    operation,
    status: response.status,
    requestId: response.headers.get("x-github-request-id"),
    rateLimitReset: response.headers.get("x-ratelimit-reset"),
    retryAfter,
  });
}

function logDeliveryFailure(error: GitHubDeliveryError): void {
  console.warn(JSON.stringify({
    level: "warn",
    event: "github_alert_delivery_failed",
    result: error.result,
    operation: error.operation,
    status: error.status,
    request_id: error.requestId,
    rate_limit_reset: error.rateLimitReset,
    retry_after: error.retryAfter,
    network_kind: error.networkKind,
    action: FAILURE_ACTION[error.result],
  }));
}

function missingToken(operation: GitHubOperation): DeliveryFailureResult {
  const error = new GitHubDeliveryError({
    result: "missing_token",
    operation,
  });
  logDeliveryFailure(error);
  return error.result;
}

/** The report as GitHub-flavored markdown. Pure, so it unit-tests. */
export function buildDataHealthIssueBody(
  headline: string,
  gates: HealthGate[],
  anomalies: Anomaly[],
  dateLabel: string,
): string {
  const gateLines = gates
    .map((g) => `| ${g.green ? "🟢" : "🔴"} | \`${g.name}\` |`)
    .join("\n");
  const anomalyLines = anomalies
    .slice(0, 12)
    .map((a) => `- **${a.source}** (\`${a.kind}\`): ${a.detail}`)
    .join("\n");
  const truncated =
    anomalies.length > 12 ? `\n\n…and ${anomalies.length - 12} more (see /admin/data-health).` : "";
  return [
    `**${dateLabel}: ${headline}**`,
    "",
    "| | check |",
    "|---|---|",
    gateLines,
    "",
    anomalies.length > 0 ? `### Details\n\n${anomalyLines}${truncated}` : "",
    "",
    "Full board: [/admin/data-health](https://frederickradius.app/admin/data-health). " +
      "This issue stays open while any check is red and closes itself on the first green morning.",
  ]
    .filter((s) => s !== "")
    .join("\n");
}

type IssueRef = { number: number };

async function gh(
  token: string,
  method: string,
  path: string,
  operation: GitHubOperation,
  body?: unknown,
): Promise<Response> {
  let response: Response;
  try {
    response = await fetch(`${API}${path}`, {
      method,
      headers: {
        authorization: `Bearer ${token}`,
        accept: "application/vnd.github+json",
        "x-github-api-version": "2022-11-28",
        ...(body ? { "content-type": "application/json" } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(10_000),
    });
  } catch (error) {
    const name =
      error && typeof error === "object" && "name" in error
        ? String(error.name)
        : "";
    throw new GitHubDeliveryError({
      result: "network_failed",
      operation,
      networkKind:
        name === "TimeoutError" || name === "AbortError"
          ? "timeout"
          : "request_failed",
    });
  }
  if (!response.ok) throw await responseFailure(response, operation);
  return response;
}

async function findOpenBoardIssue(token: string, repo: string): Promise<IssueRef | null> {
  const res = await gh(
    token,
    "GET",
    `/repos/${repo}/issues?state=open&per_page=50`,
    "find_open_issue",
  );
  let payload: unknown;
  try {
    payload = await res.json();
  } catch {
    throw new GitHubDeliveryError({
      result: "http_failed",
      operation: "find_open_issue",
      status: res.status,
      requestId: res.headers.get("x-github-request-id"),
    });
  }
  if (!Array.isArray(payload)) {
    throw new GitHubDeliveryError({
      result: "http_failed",
      operation: "find_open_issue",
      status: res.status,
      requestId: res.headers.get("x-github-request-id"),
    });
  }
  const issues = payload as Array<{
    number: number;
    title: string;
    pull_request?: unknown;
  }>;
  const hit = issues.find((i) => !i.pull_request && i.title === ISSUE_TITLE);
  return hit ? { number: hit.number } : null;
}

/**
 * Deliver the nightly report. Returns what happened so the cron's JSON
 * (and the admin board, eventually) can show the delivery state.
 */
export async function deliverDataHealthReport(input: {
  headline: string;
  gates: HealthGate[];
  anomalies: Anomaly[];
  now?: Date;
}): Promise<DeliveryResult> {
  const token = process.env.GITHUB_ALERTS_TOKEN?.trim();
  if (!token) return missingToken("find_open_issue");
  const repo = process.env.GITHUB_ALERTS_REPO ?? REPO_FALLBACK;
  const red = input.gates.filter((g) => !g.green);
  const dateLabel = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    weekday: "short",
    month: "short",
    day: "numeric",
  }).format(input.now ?? new Date());

  try {
    const existing = await findOpenBoardIssue(token, repo);

    if (red.length > 0) {
      const body = buildDataHealthIssueBody(input.headline, input.gates, input.anomalies, dateLabel);
      if (existing) {
        await gh(
          token,
          "POST",
          `/repos/${repo}/issues/${existing.number}/comments`,
          "comment_on_issue",
          { body },
        );
        return "commented";
      }
      await gh(token, "POST", `/repos/${repo}/issues`, "create_issue", {
        title: ISSUE_TITLE,
        body,
      });
      return "created";
    }

    // All green: close an open incident if one exists, otherwise stay quiet.
    if (existing) {
      await gh(
        token,
        "POST",
        `/repos/${repo}/issues/${existing.number}/comments`,
        "comment_on_issue",
        {
          body: `**${dateLabel}: ${input.headline}.** Every check is green again; closing.`,
        },
      );
      await gh(
        token,
        "PATCH",
        `/repos/${repo}/issues/${existing.number}`,
        "close_issue",
        {
          state: "closed",
          state_reason: "completed",
        },
      );
      return "closed";
    }
    return "noop";
  } catch (error) {
    const failure = error instanceof GitHubDeliveryError
      ? error
      : new GitHubDeliveryError({
          result: "network_failed",
          operation: "find_open_issue",
          networkKind: "request_failed",
        });
    logDeliveryFailure(failure);
    return failure.result;
  }
}

/**
 * Weekly business digest delivery — a fresh issue every Monday (no
 * lifecycle: a digest is a report, not an incident). Same token and
 * repo as the health alerts; failures use the same actionable result codes.
 */
export async function deliverWeeklyDigest(body: string, now: Date = new Date()): Promise<DeliveryResult> {
  const token = process.env.GITHUB_ALERTS_TOKEN?.trim();
  if (!token) return missingToken("create_weekly_digest");
  const repo = process.env.GITHUB_ALERTS_REPO ?? REPO_FALLBACK;
  const week = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    month: "short",
    day: "numeric",
  }).format(now);
  try {
    await gh(token, "POST", `/repos/${repo}/issues`, "create_weekly_digest", {
      title: `[digest] The week in Frederick Radius · ${week}`,
      body,
    });
    return "created";
  } catch (error) {
    const failure = error instanceof GitHubDeliveryError
      ? error
      : new GitHubDeliveryError({
          result: "network_failed",
          operation: "create_weekly_digest",
          networkKind: "request_failed",
        });
    logDeliveryFailure(failure);
    return failure.result;
  }
}
