import { describe, it, expect } from "vitest";
import { cleanFeedText, formatAddress } from "@/lib/format/text";
import {
  splitPresenter,
  cleanTitle,
  normalizeTitle,
  recurrenceKey,
  cleanEventSlug,
  collapseRecurringEvents,
} from "@/lib/events/normalize";
import type { EventWithMeta } from "@/lib/loaders/events";

describe("cleanFeedText", () => {
  it("decodes entities then strips tags (the County double-encode bug)", () => {
    const raw = "&lt;strong&gt;Event date:&lt;/strong&gt; May 17 &lt;br&gt;Come early";
    expect(cleanFeedText(raw)).toBe("Event date: May 17 Come early");
  });

  it("decodes numeric and hex entities", () => {
    expect(cleanFeedText("Caf&#233; opens at 9&#x20;AM")).toBe("Café opens at 9 AM");
  });

  it("never emits an em dash (writing rule): entity and glyph both normalized", () => {
    expect(cleanFeedText("Doors 6&mdash;9pm")).not.toMatch(/—/);
    expect(cleanFeedText("Doors 6&mdash;9pm")).toBe("Doors 6, 9pm");
    expect(cleanFeedText("Wine — Beer")).not.toMatch(/—/);
  });

  it("returns empty string untouched", () => {
    expect(cleanFeedText("")).toBe("");
  });
});

describe("formatAddress", () => {
  it("splits an abbreviation-period concatenation", () => {
    expect(formatAddress("12 E Church St.Frederick, MD 21701")).toBe(
      "12 E Church St., Frederick, MD 21701",
    );
  });

  it("splits a full-word suffix concatenation", () => {
    expect(formatAddress("310 Baughmans LaneFrederick, MD")).toBe(
      "310 Baughmans Lane, Frederick, MD",
    );
  });

  it("spaces a state code mashed into a ZIP", () => {
    expect(formatAddress("201 N Bentz St, Frederick, MD21701")).toBe(
      "201 N Bentz St, Frederick, MD 21701",
    );
  });

  it("leaves a clean address unchanged", () => {
    expect(formatAddress("121 N Bentz St, Frederick, MD 21701")).toBe(
      "121 N Bentz St, Frederick, MD 21701",
    );
  });

  it("does NOT comma a suffix followed by a normal space (no false positive)", () => {
    // "Market St Stage" is a legitimate venue string; a comma here is wrong.
    expect(formatAddress("Market St Stage")).toBe("Market St Stage");
  });
});

describe("splitPresenter", () => {
  it("splits an organization prefix", () => {
    expect(splitPresenter("Downtown Frederick Partnership-Alive @ Five")).toEqual({
      presenter: "Downtown Frederick Partnership",
      title: "Alive @ Five",
    });
  });

  it("splits on the FIRST hyphen only", () => {
    expect(splitPresenter("Frederick Arts Council-Sky Stage-Concert")).toEqual({
      presenter: "Frederick Arts Council",
      title: "Sky Stage-Concert",
    });
  });

  it("does not treat a non-org left side as a presenter", () => {
    expect(splitPresenter("Earth, Wheels, & Fire-54th Anniversary")).toEqual({
      title: "Earth, Wheels, & Fire-54th Anniversary",
    });
  });
});

describe("cleanTitle", () => {
  it("spaces a hyphen before an uppercase letter or digit", () => {
    expect(cleanTitle("Council-Workshop")).toBe("Council Workshop");
    expect(cleanTitle("Fire-54th Anniversary")).toBe("Fire 54th Anniversary");
  });

  it("keeps real compounds (lowercase after hyphen)", () => {
    expect(cleanTitle("Pop-up market")).toBe("Pop-up market");
    expect(cleanTitle("Drive-in movie")).toBe("Drive-in movie");
  });

  it("strips a trailing year the date implies", () => {
    expect(cleanTitle("Oktoberfest 2026", { year: 2026 })).toBe("Oktoberfest");
    expect(cleanTitle("Oktoberfest - 2026", { year: 2026 })).toBe("Oktoberfest");
  });

  it("keeps a trailing year after a preposition", () => {
    expect(cleanTitle("Surpassing 50,000 patients in 2025")).toBe(
      "Surpassing 50,000 patients in 2025",
    );
  });

  it("does not strip a year that is not the event year", () => {
    expect(cleanTitle("Class of 2025 reunion 2024", { year: 2026 })).toBe(
      "Class of 2025 reunion 2024",
    );
  });
});

