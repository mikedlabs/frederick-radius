import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  HOURS_REFRESH_CYCLE_DAYS,
  hoursRefreshCycleDay,
} from "@/lib/hours-refresh-targets";

const mocks = vi.hoisted(() => ({
  placeRefreshIdentities: vi.fn(),
  getDb: vi.fn(),
  getPlaceDetails: vi.fn(),
  googlePlacesConfigured: vi.fn(),
}));

vi.mock("@/lib/loaders/placeRefreshIdentities", () => ({
  placeRefreshIdentities: mocks.placeRefreshIdentities,
}));
vi.mock("@/lib/db/client", () => ({
  getDb: mocks.getDb,
}));
vi.mock("@/lib/integrations/google-places", () => ({
  getPlaceDetails: mocks.getPlaceDetails,
  googlePlacesConfigured: mocks.googlePlacesConfigured,
}));

import { GET } from "./route";

const NOW = new Date("2026-07-26T08:00:00.000Z");
const cycleDay =
  Math.floor(NOW.getTime() / 86_400_000) % HOURS_REFRESH_CYCLE_DAYS;

function slugForCycle(day = cycleDay) {
  for (let index = 0; index < 100; index++) {
    const slug = `hours-route-place-${index}`;
    if (hoursRefreshCycleDay(slug) === day) return slug;
  }
  throw new Error("Unable to build a deterministic hours test slug.");
}

function request(query = "") {
  return new Request(`https://frederickradius.app/api/cron/hours-refresh${query}`, {
    headers: { authorization: "Bearer test-cron-secret" },
  });
}

function db({
  preflightError,
  writeError,
}: {
  preflightError?: Error;
  writeError?: Error;
} = {}) {
  const limit = preflightError
    ? vi.fn().mockRejectedValue(preflightError)
    : vi.fn().mockResolvedValue([]);
  const select = vi.fn(() => ({
    from: vi.fn(() => ({ limit })),
  }));
  const onConflictDoUpdate = writeError
    ? vi.fn().mockRejectedValue(writeError)
    : vi.fn().mockResolvedValue(undefined);
  const values = vi.fn(() => ({ onConflictDoUpdate }));
  const insert = vi.fn(() => ({
    values,
  }));
  return { select, insert, values, onConflictDoUpdate };
}

