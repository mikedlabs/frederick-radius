import { afterEach, describe, expect, it, vi } from "vitest";
import {
  getOfficialCivicAlertsResult,
  currentLocalCivicAlerts,
  isLocallyRelevantCivicAlert,
  OFFICIAL_CIVIC_ALERT_FEEDS,
  officialCivicAlertExpiresAt,
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
  it("rechecks a parsed current alert after its ceiling passes inside the shared cache window", () => {
    const parsed = parseOfficialAlertFeed(`<rss><channel><item><title>Frederick emergency</title><link>https://www.cityoffrederickmd.gov/AlertCenter.aspx?AID=24</link><pubDate>2026-09-16T20:00:10.000Z</pubDate><description>Follow official instructions.</description></item></channel></rss>`, OFFICIAL_CIVIC_ALERT_FEEDS[0], "2026-09-30T20:00:00.000Z");
    expect(parsed.alerts).toHaveLength(1);
    expect(currentLocalCivicAlerts(parsed.alerts, Date.parse("2026-09-30T20:00:00.000Z"))).toHaveLength(1);
    expect(currentLocalCivicAlerts(parsed.alerts, Date.parse("2026-09-30T20:00:10.000Z"))).toEqual([]);
    expect(currentLocalCivicAlerts(parsed.alerts, Date.parse("2026-09-30T20:00:30.000Z"))).toEqual([]);
    expect(parsed.alerts[0].provenance.retrievedAt).toBe("2026-09-30T20:00:00.000Z");
    for (const expiresAt of [null, "", "invalid"]) expect(currentLocalCivicAlerts([{ ...parsed.alerts[0], expiresAt }], Date.parse("2026-09-30T20:00:00.000Z"))).toEqual([]);
  });
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

  it("does not promote a Southern Maryland health bulletin as a Frederick alert", () => {
    expect(
      isLocallyRelevantCivicAlert({
        kind: "health-notice",
        title: "Measles exposure update",
        summary:
          "Two cases were confirmed in residents of Southern Maryland after travel.",
      }),
    ).toBe(false);
  });

  it("keeps a health notice that names Frederick County", () => {
    expect(
      isLocallyRelevantCivicAlert({
        kind: "health-notice",
        title: "Frederick County health notice",
        summary: "Residents should read the current guidance.",
      }),
    ).toBe(true);
  });

  it("keeps feed-scoped emergencies, closings, and burn bans", () => {
    for (const kind of [
      "city-emergency",
      "health-closing",
      "health-burn-ban",
    ] as const) {
      expect(
        isLocallyRelevantCivicAlert({
          kind,
          title: "Official update",
          summary: "Read the current notice.",
        }),
      ).toBe(true);
    }
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
      expiresAt: "2026-08-23T01:45:11.000Z",
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
          <pubDate>Tue, 28 Jul 2026 10:00:00 -0500</pubDate>
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

  it("does not let an undated current-feed item remain active forever", () => {
    const xml = `<rss><channel><item>
      <title>Undated emergency notice</title>
      <link>https://www.cityoffrederickmd.gov/AlertCenter.aspx?AID=91</link>
      <description>Read the current instructions.</description>
    </item></channel></rss>`;

    expect(
      parseOfficialAlertFeed(
        xml,
        OFFICIAL_CIVIC_ALERT_FEEDS[0],
        "2026-07-28T16:30:00.000Z",
      ).alerts,
    ).toEqual([]);
  });

  it("expires routine emergency and closing notices conservatively", () => {
    const xml = `<rss><channel><item>
      <title>Old emergency notice</title>
      <link>https://www.cityoffrederickmd.gov/AlertCenter.aspx?AID=92</link>
      <pubDate>Wed, 01 Jul 2026 10:00:00 -0500</pubDate>
      <description>Read the official notice.</description>
    </item></channel></rss>`;

    expect(
      parseOfficialAlertFeed(
        xml,
        OFFICIAL_CIVIC_ALERT_FEEDS[0],
        "2026-07-28T16:30:00.000Z",
      ).alerts,
    ).toEqual([]);
    expect(
      officialCivicAlertExpiresAt(
        "city-emergency",
        "2026-07-01T15:00:00.000Z",
      ),
    ).toBe("2026-07-15T15:00:00.000Z");
  });

  it("gives a dated burn ban a wider but still finite active window", () => {
    const xml = `<rss><channel><item>
      <title>County burn ban</title>
      <link>https://health.frederickcountymd.gov/AlertCenter.aspx?AID=93</link>
      <pubDate>Wed, 01 Apr 2026 10:00:00 -0500</pubDate>
      <description>Outdoor burning is restricted.</description>
    </item></channel></rss>`;

    const parsed = parseOfficialAlertFeed(
      xml,
      OFFICIAL_CIVIC_ALERT_FEEDS[1],
      "2026-07-28T16:30:00.000Z",
    );
    expect(parsed.alerts).toHaveLength(1);
    expect(parsed.alerts[0].expiresAt).toBe("2026-09-28T15:00:00.000Z");
  });

  it("selects the latest official update when July, August and September rows share a pubDate", () => {
    // Replays the exact titles/publication date of the October 2 official feed.
    const titles = [
      "Measles Exposure Updated on Jul 23 2026  5:30PM",
      "Measles Exposure Updated on Aug  4 2026  4:24PM",
      "Measles Exposure Updated on Sep 17 2026  9:10AM",
    ];
    const feed = (rows: string[]) => `<rss><channel>${rows.map(title => `<item>
      <title>${title}</title>
      <link>https://health.frederickcountymd.gov/AlertCenter.aspx?AID=24</link>
      <guid>https://health.frederickcountymd.gov/AlertCenter.aspx?AID=24/639252330740000000</guid>
      <pubDate>Thu, 17 Sep 2026 09:11:14 -0500</pubDate>
      <description>A statewide health bulletin; see its official source.</description>
    </item>`).join("")}</channel></rss>`;
    for (const rows of [titles, [...titles].reverse()]) {
      const parsed = parseOfficialAlertFeed(feed(rows), OFFICIAL_CIVIC_ALERT_FEEDS[3], "2026-10-02T18:13:09.000Z");
      expect(parsed.alerts).toHaveLength(1);
      expect(parsed.alerts[0]).toMatchObject({
        title: "Measles Exposure Updated on Sep 17 2026 9:10AM",
        publishedAt: "2026-09-17T14:11:14.000Z",
        expiresAt: "2026-10-17T14:11:14.000Z",
      });
      expect(isLocallyRelevantCivicAlert(parsed.alerts[0])).toBe(false);
      expect(parseOfficialAlertFeed(feed(rows), OFFICIAL_CIVIC_ALERT_FEEDS[3], "2026-10-17T14:11:14.000Z").alerts).toEqual([]);
    }
  });

  it("sorts long duplicate titles by the update label before display truncation", () => {
    const prefix = "Frederick County official notice with detailed location information ".repeat(4);
    const row = (month: string, day: number, summary: string) => `<item>
      <title>${prefix}Updated on ${month} ${day} 2026 9:10AM</title>
      <link>https://health.frederickcountymd.gov/AlertCenter.aspx?AID=24</link>
      <pubDate>17 Sep 2026 09:11:14 -0500</pubDate><description>${summary}</description>
    </item>`;
    const old = row("Jul", 23, "Earlier official update.");
    const current = row("Sep", 17, "Latest official update.");
    for (const rows of [[old, current], [current, old]]) {
      const parsed = parseOfficialAlertFeed(`<rss><channel>${rows.join("")}</channel></rss>`, OFFICIAL_CIVIC_ALERT_FEEDS[3], "2026-10-02T18:13:09.000Z");
      expect(parsed.alerts).toHaveLength(1);
      expect(parsed.alerts[0].summary).toBe("Latest official update.");
      expect(parsed.alerts[0].title.length).toBeLessThanOrEqual(180);
      expect(parsed.alerts[0].title).toMatch(/…$/);
      expect(parsed.alerts[0].expiresAt).toBe("2026-10-17T14:11:14.000Z");
    }
  });

  it.each([
    "Frederick County health notice",
    "Frederick County health notice Updated on Sep 31 2026 9:10AM",
  ])("keeps a newer published local notice over an older dated statewide update: %s", (newTitle) => {
    const item = (title: string, published: string, summary: string) => `<item>
      <title>${title}</title><link>https://health.frederickcountymd.gov/AlertCenter.aspx?AID=24</link>
      <pubDate>${published}</pubDate><description>${summary}</description>
    </item>`;
    const old = item("Statewide notice Updated on Sep 17 2026 9:10AM", "17 Sep 2026 09:11:14 -0500", "A statewide bulletin.");
    const current = item(newTitle, "02 Oct 2026 09:11:14 -0500", "An official notice naming Frederick County.");
    for (const rows of [[old, current], [current, old]]) {
      const parsed = parseOfficialAlertFeed(`<rss><channel>${rows.join("")}</channel></rss>`, OFFICIAL_CIVIC_ALERT_FEEDS[3], "2026-10-02T18:13:09.000Z");
      expect(parsed.alerts).toHaveLength(1);
      expect(parsed.alerts[0]).toMatchObject({
        title: newTitle,
        publishedAt: "2026-10-02T14:11:14.000Z",
        expiresAt: "2026-11-01T14:11:14.000Z",
      });
      expect(isLocallyRelevantCivicAlert(parsed.alerts[0])).toBe(true);
    }
  });

  it("falls back to newest publication and stable order for missing or invalid update labels", () => {
    const item = (title: string, day: string, id = "24") => `<item>
      <title>${title}</title><link>https://health.frederickcountymd.gov/AlertCenter.aspx?AID=${id}</link>
      <pubDate>${day} Sep 2026 09:11:14 -0500</pubDate>
    </item>`;
    const xml = `<rss><channel>${[
      item("Older notice", "10"),
      item("Invalid date Updated on Sep 31 2026 9:10AM", "17"),
      item("Same publication, later row", "17"),
      item("Different notice", "17", "25"),
    ].join("")}</channel></rss>`;
    const parsed = parseOfficialAlertFeed(xml, OFFICIAL_CIVIC_ALERT_FEEDS[3], "2026-10-02T18:13:09.000Z");
    expect(parsed.alerts.map(alert => alert.title)).toEqual([
      "Invalid date Updated on Sep 31 2026 9:10AM", "Different notice",
    ]);
  });

  it("uses the latest dated update over undated duplicate labels without renewing its expiry", () => {
    const xml = `<rss><channel>${["Plain notice", "Notice Updated on Sep 16 2026 12:10AM", "Notice Updated on Sep 16 2026 12:10PM"].map(title => `<item>
      <title>${title}</title><link>https://health.frederickcountymd.gov/AlertCenter.aspx?AID=24</link>
      <pubDate>17 Sep 2026 09:11:14 -0500</pubDate>
    </item>`).join("")}</channel></rss>`;
    const parsed = parseOfficialAlertFeed(xml, OFFICIAL_CIVIC_ALERT_FEEDS[3], "2026-10-02T18:13:09.000Z");
    expect(parsed.alerts[0].title).toBe("Notice Updated on Sep 16 2026 12:10PM");
    expect(parsed.alerts[0].expiresAt).toBe("2026-10-17T14:11:14.000Z");
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
