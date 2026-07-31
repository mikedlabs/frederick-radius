import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  verifyCronAuth: vi.fn(),
  parkingFeedEnabled: vi.fn(),
  parkingFeedConfigured: vi.fn(),
  getParkingOccupancyResult: vi.fn(),
  configurePush: vi.fn(),
  fanoutToTopic: vi.fn(),
}));

vi.mock("../../ingest/_auth", () => ({
  verifyCronAuth: mocks.verifyCronAuth,
}));
vi.mock("@/lib/integrations/parking-live", () => ({
  parkingFeedEnabled: mocks.parkingFeedEnabled,
  parkingFeedConfigured: mocks.parkingFeedConfigured,
  getParkingOccupancyResult: mocks.getParkingOccupancyResult,
}));
vi.mock("@/lib/push", () => ({
  configurePush: mocks.configurePush,
}));
vi.mock("@/lib/push-fanout", () => ({
  fanoutToTopic: mocks.fanoutToTopic,
}));

import { GET } from "./route";

const request = () =>
  new Request("https://frederickradius.app/api/cron/parking-alerts");

const currentDeck = (
  overrides: Partial<{
    garageSlug: string | null;
    name: string;
    available: number | null;
    occupied: number | null;
    capacity: number | null;
    percentFull: number | null;
    status: string | null;
    isFull: boolean;
    isFilling: boolean;
    updated: string | null;
  }> = {},
) => ({
  garageSlug: "court-street-parking-garage-frederick",
  name: "Court Street Garage",
  available: 100,
  occupied: 300,
  capacity: 400,
  percentFull: 75,
  status: "OPEN",
  isFull: false,
  isFilling: true,
  updated: "2026-07-31T11:59:00.000Z",
  ...overrides,
});

describe("GET /api/cron/parking-alerts", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.verifyCronAuth.mockReturnValue(null);
    mocks.parkingFeedEnabled.mockReturnValue(true);
    mocks.parkingFeedConfigured.mockReturnValue(true);
    mocks.configurePush.mockReturnValue(true);
    mocks.getParkingOccupancyResult.mockResolvedValue({
      status: "ok",
      checkedAt: "2026-07-31T12:00:00.000Z",
      snapshot: {
        asOf: "2026-07-31T11:59:00.000Z",
        decks: [currentDeck()],
      },
    });
    mocks.fanoutToTopic.mockResolvedValue({ claimed: true, sent: 2 });
  });

  it("stays dormant until the operator explicitly enables the licensed feed", async () => {
    mocks.parkingFeedEnabled.mockReturnValue(false);

    const response = await GET(request());
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toMatchObject({
      ok: true,
      status: "disabled",
    });
    expect(mocks.configurePush).not.toHaveBeenCalled();
    expect(mocks.getParkingOccupancyResult).not.toHaveBeenCalled();
  });

  it("reports an enabled feed with no endpoint as a configuration failure", async () => {
    mocks.parkingFeedConfigured.mockReturnValue(false);

    const response = await GET(request());
    const body = await response.json();

    expect(response.status).toBe(503);
    expect(body).toEqual({
      ok: false,
      status: "unavailable",
      reason: "missing-url",
      decks_checked: 0,
      fanouts: 0,
      detail: [],
    });
    expect(mocks.configurePush).not.toHaveBeenCalled();
  });

  it("does not pull occupancy when push delivery is unavailable", async () => {
    mocks.configurePush.mockReturnValue(false);

    const response = await GET(request());

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      ok: true,
      skipped: "VAPID not configured",
    });
    expect(mocks.getParkingOccupancyResult).not.toHaveBeenCalled();
  });

  it.each(["network", "timeout", "invalid-payload", "stale"])(
    "returns an honest 503 and sends nothing when the feed is %s",
    async (reason) => {
      mocks.getParkingOccupancyResult.mockResolvedValue({
        status: "unavailable",
        checkedAt: "2026-07-31T12:00:00.000Z",
        reason,
      });

      const response = await GET(request());
      const bodyText = await response.text();

      expect(response.status).toBe(503);
      expect(JSON.parse(bodyText)).toEqual({
        ok: false,
        status: "unavailable",
        reason,
        checked_at: "2026-07-31T12:00:00.000Z",
        decks_checked: 0,
        fanouts: 0,
        detail: [],
      });
      expect(bodyText).not.toContain("PARKING_OCCUPANCY_KEY");
      expect(bodyText).not.toContain("parking.example");
      expect(mocks.fanoutToTopic).not.toHaveBeenCalled();
    },
  );

  it("reports a healthy current snapshot with no full garages", async () => {
    const response = await GET(request());
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toMatchObject({
      ok: true,
      status: "ok",
      source_as_of: "2026-07-31T11:59:00.000Z",
      decks_checked: 1,
      fanouts: 0,
      detail: [],
    });
    expect(mocks.fanoutToTopic).not.toHaveBeenCalled();
  });

  it("fans out only a fresh matched full garage and suggests one with room", async () => {
    mocks.getParkingOccupancyResult.mockResolvedValue({
      status: "ok",
      checkedAt: "2026-07-31T12:00:00.000Z",
      snapshot: {
        asOf: "2026-07-31T11:59:00.000Z",
        decks: [
          currentDeck({
            available: 0,
            percentFull: 100,
            isFull: true,
            isFilling: false,
          }),
          currentDeck({
            garageSlug: "carroll-creek-parking-garage-frederick",
            name: "Carroll Creek Deck",
            available: 80,
            percentFull: 70,
            isFilling: false,
          }),
        ],
      },
    });

    const response = await GET(request());
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(mocks.fanoutToTopic).toHaveBeenCalledTimes(1);
    expect(mocks.fanoutToTopic).toHaveBeenCalledWith(
      "parking",
      expect.stringMatching(
        /^court-street-parking-garage-frederick:\d{4}-\d{2}-\d{2}T\d$/,
      ),
      expect.objectContaining({
        title: "Court Street Garage is full",
        body: "Try Carroll Creek Garage. It still has room.",
        url: "/parking",
      }),
    );
    expect(body).toMatchObject({
      ok: true,
      status: "ok",
      decks_checked: 2,
      fanouts: 1,
      detail: [{
        garage: "court-street-parking-garage-frederick",
        percentFull: 100,
        claimed: true,
        sent: 2,
      }],
    });
  });
});
