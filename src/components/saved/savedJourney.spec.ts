import { describe, expect, it } from "vitest";
import { EMPTY_SAVED_JOURNEY, parseSavedJourney, SAVED_JOURNEY_MAX_AGE_MS } from "./savedJourney";

describe("Saved return context", () => {
  const now = Date.parse("2026-09-06T18:00:00Z");
  const state = { ...EMPTY_SAVED_JOURNEY, activeList: "Saturday in Brunswick", organizerOpen: true, raisedSlug: "beans-in-belfry", eventSlug: "concert", showPast: true, pastEventSlug: "old-concert", scrollY: 830 };
  const encode = (patch = {}, savedAt = now) => JSON.stringify({ version: 1, savedAt, state: { ...state, ...patch } });

  it("restores the same personal list, expanded cards, and scroll position", () => {
    expect(parseSavedJourney(encode(), now)).toEqual(state);
  });

  it("starts a fresh visit after thirty minutes instead of reviving an old task", () => {
    expect(parseSavedJourney(encode(), now + SAVED_JOURNEY_MAX_AGE_MS + 1)).toBeNull();
    expect(parseSavedJourney(encode({}, now + 1), now)).toBeNull();
  });

  it.each([{ scrollY: -1 }, { scrollY: 100_001 }, { organizerOpen: "true" }, { raisedSlug: {} }, { activeList: "x".repeat(121) }])("ignores malformed state %j", (patch) => {
    expect(parseSavedJourney(encode(patch), now)).toBeNull();
  });

  it("ignores corrupt, old-version, and oversized session values", () => {
    expect(parseSavedJourney("not json", now)).toBeNull();
    expect(parseSavedJourney(JSON.stringify({ version: 2, savedAt: now, state }), now)).toBeNull();
    expect(parseSavedJourney("x".repeat(4097), now)).toBeNull();
  });
});
