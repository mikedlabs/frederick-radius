import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  HOURS_REFRESH_CYCLE_DAYS,
  hoursRefreshCycleDay,
} from "@/lib/hours-refresh-targets";

const mocks = vi.hoisted(() => ({
  placeRefreshIdentities: vi.fn(),
  getDb: vi.fn(),
  getSql: vi.fn(),
  getPlaceDetails: vi.fn(),
  googlePlacesConfigured: vi.fn(),
  googleHoursRefreshRuntimeEnabled: vi.fn(),
  finalizeIdempotentDailyUsage: vi.fn(),
  reserveIdempotentDailyUsageBatch: vi.fn(),
  reserveUsageIntervalLease: vi.fn(),
  startIdempotentDailyUsage: vi.fn(),
}));

vi.mock("@/lib/loaders/placeRefreshIdentities", () => ({
  placeRefreshIdentities: mocks.placeRefreshIdentities,
}));
vi.mock("@/lib/db/client", () => ({
  getDb: mocks.getDb,
  getSql: mocks.getSql,
}));
vi.mock("@/lib/integrations/google-places", () => ({
  getPlaceDetails: mocks.getPlaceDetails,
  googlePlacesConfigured: mocks.googlePlacesConfigured,
}));
vi.mock("@/lib/google-maps-policy", () => ({
  googleHoursRefreshRuntimeEnabled:
    mocks.googleHoursRefreshRuntimeEnabled,
}));
vi.mock("@/lib/usage-meter", () => ({
  finalizeIdempotentDailyUsage: mocks.finalizeIdempotentDailyUsage,
  reserveIdempotentDailyUsageBatch: mocks.reserveIdempotentDailyUsageBatch,
  reserveUsageIntervalLease: mocks.reserveUsageIntervalLease,
  startIdempotentDailyUsage: mocks.startIdempotentDailyUsage,
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
  writeError,
}: {
  writeError?: Error;
} = {}) {
  const onConflictDoUpdate = writeError
    ? vi.fn().mockRejectedValue(writeError)
    : vi.fn().mockResolvedValue(undefined);
  const values = vi.fn(() => ({ onConflictDoUpdate }));
  const insert = vi.fn(() => ({
    values,
  }));
  return { insert, values, onConflictDoUpdate };
}

function rawSql({
  probeError,
  progress = [],
}: {
  probeError?: Error;
  progress?: Array<{ slug: string; place_id: string }>;
} = {}) {
  const tx = probeError
    ? vi.fn().mockRejectedValue(probeError)
    : vi.fn().mockResolvedValue([{ ok: 1 }]);
  const begin = vi.fn(
    async (callback: (transaction: typeof tx) => Promise<unknown>) =>
      callback(tx),
  );
  const sql = Object.assign(vi.fn().mockResolvedValue(progress), { begin });
  return { sql, begin, tx };
}

describe("GET /api/cron/hours-refresh", () => {
  let storageSql: ReturnType<typeof rawSql>;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
    vi.clearAllMocks();
    process.env.CRON_SECRET = "test-cron-secret";
    process.env.HOURS_REFRESH_CRON = "1";
    mocks.googleHoursRefreshRuntimeEnabled.mockReturnValue(true);
    delete process.env.GOOGLE_HOURS_REFRESH_DAILY_CAP;
    mocks.googlePlacesConfigured.mockReturnValue(true);
    storageSql = rawSql();
    mocks.getSql.mockReturnValue(storageSql.sql);
    mocks.reserveIdempotentDailyUsageBatch.mockImplementation(
      async (_upstream: string, _limit: number, values: string[]) => ({
        reserved: true,
        count: values.length,
        added: values.length,
        states: values.map(() => "ready"),
      }),
    );
    mocks.reserveUsageIntervalLease.mockResolvedValue({ acquired: true });
    mocks.startIdempotentDailyUsage.mockResolvedValue({
      started: true,
      state: "pending",
    });
    mocks.finalizeIdempotentDailyUsage.mockImplementation(
      async (_upstream: string, _value: string, outcome: string) => ({
        finalized: true,
        state: outcome,
      }),
    );
    mocks.placeRefreshIdentities.mockReturnValue([
      {
        slug: slugForCycle(),
        google_place_id: "ChIJ-hours-route-test",
      },
    ]);
  });

  it("turns a scheduled invocation into a healthy no-op while policy holds paid Google", async () => {
    mocks.googleHoursRefreshRuntimeEnabled.mockReturnValue(false);

    const response = await GET(request());
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toMatchObject({ enabled: false, mode: "policy_hold" });
    expect(mocks.googlePlacesConfigured).not.toHaveBeenCalled();
    expect(mocks.getDb).not.toHaveBeenCalled();
    expect(mocks.getPlaceDetails).not.toHaveBeenCalled();
  });

  afterEach(() => {
    vi.useRealTimers();
    delete process.env.CRON_SECRET;
    delete process.env.HOURS_REFRESH_CRON;
    delete process.env.GOOGLE_HOURS_REFRESH_DAILY_CAP;
  });

  it("proves write capability before taking a lease or making a paid Google call", async () => {
    mocks.getDb.mockReturnValue(db());
    storageSql = rawSql({ probeError: new Error("write denied") });
    mocks.getSql.mockReturnValue(storageSql.sql);

    const response = await GET(request());
    const body = await response.json();

    expect(response.status).toBe(503);
    expect(body.error).toContain("0024_place_hours_refresh.sql");
    expect(body.error).toContain("INSERT, UPDATE, DELETE");
    expect(storageSql.begin).toHaveBeenCalledOnce();
    expect(mocks.reserveUsageIntervalLease).not.toHaveBeenCalled();
    expect(mocks.reserveIdempotentDailyUsageBatch).not.toHaveBeenCalled();
    expect(mocks.getPlaceDetails).not.toHaveBeenCalled();
  });

  it("exercises insert, update, and delete in one rolled-back storage probe", async () => {
    mocks.getDb.mockReturnValue(db());
    mocks.getPlaceDetails.mockResolvedValue({
      weekday_hours: ["Monday: 9:00 AM – 5:00 PM"],
      business_status: "OPERATIONAL",
    });

    const response = await GET(request());

    expect(response.status).toBe(200);
    expect(storageSql.begin).toHaveBeenCalledOnce();
    expect(storageSql.tx).toHaveBeenCalledTimes(3);
    const statements = storageSql.tx.mock.calls.map(([strings]) =>
      Array.from(strings as TemplateStringsArray).join("?"),
    );
    expect(statements[0]).toContain("insert into public.place_hours_refresh");
    expect(statements[1]).toContain("update public.place_hours_refresh");
    expect(statements[2]).toContain("delete from public.place_hours_refresh");
    expect(storageSql.sql).toHaveBeenCalledOnce();
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
      runLease: "acquired",
    });
    expect(mocks.placeRefreshIdentities).toHaveBeenCalledTimes(1);
    expect(mocks.getPlaceDetails).toHaveBeenCalledWith(
      "ChIJ-hours-route-test",
      "hours",
    );
    expect(mocks.reserveIdempotentDailyUsageBatch).toHaveBeenCalledWith(
      "budget_google_hours_refresh",
      300,
      [`${slugForCycle()}\u0000ChIJ-hours-route-test`],
    );
    expect(mocks.reserveUsageIntervalLease).toHaveBeenCalledWith(
      "hours_refresh_run",
      7 * 60 * 1_000,
    );
    expect(
      mocks.reserveUsageIntervalLease.mock.invocationCallOrder[0],
    ).toBeLessThan(
      mocks.reserveIdempotentDailyUsageBatch.mock.invocationCallOrder[0],
    );
    expect(
      mocks.reserveIdempotentDailyUsageBatch.mock.invocationCallOrder[0],
    ).toBeLessThan(mocks.startIdempotentDailyUsage.mock.invocationCallOrder[0]);
    expect(
      mocks.startIdempotentDailyUsage.mock.invocationCallOrder[0],
    ).toBeLessThan(mocks.getPlaceDetails.mock.invocationCallOrder[0]);
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
    expect(mocks.reserveUsageIntervalLease).toHaveBeenCalledWith(
      "hours_refresh_run",
      7 * 60 * 1_000,
    );
  });

  it("returns 503 before paid work when lease storage is unavailable", async () => {
    mocks.getDb.mockReturnValue(db());
    mocks.reserveUsageIntervalLease.mockResolvedValue(null);

    const response = await GET(request());
    const body = await response.json();

    expect(response.status).toBe(503);
    expect(body).toMatchObject({
      healthy: false,
      targeted: 0,
      paidAttempts: 0,
      runLease: "unavailable",
    });
    expect(body.error).toContain("run lease is unavailable");
    expect(mocks.reserveIdempotentDailyUsageBatch).not.toHaveBeenCalled();
    expect(mocks.getPlaceDetails).not.toHaveBeenCalled();
  });

  it("returns 409 when another worker owns the shared hours-refresh lease", async () => {
    mocks.getDb.mockReturnValue(db());
    mocks.reserveUsageIntervalLease.mockResolvedValue({ acquired: false });

    const response = await GET(request());
    const body = await response.json();

    expect(response.status).toBe(409);
    expect(body).toMatchObject({
      healthy: false,
      cycleDay,
      targeted: 0,
      paidAttempts: 0,
      runLease: "held",
    });
    expect(body.error).toContain("already running");
    expect(mocks.reserveIdempotentDailyUsageBatch).not.toHaveBeenCalled();
    expect(mocks.getPlaceDetails).not.toHaveBeenCalled();
  });

  it("serializes different cycle buckets through the same global lease", async () => {
    const backfillDay = (cycleDay + 1) % HOURS_REFRESH_CYCLE_DAYS;
    const currentSlug = slugForCycle(cycleDay);
    const backfillSlug = slugForCycle(backfillDay);
    mocks.getDb.mockReturnValue(db());
    mocks.placeRefreshIdentities.mockReturnValue([
      {
        slug: currentSlug,
        google_place_id: "ChIJ-hours-global-current",
      },
      {
        slug: backfillSlug,
        google_place_id: "ChIJ-hours-global-backfill",
      },
    ]);
    mocks.reserveUsageIntervalLease
      .mockResolvedValueOnce({ acquired: true })
      .mockResolvedValueOnce({ acquired: false });
    mocks.getPlaceDetails.mockResolvedValue({
      weekday_hours: ["Monday: 9:00 AM – 5:00 PM"],
      business_status: "OPERATIONAL",
    });

    const scheduled = await GET(request());
    const blockedBackfill = await GET(request(`?cycleDay=${backfillDay}`));
    const blockedBody = await blockedBackfill.json();

    expect(scheduled.status).toBe(200);
    expect(blockedBackfill.status).toBe(409);
    expect(blockedBody).toMatchObject({
      cycleDay: backfillDay,
      cycleMode: "backfill",
      runLease: "held",
      paidAttempts: 0,
    });
    expect(mocks.reserveUsageIntervalLease).toHaveBeenNthCalledWith(
      1,
      "hours_refresh_run",
      7 * 60 * 1_000,
    );
    expect(mocks.reserveUsageIntervalLease).toHaveBeenNthCalledWith(
      2,
      "hours_refresh_run",
      7 * 60 * 1_000,
    );
    expect(mocks.reserveIdempotentDailyUsageBatch).toHaveBeenCalledTimes(1);
    expect(mocks.getPlaceDetails).toHaveBeenCalledTimes(1);
  });

  it("skips same-day persisted identities without a new lease, reservation, or provider call", async () => {
    const slug = slugForCycle();
    const placeId = "ChIJ-hours-already-refreshed";
    mocks.getDb.mockReturnValue(db());
    mocks.placeRefreshIdentities.mockReturnValue([
      { slug, google_place_id: placeId },
    ]);
    storageSql = rawSql({
      progress: [{ slug, place_id: placeId }],
    });
    mocks.getSql.mockReturnValue(storageSql.sql);

    const response = await GET(request());
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toMatchObject({
      healthy: true,
      targeted: 0,
      alreadyRefreshed: 1,
      paidAttempts: 0,
      written: 0,
      runLease: "not-needed",
    });
    expect(mocks.reserveUsageIntervalLease).not.toHaveBeenCalled();
    expect(mocks.reserveIdempotentDailyUsageBatch).not.toHaveBeenCalled();
    expect(mocks.getPlaceDetails).not.toHaveBeenCalled();
    const [strings] = storageSql.sql.mock.calls[0] ?? [];
    const statement = Array.from(strings as TemplateStringsArray).join("?");
    expect(statement).toContain("refreshed_at >=");
    expect(statement).toContain("America/New_York");
  });

  it("reserves only the unfinished tail of a partially persisted same-day bucket", async () => {
    const [persistedSlug, pendingSlug] = slugsForCycle(2);
    const persistedId = "ChIJ-hours-persisted-prefix";
    const pendingId = "ChIJ-hours-pending-tail";
    mocks.getDb.mockReturnValue(db());
    mocks.placeRefreshIdentities.mockReturnValue([
      { slug: persistedSlug, google_place_id: persistedId },
      { slug: pendingSlug, google_place_id: pendingId },
    ]);
    storageSql = rawSql({
      progress: [{ slug: persistedSlug, place_id: persistedId }],
    });
    mocks.getSql.mockReturnValue(storageSql.sql);
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
      alreadyRefreshed: 1,
      paidAttempts: 1,
      written: 1,
      runLease: "acquired",
    });
    expect(mocks.reserveIdempotentDailyUsageBatch).toHaveBeenCalledOnce();
    expect(mocks.reserveIdempotentDailyUsageBatch).toHaveBeenCalledWith(
      "budget_google_hours_refresh",
      300,
      [`${pendingSlug}\u0000${pendingId}`],
    );
    expect(mocks.getPlaceDetails).toHaveBeenCalledOnce();
    expect(mocks.getPlaceDetails).toHaveBeenCalledWith(pendingId, "hours");
  });

  it("resumes a pre-reserved unfinished tail without incrementing the daily allowance again", async () => {
    const [persistedSlug, pendingSlug] = slugsForCycle(2);
    const persistedId = "ChIJ-hours-resume-persisted";
    const pendingId = "ChIJ-hours-resume-ready-tail";
    mocks.getDb.mockReturnValue(db());
    mocks.placeRefreshIdentities.mockReturnValue([
      { slug: persistedSlug, google_place_id: persistedId },
      { slug: pendingSlug, google_place_id: pendingId },
    ]);
    storageSql = rawSql({
      progress: [{ slug: persistedSlug, place_id: persistedId }],
    });
    mocks.getSql.mockReturnValue(storageSql.sql);
    mocks.reserveIdempotentDailyUsageBatch.mockResolvedValue({
      reserved: true,
      count: 2,
      added: 0,
      states: ["ready"],
    });
    mocks.getPlaceDetails.mockResolvedValue({
      weekday_hours: ["Monday: 9:00 AM – 5:00 PM"],
      business_status: "OPERATIONAL",
    });

    const response = await GET(request());
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toMatchObject({
      healthy: true,
      alreadyRefreshed: 1,
      targeted: 1,
      paidAttempts: 1,
      written: 1,
      reservationsAdded: 0,
      reservationsReused: 1,
      blockedClaims: 0,
    });
    expect(mocks.reserveIdempotentDailyUsageBatch).toHaveBeenCalledWith(
      "budget_google_hours_refresh",
      300,
      [`${pendingSlug}\u0000${pendingId}`],
    );
    expect(mocks.startIdempotentDailyUsage).toHaveBeenCalledWith(
      "budget_google_hours_refresh",
      `${pendingSlug}\u0000${pendingId}`,
    );
    expect(mocks.getPlaceDetails).toHaveBeenCalledWith(pendingId, "hours");
  });

  it("does not repurchase a same-day target whose earlier attempt is uncertain", async () => {
    const slug = slugForCycle();
    const placeId = "ChIJ-hours-uncertain-attempt";
    mocks.getDb.mockReturnValue(db());
    mocks.placeRefreshIdentities.mockReturnValue([
      { slug, google_place_id: placeId },
    ]);
    mocks.reserveIdempotentDailyUsageBatch.mockResolvedValue({
      reserved: true,
      count: 1,
      added: 0,
      states: ["pending"],
    });

    const response = await GET(request());
    const body = await response.json();

    expect(response.status).toBe(503);
    expect(body).toMatchObject({
      healthy: false,
      targeted: 1,
      paidAttempts: 0,
      written: 0,
      reservationsAdded: 0,
      reservationsReused: 0,
      blockedClaims: 1,
      notAttempted: 1,
      failures: [slug],
    });
    expect(mocks.startIdempotentDailyUsage).not.toHaveBeenCalled();
    expect(mocks.getPlaceDetails).not.toHaveBeenCalled();
  });

  it("allows a later backfill after the expiring lease can be acquired", async () => {
    const backfillDay = (cycleDay + 1) % HOURS_REFRESH_CYCLE_DAYS;
    const backfillSlug = slugForCycle(backfillDay);
    const storage = db();
    mocks.getDb.mockReturnValue(storage);
    mocks.placeRefreshIdentities.mockReturnValue([
      {
        slug: backfillSlug,
        google_place_id: "ChIJ-hours-expired-lease-test",
      },
    ]);
    mocks.reserveUsageIntervalLease
      .mockResolvedValueOnce({ acquired: false })
      .mockResolvedValueOnce({ acquired: true });
    mocks.getPlaceDetails.mockResolvedValue({
      weekday_hours: ["Monday: 9:00 AM – 5:00 PM"],
      business_status: "OPERATIONAL",
    });

    const held = await GET(request(`?cycleDay=${backfillDay}`));
    expect(held.status).toBe(409);
    expect(mocks.getPlaceDetails).not.toHaveBeenCalled();

    const acquired = await GET(request(`?cycleDay=${backfillDay}`));
    const body = await acquired.json();

    expect(acquired.status).toBe(200);
    expect(body).toMatchObject({
      healthy: true,
      cycleDay: backfillDay,
      cycleMode: "backfill",
      runLease: "acquired",
      written: 1,
    });
    expect(mocks.reserveUsageIntervalLease).toHaveBeenNthCalledWith(
      2,
      "hours_refresh_run",
      7 * 60 * 1_000,
    );
    expect(mocks.getPlaceDetails).toHaveBeenCalledTimes(1);
  });

  it("does not partially consume a sequential second bucket after the lease expires", async () => {
    const backfillDay = (cycleDay + 1) % HOURS_REFRESH_CYCLE_DAYS;
    const currentSlugs = slugsForCycle(2, cycleDay);
    const backfillSlugs = slugsForCycle(2, backfillDay);
    mocks.getDb.mockReturnValue(db());
    mocks.placeRefreshIdentities.mockReturnValue([
      ...currentSlugs.map((slug, index) => ({
        slug,
        google_place_id: `ChIJ-hours-sequential-current-${index}`,
      })),
      ...backfillSlugs.map((slug, index) => ({
        slug,
        google_place_id: `ChIJ-hours-sequential-backfill-${index}`,
      })),
    ]);
    mocks.reserveUsageIntervalLease.mockResolvedValue({ acquired: true });
    mocks.reserveIdempotentDailyUsageBatch
      .mockResolvedValueOnce({
        reserved: true,
        count: 2,
        added: 2,
        states: ["ready", "ready"],
      })
      .mockResolvedValueOnce({
        reserved: false,
        count: 300,
        added: 0,
        states: ["ready", "ready"],
      });
    mocks.getPlaceDetails.mockResolvedValue({
      weekday_hours: ["Monday: 9:00 AM – 5:00 PM"],
      business_status: "OPERATIONAL",
    });

    const first = await GET(request());
    const second = await GET(request(`?cycleDay=${backfillDay}`));
    const secondBody = await second.json();

    expect(first.status).toBe(200);
    expect(second.status).toBe(503);
    expect(secondBody).toMatchObject({
      healthy: false,
      cycleDay: backfillDay,
      targeted: 2,
      paidAttempts: 0,
      written: 0,
      budgetExhausted: true,
      notAttempted: 2,
    });
    expect(mocks.reserveIdempotentDailyUsageBatch).toHaveBeenNthCalledWith(
      1,
      "budget_google_hours_refresh",
      300,
      currentSlugs.map(
        (slug, index) =>
          `${slug}\u0000ChIJ-hours-sequential-current-${index}`,
      ),
    );
    expect(mocks.reserveIdempotentDailyUsageBatch).toHaveBeenNthCalledWith(
      2,
      "budget_google_hours_refresh",
      300,
      backfillSlugs.map(
        (slug, index) =>
          `${slug}\u0000ChIJ-hours-sequential-backfill-${index}`,
      ),
    );
    expect(mocks.getPlaceDetails).toHaveBeenCalledTimes(2);
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
    mocks.reserveIdempotentDailyUsageBatch.mockResolvedValue({
      reserved: false,
      count: 300,
      added: 0,
      states: ["ready"],
    });

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
    expect(body.error).toContain("bucket was not partially consumed");
    expect(mocks.reserveIdempotentDailyUsageBatch).toHaveBeenCalledWith(
      "budget_google_hours_refresh",
      300,
      [`${backfillSlug}\u0000ChIJ-hours-replay-test`],
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
    expect(mocks.reserveUsageIntervalLease).not.toHaveBeenCalled();
    expect(mocks.reserveIdempotentDailyUsageBatch).not.toHaveBeenCalled();
    expect(mocks.getPlaceDetails).not.toHaveBeenCalled();
  });

  it("atomically rejects the whole remaining bucket before any Google call", async () => {
    const slugs = slugsForCycle(2);
    mocks.getDb.mockReturnValue(db());
    mocks.placeRefreshIdentities.mockReturnValue(
      slugs.map((slug, index) => ({
        slug,
        google_place_id: `ChIJ-hours-partial-cap-${index}`,
      })),
    );
    mocks.reserveIdempotentDailyUsageBatch.mockResolvedValue({
      reserved: false,
      count: 300,
      added: 0,
      states: ["ready", "ready"],
    });
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
      paidAttempts: 0,
      written: 0,
      budgetExhausted: true,
      notAttempted: 2,
    });
    expect(body.error).toContain("all 2 remaining targets");
    expect(mocks.reserveIdempotentDailyUsageBatch).toHaveBeenCalledOnce();
    expect(mocks.reserveIdempotentDailyUsageBatch).toHaveBeenCalledWith(
      "budget_google_hours_refresh",
      300,
      slugs.map(
        (slug, index) =>
          `${slug}\u0000ChIJ-hours-partial-cap-${index}`,
      ),
    );
    expect(mocks.getPlaceDetails).not.toHaveBeenCalled();
  });

  it("fails closed before Google when the shared counter is unavailable", async () => {
    mocks.getDb.mockReturnValue(db());
    mocks.reserveIdempotentDailyUsageBatch.mockResolvedValue(null);

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
    mocks.reserveIdempotentDailyUsageBatch.mockResolvedValue({
      reserved: false,
      count: 400,
      added: 0,
      states: ["ready"],
    });

    const response = await GET(request());
    const body = await response.json();

    expect(body.dailyCap).toBe(400);
    expect(mocks.reserveIdempotentDailyUsageBatch).toHaveBeenCalledWith(
      "budget_google_hours_refresh",
      400,
      [`${slugForCycle()}\u0000ChIJ-hours-route-test`],
    );
    expect(mocks.getPlaceDetails).not.toHaveBeenCalled();
  });
});
