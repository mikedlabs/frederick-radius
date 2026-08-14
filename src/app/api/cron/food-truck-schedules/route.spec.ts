import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  buildFoodTruckSchedule: vi.fn(),
  reconcileFoodTruckSchedule: vi.fn(),
  readStoredFoodTruckScheduleArtifact: vi.fn(),
  writeFoodTruckSchedule: vi.fn(),
  revalidatePath: vi.fn(),
  revalidateTag: vi.fn(),
}));

vi.mock("next/cache", () => ({
  revalidatePath: mocks.revalidatePath,
  revalidateTag: mocks.revalidateTag,
}));
vi.mock("@/lib/food-trucks/schedule", () => ({
  buildFoodTruckSchedule: mocks.buildFoodTruckSchedule,
}));
vi.mock("@/lib/food-trucks/schedule-store", () => ({
  reconcileFoodTruckSchedule: mocks.reconcileFoodTruckSchedule,
  readStoredFoodTruckScheduleArtifact: mocks.readStoredFoodTruckScheduleArtifact,
  writeFoodTruckSchedule: mocks.writeFoodTruckSchedule,
}));

import { GET } from "./route";

function request() {
  return new Request(
    "https://frederickradius.app/api/cron/food-truck-schedules",
    { headers: { authorization: "Bearer test-secret" } },
  );
}

