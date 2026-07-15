import { describe, expect, it } from "vitest";
import { clockLine, timeAnchorOf, eventContextLines, rankForSources, stripInlineMarkdown, type AskEvent } from "./context";

// A fixed summer Wednesday, 6 PM Eastern (22:00 UTC in July / EDT).
const WED_6PM = new Date("2026-07-15T18:00:00-04:00");

function ev(over: Partial<AskEvent>): AskEvent {
  return {
    slug: "e",
    title: "Event",
    starts_at: "2026-07-15T19:00:00-04:00",
    ends_at: "2026-07-15T21:00:00-04:00",
    ...over,
  };
}

describe("clockLine", () => {
  it("prints the Eastern date at HOUR granularity (it is the cache key)", () => {
    expect(clockLine(WED_6PM)).toBe("Wednesday, July 15, 2026, 6 PM");
    // Same hour, different minute → identical line (cache-stable).
    expect(clockLine(new Date("2026-07-15T18:59:00-04:00"))).toBe("Wednesday, July 15, 2026, 6 PM");
  });
});

describe("timeAnchorOf", () => {
  it("hears tonight/this evening as the evening window", () => {
    expect(timeAnchorOf("Music tonight")).toBe("tonight");
    expect(timeAnchorOf("anything this evening?")).toBe("tonight");
  });
  it("hears today/now as the whole day", () => {
    expect(timeAnchorOf("what's happening today")).toBe("today");
    expect(timeAnchorOf("anything going on right now?")).toBe("today");
  });
  it("most-specific wins: tomorrow and weekend beat tonight", () => {
    expect(timeAnchorOf("live music tomorrow night")).toBe("tomorrow");
    expect(timeAnchorOf("what should we do this weekend")).toBe("weekend");
  });
  it("timeless questions get no anchor", () => {
    expect(timeAnchorOf("best coffee in Frederick")).toBeNull();
  });
});

describe("eventContextLines", () => {
  it("a tonight event lands in the TODAY block with its clock time, venue, town, and category", () => {
    const { block, picked } = eventContextLines(
      [ev({ slug: "jam", title: "Bluegrass Jam", venue_name: "Steinhardt Brewing", municipality_name: "Frederick", category: "music" })],
      "today",
      WED_6PM,
    );
    expect(block).toContain("EVENTS TODAY (including tonight)");
    expect(block).toContain("7:00 PM — Bluegrass Jam @ Steinhardt Brewing (Frederick) [music]");
    expect(picked.map((e) => e.slug)).toEqual(["jam"]);
  });

  it("tomorrow's window excludes tonight and next week", () => {
    const pool = [
      ev({ slug: "tonight" }),
      ev({ slug: "tmrw", starts_at: "2026-07-16T19:00:00-04:00", ends_at: "2026-07-16T21:00:00-04:00" }),
      ev({ slug: "next-week", starts_at: "2026-07-22T19:00:00-04:00", ends_at: "2026-07-22T21:00:00-04:00" }),
    ];
    const { picked } = eventContextLines(pool, "tomorrow", WED_6PM);
    expect(picked.map((e) => e.slug)).toEqual(["tmrw"]);
  });

  it("tonight keeps the 7 PM show even when afternoon programs would eat the cap (the prod miss)", () => {
    const afternoon = Array.from({ length: 12 }, (_, i) =>
      ev({ slug: `pm${i}`, title: `Program ${i}`, starts_at: "2026-07-15T13:45:00-04:00", ends_at: "2026-07-15T14:45:00-04:00" }),
    );
    const jam = ev({ slug: "jam", title: "Bluegrass Jam", category: "music", starts_at: "2026-07-15T19:00:00-04:00", ends_at: "2026-07-15T21:00:00-04:00" });
    const noon = new Date("2026-07-15T12:00:00-04:00");
    const { block, picked } = eventContextLines([...afternoon, jam], "tonight", noon);
    expect(block).toContain("EVENTS TONIGHT");
    expect(picked.map((e) => e.slug)).toEqual(["jam"]);
  });

  it("an empty window says so explicitly instead of omitting the block", () => {
    const { block, picked } = eventContextLines([], "today", WED_6PM);
    expect(block).toContain("(no listed events in this window)");
    expect(picked).toEqual([]);
  });

  it("caps the block", () => {
    const pool = Array.from({ length: 24 }, (_, i) => ev({ slug: `e${i}`, title: `Show ${i}` }));
    expect(eventContextLines(pool, "today", WED_6PM).picked).toHaveLength(16);
  });

  it("query-relevant rows survive the cap (the second prod miss: 7 PM music past 16 earlier rows)", () => {
    const noon = new Date("2026-07-15T12:00:00-04:00");
    const early = Array.from({ length: 18 }, (_, i) =>
      ev({ slug: `k${i}`, title: `Karaoke ${i}`, starts_at: "2026-07-15T17:00:00-04:00", ends_at: "2026-07-15T18:00:00-04:00" }),
    );
    const jam = ev({ slug: "jam", title: "Bluegrass Jam", category: "music", starts_at: "2026-07-15T19:00:00-04:00", ends_at: "2026-07-15T21:00:00-04:00" });
    const { picked } = eventContextLines([...early, jam], "tonight", noon, "Music tonight");
    expect(picked.some((e) => e.slug === "jam")).toBe(true);
    // ...and the block stays chronological after the relevance cut.
    expect(picked[picked.length - 1].slug).toBe("jam");
  });
});

describe("rankForSources", () => {
  it("'Music tonight' leads with the music event, not the earlier tai chi", () => {
    const picked = [
      ev({ slug: "tai-chi", title: "Tai Chi with Cain", category: "wellness" }),
      ev({ slug: "market", title: "Farmers Market", category: "market" }),
      ev({ slug: "jam", title: "Bluegrass Jam", category: "music" }),
    ];
    expect(rankForSources(picked, "Music tonight")[0].slug).toBe("jam");
  });
  it("no meaningful tokens → chronological order untouched", () => {
    const picked = [ev({ slug: "a" }), ev({ slug: "b" })];
    expect(rankForSources(picked, "now?").map((e) => e.slug)).toEqual(["a", "b"]);
  });
});

describe("stripInlineMarkdown", () => {
  it("strips the exact emphasis that reached users raw (the Reddit screenshot)", () => {
    expect(
      stripInlineMarkdown("I can't tell you what's happening *tonight* specifically. But Frederick's got the **Alive @ Five** series"),
    ).toBe("I can't tell you what's happening tonight specifically. But Frederick's got the Alive @ Five series");
  });
  it("collapses code ticks and links to their text", () => {
    expect(stripInlineMarkdown("check `hours` on [the map](/map)")).toBe("check hours on the map");
  });
  it("leaves legitimate prose alone", () => {
    const s = "Shab Row & Everedy Square, 5-9 PM. A 4.5 star spot.";
    expect(stripInlineMarkdown(s)).toBe(s);
  });
});
