import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  buildFoodTruckSchedule: vi.fn(),
  readStoredFoodTruckSchedule: vi.fn(),
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
  readStoredFoodTruckSchedule: mocks.readStoredFoodTruckSchedule,
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
    mocks.readStoredFoodTruckSchedule.mockResolvedValue(null);
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

  it("revalidates public pages only after a durable write", async () => {
    const response = await GET(request());

    expect(response.status).toBe(200);
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/food-trucks");
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/today");
    expect(mocks.revalidateTag).toHaveBeenCalledWith(
      "food-truck-source",
      "max",
    );
  });
});
