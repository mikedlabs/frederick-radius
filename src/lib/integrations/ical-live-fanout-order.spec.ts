import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getLiveEventsForSources } from "./ical-live";
import { publicEventSourceCircuits } from "./event-source-circuit";

/**
 * Four calendars are read at a time. The CivicPlus hosts (every RSSFeed.aspx
 * calendar) hang together on server-side connections, and four of them sit in
 * the first seven registry entries. Read in registry order, they took all four
 * connections and the calendars behind them never got a turn before the
 * caller's deadline. These cases pin the order that prevents it.
 */

const RSS_SOURCES = ["county", "city-frederick", "mount-airy", "thurmont", "parks"] as const;
const OTHER_SOURCES = [
  "celebrate",
  "hood",
  "fair",
  "heritage-frederick",
  "monocacy",
  "msd",
  "delaplaine",
  "isf",
  "elc",
] as const;
// The registry's own order for the fourteen calendars above.
const REGISTRY_ORDER = [
  "celebrate",
  "county",
  "hood",
  "city-frederick",
  "fair",
  "mount-airy",
  "thurmont",
  "heritage-frederick",
  "monocacy",
  "msd",
  "parks",
  "delaplaine",
  "isf",
  "elc",
] as const;

const EMPTY_RSS = '<?xml version="1.0"?><rss version="2.0"><channel><title>Calendar</title></channel></rss>';

function isCivicPlus(url: string): boolean {
  return url.includes("RSSFeed.aspx");
}

function ical(serial: number): string {
  return [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "BEGIN:VEVENT",
    `UID:fanout-order-${serial}`,
    "DTSTART:20260827T180000Z",
    "DTEND:20260827T200000Z",
    `SUMMARY:Fanout order event ${serial}`,
    "LOCATION:Carroll Creek Amphitheater, Frederick, MD",
    `URL:https://example.com/fanout-order-${serial}`,
    "END:VEVENT",
    "END:VCALENDAR",
  ].join("\r\n");
}

function icalResponse(serial: number): Response {
  return new Response(ical(serial), {
    status: 200,
    headers: { "content-type": "text/calendar" },
  });
}

describe("live calendar fanout order", () => {
  beforeEach(() => {
    publicEventSourceCircuits.reset();
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-28T12:00:00.000Z"));
    vi.spyOn(console, "log").mockImplementation(() => undefined);
    vi.spyOn(console, "info").mockImplementation(() => undefined);
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("starts with calendars that answer and reports results in registry order", async () => {
    const requested: string[] = [];
    let serial = 0;
    vi.stubGlobal(
      "fetch",
      vi.fn<typeof fetch>(async (input) => {
        const url = String(input);
        requested.push(url);
        serial += 1;
        return isCivicPlus(url)
          ? new Response(EMPTY_RSS, { status: 200 })
          : icalResponse(serial);
      }),
    );

    const result = await getLiveEventsForSources([...REGISTRY_ORDER], 60);

    expect(requested).toHaveLength(REGISTRY_ORDER.length);
    // All four connections open on calendars that answer. In registry order
    // the second and fourth requests went to CivicPlus.
    expect(requested.slice(0, 4).filter(isCivicPlus)).toEqual([]);
    expect(requested.filter(isCivicPlus)).toHaveLength(RSS_SOURCES.length);
    // Dedupe keeps the first calendar that lists an event, so the results must
    // stay in registry order whatever order the reads ran in.
    expect(result.sources_succeeded).toEqual([...REGISTRY_ORDER]);
    expect(result.sources_failed).toEqual([]);
  });

  it("lets hung CivicPlus hosts cost only their own calendars", async () => {
    let serial = 0;
    vi.stubGlobal(
      "fetch",
      vi.fn<typeof fetch>((input, init) => {
        const url = String(input);
        if (!isCivicPlus(url)) {
          serial += 1;
          return Promise.resolve(icalResponse(serial));
        }
        // A blackholed connection: nothing answers until the reader gives up.
        return new Promise<Response>((_resolve, reject) => {
          const signal = init?.signal ?? undefined;
          const giveUp = () =>
            reject(new DOMException("This operation was aborted", "AbortError"));
          if (signal?.aborted) giveUp();
          else signal?.addEventListener("abort", giveUp, { once: true });
        });
      }),
    );

    const caller = new AbortController();
    const pending = getLiveEventsForSources([...REGISTRY_ORDER], 60, {
      signal: caller.signal,
      readMode: "public",
    });
    // The unified assembly stops its calendar reads shortly before its eight
    // second budget ends.
    await vi.advanceTimersByTimeAsync(7_500);
    caller.abort();
    await vi.advanceTimersByTimeAsync(0);
    const result = await pending;

    expect(result.sources_succeeded).toEqual([...OTHER_SOURCES]);
    expect(result.sources_failed).toEqual([...RSS_SOURCES]);
    expect(result.events).toHaveLength(OTHER_SOURCES.length);
  });
});
