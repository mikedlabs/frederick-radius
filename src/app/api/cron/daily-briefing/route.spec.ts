import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

const mocks = vi.hoisted(() => ({
  verifyCronAuth: vi.fn(),
  configurePush: vi.fn(),
  getNwsForecast: vi.fn(),
  assembleUnifiedEvents: vi.fn(),
  fanoutToTopic: vi.fn(),
}));

vi.mock("../../ingest/_auth", () => ({
  verifyCronAuth: mocks.verifyCronAuth,
}));
vi.mock("@/lib/push", () => ({
  configurePush: mocks.configurePush,
}));
vi.mock("@/lib/integrations/nws", () => ({
  getNwsForecast: mocks.getNwsForecast,
}));
vi.mock("@/lib/loaders/unifiedEvents", () => ({
  assembleUnifiedEvents: mocks.assembleUnifiedEvents,
}));
vi.mock("@/lib/push-fanout", () => ({
  fanoutToTopic: mocks.fanoutToTopic,
}));

import { GET } from "./route";

const NOW = new Date("2026-07-31T12:03:00.000Z");
const request = () =>
  new Request("https://frederickradius.app/api/cron/daily-briefing");

describe("GET /api/cron/daily-briefing", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
    vi.clearAllMocks();
    mocks.verifyCronAuth.mockReturnValue(null);
    mocks.configurePush.mockReturnValue(true);
    mocks.getNwsForecast.mockResolvedValue({
      daily: [{
        temperature: 82,
        temperatureUnit: "F",
        shortForecast: "Mostly Sunny",
      }],
    });
    mocks.assembleUnifiedEvents.mockResolvedValue({
      unified: [],
      publicEvents: [
        { starts_at: "2026-07-31T13:00:00.000Z" },
        { starts_at: "2026-08-01T01:00:00.000Z" },
        { starts_at: "2026-08-01T04:00:00.000Z" },
      ],
      sourceHealth: { degraded: false, unavailable: [] },
    });
    mocks.fanoutToTopic.mockResolvedValue({
      claimed: true,
      attempted: 2,
      sent: 2,
      gone: 0,
      held: 0,
    });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("counts the authoritative public board on the Eastern calendar day", async () => {
    const response = await GET(request());
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(mocks.assembleUnifiedEvents).toHaveBeenCalledWith(NOW);
    expect(mocks.fanoutToTopic).toHaveBeenCalledWith(
      "daily-briefing",
      "briefing:2026-07-31",
      expect.objectContaining({
        body:
          "Today's forecast is 82°F with mostly sunny. 2 listed events are happening today.",
      }),
    );
    expect(body).toMatchObject({
      date: "2026-07-31",
      claimed: true,
      sent: 2,
    });
  });

  it("degrades to a weather-only briefing when the event board is unavailable", async () => {
    mocks.assembleUnifiedEvents.mockRejectedValue(
      new Error("event cache unavailable"),
    );

    const response = await GET(request());
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.body).toBe(
      "Today's forecast is 82°F with mostly sunny.",
    );
    expect(mocks.fanoutToTopic).toHaveBeenCalledOnce();
  });

  it("stays silent when neither trusted input is available", async () => {
    mocks.getNwsForecast.mockResolvedValue(null);
    mocks.assembleUnifiedEvents.mockRejectedValue(
      new Error("event cache unavailable"),
    );

    const response = await GET(request());
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toMatchObject({
      skipped: "no briefing content",
      date: "2026-07-31",
    });
    expect(mocks.fanoutToTopic).not.toHaveBeenCalled();
  });
});
