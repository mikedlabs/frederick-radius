import { afterEach, describe, expect, it, vi } from "vitest";
import {
  getLiveEventsForSources,
  withLiveEventFetchSession,
} from "./ical-live";

const ICAL = [
  "BEGIN:VCALENDAR",
  "VERSION:2.0",
  "BEGIN:VEVENT",
  "UID:inside-60",
  "DTSTART:20260827T180000Z",
  "DTEND:20260827T200000Z",
  "SUMMARY:Inside sixty days",
  "LOCATION:Carroll Creek Amphitheater, Frederick, MD",
  "URL:https://example.com/inside-60",
  "END:VEVENT",
  "BEGIN:VEVENT",
  "UID:inside-90",
  "DTSTART:20261011T180000Z",
  "DTEND:20261011T200000Z",
  "SUMMARY:Inside ninety days",
  "LOCATION:Carroll Creek Amphitheater, Frederick, MD",
  "URL:https://example.com/inside-90",
  "END:VEVENT",
  "END:VCALENDAR",
].join("\r\n");

describe("warm-event live fetch session", () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("pulls one widest source window and preserves narrower event counts", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-28T12:00:00.000Z"));
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValue(
        new Response(ICAL, {
          status: 200,
          headers: { "content-type": "text/calendar" },
        }),
      );
    vi.stubGlobal("fetch", fetchMock);

    const result = await withLiveEventFetchSession(async () => {
      // Deliberately sequential: the old active-only single-flight cleared
      // after the first response and repeated this source for each cache fill.
      const live60 = await getLiveEventsForSources(["celebrate"], 60);
      const live90 = await getLiveEventsForSources(["celebrate"], 90);
      const second60 = await getLiveEventsForSources(["celebrate"], 60);
      return { live60, live90, second60 };
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(result.live60.events.map((event) => event.id)).toEqual([
      "inside-60",
    ]);
    expect(result.second60.events.map((event) => event.id)).toEqual([
      "inside-60",
    ]);
    expect(result.live90.events.map((event) => event.id)).toEqual([
      "inside-60",
      "inside-90",
    ]);
    expect(result.live60.sources_succeeded).toEqual(["celebrate"]);
    expect(result.live90.sources_succeeded).toEqual(["celebrate"]);
  });

  it("shares one failed source result across windows without retrying it", async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockRejectedValue(new Error("upstream unavailable"));
    vi.stubGlobal("fetch", fetchMock);

    const result = await withLiveEventFetchSession(async () => ({
      live60: await getLiveEventsForSources(["celebrate"], 60),
      live90: await getLiveEventsForSources(["celebrate"], 90),
    }));

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(result.live60).toMatchObject({
      events: [],
      sources_succeeded: [],
      sources_failed: ["celebrate"],
    });
    expect(result.live90).toMatchObject({
      events: [],
      sources_succeeded: [],
      sources_failed: ["celebrate"],
    });
  });
});
