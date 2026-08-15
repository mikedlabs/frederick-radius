import * as Sentry from "@sentry/nextjs";

export type CronMonitorSchedule = {
  schedule: string;
  checkinMarginMinutes?: number;
  maxRuntimeMinutes?: number;
};

type CronResponseAssessment = {
  healthy: boolean;
  reason: string | null;
};

const UNHEALTHY_STATUS_VALUES = new Set([
  "degraded",
  "error",
  "failed",
  "partial",
  "unavailable",
]);

const HEALTHY_STATUS_VALUES = new Set([
  "healthy",
  "ok",
  "success",
]);

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

/**
 * HTTP describes whether a scheduled route answered. Its JSON describes
 * whether the data work succeeded. Several bounded workers deliberately use a
 * 2xx response for a completed partial pass so Vercel will not retry unsafe
 * writes. Sentry must still record that pass as red.
 */
export async function assessCronResponse(
  response: Response,
): Promise<CronResponseAssessment> {
  if (!response.ok) {
    return { healthy: false, reason: `http_${response.status}` };
  }

  const contentType = response.headers.get("content-type")?.toLowerCase() ?? "";
  if (!contentType.includes("json")) {
    return { healthy: false, reason: "non_json_response" };
  }

  let payload: Record<string, unknown> | null = null;
  try {
    payload = record(await response.clone().json());
  } catch {
    return { healthy: false, reason: "invalid_json" };
  }
  if (!payload) return { healthy: false, reason: "invalid_json_shape" };

  if (payload.ok === false) return { healthy: false, reason: "ok_false" };
  if (payload.healthy === false) {
    return { healthy: false, reason: "healthy_false" };
  }
  if (payload.degraded === true) {
    return { healthy: false, reason: "degraded_true" };
  }

  const status = typeof payload.status === "string"
    ? payload.status.toLowerCase()
    : null;
  if (status && UNHEALTHY_STATUS_VALUES.has(status)) {
    return { healthy: false, reason: `status_${status}` };
  }

  const summary = record(payload.summary);
  if (summary?.degraded === true) {
    return { healthy: false, reason: "summary_degraded" };
  }
  const summaryStatus = typeof summary?.status === "string"
    ? summary.status.toLowerCase()
    : null;
  if (summaryStatus && UNHEALTHY_STATUS_VALUES.has(summaryStatus)) {
    return { healthy: false, reason: `summary_status_${summaryStatus}` };
  }

  const hasExplicitHealthySemantic =
    payload.ok === true ||
    payload.healthy === true ||
    Boolean(status && HEALTHY_STATUS_VALUES.has(status)) ||
    Boolean(summaryStatus && HEALTHY_STATUS_VALUES.has(summaryStatus));

  return hasExplicitHealthySemantic
    ? { healthy: true, reason: null }
    : { healthy: false, reason: "missing_healthy_semantic" };
}

/**
 * Report a complete scheduled-route lifecycle to Sentry Cron Monitors.
 *
 * Vercel considers any completed invocation delivered, including a 5xx
 * response. Sentry therefore has to see the response status rather than only
 * whether the route handler threw. Telemetry is deliberately fail-soft: a
 * missing DSN or a Sentry outage must never change the cron's real response.
 */
export async function monitorCronResponse<T extends Response>(
  monitorSlug: string,
  schedule: CronMonitorSchedule,
  run: () => Promise<T>,
): Promise<T> {
  const startedAt = Date.now();
  let checkInId: string | null = null;

  try {
    if (Sentry.isInitialized()) {
      checkInId = Sentry.captureCheckIn(
        { monitorSlug, status: "in_progress" },
        {
          schedule: { type: "crontab", value: schedule.schedule },
          checkinMargin: schedule.checkinMarginMinutes ?? 5,
          maxRuntime: schedule.maxRuntimeMinutes ?? 5,
          timezone: "Etc/UTC",
          failureIssueThreshold: 1,
          recoveryThreshold: 1,
        },
      );
    }
  } catch {
    checkInId = null;
  }

  try {
    const response = await run();
    const assessment = await assessCronResponse(response);
    if (!assessment.healthy) {
      // Keep logs searchable without serializing payloads, URLs, credentials,
      // or upstream error text.
      console.warn(JSON.stringify({
        level: "warn",
        event: "cron_semantic_failure",
        monitorSlug,
        httpStatus: response.status,
        reason: assessment.reason,
      }));
    }
    await finishCheckIn(
      monitorSlug,
      checkInId,
      assessment.healthy ? "ok" : "error",
      startedAt,
    );
    return response;
  } catch (error) {
    try {
      if (Sentry.isInitialized()) {
        Sentry.captureException(error, {
          tags: { cron_monitor: monitorSlug },
        });
      }
    } catch {
      // The scheduled task's own exception is the result that must survive.
    }
    await finishCheckIn(monitorSlug, checkInId, "error", startedAt);
    throw error;
  }
}

async function finishCheckIn(
  monitorSlug: string,
  checkInId: string | null,
  status: "ok" | "error",
  startedAt: number,
): Promise<void> {
  try {
    if (!checkInId || !Sentry.isInitialized()) return;
    Sentry.captureCheckIn({
      monitorSlug,
      checkInId,
      status,
      duration: Math.max(0, (Date.now() - startedAt) / 1_000),
    });
    await Sentry.flush(1_500);
  } catch {
    // Monitoring must never turn a successful data refresh into a failure.
  }
}
