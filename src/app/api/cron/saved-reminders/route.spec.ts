import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  verifyCronAuth: vi.fn(),
  getDb: vi.fn(),
  getSql: vi.fn(),
  configurePush: vi.fn(),
  sendPush: vi.fn(),
  getEventBySlug: vi.fn(),
  archivedEventBySlug: vi.fn(),
  archivedEventFromSnapshot: vi.fn(),
  getLiveCardEventBySlug: vi.fn(),
  getIngestedCardBySlug: vi.fn(),
  noticeForEvent: vi.fn(),
}));

vi.mock("../../ingest/_auth", () => ({
  verifyCronAuth: mocks.verifyCronAuth,
}));
vi.mock("@/lib/db/client", () => ({
  getDb: mocks.getDb,
  getSql: mocks.getSql,
}));
vi.mock("@/lib/push", () => ({
  configurePush: mocks.configurePush,
  sendPush: mocks.sendPush,
}));
vi.mock("@/lib/loaders/events", () => ({
  getEventBySlug: mocks.getEventBySlug,
}));
vi.mock("@/lib/loaders/liveEvents", () => ({
  getLiveCardEventBySlug: mocks.getLiveCardEventBySlug,
}));
vi.mock("@/lib/loaders/ingestedEvents", () => ({
  getIngestedCardBySlug: mocks.getIngestedCardBySlug,
}));
vi.mock("@/lib/events/event-identity", () => ({
  archivedEventBySlug: mocks.archivedEventBySlug,
  archivedEventFromSnapshot: mocks.archivedEventFromSnapshot,
}));
vi.mock("@/lib/events/notices", () => ({
  noticeForEvent: mocks.noticeForEvent,
}));

import { GET } from "./route";

const NOW = "2026-09-02T12:00:00.000Z";

function request() {
  return new Request("https://frederickradius.app/api/cron/saved-reminders");
}

function retryableClaimDb() {
  let claimAvailable = true;
  const returning = vi.fn(async () => {
    if (!claimAvailable) return [];
    claimAvailable = false;
    return [{ id: "11111111-1111-4111-8111-111111111111" }];
  });
  const onConflictDoNothing = vi.fn(() => ({ returning }));
  const values = vi.fn(() => ({ onConflictDoNothing }));
  const insert = vi.fn(() => ({ values }));
  const deleteWhere = vi.fn(async () => {
    claimAvailable = true;
  });
  const remove = vi.fn(() => ({ where: deleteWhere }));

  return { db: { insert, delete: remove }, deleteWhere };
}

describe("GET /api/cron/saved-reminders", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(NOW));
    vi.clearAllMocks();
    vi.stubEnv("SAVED_REMINDERS_ENABLED", "1");
    mocks.verifyCronAuth.mockReturnValue(null);
    mocks.configurePush.mockReturnValue(true);
    mocks.getSql.mockReturnValue(vi.fn(async () => [
      {
        event_slug: "fair-opening-day",
        canonical_event_slug: null,
        event_snapshot: null,
        endpoint:
          "https://updates.push.services.mozilla.com/wpush/v2/reminder",
        p256dh: "key",
        auth: "auth",
      },
    ]));
    mocks.getEventBySlug.mockReturnValue({
      title: "Fair opening day",
      starts_at: "2026-09-02T13:00:00.000Z",
      status: "scheduled",
    });
    mocks.archivedEventFromSnapshot.mockReturnValue(null);
    mocks.archivedEventBySlug.mockResolvedValue(null);
    mocks.getLiveCardEventBySlug.mockResolvedValue(null);
    mocks.getIngestedCardBySlug.mockResolvedValue(null);
    mocks.noticeForEvent.mockReturnValue(null);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllEnvs();
  });

  it("releases a transient provider-failure claim so the next cron can retry", async () => {
    const { db, deleteWhere } = retryableClaimDb();
    mocks.getDb.mockReturnValue(db);
    mocks.sendPush
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ statusCode: 201, headers: {}, body: "" });

    const first = await GET(request());
    const second = await GET(request());

    expect(await first.json()).toMatchObject({
      enabled: true,
      candidates: 1,
      inWindow: 1,
      sent: 0,
    });
    expect(await second.json()).toMatchObject({
      enabled: true,
      candidates: 1,
      inWindow: 1,
      sent: 1,
    });
    expect(mocks.sendPush).toHaveBeenCalledTimes(2);
    expect(deleteWhere).toHaveBeenCalledOnce();
  });
});
