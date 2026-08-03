import { afterEach, describe, expect, it, vi } from "vitest";
import {
  EMPTY_SPORTS_EVENTS,
  loadSportsPageData,
  SPORTS_PAGE_DATA_DEADLINE_MS,
} from "./sportsPage";

describe("sports page data boundary", () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  it("keeps successful schedule data", async () => {
    const events = {
      unified: [],
      publicEvents: [],
      sourceHealth: { degraded: false, unavailable: [] },
    };
    const game = {
      id: "hood-1",
      teamId: "hood" as const,
      teamName: "Hood College",
      teamNickname: "Blazers",
      sport: "Soccer",
      startsAt: "2026-08-22T21:00:00.000Z",
      timeTba: false,
      homeAway: "home" as const,
      opponent: "McDaniel College",
      venue: "Thomas Athletic Field",
      location: "Frederick, MD",
      state: "scheduled" as const,
      result: null,
      teamScore: null,
      opponentScore: null,
      sourceUrl: "https://example.com/game",
      watchUrl: null,
      statsUrl: null,
      ticketsUrl: null,
      recapUrl: null,
      verifiedAt: "2026-08-03T12:00:00.000Z",
    };

    const result = loadSportsPageData(new Date("2026-08-03T12:00:00.000Z"), {
      assembleUnifiedEvents: vi.fn().mockResolvedValue(events),
      getLocalSportsGames: vi.fn().mockResolvedValue([game]),
    });

    await expect(result.eventsPromise).resolves.toBe(events);
    await expect(result.localSportsPromise).resolves.toEqual([game]);
  });

  it("resolves both sections with honest fallbacks at the route deadline", async () => {
    vi.useFakeTimers();
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const never = new Promise<never>(() => undefined);
    const result = loadSportsPageData(new Date("2026-08-03T12:00:00.000Z"), {
      assembleUnifiedEvents: vi.fn(() => never),
      getLocalSportsGames: vi.fn(() => never),
    });

    await vi.advanceTimersByTimeAsync(SPORTS_PAGE_DATA_DEADLINE_MS);

    await expect(result.eventsPromise).resolves.toEqual(EMPTY_SPORTS_EVENTS);
    await expect(result.localSportsPromise).resolves.toEqual([]);
    expect(warn).toHaveBeenCalledTimes(2);
  });
});
