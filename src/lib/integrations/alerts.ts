/**
 * Outbound alerting for the data-health cron. One channel today
 * (Slack incoming webhook) and a console-only fallback; the helper
 * function is the only contract callers see, so adding email or
 * PagerDuty later is a one-file change.
 *
 * Wire-up: set SLACK_WEBHOOK_URL in the Vercel project env. Leave it
 * unset in dev — the alerter logs to stderr and is otherwise quiet.
 *
 * Throttling: we hash the active anomaly set and skip a re-send when
 * the same fingerprint fired in the last `MIN_REPEAT_MS`. Process-
 * local only (good enough for a single-worker cron path); a deploy
 * resets it. The intent is "don't spam Slack every cron run while
 * the same upstream feed is still broken" — not durable suppression.
 */

import type { Anomaly } from "./feed-snapshot";

const MIN_REPEAT_MS = 6 * 60 * 60 * 1000; // 6h, ≈ one cron window
const SLACK_REQUEST_TIMEOUT_MS = 5_000;
let lastFingerprint: string | null = null;
let lastSentAt = 0;

export type AnomalyAlertDelivery =
  | "not_needed"
  | "suppressed"
  | "not_configured"
  | "accepted"
  | "rejected"
  | "timeout"
  | "failed";

function fingerprint(anomalies: Anomaly[]): string {
  // Stable: sort by source+kind. Detail can vary in counts so we
  // ignore it for the fingerprint — only the SHAPE of the alert.
  return anomalies
    .map((a) => `${a.source}:${a.kind}`)
    .sort()
    .join("|");
}

/**
 * POST a formatted message to Slack when SLACK_WEBHOOK_URL is set.
 * Otherwise log to stderr with the same structure. Delivery is deadline-bound
 * and returned explicitly so callers never confuse a completed helper with a
 * provider-accepted alert.
 */
export async function sendAnomalyAlert(
  anomalies: Anomaly[],
): Promise<AnomalyAlertDelivery> {
  if (anomalies.length === 0) return "not_needed";

  const fp = fingerprint(anomalies);
  if (fp === lastFingerprint && Date.now() - lastSentAt < MIN_REPEAT_MS) {
    console.info("[alerts] suppressing repeat anomaly alert (same fingerprint)");
    return "suppressed";
  }

  const url = process.env.SLACK_WEBHOOK_URL?.trim();
  if (!url) {
    console.warn(
      `[alerts] ${anomalies.length} anomalies, no SLACK_WEBHOOK_URL set:`,
      anomalies.map((a) => `${a.source}:${a.kind}`).join(", "),
    );
    return "not_configured";
  }

  const text = formatSlack(anomalies);
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text }),
      signal: AbortSignal.timeout(SLACK_REQUEST_TIMEOUT_MS),
    });
    if (!res.ok) {
      console.error(`[alerts] slack post failed: HTTP ${res.status}`);
      return "rejected";
    }
    lastFingerprint = fp;
    lastSentAt = Date.now();
    return "accepted";
  } catch (err) {
    console.error("[alerts] slack post threw:", err instanceof Error ? err.message : err);
    const name = err instanceof Error ? err.name : "";
    return name === "AbortError" || name === "TimeoutError"
      ? "timeout"
      : "failed";
  }
}

function formatSlack(anomalies: Anomaly[]): string {
  // Plain-text Slack message — readable when surfaced in a thread or
  // a channel without rich blocks. Each anomaly on its own line with
  // source · kind · detail.
  const lines = anomalies.map(
    (a) => `• *${a.source}* · _${a.kind.replace(/_/g, " ")}_ — ${a.detail}`,
  );
  return [
    `:rotating_light: *Frederick Radius data-health* — ${anomalies.length} anomal${anomalies.length === 1 ? "y" : "ies"} on the last fetch.`,
    ...lines,
    `<https://frederickradius.app/admin/data-health|Open dashboard →>`,
  ].join("\n");
}

/** Test-only: reset the throttle so the next call always sends. */
export function _resetAlertThrottle(): void {
  lastFingerprint = null;
  lastSentAt = 0;
  lastWarmFingerprint = null;
  lastWarmSentAt = 0;
}

// ─────────────────────────────────────────────────────────────────────────
// Warm-events failure alert (obs-3). Separate from sendAnomalyAlert because
// the Anomaly union is feed-shaped; a warm-cache failure carries a cache name
// + an error string. Own throttle state so a persistent feed anomaly and a
// persistent warm failure don't suppress each other.
// ─────────────────────────────────────────────────────────────────────────
let lastWarmFingerprint: string | null = null;
let lastWarmSentAt = 0;

export type WarmFailure = { cache: string; error: string };

/**
 * Alert when the warm-events cron fails to warm one or more caches. That cron
 * is the ONLY thing between users and the 8s cold-miss TTFB on /today /events
 * /map, and it `allSettled`s — so without this a rejected warm is silently
 * 200'd and the protection rots invisibly. Same Slack-webhook + throttle shape
 * as sendAnomalyAlert; logs to stderr when no webhook is set. Always resolves.
 */
export async function sendWarmFailureAlert(failures: WarmFailure[]): Promise<void> {
  if (failures.length === 0) return;

  const fp = failures.map((f) => f.cache).sort().join("|");
  if (fp === lastWarmFingerprint && Date.now() - lastWarmSentAt < MIN_REPEAT_MS) {
    console.info("[alerts] suppressing repeat warm-failure alert (same fingerprint)");
    return;
  }

  const url = process.env.SLACK_WEBHOOK_URL?.trim();
  if (!url) {
    console.warn(
      `[alerts] warm-events failed to warm ${failures.length} cache(s), no SLACK_WEBHOOK_URL set:`,
      failures.map((f) => `${f.cache}: ${f.error}`).join("; "),
    );
    lastWarmFingerprint = fp;
    lastWarmSentAt = Date.now();
    return;
  }

  const text = [
    `:warning: *Frederick Radius warm-events* — ${failures.length} cache(s) failed to warm; users may hit cold-miss TTFB until the next run.`,
    ...failures.map((f) => `• *${f.cache}* — ${f.error}`),
    `<https://frederickradius.app/admin/data-health|Open dashboard →>`,
  ].join("\n");
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text }),
      signal: AbortSignal.timeout(SLACK_REQUEST_TIMEOUT_MS),
    });
    if (!res.ok) {
      console.error(`[alerts] warm slack post failed: HTTP ${res.status}`);
      return;
    }
    lastWarmFingerprint = fp;
    lastWarmSentAt = Date.now();
  } catch (err) {
    console.error("[alerts] warm slack post threw:", err instanceof Error ? err.message : err);
  }
}
