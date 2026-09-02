import { afterEach, describe, it, expect, vi } from "vitest";
import {
  aggregate,
  loadScannerIncidentsResult,
  scannerFetchFailureReason,
  type IncidentEntry,
} from "./scannerIncidents";
import type { PublicIncident } from "@/lib/scanner/incidentFeed";

// A minimal public incident stub; only the fields aggregate() groups on matter.
function inc(kind: PublicIncident["kind"], location: string, time = "9:00 pm"): PublicIncident {
  return { kind, location, time, roadImpact: kind === "Crash" };
}
const MIN = 60_000;

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("aggregate — call-lifecycle grouping", () => {
  it("folds repeated posts of one call into a single lifecycle entry", () => {
    const now = Date.now();
    // Same working fire posted three times as the response grew.
    const entries: IncidentEntry[] = [
      { inc: inc("Structure fire", "700 block E Potomac St", "11:17 pm"), atMs: now - 20 * MIN },
      { inc: inc("Structure fire", "700 block E Potomac St", "11:24 pm"), atMs: now - 13 * MIN },
      { inc: inc("Structure fire", "700 block E Potomac St", "11:31 pm"), atMs: now - 6 * MIN },
    ];
    const out = aggregate(entries);
    expect(out).toHaveLength(1);
    expect(out[0].updates).toBe(3);
    // firstAt = earliest post, at = latest post.
    expect(Date.parse(out[0].firstAt)).toBe(now - 20 * MIN);
    expect(Date.parse(out[0].at)).toBe(now - 6 * MIN);
    // Latest post drives the shown clock time.
    expect(out[0].time).toBe("11:31 pm");
  });

  it("keeps distinct calls separate and sorts newest-active first", () => {
    const now = Date.now();
    const out = aggregate([
      { inc: inc("Crash", "Route 15 and Motter Ave"), atMs: now - 30 * MIN },
      { inc: inc("Wires down", "E B St and Ninth Ave"), atMs: now - 2 * MIN },
    ]);
    expect(out).toHaveLength(2);
    expect(out[0].kind).toBe("Wires down"); // most recently active
    expect(out.every((o) => o.updates === 1)).toBe(true);
  });

  it("drops posts older than the aging window", () => {
    const now = Date.now();
    const HR = 60 * MIN;
    const out = aggregate([
      { inc: inc("Crash", "Old Rd"), atMs: now - 13 * HR }, // past the 12h window
      { inc: inc("Crash", "Fresh Rd"), atMs: now - 5 * MIN },
    ]);
    expect(out).toHaveLength(1);
    expect(out[0].location).toBe("Fresh Rd");
  });

  it("counts only in-window posts toward a call's update total", () => {
    const now = Date.now();
    const HR = 60 * MIN;
    const out = aggregate([
      { inc: inc("Structure fire", "Main St"), atMs: now - 13 * HR }, // aged out (>12h)
      { inc: inc("Structure fire", "Main St"), atMs: now - 4 * HR },
      { inc: inc("Structure fire", "Main St"), atMs: now - 3 * MIN },
    ]);
    expect(out).toHaveLength(1);
    expect(out[0].updates).toBe(2);
    expect(Date.parse(out[0].firstAt)).toBe(now - 4 * HR);
  });
});

describe("scanner source availability", () => {
  it("classifies an elapsed route deadline as a timeout", () => {
    const controller = new AbortController();
    expect(scannerFetchFailureReason(controller.signal)).toBe(
      "upstream_unavailable",
    );
    controller.abort();
    expect(scannerFetchFailureReason(controller.signal)).toBe("timeout");
  });

  it("falls back when the direct endpoint returns an unrelated 200 HTML page", async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        new Response("<html><body><p>Service temporarily unavailable.</p></body></html>", {
          status: 200,
        }),
      )
      .mockResolvedValueOnce(
        new Response("<rss><channel></channel></rss>", {
          status: 200,
          headers: { Date: "Tue, 28 Jul 2026 16:00:00 GMT" },
        }),
      );
    vi.stubGlobal("fetch", fetchMock);

    await expect(loadScannerIncidentsResult()).resolves.toEqual({
      data: [],
      available: true,
      source: "rss",
      asOf: "2026-07-28T16:00:00.000Z",
      asOfBasis: "retrieval",
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    const directSignal = fetchMock.mock.calls[0][1]?.signal;
    expect(directSignal).toBeInstanceOf(AbortSignal);
    expect(fetchMock.mock.calls[1][1]?.signal).toBe(directSignal);
  });

  it("accepts the direct page's explicit quiet-board sentinel without falling back", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(
        "<html><body><b>Latest Incidents:</b><p>New incident log started. This will start populating soon.</p></body></html>",
        {
          status: 200,
          headers: { Date: "Tue, 28 Jul 2026 16:00:00 GMT" },
        },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);

    await expect(loadScannerIncidentsResult()).resolves.toEqual({
      data: [],
      available: true,
      source: "direct",
      asOf: "2026-07-28T16:00:00.000Z",
      asOfBasis: "retrieval",
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("accepts a dated dispatch-shaped direct page", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-28T16:00:00.000Z"));
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(
        "<html><body><p>11:55 am | VEHICLE ACCIDENT - BLS | 100 BLOCK N MARKET ST | Radio: 9B | Units: E31 | Listen live at FrederickScanner.com (posted 07/28/2026)</p></body></html>",
        {
          status: 200,
          headers: { Date: "Tue, 28 Jul 2026 16:00:00 GMT" },
        },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);

    const result = await loadScannerIncidentsResult();
    expect(result).toMatchObject({
      available: true,
      source: "direct",
      asOf: "2026-07-28T16:00:00.000Z",
      asOfBasis: "retrieval",
    });
    expect(result.data).toHaveLength(1);
    expect(result.data[0]).toMatchObject({
      kind: "Crash",
      location: "100 block N Market St",
      at: "2026-07-28T15:55:00.000Z",
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("does not stamp an incident with the current time when its date is missing", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn<typeof fetch>().mockResolvedValue(
        new Response(
          "<b>Latest Incidents:</b><p>7:23 pm | VEHICLE ACCIDENT - BLS | 12200 BLOCK COPPERMINE RD | Radio: 9B | Units: A179, E172</p><p>New incident log started. This will start populating soon.</p>",
          {
            status: 200,
            headers: { Date: "Tue, 28 Jul 2026 16:00:00 GMT" },
          },
        ),
      ),
    );

    await expect(loadScannerIncidentsResult()).resolves.toEqual({
      data: [],
      available: true,
      source: "direct",
      asOf: "2026-07-28T16:00:00.000Z",
      asOfBasis: "retrieval",
    });
  });
});
