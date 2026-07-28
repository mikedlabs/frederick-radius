import { afterEach, describe, expect, it, vi } from "vitest";
import type { Event } from "@/data/events";

const mocks = vi.hoisted(() => ({
  assembleUnifiedEvents: vi.fn(),
}));

vi.mock("@/lib/loaders/unifiedEvents", () => ({
  assembleUnifiedEvents: mocks.assembleUnifiedEvents,
}));

import { askFrederick } from "./answer";

function event(
  slug: string,
  title: string,
  municipality: string,
  geom: { lng: number; lat: number },
): Event {
  return {
    slug,
    title,
    description: `${title} is scheduled tonight.`,
    starts_at: "2026-07-27T23:00:00.000Z",
    ends_at: "2026-07-28T01:00:00.000Z",
    timezone: "America/New_York",
    venue_name: `${title} venue`,
    address: "Frederick County, MD",
    geom,
    municipality,
    category: "music",
    audience: ["all"],
    is_free: true,
    source: "manual",
    is_verified: true,
  };
}

describe("Ask event proximity", () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  it.each([
    "Anything fun tonight near me?",
    "What can I do within walking distance tonight?",
  ])("keeps %s inside the visitor's local radius", async (query) => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-27T22:00:00.000Z"));

    const downtown = event(
      "downtown-show",
      "Downtown Show",
      "frederick",
      { lng: -77.4098, lat: 39.4139 },
    );
    const mountAiry = event(
      "mount-airy-show",
      "Mount Airy Show",
      "mount-airy",
      { lng: -77.1547, lat: 39.3762 },
    );
    mocks.assembleUnifiedEvents.mockResolvedValue({
      unified: [mountAiry, downtown],
      publicEvents: [mountAiry, downtown],
      sourceHealth: { degraded: false, unavailable: [] },
    });

    const result = await askFrederick(query, {
      origin: { lng: -77.4105, lat: 39.4143 },
      contextLabel: "Near you",
      canShowDistance: true,
    });

    expect(result.sources.map((source) => source.name)).toContain("Downtown Show");
    expect(result.sources.map((source) => source.name)).not.toContain("Mount Airy Show");
    expect(result.sources.every((source) => source.href !== "/events/mount-airy-show")).toBe(true);
    expect(result.sources.find((source) => source.name === "Downtown Show")?.distance).toBeTruthy();
  });
});
