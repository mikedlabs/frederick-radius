import { describe, expect, it } from "vitest";
import {
  MAX_SAVED_TRANSIT_STOPS,
  deriveCatchability,
  estimateWalkingMinutes,
  isPredictionFresh,
  minutesUntilArrival,
  parseSavedTransitStops,
  toggleSavedTransitStop,
  type SavedTransitStop,
} from "./transitRiderModel";

function savedStop(index: number): SavedTransitStop {
  return {
    id: String(index),
    name: `Stop ${index}`,
    lat: 39.4 + index / 1000,
    lng: -77.4,
    savedAt: `2026-07-${String(index).padStart(2, "0")}T12:00:00.000Z`,
  };
}

describe("saved transit stops", () => {
  it("parses defensively, removes duplicate ids, and caps the device list", () => {
    const raw = JSON.stringify([
      savedStop(1),
      savedStop(1),
      { ...savedStop(2), lat: 120 },
      ...Array.from({ length: 7 }, (_, index) => savedStop(index + 3)),
    ]);

    const parsed = parseSavedTransitStops(raw);

    expect(parsed).toHaveLength(MAX_SAVED_TRANSIT_STOPS);
    expect(parsed.map((stop) => stop.id)).toEqual(["1", "3", "4", "5", "6", "7"]);
    expect(parseSavedTransitStops("{bad json")).toEqual([]);
  });

  it("adds and removes a stop without silently evicting another one", () => {
    const first = savedStop(1);
    const added = toggleSavedTransitStop(
      [],
      first,
      "2026-07-28T12:00:00.000Z",
    );
    expect(added.saved).toBe(true);
    expect(added.stops).toHaveLength(1);

    const removed = toggleSavedTransitStop(
      added.stops,
      first,
      "2026-07-28T12:01:00.000Z",
    );
    expect(removed).toMatchObject({
      stops: [],
      saved: false,
      limitReached: false,
    });

    const full = Array.from(
      { length: MAX_SAVED_TRANSIT_STOPS },
      (_, index) => savedStop(index + 1),
    );
    const blocked = toggleSavedTransitStop(
      full,
      savedStop(20),
      "2026-07-28T12:02:00.000Z",
    );
    expect(blocked.limitReached).toBe(true);
    expect(blocked.stops.map((stop) => stop.id)).toEqual(
      full.map((stop) => stop.id),
    );
  });
});

describe("rider timing estimates", () => {
  it("inflates straight-line distance before estimating the walk", () => {
    expect(estimateWalkingMinutes(1000)).toBe(18);
    expect(estimateWalkingMinutes(-1)).toBeNull();
  });

  it("rounds arrival minutes down so the advice errs early", () => {
    const nowMs = 1_000_000;
    const arrivalEpoch = nowMs / 1000 + 5 * 60 + 59;
    expect(minutesUntilArrival(arrivalEpoch, nowMs)).toBe(5);
    expect(minutesUntilArrival(undefined, nowMs)).toBeNull();
  });

  it("uses a prediction timestamp when present and the feed age otherwise", () => {
    const nowMs = 1_700_000_000_000;
    expect(isPredictionFresh(undefined, nowMs, true)).toBe(true);
    expect(isPredictionFresh(undefined, nowMs, false)).toBe(false);
    expect(
      isPredictionFresh((nowMs - 89_000) / 1000, nowMs, true),
    ).toBe(true);
    expect(
      isPredictionFresh((nowMs - 91_000) / 1000, nowMs, true),
    ).toBe(false);
    expect(isPredictionFresh(nowMs - 10_000, nowMs, true)).toBe(true);
    expect(
      isPredictionFresh((nowMs + 5 * 60_000) / 1000, nowMs, true),
    ).toBe(false);
  });

  it("only labels fresh arrivals with conservative catchability language", () => {
    expect(deriveCatchability(12, 8, false)).toBeNull();
    expect(deriveCatchability(12, null, true)).toBeNull();
    expect(deriveCatchability(7, 8, true)).toEqual({
      kind: "too-tight",
      label: "Probably too tight",
    });
    expect(deriveCatchability(8, 8, true)).toEqual({
      kind: "tight",
      label: "Leave now. Timing is tight.",
    });
    expect(deriveCatchability(10, 8, true)).toEqual({
      kind: "likely",
      label: "Likely catchable",
    });
  });
});
