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
});
