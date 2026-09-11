import { beforeEach, describe, expect, it, vi } from "vitest";

const sentry = vi.hoisted(() => ({
  captureCheckIn: vi.fn(),
  captureException: vi.fn(),
  flush: vi.fn(),
  isInitialized: vi.fn(),
}));

vi.mock("@sentry/nextjs", () => sentry);

import {
  CRON_MONITOR_STATUS_HEADER,
  monitorCronResponse,
} from "./cron-monitor";

const schedule = {
  schedule: "*/15 * * * *",
  checkinMarginMinutes: 3,
  maxRuntimeMinutes: 2,
};

describe("monitorCronResponse", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    sentry.isInitialized.mockReturnValue(true);
    sentry.captureCheckIn.mockReturnValue("check-in-id");
    sentry.flush.mockResolvedValue(true);
  });

  it("records an ok completion for a successful response", async () => {
    const response = await monitorCronResponse(
      "scanner-archive",
      schedule,
      async () => Response.json({ ok: true }),
    );

    expect(response.status).toBe(200);
    expect(sentry.captureCheckIn).toHaveBeenNthCalledWith(
      1,
      { monitorSlug: "scanner-archive", status: "in_progress" },
      expect.objectContaining({
        schedule: { type: "crontab", value: "*/15 * * * *" },
        checkinMargin: 3,
        maxRuntime: 2,
        timezone: "Etc/UTC",
      }),
    );
    expect(sentry.captureCheckIn).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        monitorSlug: "scanner-archive",
        checkInId: "check-in-id",
        status: "ok",
      }),
    );
  });

  it("records an error completion for a handled 5xx response", async () => {
    const response = await monitorCronResponse(
      "scanner-archive",
      schedule,
      async () => Response.json({ ok: false }, { status: 503 }),
    );

    expect(response.status).toBe(503);
    expect(sentry.captureCheckIn).toHaveBeenLastCalledWith(
      expect.objectContaining({ status: "error" }),
    );
  });

  it("keeps a persisted dependency degradation red without requiring HTTP 503", async () => {
    const response = await monitorCronResponse(
      "runtime-source-health",
      schedule,
      async () => Response.json(
        { status: "degraded", execution: { status: "complete" } },
        { headers: { [CRON_MONITOR_STATUS_HEADER]: "error" } },
      ),
    );

    expect(response.status).toBe(200);
    expect(sentry.captureCheckIn).toHaveBeenLastCalledWith(
      expect.objectContaining({ status: "error" }),
    );
  });

  it("captures and rethrows an unhandled task exception", async () => {
    const error = new Error("task failed");

    await expect(
      monitorCronResponse("scanner-archive", schedule, async () => {
        throw error;
      }),
    ).rejects.toBe(error);

    expect(sentry.captureException).toHaveBeenCalledWith(
      error,
      { tags: { cron_monitor: "scanner-archive" } },
    );
    expect(sentry.captureCheckIn).toHaveBeenLastCalledWith(
      expect.objectContaining({ status: "error" }),
    );
  });

  it("is a no-op when Sentry is not configured", async () => {
    sentry.isInitialized.mockReturnValue(false);

    const response = await monitorCronResponse(
      "scanner-archive",
      schedule,
      async () => Response.json({ ok: true }),
    );

    expect(response.status).toBe(200);
    expect(sentry.captureCheckIn).not.toHaveBeenCalled();
    expect(sentry.flush).not.toHaveBeenCalled();
  });
});
