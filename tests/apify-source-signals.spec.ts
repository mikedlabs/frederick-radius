import { describe, expect, it } from "vitest";
import {
  canonicalApifyEventLinks,
  changedApifySourceFingerprintFields,
  fingerprintApifySource,
} from "../scripts/lib/apify-source-signals";

describe("Apify source signal fingerprints", () => {
  it("normalizes harmless whitespace while hashing date, time, and exact-host link signals", () => {
    const sourceUrl = "https://example.com/calendar/";
    const first = fingerprintApifySource(
      "# Calendar\n\nJuly 31 at 7:00 p.m.\n",
      [
        "https://example.com/events/first-friday?utm_source=test#details",
        "https://unrelated.example/events/copied",
      ],
      sourceUrl,
    );
    const second = fingerprintApifySource(
      "  # Calendar\r\n\r\nJuly   31 at 7:00 p.m.  ",
      ["https://example.com/events/first-friday?utm_medium=email"],
      sourceUrl,
    );

    expect(second).toEqual(first);
    expect(first).toMatchObject({
      dates: { count: 1 },
      times: { count: 1 },
      eventLinks: { count: 1 },
    });
  });

  it("separates cosmetic content drift from schedule-signal changes", () => {
    const sourceUrl = "https://example.com/calendar/";
    const baseline = fingerprintApifySource(
      "Navigation A\nJuly 31 at 7 p.m.",
      [],
      sourceUrl,
    );
    const cosmetic = fingerprintApifySource(
      "Navigation B\nJuly 31 at 7 p.m.",
      [],
      sourceUrl,
    );
    const schedule = fingerprintApifySource(
      "Navigation B\nAugust 1 at 8 p.m.",
      [],
      sourceUrl,
    );

    expect(changedApifySourceFingerprintFields(baseline, cosmetic)).toEqual([
      "content",
    ]);
    expect(changedApifySourceFingerprintFields(cosmetic, schedule)).toEqual([
      "content",
      "dates",
      "times",
    ]);
  });

  it("keeps only canonical HTTPS event-like links on the exact source host", () => {
    expect(
      canonicalApifyEventLinks(
        [
          "https://www.example.com/events/one?tracking=yes",
          "https://example.com/about",
          "http://example.com/events/insecure",
          "https://example.com:8443/events/different-origin",
          "https://user:password@example.com/events/credentialed",
          "https://other.example/events/copied",
        ],
        "https://example.com/calendar",
      ),
    ).toEqual(["https://example.com/events/one"]);
  });

  it("recognizes single-digit 24-hour-style times without a meridiem", () => {
    const fingerprint = fingerprintApifySource(
      "Doors 7:30. Program 19:05. Invalid 29:99.",
      [],
      "https://example.com/calendar/",
    );

    expect(fingerprint.times.count).toBe(2);
  });

  it.each(["7-9 pm", "7–9 p.m.", "7—9 PM", "7 to 9 pm", "7:30–9 pm"])(
    "captures both endpoints when a time range shares its meridiem: %s",
    (range) => {
      const fingerprint = fingerprintApifySource(
        `Live music ${range}`,
        [],
        "https://example.com/calendar/",
      );

      expect(fingerprint.times.count).toBe(2);
    },
  );

  it("changes the time signal when the bare start of a shared-meridiem range moves", () => {
    const sourceUrl = "https://example.com/calendar/";
    const seven = fingerprintApifySource("Live music 7–9 pm", [], sourceUrl);
    const eight = fingerprintApifySource("Live music 8–9 pm", [], sourceUrl);

    expect(eight.times.hash).not.toBe(seven.times.hash);
    expect(changedApifySourceFingerprintFields(seven, eight)).toContain(
      "times",
    );
  });

  it.each([
    "Jul 21-22, 2026",
    "Jul 21–22, 2026",
    "Jul 21 to 22, 2026",
    "Jul 21 thru 22, 2026",
    "Jul 21 through 22, 2026",
  ])("tracks a same-month date range endpoint: %s", (range) => {
    const sourceUrl = "https://example.com/calendar/";
    const baseline = fingerprintApifySource(range, [], sourceUrl);
    const changed = fingerprintApifySource(
      range.replace("22", "23"),
      [],
      sourceUrl,
    );

    expect(baseline.dates.count).toBe(1);
    expect(changed.dates.hash).not.toBe(baseline.dates.hash);
    expect(changedApifySourceFingerprintFields(baseline, changed)).toContain(
      "dates",
    );
  });

  it("does not join a named date and unrelated list number across lines", () => {
    const sourceUrl = "https://example.com/calendar/";
    const splitDate = fingerprintApifySource(
      "Jul\n21 agenda items",
      [],
      sourceUrl,
    );
    const pageTwentyTwo = fingerprintApifySource(
      "Jul 21\n- 22, 2026 attendees",
      [],
      sourceUrl,
    );
    const pageTwentyThree = fingerprintApifySource(
      "Jul 21\n- 23, 2026 attendees",
      [],
      sourceUrl,
    );

    expect(splitDate.dates.count).toBe(0);
    expect(pageTwentyTwo.dates.count).toBe(1);
    expect(pageTwentyThree.dates).toEqual(pageTwentyTwo.dates);
  });

  it("does not join unrelated numbers and times across markdown lines", () => {
    const sourceUrl = "https://example.com/calendar/";
    const pageSeven = fingerprintApifySource(
      "Page 7\n- 9 pm concert",
      [],
      sourceUrl,
    );
    const pageEight = fingerprintApifySource(
      "Page 8\n- 9 pm concert",
      [],
      sourceUrl,
    );

    expect(pageSeven.times.count).toBe(1);
    expect(pageEight.times).toEqual(pageSeven.times);
  });

  it("recognizes event-like PHP endpoints without accepting unrelated PHP pages", () => {
    expect(
      canonicalApifyEventLinks(
        [
          "https://example.com/events.php?id=42",
          "https://example.com/calendar.php",
          "https://example.com/contact.php",
        ],
        "https://example.com/",
      ),
    ).toEqual([
      "https://example.com/calendar.php",
      "https://example.com/events.php?id=42",
    ]);
  });

  it("canonicalizes equivalent www and apex event links to the configured source host", () => {
    expect(
      canonicalApifyEventLinks(
        [
          "https://example.com/events/show?utm_source=calendar",
          "https://www.example.com/events/show#tickets",
        ],
        "https://www.example.com/calendar/",
      ),
    ).toEqual(["https://www.example.com/events/show"]);
  });

  it("accepts an explicit default HTTPS port but rejects a different port", () => {
    expect(
      canonicalApifyEventLinks(
        [
          "https://example.com:443/events/default-port",
          "https://example.com:8443/events/other-port",
        ],
        "https://example.com/calendar/",
      ),
    ).toEqual(["https://example.com/events/default-port"]);
  });

  it("excludes the source page itself from discovered event links", () => {
    const sourceUrl = "https://www.example.com/calendar/?view=month#top";
    const links = [
      "https://example.com/calendar",
      "https://www.example.com/calendar/?utm_source=navigation",
      "https://example.com/calendar/show-one?tracking=private",
    ];

    expect(canonicalApifyEventLinks(links, sourceUrl)).toEqual([
      "https://www.example.com/calendar/show-one",
    ]);
    expect(
      fingerprintApifySource("Calendar", links.slice(0, 2), sourceUrl),
    ).toMatchObject({ eventLinks: { count: 0 } });
  });

  it("preserves semantic event IDs while removing tracking parameters", () => {
    const sourceUrl = "https://example.com/events.php";
    const eventLinks = canonicalApifyEventLinks(
      [
        "https://example.com/events.php?id=42&utm_source=calendar&category=music",
        "https://example.com/events.php?utm_medium=email&category=music&id=41",
      ],
      sourceUrl,
    );
    const eventFortyOne = fingerprintApifySource(
      "Events",
      [eventLinks[0]],
      sourceUrl,
    );
    const eventFortyTwo = fingerprintApifySource(
      "Events",
      [eventLinks[1]],
      sourceUrl,
    );

    expect(eventLinks).toEqual([
      "https://example.com/events.php?category=music&id=41",
      "https://example.com/events.php?category=music&id=42",
    ]);
    expect(eventFortyOne.eventLinks.hash).not.toBe(
      eventFortyTwo.eventLinks.hash,
    );
    expect(
      changedApifySourceFingerprintFields(eventFortyOne, eventFortyTwo),
    ).toContain("event-links");
  });
});
