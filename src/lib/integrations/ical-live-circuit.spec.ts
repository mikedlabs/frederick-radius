import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getLiveEventsForSources } from "./ical-live";
import { publicEventSourceCircuits } from "./event-source-circuit";

const ICAL = [
  "BEGIN:VCALENDAR",
  "VERSION:2.0",
  "BEGIN:VEVENT",
  "UID:recovered-event",
  "DTSTART:20260827T180000Z",
  "DTEND:20260827T200000Z",
  "SUMMARY:Recovered event",
  "LOCATION:Carroll Creek Amphitheater, Frederick, MD",
  "URL:https://example.com/recovered",
  "END:VEVENT",
  "END:VCALENDAR",
].join("\r\n");

describe("public live-event source circuit integration", () => {
  beforeEach(() => {
    publicEventSourceCircuits.reset();
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-29T12:00:00.000Z"));
    vi.spyOn(Math, "random").mockReturnValue(0.5);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("does not make each visitor retry a failed provider", async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockRejectedValue(new Error("provider unavailable"));
    vi.stubGlobal("fetch", fetchMock);

    const first = await getLiveEventsForSources(["celebrate"], 60);
    const second = await getLiveEventsForSources(["celebrate"], 60);

    expect(first.sources_failed).toEqual(["celebrate"]);
    expect(second.sources_failed).toEqual(["celebrate"]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(publicEventSourceCircuits.snapshot("feed:celebrate")).toEqual({
      phase: "open",
      failures: 1,
      nextProbeAtMs: Date.now() + 30_000,
      hasLastGood: false,
    });
  });

  it("reuses the last good source rows without claiming the source is healthy", async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        new Response(ICAL, {
          status: 200,
          headers: { "content-type": "text/calendar" },
        }),
      )
      .mockRejectedValue(new Error("provider unavailable"));
    vi.stubGlobal("fetch", fetchMock);

    const good = await getLiveEventsForSources(["celebrate"], 60);
    const failedRefresh = await getLiveEventsForSources(
      ["celebrate"],
      60,
    );
    const skippedVisitor = await getLiveEventsForSources(
      ["celebrate"],
      60,
    );

    expect(good.sources_succeeded).toEqual(["celebrate"]);
    expect(failedRefresh.sources_failed).toEqual(["celebrate"]);
    expect(skippedVisitor.sources_failed).toEqual(["celebrate"]);
    expect(failedRefresh.events.map((event) => event.id)).toEqual([
      "recovered-event",
    ]);
    expect(skippedVisitor.events.map((event) => event.id)).toEqual([
      "recovered-event",
    ]);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("lets a signalled health probe bypass an open public circuit, then closes on a successful half-open public probe", async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockRejectedValueOnce(new Error("provider unavailable"))
      .mockImplementation(async () =>
        new Response(ICAL, {
          status: 200,
          headers: { "content-type": "text/calendar" },
        }),
      );
    vi.stubGlobal("fetch", fetchMock);

    await getLiveEventsForSources(["celebrate"], 60);

    const healthController = new AbortController();
    const health = await getLiveEventsForSources(
      ["celebrate"],
      60,
      { signal: healthController.signal },
    );
    expect(health.sources_succeeded).toEqual(["celebrate"]);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    // The operational read was isolated: it recovered its own answer without
    // silently mutating the public process circuit.
    expect(publicEventSourceCircuits.snapshot("feed:celebrate").phase).toBe(
      "open",
    );

    const skipped = await getLiveEventsForSources(["celebrate"], 60);
    expect(skipped.sources_failed).toEqual(["celebrate"]);
    expect(fetchMock).toHaveBeenCalledTimes(2);

    await vi.advanceTimersByTimeAsync(30_000);
    const recovered = await getLiveEventsForSources(["celebrate"], 60);
    expect(recovered.sources_succeeded).toEqual(["celebrate"]);
    expect(recovered.events.map((event) => event.id)).toEqual([
      "recovered-event",
    ]);
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(publicEventSourceCircuits.snapshot("feed:celebrate")).toEqual({
      phase: "closed",
      failures: 0,
      nextProbeAtMs: null,
      hasLastGood: true,
    });
  });

  it("caps the public municipal fanout at four providers", async () => {
    vi.useRealTimers();
    const releases: Array<() => void> = [];
    let active = 0;
    let maxActive = 0;
    const fetchMock = vi.fn<typeof fetch>(
      () =>
        new Promise<Response>((resolve) => {
          active += 1;
          maxActive = Math.max(maxActive, active);
          releases.push(() => {
            active -= 1;
            resolve(
              new Response("BEGIN:VCALENDAR\r\nEND:VCALENDAR", {
                status: 200,
                headers: { "content-type": "text/calendar" },
              }),
            );
          });
        }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const pending = getLiveEventsForSources(
      [
        "celebrate",
        "hood",
        "fair",
        "heritage-frederick",
        "monocacy",
        "msd",
      ],
      60,
    );

    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(4));
    expect(active).toBe(4);
    releases.splice(0, 4).forEach((release) => release());
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(6));
    releases.splice(0).forEach((release) => release());

    await expect(pending).resolves.toMatchObject({
      sources_failed: [],
      sources_succeeded: [
        "celebrate",
        "hood",
        "fair",
        "heritage-frederick",
        "monocacy",
        "msd",
      ],
    });
    expect(maxActive).toBe(4);
  });
});
