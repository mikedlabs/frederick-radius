import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const sentry = vi.hoisted(() => ({
  captureCheckIn: vi.fn(),
  captureException: vi.fn(),
  flush: vi.fn(),
  isInitialized: vi.fn(),
}));

vi.mock("@sentry/nextjs", () => sentry);

import { assessCronResponse, monitorCronResponse } from "./cron-monitor";

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
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
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

  it.each([
    [{ ok: false }, "ok_false"],
    [{ healthy: false }, "healthy_false"],
    [{ degraded: true }, "degraded_true"],
    [{ status: "partial" }, "status_partial"],
    [{ summary: { status: "degraded" } }, "summary_status_degraded"],
  ])("records a completed 2xx response as red when its JSON is unhealthy", async (
    payload,
    reason,
  ) => {
    const response = await monitorCronResponse(
      "event-archive",
      schedule,
      async () => Response.json(payload),
    );

    expect(response.status).toBe(200);
    expect(sentry.captureCheckIn).toHaveBeenLastCalledWith(
      expect.objectContaining({ status: "error" }),
    );
    expect(JSON.parse(vi.mocked(console.warn).mock.calls.at(-1)?.[0] ?? "{}"))
      .toMatchObject({
        event: "cron_semantic_failure",
        monitorSlug: "event-archive",
        reason,
      });
  });

  it("rejects invalid JSON on a JSON cron response", async () => {
    await expect(assessCronResponse(new Response("not-json", {
      headers: { "content-type": "application/json" },
    }))).resolves.toEqual({
      healthy: false,
      reason: "invalid_json",
    });
  });

  it.each([
    [new Response("done"), "non_json_response"],
    [Response.json({}), "missing_healthy_semantic"],
    [Response.json({ enabled: false }), "missing_healthy_semantic"],
  ])("does not infer cron health without an explicit healthy semantic", async (
    response,
    reason,
  ) => {
    await expect(assessCronResponse(response)).resolves.toEqual({
      healthy: false,
      reason,
    });
  });

  it.each([
    { ok: true },
    { healthy: true },
    { status: "ok" },
    { summary: { status: "healthy" } },
  ])("accepts a recognized explicit healthy semantic", async (payload) => {
    await expect(assessCronResponse(Response.json(payload))).resolves.toEqual({
      healthy: true,
      reason: null,
    });
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
