import { describe, it, expect } from "vitest";
import type { Place } from "@/data/places";
import { priceLabel, openCell, specimenLedger } from "./specimenLedger";

// A minimal verified place open Mon–Sun 9am–6pm, priced $$.
function make(overrides: Partial<Place> = {}): Place {
  const window = [{ open: "09:00", close: "18:00" }];
  return {
    slug: "x",
    name: "X",
    category: "coffee",
    short_blurb: "",
    address: "",
    city: "Frederick",
    state: "MD",
    postal_code: "21701",
    municipality: "Frederick",
    geom: { lng: 0, lat: 0 },
    is_verified: true,
    hours_verified: true,
    hours: { mon: window, tue: window, wed: window, thu: window, fri: window, sat: window, sun: window },
    price_band: 2,
    feature_score: 0,
    source: "seed",
    updated_at: "",
    ...overrides,
  } as Place;
}

// A Wednesday at 2pm Eastern — solidly inside a 9–6 window.
const WED_2PM = new Date("2026-07-08T18:00:00Z");
// A Wednesday at 5:30pm Eastern — inside the last hour (closing soon).
const WED_530PM = new Date("2026-07-08T21:30:00Z");
// A Wednesday at 8pm Eastern — after close.
const WED_8PM = new Date("2026-07-09T00:00:00Z");

describe("priceLabel", () => {
  it("maps bands to dollar signs and null when unpriced", () => {
    expect(priceLabel(1)).toBe("$");
    expect(priceLabel(3)).toBe("$$$");
    expect(priceLabel(undefined)).toBeNull();
  });
});

describe("openCell", () => {
  it("reads open with a closing time", () => {
    const c = openCell(make(), WED_2PM)!;
    expect(c.tone).toBe("open");
    expect(c.text).toBe("Open · til 6pm");
  });

  it("flags the last hour as closing soon", () => {
    const c = openCell(make(), WED_530PM)!;
    expect(c.tone).toBe("soon");
    expect(c.text).toBe("Til 6pm");
  });

  it("reads closed after hours", () => {
    const c = openCell(make(), WED_8PM)!;
    expect(c.tone).toBe("closed");
    expect(c.text).toBe("Closed");
  });

  it("says hours unconfirmed when not verified", () => {
    const c = openCell(make({ hours_verified: false, is_verified: false }), WED_2PM)!;
    expect(c.tone).toBe("muted");
    expect(c.text).toBe("Hours unconfirmed");
  });

  it("returns null when no hours are known", () => {
    expect(openCell(make({ hours: undefined }), WED_2PM)).toBeNull();
  });

  it("reads all-day windows as Open 24h", () => {
    const allDay = [{ open: "00:00", close: "24:00" }];
    const c = openCell(make({ hours: { wed: allDay } }), WED_2PM)!;
    expect(c.text).toBe("Open 24h");
    expect(c.tone).toBe("open");
  });
});

describe("specimenLedger", () => {
  it("puts status first, price after", () => {
    const cells = specimenLedger(make(), WED_2PM);
    expect(cells.map((c) => c.text)).toEqual(["Open · til 6pm", "$$"]);
  });

  it("drops the price cell when unpriced", () => {
    const cells = specimenLedger(make({ price_band: undefined }), WED_2PM);
    expect(cells.map((c) => c.text)).toEqual(["Open · til 6pm"]);
  });

  it("returns an empty row when nothing factual is known", () => {
    expect(specimenLedger(make({ hours: undefined, price_band: undefined }), WED_2PM)).toEqual([]);
  });
});
