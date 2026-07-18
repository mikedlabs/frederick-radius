import "server-only";
import type { Anomaly } from "@/lib/integrations/feed-snapshot";

/**
 * GitHub-issue delivery for the nightly data-health board.
 *
 * The July 2026 lesson, twice over: detection existed (stale-ingest
 * checks, feed anomalies) but nothing DELIVERED it, so the FCPL ingest
 * stayed dead for two months and the photo pipeline served initials
 * tiles app-wide until a human noticed. Slack delivery exists but
 * requires a webhook the deployment never got. This channel uses the
 * inbox the owner already checks: the repo itself.
 *
 * Lifecycle, one issue per incident (never issue-per-day spam):
 *   - first red morning  → OPEN one issue titled [data-health] with the
 *     full report;
 *   - still red next day → COMMENT that day's report on the same issue;
 *   - recovery           → COMMENT "all green" and CLOSE it.
 *
 * Fail-soft like every alert path: no GITHUB_ALERTS_TOKEN (a
 * fine-grained PAT with Issues read/write on this repo) means a silent
 * "skipped", and no network error can ever fail the cron.
 */

const API = "https://api.github.com";
const ISSUE_TITLE = "[data-health] Red checks on the nightly board";
const REPO_FALLBACK = "mikedlabs/frederick-radius";

export type HealthGate = { name: string; green: boolean };

export type DeliveryResult = "created" | "commented" | "closed" | "noop" | "skipped";

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
  body?: unknown,
): Promise<Response> {
  return fetch(`${API}${path}`, {
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
}

async function findOpenBoardIssue(token: string, repo: string): Promise<IssueRef | null> {
  const res = await gh(token, "GET", `/repos/${repo}/issues?state=open&per_page=50`);
  if (!res.ok) return null;
  const issues = (await res.json()) as Array<{ number: number; title: string; pull_request?: unknown }>;
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
  const token = process.env.GITHUB_ALERTS_TOKEN;
  if (!token) return "skipped";
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
        const res = await gh(token, "POST", `/repos/${repo}/issues/${existing.number}/comments`, { body });
        return res.ok ? "commented" : "skipped";
      }
      const res = await gh(token, "POST", `/repos/${repo}/issues`, { title: ISSUE_TITLE, body });
      return res.ok ? "created" : "skipped";
    }

    // All green: close an open incident if one exists, otherwise stay quiet.
    if (existing) {
      await gh(token, "POST", `/repos/${repo}/issues/${existing.number}/comments`, {
        body: `**${dateLabel}: ${input.headline}.** Every check is green again; closing.`,
      });
      const res = await gh(token, "PATCH", `/repos/${repo}/issues/${existing.number}`, {
        state: "closed",
        state_reason: "completed",
      });
      return res.ok ? "closed" : "skipped";
    }
    return "noop";
  } catch (err) {
    console.warn(
      "[github-alerts] delivery failed (fail-soft):",
      err instanceof Error ? err.message : err,
    );
    return "skipped";
  }
}

/**
 * Weekly business digest delivery — a fresh issue every Monday (no
 * lifecycle: a digest is a report, not an incident). Same token and
 * repo as the health alerts; "skipped" without the token.
 */
export async function deliverWeeklyDigest(body: string, now: Date = new Date()): Promise<DeliveryResult> {
  const token = process.env.GITHUB_ALERTS_TOKEN;
  if (!token) return "skipped";
  const repo = process.env.GITHUB_ALERTS_REPO ?? REPO_FALLBACK;
  const week = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    month: "short",
    day: "numeric",
  }).format(now);
  try {
    const res = await gh(token, "POST", `/repos/${repo}/issues`, {
      title: `[digest] The week in Frederick Radius · ${week}`,
      body,
    });
    return res.ok ? "created" : "skipped";
  } catch {
    return "skipped";
  }
}
