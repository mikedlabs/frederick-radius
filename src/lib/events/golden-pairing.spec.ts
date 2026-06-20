import { describe, it, expect } from "vitest";
import { isOutdoorEvent, pickGoldenHourOutdoorEvent } from "./golden-pairing";
import type { EventWithMeta } from "@/lib/loaders/events";

// Frederick, MD. On 2026-06-20 golden hour ~7:49 PM, sunset ~8:39 PM ET
// (23:49 / 00:39 UTC). 21:00Z = 5 PM ET; 02:00Z (next) = 10 PM ET (sun down).
const LAT = 39.4143;
const LNG = -77.4105;
function ev(p: Partial<EventWithMeta>): EventWithMeta {
  return {
    slug: "x", title: "", starts_at: "2026-06-20T23:00:00Z", ends_at: "2026-06-21T02:00:00Z",
    category: "community", is_all_day: false, municipality_name: "Frederick", ...p,
  } as EventWithMeta;
}

describe("isOutdoorEvent", () => {
  it("catches outdoor categories AND mis-categorized outdoor draws by title", () => {
    expect(isOutdoorEvent({ category: "festival" })).toBe(true);
    expect(isOutdoorEvent({ category: "community", title: "Thurmont Firemen's Carnival" })).toBe(true);
    expect(isOutdoorEvent({ category: "community", title: "New Midway Farmers Market" })).toBe(true);
  });
  it("vetoes a title-only match that is clearly indoors", () => {
    expect(isOutdoorEvent({ category: "community", title: "Garden Club Meeting" })).toBe(false);
    expect(isOutdoorEvent({ category: "community", title: "Vineyard Community Church Service" })).toBe(false);
    expect(isOutdoorEvent({ category: "music", title: "Jazz Night at the Bar" })).toBe(false);
    expect(isOutdoorEvent({ category: "community", title: "Family Storytime" })).toBe(false);
  });
});

describe("pickGoldenHourOutdoorEvent — honesty gates", () => {
  const afternoon = new Date("2026-06-20T21:00:00Z"); // 5 PM ET
  const afterDark = new Date("2026-06-21T02:00:00Z"); // 10 PM ET, sun down

  it("returns an outdoor draw that runs into the golden window", () => {
    const pool = [ev({ slug: "carnival", title: "Thurmont Firemen's Carnival", starts_at: "2026-06-20T23:00:00Z", ends_at: "2026-06-21T02:00:00Z" })];
    expect(pickGoldenHourOutdoorEvent(pool, afternoon, LAT, LNG)?.slug).toBe("carnival");
  });

  it("returns null once the sun is down (no good light to promise)", () => {
    const pool = [ev({ slug: "c", category: "festival", starts_at: "2026-06-21T02:30:00Z", ends_at: "2026-06-21T05:00:00Z" })];
    expect(pickGoldenHourOutdoorEvent(pool, afterDark, LAT, LNG)).toBeNull();
  });

  it("EXCLUDES a market that closes BEFORE golden hour (the false-pairing the review caught)", () => {
    const pool = [ev({ slug: "early", title: "Morning Market", category: "market", starts_at: "2026-06-20T21:00:00Z", ends_at: "2026-06-20T22:00:00Z" })];
    expect(pickGoldenHourOutdoorEvent(pool, afternoon, LAT, LNG)).toBeNull();
  });

  it("excludes indoor and utility events", () => {
    const pool = [
      ev({ slug: "indoor", title: "Jazz Night", category: "music" }),
      ev({ slug: "meeting", title: "City Council Meeting" }),
    ];
    expect(pickGoldenHourOutdoorEvent(pool, afternoon, LAT, LNG)).toBeNull();
  });

  it("includes an all-day outdoor draw even though it already started", () => {
    const pool = [ev({ slug: "fair", title: "The Great Frederick Fair", category: "festival", is_all_day: true, starts_at: "2026-06-20T16:00:00Z", ends_at: "2026-06-20T16:00:00Z" })];
    expect(pickGoldenHourOutdoorEvent(pool, afternoon, LAT, LNG)?.slug).toBe("fair");
  });

  it("picks the SOONEST qualifying outdoor draw", () => {
    const pool = [
      ev({ slug: "later", title: "Evening Festival", category: "festival", starts_at: "2026-06-21T00:00:00Z", ends_at: "2026-06-21T03:00:00Z" }),
      ev({ slug: "sooner", title: "Twilight Market", category: "market", starts_at: "2026-06-20T22:00:00Z", ends_at: "2026-06-21T01:00:00Z" }),
    ];
    expect(pickGoldenHourOutdoorEvent(pool, afternoon, LAT, LNG)?.slug).toBe("sooner");
  });
});