describe("GET /api/cron/food-truck-schedules", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.CRON_SECRET = "test-secret";
    mocks.reconcileFoodTruckSchedule.mockImplementation((next) => next);
    mocks.readStoredFoodTruckScheduleArtifact.mockResolvedValue({
      status: "absent",
    });
    mocks.buildFoodTruckSchedule.mockResolvedValue({
      version: 1,
      generatedAt: "2026-07-31T12:00:00.000Z",
      windowStart: "2026-07-31T04:00:00.000Z",
      windowEnd: "2026-08-08T04:00:00.000Z",
      stops: [],
      sources: [{ id: "source", name: "Source", ok: true }],
    });
    mocks.writeFoodTruckSchedule.mockResolvedValue({
      stored: true,
      preservedPrevious: false,
    });
  });

  afterEach(() => {
    delete process.env.CRON_SECRET;
  });

  it("fails when the refreshed schedule was not persisted", async () => {
    mocks.writeFoodTruckSchedule.mockResolvedValue({
      stored: false,
      preservedPrevious: false,
      reason: "Blob storage is not configured",
    });

    const response = await GET(request());
    const body = await response.json();

    expect(response.status).toBe(503);
    expect(body).toMatchObject({
      ok: false,
      storage: { stored: false },
    });
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
  });

  it("fails when every source failed even if a write result looks successful", async () => {
    mocks.buildFoodTruckSchedule.mockResolvedValue({
      version: 1,
      generatedAt: "2026-07-31T12:00:00.000Z",
      windowStart: "2026-07-31T04:00:00.000Z",
      windowEnd: "2026-08-08T04:00:00.000Z",
      stops: [],
      sources: [{ id: "source", name: "Source", ok: false }],
    });

    const response = await GET(request());
    const body = await response.json();

    expect(response.status).toBe(502);
    expect(body.ok).toBe(false);
  });

  it("fails an empty source inventory instead of treating it as healthy", async () => {
    mocks.buildFoodTruckSchedule.mockResolvedValue({
      version: 1,
      generatedAt: "2026-07-31T12:00:00.000Z",
      windowStart: "2026-07-31T04:00:00.000Z",
      windowEnd: "2026-08-08T04:00:00.000Z",
      stops: [],
      sources: [],
    });

    const response = await GET(request());
    const body = await response.json();

    expect(response.status).toBe(502);
    expect(body).toMatchObject({
      ok: false,
      completed: false,
      healthy: false,
      degraded: true,
    });
  });

  it("reports a completed partial refresh as degraded instead of healthy", async () => {
    mocks.buildFoodTruckSchedule.mockResolvedValue({
      version: 1,
      generatedAt: "2026-07-31T12:00:00.000Z",
      windowStart: "2026-07-31T04:00:00.000Z",
      windowEnd: "2026-08-08T04:00:00.000Z",
      stops: [],
      sources: [
        { id: "good", name: "Good source", ok: true },
        { id: "bad", name: "Bad source", ok: false },
      ],
    });

    const response = await GET(request());
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toMatchObject({
      ok: false,
      completed: true,
      healthy: false,
      degraded: true,
      retryable: false,
    });
  });

  it("does not call a suspicious zero-row refresh healthy", async () => {
    mocks.buildFoodTruckSchedule.mockResolvedValue({
      version: 1,
      generatedAt: "2026-07-31T12:00:00.000Z",
      windowStart: "2026-07-31T04:00:00.000Z",
      windowEnd: "2026-08-08T04:00:00.000Z",
      stops: [],
      sources: [{
        id: "source",
        label: "Source",
        ok: true,
        count: 0,
        checkedAt: "2026-07-31T12:00:00.000Z",
        suspiciousZero: true,
      }],
    });

    const response = await GET(request());
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toMatchObject({
      ok: false,
      completed: true,
      degraded: true,
      source_anomalies: 1,
    });
  });

  it("revalidates public pages only after a durable write", async () => {
    const response = await GET(request());

    await expect(response.clone().json()).resolves.toMatchObject({
      ok: true,
      completed: true,
      healthy: true,
      degraded: false,
    });

    expect(response.status).toBe(200);
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/food-trucks");
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/today");
    expect(mocks.revalidateTag).toHaveBeenCalledWith(
      "food-truck-source",
      "max",
    );
  });

  it("treats an older concurrent run as completed without revalidating", async () => {
    mocks.writeFoodTruckSchedule.mockResolvedValue({
      stored: false,
      preservedPrevious: true,
      superseded: true,
      reason: "A newer schedule is already stored",
    });

    const response = await GET(request());
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toMatchObject({
      ok: true,
      completed: true,
      healthy: true,
      storage: { superseded: true },
    });
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
  });

  it("passes the distinct prior-artifact state through to the writer", async () => {
    const unavailable = {
      status: "unavailable",
      reason: "Blob read timed out",
    };
    mocks.readStoredFoodTruckScheduleArtifact.mockResolvedValue(unavailable);

    await GET(request());

    expect(mocks.writeFoodTruckSchedule).toHaveBeenCalledWith(
      expect.any(Object),
      unavailable,
    );
  });

  it("gives the atomic writer the raw collection, not an earlier retained view", async () => {
    const collected = await mocks.buildFoodTruckSchedule();
    const earlierView = {
      ...collected,
      stops: [{ id: "stale-retained-stop" }],
    };
    mocks.buildFoodTruckSchedule.mockResolvedValue(collected);
    mocks.reconcileFoodTruckSchedule.mockReturnValue(earlierView);

    await GET(request());

    expect(mocks.writeFoodTruckSchedule).toHaveBeenCalledWith(
      collected,
      { status: "absent" },
    );
  });

  it("reports health from the artifact that won the atomic write boundary", async () => {
    mocks.writeFoodTruckSchedule.mockResolvedValue({
      stored: true,
      preservedPrevious: true,
      url: "https://blob.example/schedule.json",
      publishedSnapshot: {
        version: 1,
        generatedAt: "2026-07-31T12:01:00.000Z",
        windowStart: "2026-07-31T04:00:00.000Z",
        windowEnd: "2026-08-08T04:00:00.000Z",
        stops: Array.from({ length: 10 }, (_, index) => ({ id: `stop-${index}` })),
        sources: [{
          id: "source",
          label: "Source",
          ok: true,
          count: 2,
          checkedAt: "2026-07-31T12:01:00.000Z",
          previousCount: 10,
          retainedCount: 8,
          suspiciousDrop: true,
        }],
      },
    });

    const response = await GET(request());
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toMatchObject({
      ok: false,
      completed: true,
      degraded: true,
      stops: 10,
      source_anomalies: 1,
      sources: [{ suspiciousDrop: true, retainedCount: 8 }],
      storage: {
        stored: true,
        preservedPrevious: true,
      },
    });
    expect(body.storage.publishedSnapshot).toBeUndefined();
  });
});
