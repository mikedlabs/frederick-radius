import { beforeEach, describe, expect, it, vi } from "vitest";
import type { EventWithMeta } from "@/lib/loaders/events";

const mocks = vi.hoisted(() => ({
  verifyCronAuth: vi.fn(),
  assembleUnifiedEvents: vi.fn(),
  configurePush: vi.fn(),
  fanoutToTopic: vi.fn(),
}));

vi.mock("../../ingest/_auth", () => ({
  verifyCronAuth: mocks.verifyCronAuth,
}));
vi.mock("@/lib/loaders/unifiedEvents", () => ({
  assembleUnifiedEvents: mocks.assembleUnifiedEvents,
}));
vi.mock("@/lib/push", () => ({
  configurePush: mocks.configurePush,
}));
vi.mock("@/lib/push-fanout", () => ({
  fanoutToTopic: mocks.fanoutToTopic,
}));

import { GET } from "./route";

const request = () =>
  new Request("https://frederickradius.app/api/cron/parking-forecast");

const DOWNTOWN = { lng: -77.4096093, lat: 39.4134048 };

function publicEvent(over: Partial<EventWithMeta> = {}): EventWithMeta {
  return {
    slug: "weinberg-show",
    title: "A posted concert",
    description: "A posted event.",
    starts_at: "2026-10-22T23:00:00.000Z",
    ends_at: "2026-10-23T01:00:00.000Z",
    timezone: "America/New_York",
    venue_name: "Weinberg Center",
    address: "20 W Patrick St, Frederick, MD 21701",
    geom: DOWNTOWN,
    municipality: "frederick",
    category: "music",
    audience: [],
    is_free: false,
    source: "manual",
    is_verified: true,
    feature_score: 5,
    municipality_name: "Frederick",
    category_name: "music",
    geo_confidence: "venue_match",
    attendance_mode: "physical",
    ...over,
  } as EventWithMeta;
}

describe("GET /api/cron/parking-forecast", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.verifyCronAuth.mockReturnValue(null);
    mocks.configurePush.mockReturnValue(true);
    mocks.fanoutToTopic.mockResolvedValue({ claimed: true, sent: 1 });
    mocks.assembleUnifiedEvents.mockResolvedValue({
      publicEvents: [],
      unified: [],
      sourceHealth: { degraded: false, unavailable: [] },
    });
  });

  it("reads the live unified board instead of the seed-only upcoming lists", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const response = await GET(request());
    const body = await response.json();

    expect(mocks.assembleUnifiedEvents).toHaveBeenCalledTimes(1);
    expect(response.status).toBe(200);
    expect(body.events_checked).toBe(0);
    expect(body.public_events).toBe(0);
    expect(body.note).toBe("zero events to check");
    expect(log).toHaveBeenCalledWith(
      "[events] parking-forecast checked zero events",
      { public_events: 0 },
    );
  });

  it("counts physical events with a point and omits the empty-board note", async () => {
    const info = vi.spyOn(console, "info").mockImplementation(() => undefined);
    mocks.assembleUnifiedEvents.mockResolvedValue({
      publicEvents: [
        publicEvent(),
        publicEvent({
          slug: "zoom-book-club",
          title: "Virtual Book Club",
          attendance_mode: "online",
          geom: DOWNTOWN,
        }),
      ],
      unified: [],
      sourceHealth: { degraded: false, unavailable: [] },
    });

    const response = await GET(request());
    const body = await response.json();

    expect(body.public_events).toBe(2);
    expect(body.events_checked).toBe(1);
    expect(body.note).toBeUndefined();
    expect(info).toHaveBeenCalledWith(
      "[events] parking-forecast checked",
      1,
      "events",
    );
  });

  it("still names a zero-count check when the live board has only online events", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => undefined);
    mocks.assembleUnifiedEvents.mockResolvedValue({
      publicEvents: [
        publicEvent({
          slug: "zoom-book-club",
          title: "Virtual Book Club",
          attendance_mode: "online",
        }),
      ],
      unified: [],
      sourceHealth: { degraded: false, unavailable: [] },
    });

    const body = await (await GET(request())).json();

    expect(body).toMatchObject({
      public_events: 1,
      events_checked: 0,
      forecasts: 0,
      note: "zero events to check",
    });
    expect(log).toHaveBeenCalledWith(
      "[events] parking-forecast checked zero events",
      { public_events: 1 },
    );
  });
});
