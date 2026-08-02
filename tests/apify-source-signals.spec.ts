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
      ["https://example.com/events/first-friday?other=value"],
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
          "https://other.example/events/copied",
        ],
        "https://example.com/calendar",
      ),
    ).toEqual(["https://www.example.com/events/one"]);
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
      "https://example.com/events.php",
    ]);
  });
});
