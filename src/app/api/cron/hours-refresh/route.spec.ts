import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  HOURS_REFRESH_CYCLE_DAYS,
  HOURS_REFRESH_MAX_RUN_CAP,
  hoursRefreshCycleDay,
} from "@/lib/hours-refresh-targets";

const mocks = vi.hoisted(() => ({
  placeRefreshIdentities: vi.fn(),
  getDb: vi.fn(),
  getPlaceDetails: vi.fn(),
  googlePlacesConfigured: vi.fn(),
  reserveDailyUsage: vi.fn(),
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
vi.mock("@/lib/usage-meter", () => ({
  reserveDailyUsage: mocks.reserveDailyUsage,
}));

import { GET } from "./route";

const NOW = new Date("2026-07-26T08:00:00.000Z");
const cycleDay =
  Math.floor(NOW.getTime() / 86_400_000) % HOURS_REFRESH_CYCLE_DAYS;

function slugsForCycle(
  count: number,
  day = cycleDay,
  prefix = "hours-route-place",
) {
  const slugs: string[] = [];
  for (let index = 0; index < 100_000 && slugs.length < count; index++) {
    const slug = `${prefix}-${index}`;
    if (hoursRefreshCycleDay(slug) === day) slugs.push(slug);
  }
  if (slugs.length !== count) {
    throw new Error("Unable to build deterministic hours test slugs.");
  }
  return slugs;
}

function slugForCycle(day = cycleDay) {
  return slugsForCycle(1, day)[0];
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
    mocks.reserveDailyUsage.mockResolvedValue({ reserved: true, count: 1 });
    mocks.placeRefreshIdentities.mockReturnValue([
      {
        slug: slugForCycle(),
        google_place_id: "ChIJ-hours-route-test",
        category: "restaurant",
      },
    ]);
  });

  afterEach(() => {
    vi.useRealTimers();
    delete process.env.CRON_SECRET;
    delete process.env.HOURS_REFRESH_CRON;
    delete process.env.HOURS_REFRESH_RUN_CAP;
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
        category: "restaurant",
      },
      {
        slug: "duplicate-b",
        google_place_id: "ChIJ-duplicate",
        category: "restaurant",
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
        category: "restaurant",
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
    expect(mocks.reserveDailyUsage).toHaveBeenCalledWith(
      "budget_google_hours_refresh",
      HOURS_REFRESH_MAX_RUN_CAP,
    );
    expect(mocks.reserveDailyUsage.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.getPlaceDetails.mock.invocationCallOrder[0],
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

  it("fails closed before Google when the shared daily allowance is exhausted", async () => {
    mocks.getDb.mockReturnValue(db());
    mocks.reserveDailyUsage.mockResolvedValue({
      reserved: false,
      count: HOURS_REFRESH_MAX_RUN_CAP,
    });

    const response = await GET(request());
    const body = await response.json();

    expect(response.status).toBe(503);
    expect(body).toMatchObject({
      healthy: false,
      targeted: 1,
      written: 0,
      failed: 1,
      budgetBlocked: 1,
    });
    expect(mocks.reserveDailyUsage).toHaveBeenCalledWith(
      "budget_google_hours_refresh",
      HOURS_REFRESH_MAX_RUN_CAP,
    );
    expect(mocks.getPlaceDetails).not.toHaveBeenCalled();
  });

  it("uses a lowered operator cap for the shared daily allowance", async () => {
    process.env.HOURS_REFRESH_RUN_CAP = "1";
    mocks.getDb.mockReturnValue(db());
    mocks.getPlaceDetails.mockResolvedValue({
      weekday_hours: ["Monday: 9:00 AM – 5:00 PM"],
      business_status: "OPERATIONAL",
    });

    const response = await GET(request());

    expect(response.status).toBe(200);
    expect(mocks.reserveDailyUsage).toHaveBeenCalledWith(
      "budget_google_hours_refresh",
      1,
    );
  });

  it("refreshes eligible food/drink places while leaving excluded categories unknown", async () => {
    const [restaurantSlug, parkSlug] = slugsForCycle(
      2,
      cycleDay,
      "hours-category-policy",
    );
    const storage = db();
    mocks.getDb.mockReturnValue(storage);
    mocks.placeRefreshIdentities.mockReturnValue([
      {
        slug: restaurantSlug,
        google_place_id: "ChIJ-eligible-restaurant",
        category: "restaurant",
      },
      {
        slug: parkSlug,
        google_place_id: "ChIJ-excluded-park",
        category: "park",
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
      catalog: 2,
      validGoogleIds: 2,
      eligible: 1,
      targeted: 1,
      written: 1,
    });
    expect(mocks.getPlaceDetails).toHaveBeenCalledTimes(1);
    expect(mocks.getPlaceDetails).toHaveBeenCalledWith(
      "ChIJ-eligible-restaurant",
      "hours",
    );
    expect(storage.values).toHaveBeenCalledWith(
      expect.objectContaining({ slug: restaurantSlug }),
    );
    expect(storage.values).not.toHaveBeenCalledWith(
      expect.objectContaining({ slug: parkSlug }),
    );
  });

  it("fails before spending when an eligible bucket exceeds the hard 80-call cap", async () => {
    const slugs = slugsForCycle(
      HOURS_REFRESH_MAX_RUN_CAP + 1,
      cycleDay,
      "hours-hard-cap",
    );
    const storage = db();
    process.env.HOURS_REFRESH_RUN_CAP = "9999";
    mocks.getDb.mockReturnValue(storage);
    mocks.placeRefreshIdentities.mockReturnValue(
      slugs.map((slug, index) => ({
        slug,
        google_place_id: `ChIJ-hard-cap-${index}`,
        category: "restaurant",
      })),
    );

    const response = await GET(request());
    const body = await response.json();

    expect(response.status).toBe(503);
    expect(body).toMatchObject({
      healthy: false,
      runCap: HOURS_REFRESH_MAX_RUN_CAP,
      eligible: HOURS_REFRESH_MAX_RUN_CAP + 1,
      targeted: HOURS_REFRESH_MAX_RUN_CAP,
      deferred: 1,
    });
    expect(mocks.getPlaceDetails).not.toHaveBeenCalled();
    expect(storage.insert).not.toHaveBeenCalled();
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
        category: "cafe",
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