describe("normalizeTitle (combined)", () => {
  it("decodes, splits presenter, and cleans in one pass", () => {
    const out = normalizeTitle("Frederick Arts Council-First Friday 2026", { year: 2026 });
    expect(out.presenter).toBe("Frederick Arts Council");
    expect(out.title).toBe("First Friday");
  });
});

describe("recurrenceKey", () => {
  it("is identical for the same title+venue regardless of date", () => {
    const a = recurrenceKey({ title: "Tasting Room Open", venue: "True Standard Distilling", municipality: "frederick" });
    const b = recurrenceKey({ title: "tasting room  open", venue: "True Standard Distilling!", municipality: "Frederick" });
    expect(a).toBe(b);
  });

  it("differs for different events", () => {
    const a = recurrenceKey({ title: "Tasting Room Open", venue: "True Standard" });
    const b = recurrenceKey({ title: "Live Music", venue: "True Standard" });
    expect(a).not.toBe(b);
  });
});

describe("cleanEventSlug", () => {
  it("produces a clean, dated slug with no live- prefix or timestamp", () => {
    const slug = cleanEventSlug({
      presenter: "Downtown Frederick Partnership",
      title: "Alive @ Five",
      startsAt: "2026-09-24T21:00:00Z", // 5pm ET
    });
    expect(slug).toBe("downtown-frederick-partnership-alive-five-2026-09-24");
    expect(slug).not.toMatch(/^live-/);
    // Ends in a clean YYYY-MM-DD with no trailing -HH-MM time suffix
    // (the old liveEventSlug produced "...-2026-05-19-15-00").
    expect(slug).toMatch(/-\d{4}-\d{2}-\d{2}$/);
  });

  it("caps a very long name before the date", () => {
    const slug = cleanEventSlug({
      title: "A".repeat(120),
      startsAt: "2026-01-02T12:00:00Z",
    });
    // base capped to <= 60 chars, then "-YYYY-MM-DD"
    expect(slug.length).toBeLessThanOrEqual(60 + 11);
    expect(slug.endsWith("-2026-01-02")).toBe(true);
  });
});

describe("collapseRecurringEvents", () => {
  function ev(title: string, venue: string, startsAt: string): EventWithMeta {
    return {
      slug: `${title}-${startsAt}`.toLowerCase().replace(/\W+/g, "-"),
      title,
      description: "",
      starts_at: startsAt,
      ends_at: startsAt,
      timezone: "America/New_York",
      venue_name: venue,
      address: "",
      geom: { lng: -77.4, lat: 39.4 },
      municipality: "frederick",
      category: "food",
      audience: [],
      is_free: true,
      source: "manual",
      is_verified: false,
      geo_confidence: "exact_address",
      category_name: "Food",
      municipality_name: "Frederick",
    } as EventWithMeta;
  }

  it("collapses a daily-recurring series to one card with a note", () => {
    const days = ["17", "20", "21", "22", "23", "24", "27", "28", "29", "30"];
    const list = days.map((d) =>
      ev("Tasting Room Open", "True Standard Distilling", `2026-05-${d}T20:00:00Z`),
    );
    const out = collapseRecurringEvents(list);
    expect(out).toHaveLength(1);
    expect(out[0].is_recurring).toBe(true);
    expect(out[0].recurrence_text).toBe("Runs most days");
    // keeps the soonest occurrence
    expect(out[0].starts_at).toBe("2026-05-17T20:00:00Z");
  });

  it("leaves distinct events untouched", () => {
    const list = [
      ev("Tasting Room Open", "True Standard", "2026-05-17T20:00:00Z"),
      ev("Live Music", "True Standard", "2026-05-17T22:00:00Z"),
      ev("Farmers Market", "Market Street", "2026-05-18T13:00:00Z"),
    ];
    const out = collapseRecurringEvents(list);
    expect(out).toHaveLength(3);
    expect(out.every((e) => !e.is_recurring)).toBe(true);
  });

  it("uses a smaller count note for a short series", () => {
    const list = [
      ev("Yoga on the Creek", "Carroll Creek", "2026-06-04T23:00:00Z"),
      ev("Yoga on the Creek", "Carroll Creek", "2026-06-11T23:00:00Z"),
      ev("Yoga on the Creek", "Carroll Creek", "2026-06-18T23:00:00Z"),
    ];
    const out = collapseRecurringEvents(list);
    expect(out).toHaveLength(1);
    expect(out[0].recurrence_text).toBe("3 upcoming dates");
  });
});
