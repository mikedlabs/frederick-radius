import { describe, it, expect, vi, afterEach } from "vitest";
import { getLiveEvents } from "@/lib/integrations/ical-live";
import { publicEventSourceCircuits } from "@/lib/integrations/event-source-circuit";

/**
 * PR1 — events cold-load hardening. The /events render awaits the live
 * feeds in parallel, so a failing or hung upstream must degrade to []
 * (the page then renders from seed + curated data), never throw and
 * never block the render indefinitely.
 */
afterEach(() => {
  // Each case represents a fresh worker. A failure in one test must not leave
  // the process-local circuit open and suppress the next test's fetches.
  publicEventSourceCircuits.reset();
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe("getLiveEvents — feed failures never block or break the page", () => {
  it("a rejecting feed degrades to an empty, valid result (no throw)", async () => {
    vi.stubGlobal("fetch", vi.fn(() => Promise.reject(new Error("network down"))));
    const res = await getLiveEvents(60);
    expect(Array.isArray(res.events)).toBe(true);
    expect(res.events).toEqual([]);
  });

  it("a hung feed is aborted by the timeout instead of hanging forever", async () => {
    // fetch never resolves on its own — it only settles when the
    // AbortController fires, which is exactly the timeout path.
    vi.stubGlobal(
      "fetch",
      vi.fn(
        (_url: string, opts?: { signal?: AbortSignal }) =>
          new Promise((_resolve, reject) => {
            opts?.signal?.addEventListener("abort", () =>
              reject(Object.assign(new Error("aborted"), { name: "AbortError" })),
            );
          }),
      ),
    );
    vi.useFakeTimers();
    const p = getLiveEvents(60);
    // Source reads are concurrency-limited, so later waves do not create
    // their deadlines until an earlier wave aborts. Advance through every
    // wave instead of stopping after the first four feeds.
    for (let wave = 0; wave < 8; wave += 1) {
      await vi.advanceTimersByTimeAsync(9_000);
    }
    const res = await p;
    expect(res.events).toEqual([]);
  });

  it("keeps raw Google Calendar bodies out of Next's 2 MB Data Cache", async () => {
    const respondWithCalendar: typeof fetch = async () =>
      new Response(
        [
          "BEGIN:VCALENDAR",
          "VERSION:2.0",
          "PRODID:-//Frederick Radius test//EN",
          "END:VCALENDAR",
        ].join("\r\n"),
        { status: 200, headers: { "content-type": "text/calendar" } },
      );
    const fetchMock = vi.fn(respondWithCalendar);
    vi.stubGlobal("fetch", fetchMock);

    await getLiveEvents(60);

    const calendarCalls = fetchMock.mock.calls.filter(([url]) =>
      String(url).includes("calendar.google.com/calendar/ical/"),
    );
    expect(calendarCalls.length).toBeGreaterThan(0);
    for (const [, options] of calendarCalls) {
      expect(options).toMatchObject({ cache: "no-store" });
      expect(options).not.toHaveProperty("next");
    }
  });

  it("keeps every upstream event body out of a nested Next SWR cache", async () => {
    const respondWithEmptyFeed: typeof fetch = async () =>
      new Response("[]", { status: 200 });
    const fetchMock = vi.fn(respondWithEmptyFeed);
    vi.stubGlobal("fetch", fetchMock);

    await getLiveEvents(60, {
      includeTicketmaster: false,
      readMode: "probe",
    });

    expect(fetchMock).toHaveBeenCalled();
    for (const [, options] of fetchMock.mock.calls) {
      expect(options).toMatchObject({ cache: "no-store" });
      expect(options).not.toHaveProperty("next");
    }
  });

  it("coalesces concurrent 60-day and 90-day reads of the same raw calendar", async () => {
    const respondWithCalendar: typeof fetch = async () =>
      new Response(
        [
          "BEGIN:VCALENDAR",
          "VERSION:2.0",
          "PRODID:-//Frederick Radius test//EN",
          "END:VCALENDAR",
        ].join("\r\n"),
        { status: 200, headers: { "content-type": "text/calendar" } },
      );
    const fetchMock = vi.fn(respondWithCalendar);
    vi.stubGlobal("fetch", fetchMock);

    await Promise.all([getLiveEvents(60), getLiveEvents(90)]);

    const fairCalendarCalls = fetchMock.mock.calls.filter(([url]) =>
      String(url).includes("gffcal%40gmail.com"),
    );
    expect(fairCalendarCalls).toHaveLength(1);
  });

  it("fails one oversized calendar source softly instead of buffering it", async () => {
    const fetchMock = vi.fn((url: string | URL | Request) => {
      if (String(url).includes("gffcal%40gmail.com")) {
        return Promise.resolve(
          new Response("", {
            status: 200,
            headers: { "content-length": "5000001" },
          }),
        );
      }
      return Promise.reject(new Error("offline in test"));
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await getLiveEvents(60);

    expect(result.events).toEqual([]);
    expect(result.sources_failed).toContain("fair");
  });
});
