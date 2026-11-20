import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getLiveEventsForSources } from "./ical-live";
import { publicEventSourceCircuits } from "./event-source-circuit";

function rssItem(opts: {
  title: string;
  date: string;
  times: string;
  location?: string;
}): string {
  return `<item>
    <title>${opts.title}</title>
    <link>https://www.cityoffrederickmd.gov/Calendar.aspx?EID=1</link>
    <description>A CivicEngage listing.</description>
    <calendarEvent:EventDates>${opts.date}</calendarEvent:EventDates>
    <calendarEvent:EventTimes>${opts.times}</calendarEvent:EventTimes>
    <calendarEvent:Location>${opts.location ?? "City Hall, Frederick, MD"}</calendarEvent:Location>
  </item>`;
}

function rssFeed(items: string): string {
  return `<?xml version="1.0" encoding="utf-8"?>
<rss version="2.0" xmlns:calendarEvent="https://www.civicplus.com">
  <channel>
    <title>City Calendar</title>
    ${items}
  </channel>
</rss>`;
}

describe("CivicEngage live RSS", () => {
  beforeEach(() => {
    publicEventSourceCircuits.reset();
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-05-01T16:00:00.000Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("parses overnight ranges, single clocks, and title entities", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn<typeof fetch>(async () =>
        new Response(
          rssFeed(
            [
              rssItem({
                title: "Late Movie Night",
                date: "May 14, 2026",
                times: "10:00 PM - 1:00 AM",
              }),
              rssItem({
                title: "Kids&#39; Story Time",
                date: "May 15, 2026",
                times: "5:30 PM",
              }),
            ].join("\n"),
          ),
          { status: 200, headers: { "content-type": "application/rss+xml" } },
        ),
      ),
    );

    const result = await getLiveEventsForSources(["city-frederick"], 60);

    expect(result.sources_succeeded).toEqual(["city-frederick"]);
    const overnight = result.events.find((event) => event.title === "Late Movie Night");
    const story = result.events.find((event) => event.title === "Kids' Story Time");
    expect(overnight?.starts_at).toBe("2026-05-15T02:00:00.000Z");
    expect(overnight?.ends_at).toBe("2026-05-15T05:00:00.000Z");
    expect(story?.starts_at).toBe("2026-05-15T21:30:00.000Z");
    expect(story?.ends_at).toBe("2026-05-15T23:30:00.000Z");
  });

  it("leaves out a row that publishes a date and no time", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn<typeof fetch>(async () =>
        new Response(
          rssFeed(
            [
              rssItem({ title: "Holiday Display", date: "May 14, 2026", times: "" }),
              rssItem({ title: "Evening Concert", date: "May 14, 2026", times: "7:00 PM - 9:00 PM" }),
            ].join("\n"),
          ),
          { status: 200, headers: { "content-type": "application/rss+xml" } },
        ),
      ),
    );

    const result = await getLiveEventsForSources(["city-frederick"], 60);

    // Listing it at the parser's midday anchor would print "12:00 PM" for
    // an event whose publisher announced no time.
    expect(result.events.map((event) => event.title)).toEqual(["Evening Concert"]);
  });

  it("treats an XML-declared error page as a failed source", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn<typeof fetch>(async () =>
        new Response(
          '<?xml version="1.0" encoding="utf-8"?><html xmlns="http://www.w3.org/1999/xhtml"><body><h1>Service unavailable</h1></body></html>',
          { status: 200, headers: { "content-type": "application/xhtml+xml" } },
        ),
      ),
    );

    const result = await getLiveEventsForSources(["city-frederick"], 60);
    expect(result).toMatchObject({
      events: [],
      sources_succeeded: [],
      sources_failed: ["city-frederick"],
    });
  });

  it("treats an HTML error page as a failed source, not an empty calendar", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn<typeof fetch>(async () =>
        new Response("<html><h1>Temporarily unavailable</h1></html>", {
          status: 200,
          headers: { "content-type": "text/html" },
        }),
      ),
    );

    const result = await getLiveEventsForSources(["city-frederick"], 60);
    expect(result).toMatchObject({
      events: [],
      sources_succeeded: [],
      sources_failed: ["city-frederick"],
    });
  });
});
