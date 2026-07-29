import { afterEach, describe, expect, it, vi } from "vitest";
import {
  getOfficialCivicAlertsResult,
  OFFICIAL_CIVIC_ALERT_FEEDS,
  parseOfficialAlertFeed,
} from "./official-alert-feeds";

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

const EMPTY_RSS = `<?xml version="1.0"?>
<rss version="2.0"><channel>
  <title>Current alerts</title>
  <lastBuildDate>Tue, 28 Jul 2026 11:25:59 -0500</lastBuildDate>
</channel></rss>`;

describe("official CivicPlus alert parsing", () => {
  it("treats a valid empty current-alert channel as available", () => {
    const parsed = parseOfficialAlertFeed(
      EMPTY_RSS,
      OFFICIAL_CIVIC_ALERT_FEEDS[0],
      "2026-07-28T16:30:00.000Z",
    );

    expect(parsed.valid).toBe(true);
    expect(parsed.alerts).toEqual([]);
    expect(parsed.asOf).toBe("2026-07-28T16:25:59.000Z");
  });

  it("normalizes active state, clean text, timestamps, and provenance", () => {
    const xml = `<?xml version="1.0"?>
      <rss version="2.0"><channel>
        <lastBuildDate>Tue, 28 Jul 2026 11:25:59 -0500</lastBuildDate>
        <item>
          <title>Health &amp; safety notice</title>
          <link>https://health.frederickcountymd.gov/AlertCenter.aspx?AID=24</link>
          <pubDate>Thu, 23 Jul 2026 20:45:11 -0500</pubDate>
          <description>&lt;p&gt;A useful &amp;amp; current update.&lt;/p&gt;</description>
        </item>
      </channel></rss>`;
    const parsed = parseOfficialAlertFeed(
      xml,
      OFFICIAL_CIVIC_ALERT_FEEDS[3],
      "2026-07-28T16:30:00.000Z",
    );

    expect(parsed.alerts).toHaveLength(1);
    expect(parsed.alerts[0]).toMatchObject({
      kind: "health-notice",
      title: "Health & safety notice",
      summary: "A useful & current update.",
      state: "active",
      active: true,
      scope: "county",
      publishedAt: "2026-07-24T01:45:11.000Z",
      occurredAt: null,
      expiresAt: null,
      confidence: "official",
      provenance: {
        publisher: "Frederick County Health Department",
        authority: "official-government",
        sourceKind: "official-rss",
        retrievedAt: "2026-07-28T16:30:00.000Z",
        providerUpdatedAt: "2026-07-28T16:25:59.000Z",
        confidence: "official",
      },
    });
  });

  it("ends long public excerpts at a complete sentence when possible", () => {
    const xml = `<?xml version="1.0"?>
      <rss version="2.0"><channel>
        <item>
          <title>Health notice</title>
          <link>https://health.frederickcountymd.gov/AlertCenter.aspx?AID=25</link>
          <description>
            The first official sentence contains the useful local facts and
            gives a reader enough context before opening the source. This
            second sentence deliberately continues with enough extra language
            to push the complete description beyond the public excerpt limit
            without allowing the interface to stop in the middle of a word or
            an unfinished thought.
          </description>
        </item>
      </channel></rss>`;
    const parsed = parseOfficialAlertFeed(
      xml,
      OFFICIAL_CIVIC_ALERT_FEEDS[3],
      "2026-07-28T16:30:00.000Z",
    );

    expect(parsed.alerts[0].summary).toBe(
      "The first official sentence contains the useful local facts and gives a reader enough context before opening the source.",
    );
  });

  it("drops an item whose link leaves the official publisher host", () => {
    const xml = `<rss><channel><item>
      <title>Do not follow this</title>
      <link>https://example.com/not-official</link>
    </item></channel></rss>`;

    expect(
      parseOfficialAlertFeed(xml, OFFICIAL_CIVIC_ALERT_FEEDS[0]).alerts,
    ).toEqual([]);
  });

  it("rejects a 200 HTML error page as a changed feed shape", () => {
    expect(
      parseOfficialAlertFeed(
        "<html><body>Temporarily unavailable</body></html>",
        OFFICIAL_CIVIC_ALERT_FEEDS[0],
      ).valid,
    ).toBe(false);
  });
});

describe("official CivicPlus alert availability", () => {
  it("keeps category health separate and never claims complete coverage", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn<typeof fetch>(async (input) => {
        const url = String(input);
        if (url.includes("cityoffrederickmd.gov")) {
          return new Response("unavailable", { status: 503 });
        }
        return new Response(EMPTY_RSS, { status: 200 });
      }),
    );

    const result = await getOfficialCivicAlertsResult({
      now: new Date("2026-07-28T16:30:00.000Z"),
    });

    expect(result.available).toBe(true);
    expect(result.degraded).toBe(true);
    expect(result.coverageComplete).toBe(false);
    expect(result.coverageNote).toMatch(/not represent complete/i);
    expect(result.sourceHealth).toHaveLength(4);
    expect(result.sourceHealth[0]).toMatchObject({
      id: "city-emergency",
      available: false,
      activeCount: 0,
    });
    expect(result.sourceHealth.slice(1).every((source) => source.available))
      .toBe(true);
  });

  it("aborts stalled categories and distinguishes failure from empty", async () => {
    vi.useFakeTimers();
    const signals: AbortSignal[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn((_input: string | URL | Request, init?: RequestInit) => {
        const signal = init?.signal;
        if (signal) signals.push(signal);
        return new Promise<Response>((_resolve, reject) => {
          signal?.addEventListener("abort", () =>
            reject(new DOMException("Aborted", "AbortError")),
          );
        });
      }),
    );

    const pending = getOfficialCivicAlertsResult({ deadlineMs: 50 });
    await vi.advanceTimersByTimeAsync(50);

    const result = await pending;
    expect(result.available).toBe(false);
    expect(result.degraded).toBe(true);
    expect(signals).toHaveLength(4);
    expect(signals.every((signal) => signal.aborted)).toBe(true);
  });
});
