import { describe, it, expect } from "vitest";
import {
  normalizeMdMarkets,
  findMarketSchedule,
  normMarketName,
} from "@/lib/integrations/mdFarmersMarkets";

// Real Socrata row shape (confirmed live against fpk6-yugb, Frederick
// County). Empty cells arrive as the literal string "None".
const raw = [
  {
    market_name: "Emmitsburg Farmers Market",
    market_day: "Friday",
    market_hours: "3pm - 6:30pm",
    full_market_address: "302 South Seton Ave., Emmitsburg MD  21727",
    website: "http://www.emmitsburg.net/towngov/misc/farmers_market.htm",
    federal_benefits: "FMNP-FVC, SNAP (farmer)",
  },
  {
    market_name: "Urbana Farmers Market",
    market_day: "Sunday",
    market_hours: "12pm - 3pm",
    full_market_address: "9020 Amelung Street, Frederick MD  21704",
    website: "www.theurbanalibraryfarmersmarket.com", // bare www -> https
    federal_benefits: "None",
  },
  {
    market_name: "Field Fresh Farmers Market",
    market_day: "None", // -> undefined
    market_hours: "None",
    full_market_address: "Frederick Fair Grounds 797 East Patrick St, Frederick, MD",
    website: "no website here", // junk -> undefined
    federal_benefits: "None",
  },
  // nameless -> dropped
  { market_name: "  ", market_day: "Monday" },
  // duplicate normalized name -> deduped
  { market_name: "EMMITSBURG FARMERS MARKET", market_day: "Friday" },
];

describe("normMarketName", () => {
  it("uppercases and keeps only alphanumerics", () => {
    expect(normMarketName("West Frederick Farmers Market!")).toBe(
      "WESTFREDERICKFARMERSMARKET",
    );
  });
});

describe("normalizeMdMarkets", () => {
  it("parses rows; treats 'None'/junk as missing; normalizes website; dedupes", () => {
    const out = normalizeMdMarkets(raw);
    expect(out.map((m) => m.name)).toEqual([
      "Emmitsburg Farmers Market",
      "Urbana Farmers Market",
      "Field Fresh Farmers Market",
    ]);
    const emm = out[0];
    expect(emm.day).toBe("Friday");
    expect(emm.hours).toBe("3pm - 6:30pm");
    expect(emm.website).toContain("emmitsburg.net");
    expect(emm.benefits).toBe("FMNP-FVC, SNAP (farmer)");

    const urb = out[1];
    expect(urb.website).toBe("https://www.theurbanalibraryfarmersmarket.com");
    expect(urb.benefits).toBeUndefined(); // "None"

    const ff = out[2];
    expect(ff.day).toBeUndefined(); // "None"
    expect(ff.hours).toBeUndefined();
    expect(ff.website).toBeUndefined(); // junk -> dropped
  });

  it("returns [] for junk input", () => {
    expect(normalizeMdMarkets(null)).toEqual([]);
    expect(normalizeMdMarkets({})).toEqual([]);
    expect(normalizeMdMarkets("nope")).toEqual([]);
  });
});

describe("findMarketSchedule", () => {
  const mkts = normalizeMdMarkets(raw);

  it("matches by exact normalized name (case/space/punct insensitive)", () => {
    const m = findMarketSchedule("emmitsburg   farmers market", mkts);
    expect(m?.name).toBe("Emmitsburg Farmers Market");
    expect(m?.day).toBe("Friday");
  });

  it("matches a suffix-less name via the symmetric MARKET strip", () => {
    // curated place "Urbana" should still find "Urbana Farmers Market"
    const m = findMarketSchedule("Urbana", mkts);
    expect(m?.name).toBe("Urbana Farmers Market");
  });

  it("does not falsely match a different market or when list is empty", () => {
    expect(findMarketSchedule("Thurmont Main Street Farmers Market", mkts)).toBeUndefined();
    expect(findMarketSchedule("Emmitsburg Farmers Market", [])).toBeUndefined();
  });
});
