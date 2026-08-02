import * as Sentry from "@sentry/nextjs";

export type CronMonitorSchedule = {
  schedule: string;
  checkinMarginMinutes?: number;
  maxRuntimeMinutes?: number;
};

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
    await finishCheckIn(
      monitorSlug,
      checkInId,
      response.ok ? "ok" : "error",
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
