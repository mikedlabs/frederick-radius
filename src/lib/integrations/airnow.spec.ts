import { afterEach, describe, expect, it, vi } from "vitest";
import type { AqiObservation } from "./airnow";
import { airQualityObservedAt, getAirQuality, isFreshAqiObservation } from "./airnow";
import { FREDERICK_CENTER } from "@/lib/geo";

const originalAirNowKey = process.env.AIRNOW_API_KEY;

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  if (originalAirNowKey === undefined) delete process.env.AIRNOW_API_KEY;
  else process.env.AIRNOW_API_KEY = originalAirNowKey;
});

function observation(dateObserved: string, hourObserved: number): AqiObservation {
  return {
    parameter: "PM2.5",
    aqi: 42,
    category: { id: 1, name: "Good", color: "#315A43" },
    reportingArea: "Frederick",
    dateObserved,
    hourObserved,
  };
}

describe("AirNow observation freshness", () => {
  it("parses AirNow's ISO and slash date shapes as Eastern wall time", () => {
    expect(airQualityObservedAt(observation("2026-07-17", 12))?.toISOString())
      .toBe("2026-07-17T16:00:00.000Z");
    expect(airQualityObservedAt(observation("07/17/2026", 12))?.toISOString())
      .toBe("2026-07-17T16:00:00.000Z");
  });

  it("accepts an hourly reading within three hours", () => {
    expect(isFreshAqiObservation(
      observation("2026-07-17", 12),
      new Date("2026-07-17T18:59:00.000Z"),
    )).toBe(true);
  });

  it("rejects stale, malformed, and implausibly future readings", () => {
    const now = new Date("2026-07-17T20:01:00.000Z");
    expect(isFreshAqiObservation(observation("2026-07-17", 12), now)).toBe(false);
    expect(isFreshAqiObservation(observation("not-a-date", 12), now)).toBe(false);
    expect(isFreshAqiObservation(
      observation("2026-07-17", 18),
      new Date("2026-07-17T20:00:00.000Z"),
    )).toBe(false);
  });
});

describe("AirNow request deadline", () => {
  it("aborts a stalled upstream request and fails soft", async () => {
    vi.useFakeTimers();
    process.env.AIRNOW_API_KEY = "test-key";
    let signal: AbortSignal | undefined;
    vi.stubGlobal("fetch", vi.fn((_url: string | URL | Request, init?: RequestInit) => {
      signal = init?.signal ?? undefined;
      return new Promise<Response>((_resolve, reject) => {
        signal?.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")));
      });
    }));

    const pending = getAirQuality(FREDERICK_CENTER, { deadlineMs: 50 });
    await vi.advanceTimersByTimeAsync(50);

    await expect(pending).resolves.toBeNull();
    expect(signal?.aborted).toBe(true);
  });
});