describe("GET /api/cron/hours-refresh", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
    vi.clearAllMocks();
    process.env.CRON_SECRET = "test-cron-secret";
    process.env.HOURS_REFRESH_CRON = "1";
    mocks.googlePlacesConfigured.mockReturnValue(true);
    mocks.placeRefreshIdentities.mockReturnValue([
      {
        slug: slugForCycle(),
        google_place_id: "ChIJ-hours-route-test",
      },
    ]);
  });

  afterEach(() => {
    vi.useRealTimers();
    delete process.env.CRON_SECRET;
    delete process.env.HOURS_REFRESH_CRON;
  });

  it("reports an intentionally disabled run as explicitly healthy", async () => {
    delete process.env.HOURS_REFRESH_CRON;

    const response = await GET(request());

    await expect(response.json()).resolves.toMatchObject({
      enabled: false,
      healthy: true,
      status: "disabled",
    });
    expect(mocks.getDb).not.toHaveBeenCalled();
    expect(mocks.getPlaceDetails).not.toHaveBeenCalled();
  });

  it("checks migration 0024 before making a paid Google call", async () => {
    mocks.getDb.mockReturnValue(
      db({ preflightError: new Error("relation does not exist") }),
    );

    const response = await GET(request());
    const body = await response.json();

    expect(response.status).toBe(503);
    expect(body.error).toContain("0024_place_hours_refresh.sql");
    expect(mocks.getPlaceDetails).not.toHaveBeenCalled();
  });

  it("rejects an invalid backfill bucket before touching storage or Google", async () => {
    const response = await GET(
      request(`?cycleDay=${HOURS_REFRESH_CYCLE_DAYS}`),
    );
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error).toContain(
      `cycleDay must be one integer from 0 to ${HOURS_REFRESH_CYCLE_DAYS - 1}`,
    );
    expect(mocks.getDb).not.toHaveBeenCalled();
    expect(mocks.getPlaceDetails).not.toHaveBeenCalled();
  });

  it("returns a failed cron status when every database write fails", async () => {
    mocks.getDb.mockReturnValue(db({ writeError: new Error("write denied") }));
    mocks.getPlaceDetails.mockResolvedValue({
      weekday_hours: ["Monday: 9:00 AM – 5:00 PM"],
      business_status: "OPERATIONAL",
    });

    const response = await GET(request());
    const body = await response.json();

    expect(response.status).toBe(503);
    expect(body.healthy).toBe(false);
    expect(body.written).toBe(0);
    expect(body.error).toBe("No refresh rows were persisted.");
  });

  it("fails before a paid call when the canonical refresh catalog shares a provider identity", async () => {
    mocks.getDb.mockReturnValue(db());
    mocks.placeRefreshIdentities.mockReturnValue([
      {
        slug: "duplicate-a",
        google_place_id: "ChIJ-duplicate",
      },
      {
        slug: "duplicate-b",
        google_place_id: "ChIJ-duplicate",
      },
    ]);

    const response = await GET(request());
    const body = await response.json();

    expect(response.status).toBe(503);
    expect(body.healthy).toBe(false);
    expect(body.error).toContain(
      "Duplicate Google Place ID ChIJ-duplicate",
    );
    expect(mocks.getPlaceDetails).not.toHaveBeenCalled();
  });

  it("reports a healthy run only after a schedule is persisted", async () => {
    const storage = db();
    mocks.getDb.mockReturnValue(storage);
    mocks.placeRefreshIdentities.mockReturnValue([
      {
        slug: slugForCycle(),
        google_place_id: "ChIJ-hours-route-test",
      },
    ]);
    mocks.getPlaceDetails.mockResolvedValue({
      weekday_hours: ["Monday: 9:00 AM – 5:00 PM"],
      business_status: "OPERATIONAL",
    });

    const response = await GET(request());
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toMatchObject({
      healthy: true,
      targeted: 1,
      written: 1,
      withHours: 1,
      failed: 0,
    });
    expect(mocks.placeRefreshIdentities).toHaveBeenCalledTimes(1);
    expect(mocks.getPlaceDetails).toHaveBeenCalledWith(
      "ChIJ-hours-route-test",
      "hours",
    );
    expect(storage.values).toHaveBeenCalledWith(
      expect.objectContaining({
        slug: slugForCycle(),
        placeId: "ChIJ-hours-route-test",
      }),
    );
    expect(storage.onConflictDoUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        set: expect.objectContaining({
          placeId: "ChIJ-hours-route-test",
        }),
      }),
    );
  });

  it("can recover one missed cycle bucket through an authenticated backfill", async () => {
    const backfillDay = (cycleDay + 1) % HOURS_REFRESH_CYCLE_DAYS;
    const backfillSlug = slugForCycle(backfillDay);
    const storage = db();
    mocks.getDb.mockReturnValue(storage);
    mocks.placeRefreshIdentities.mockReturnValue([
      {
        slug: backfillSlug,
        google_place_id: "ChIJ-hours-backfill-test",
      },
    ]);
    mocks.getPlaceDetails.mockResolvedValue({
      weekday_hours: ["Monday: 9:00 AM – 5:00 PM"],
      business_status: "OPERATIONAL",
    });

    const response = await GET(request(`?cycleDay=${backfillDay}`));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toMatchObject({
      healthy: true,
      cycleDay: backfillDay,
      cycleMode: "backfill",
      targeted: 1,
      written: 1,
    });
    expect(mocks.getPlaceDetails).toHaveBeenCalledWith(
      "ChIJ-hours-backfill-test",
      "hours",
    );
  });
});
