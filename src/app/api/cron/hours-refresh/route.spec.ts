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

function slugForCycle(day = cycleDay) {
  for (let index = 0; index < 100; index++) {
    const slug = `hours-route-place-${index}`;
    if (hoursRefreshCycleDay(slug) === day) return slug;
  }
  throw new Error("Unable to build a deterministic hours test slug.");
}

function slugsForCycle(count: number, day = cycleDay) {
  const slugs: string[] = [];
  for (let index = 0; index < 10_000 && slugs.length < count; index++) {
    const slug = `hours-route-bucket-${index}`;
    if (hoursRefreshCycleDay(slug) === day) slugs.push(slug);
  }
  if (slugs.length !== count) {
    throw new Error(`Unable to build ${count} deterministic hours test slugs.`);
  }
  return slugs;
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
    delete process.env.GOOGLE_HOURS_REFRESH_DAILY_CAP;
    mocks.googlePlacesConfigured.mockReturnValue(true);
    mocks.reserveDailyUsage.mockResolvedValue({ reserved: true, count: 1 });
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
    delete process.env.GOOGLE_HOURS_REFRESH_DAILY_CAP;
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
    expect(mocks.reserveDailyUsage).toHaveBeenCalledWith(
      "budget_google_hours_refresh",
      300,
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

  it("shares one daily allowance across authenticated cycleDay replays", async () => {
    const backfillDay = (cycleDay + 1) % HOURS_REFRESH_CYCLE_DAYS;
    const backfillSlug = slugForCycle(backfillDay);
    mocks.getDb.mockReturnValue(db());
    mocks.placeRefreshIdentities.mockReturnValue([
      {
        slug: backfillSlug,
        google_place_id: "ChIJ-hours-replay-test",
      },
    ]);
    mocks.reserveDailyUsage.mockResolvedValue({ reserved: false, count: 300 });

    const response = await GET(request(`?cycleDay=${backfillDay}`));
    const body = await response.json();

    expect(response.status).toBe(503);
    expect(body).toMatchObject({
      healthy: false,
      cycleMode: "backfill",
      paidAttempts: 0,
      written: 0,
      budgetExhausted: true,
      dailyCap: 300,
    });
    expect(body.error).toContain("retries and cycleDay replays remain blocked");
    expect(mocks.reserveDailyUsage).toHaveBeenCalledWith(
      "budget_google_hours_refresh",
      300,
    );
    expect(mocks.getPlaceDetails).not.toHaveBeenCalled();
  });

  it("rejects a configured cap below the whole deterministic bucket before reserving", async () => {
    const slugs = slugsForCycle(2);
    mocks.getDb.mockReturnValue(db());
    mocks.placeRefreshIdentities.mockReturnValue(
      slugs.map((slug, index) => ({
        slug,
        google_place_id: `ChIJ-hours-cap-preflight-${index}`,
      })),
    );
    process.env.GOOGLE_HOURS_REFRESH_DAILY_CAP = "1";

    const response = await GET(request());
    const body = await response.json();

    expect(response.status).toBe(503);
    expect(body).toMatchObject({
      healthy: false,
      eligible: 2,
      targeted: 0,
      paidAttempts: 0,
      budgetExhausted: false,
      dailyCap: 1,
    });
    expect(body.error).toContain("fit the whole bucket");
    expect(mocks.reserveDailyUsage).not.toHaveBeenCalled();
    expect(mocks.getPlaceDetails).not.toHaveBeenCalled();
  });

  it("never reports a partially exhausted bucket as healthy or successful", async () => {
    const slugs = slugsForCycle(2);
    mocks.getDb.mockReturnValue(db());
    mocks.placeRefreshIdentities.mockReturnValue(
      slugs.map((slug, index) => ({
        slug,
        google_place_id: `ChIJ-hours-partial-cap-${index}`,
      })),
    );
    mocks.reserveDailyUsage
      .mockResolvedValueOnce({ reserved: true, count: 299 })
      .mockResolvedValueOnce({ reserved: false, count: 300 });
    mocks.getPlaceDetails.mockResolvedValue({
      weekday_hours: ["Monday: 9:00 AM – 5:00 PM"],
      business_status: "OPERATIONAL",
    });

    const response = await GET(request());
    const body = await response.json();

    expect(response.status).toBe(503);
    expect(body).toMatchObject({
      healthy: false,
      targeted: 2,
      paidAttempts: 1,
      written: 1,
      budgetExhausted: true,
      notAttempted: 1,
    });
    expect(mocks.getPlaceDetails).toHaveBeenCalledTimes(1);
  });

  it("fails closed before Google when the shared counter is unavailable", async () => {
    mocks.getDb.mockReturnValue(db());
    mocks.reserveDailyUsage.mockResolvedValue(null);

    const response = await GET(request());
    const body = await response.json();

    expect(response.status).toBe(503);
    expect(body).toMatchObject({
      healthy: false,
      paidAttempts: 0,
      budgetExhausted: false,
      dailyCap: 300,
    });
    expect(body.error).toContain("usage counter is unavailable");
    expect(mocks.getPlaceDetails).not.toHaveBeenCalled();
  });

  it("honors a lower configured cap and clamps accidental increases", async () => {
    mocks.getDb.mockReturnValue(db());
    process.env.GOOGLE_HOURS_REFRESH_DAILY_CAP = "9999";
    mocks.reserveDailyUsage.mockResolvedValue({ reserved: false, count: 400 });

    const response = await GET(request());
    const body = await response.json();

    expect(body.dailyCap).toBe(400);
    expect(mocks.reserveDailyUsage).toHaveBeenCalledWith(
      "budget_google_hours_refresh",
      400,
    );
    expect(mocks.getPlaceDetails).not.toHaveBeenCalled();
  });
});
