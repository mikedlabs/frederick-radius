import { afterEach, describe, expect, it, vi } from "vitest";
import type { Event } from "@/data/events";

const mocks = vi.hoisted(() => ({
  assembleUnifiedEvents: vi.fn(),
}));

vi.mock("@/lib/loaders/unifiedEvents", () => ({
  assembleUnifiedEvents: mocks.assembleUnifiedEvents,
}));

import { askFrederick } from "./answer";

function accessEvent(
  overrides: Partial<Event> & Pick<Event, "slug" | "title">,
): Event {
  return {
    description: "The publisher confirms live captions.",
    starts_at: "2026-07-30T22:00:00.000Z",
    ends_at: "2026-07-31T00:00:00.000Z",
    timezone: "America/New_York",
    venue_name: "Test venue",
    address: "1 Test Street, Frederick, MD",
    geom: { lat: 39.4143, lng: -77.4105 },
    municipality: "frederick",
    category: "community",
    audience: [],
    is_free: true,
    source: "manual",
    is_verified: true,
    ...overrides,
  };
}

describe("Ask communication-access event routing", () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  it("routes an empty dated search to the access guide and filtered calendar", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-29T22:00:00.000Z"));
    const multiWeekCourse = accessEvent({
      slug: "six-week-asl-class",
      title: "6-Week ASL Class",
      description: "Registration covers six weekly classes.",
      source: "mdcc",
      starts_at: "2026-07-14T22:00:00.000Z",
      ends_at: "2026-08-18T23:00:00.000Z",
    });
    mocks.assembleUnifiedEvents.mockResolvedValue({
      unified: [multiWeekCourse],
      publicEvents: [multiWeekCourse],
      sourceHealth: { degraded: false, unavailable: [] },
    });

    const result = await askFrederick(
      "Are there any ASL or Deaf community events tomorrow?",
      {
        origin: { lng: -77.4105, lat: 39.4143 },
        municipality: "frederick",
        contextLabel: "your location",
        canShowDistance: true,
      },
    );

    expect(result.status).toBe("empty");
    expect(result.sources).toEqual([]);
    expect(result.answer).toContain("does not treat them as drop-in events");
    expect(result.actions).toEqual([
      expect.objectContaining({ href: "/access" }),
      expect.objectContaining({ href: "/events?access=1" }),
    ]);
  });

  it("keeps a publisher-confirmed single event and still exposes both access routes", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-29T22:00:00.000Z"));
    const captionedMeeting = accessEvent({
      slug: "captioned-meeting",
      title: "Captioned community meeting",
    });
    mocks.assembleUnifiedEvents.mockResolvedValue({
      unified: [captionedMeeting],
      publicEvents: [captionedMeeting],
      sourceHealth: { degraded: false, unavailable: [] },
    });

    const result = await askFrederick(
      "Are there any captioned events tomorrow?",
      {
        origin: { lng: -77.4105, lat: 39.4143 },
        municipality: "frederick",
        contextLabel: "your location",
        canShowDistance: true,
      },
    );

    expect(result.sources).toContainEqual(
      expect.objectContaining({
        slug: "captioned-meeting",
        reason: "Captions",
      }),
    );
    expect(result.actions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ href: "/access" }),
        expect.objectContaining({ href: "/events?access=1" }),
      ]),
    );
  });
});
