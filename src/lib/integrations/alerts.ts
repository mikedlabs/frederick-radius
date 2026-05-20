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
let lastFingerprint: string | null = null;
let lastSentAt = 0;

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
 * Otherwise log to stderr with the same structure. Always resolves
 * (errors are swallowed) so the cron handler can `void` the call.
 */
export async function sendAnomalyAlert(anomalies: Anomaly[]): Promise<void> {
  if (anomalies.length === 0) return;

  const fp = fingerprint(anomalies);
  if (fp === lastFingerprint && Date.now() - lastSentAt < MIN_REPEAT_MS) {

    console.info("[alerts] suppressing repeat anomaly alert (same fingerprint)");
    return;
  }

  const url = process.env.SLACK_WEBHOOK_URL;
  if (!url) {

    console.warn(
      `[alerts] ${anomalies.length} anomalies, no SLACK_WEBHOOK_URL set:`,
      anomalies.map((a) => `${a.source}:${a.kind}`).join(", "),
    );
    lastFingerprint = fp;
    lastSentAt = Date.now();
    return;
  }

  const text = formatSlack(anomalies);
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text }),
    });
    if (!res.ok) {

      console.error(`[alerts] slack post failed: HTTP ${res.status}`);
      return;
    }
    lastFingerprint = fp;
    lastSentAt = Date.now();
  } catch (err) {

    console.error("[alerts] slack post threw:", err instanceof Error ? err.message : err);
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
}
