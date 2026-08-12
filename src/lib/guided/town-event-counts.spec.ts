import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getLiveEvents: vi.fn(),
  isPromotedDataBuild: vi.fn(),
}));

vi.mock("next/cache", () => ({
  unstable_cache: (fn: unknown) => fn,
}));
vi.mock("@/lib/loaders/events", () => ({
  allUpcoming: () => [],
  dedupeLiveAgainstCurated: () => [],
}));
vi.mock("@/lib/events/classify", () => ({
  isPublicEvent: () => true,
}));
vi.mock("@/lib/integrations/ical-live", () => ({
  getLiveEvents: mocks.getLiveEvents,
}));
vi.mock("@/lib/loaders/liveEvents", () => ({
  liveToCardEvent: (event: unknown) => event,
}));
vi.mock("@/lib/loaders/venueEvents", () => ({
  venueEventsAsCards: () => [],
}));
vi.mock("@/lib/events/normalize", () => ({
  collapseRecurringEvents: (events: unknown[]) => events,
}));
vi.mock("@/lib/guided/town-event-window", () => ({
  isInNextSevenDayTownWindow: () => true,
}));
vi.mock("@/lib/data-release-mode", () => ({
  isPromotedDataBuild: mocks.isPromotedDataBuild,
}));

import { buildNextSevenDayPublicEventCounts } from "./town-event-counts";

describe("town event counts release boundary", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getLiveEvents.mockResolvedValue({ events: [] });
  });

  it("uses only promoted inputs during a release build", async () => {
    mocks.isPromotedDataBuild.mockReturnValue(true);

    await expect(buildNextSevenDayPublicEventCounts()).resolves.toEqual({});
    expect(mocks.getLiveEvents).not.toHaveBeenCalled();
  });

  it("keeps the live feed available at runtime", async () => {
    mocks.isPromotedDataBuild.mockReturnValue(false);

    await expect(buildNextSevenDayPublicEventCounts()).resolves.toEqual({});
    expect(mocks.getLiveEvents).toHaveBeenCalledWith(60);
  });
});
