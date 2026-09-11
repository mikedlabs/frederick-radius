import { describe, expect, it } from "vitest";
import { parseUntappdAccounts, shapeTapItems } from "./untappd-business";

describe("parseUntappdAccounts", () => {
  it("returns [] for missing, malformed, or non-array env values", () => {
    expect(parseUntappdAccounts(undefined)).toEqual([]);
    expect(parseUntappdAccounts("")).toEqual([]);
    expect(parseUntappdAccounts("not json")).toEqual([]);
    expect(parseUntappdAccounts('{"slug":"x"}')).toEqual([]);
  });

  it("keeps only complete account rows", () => {
    const raw = JSON.stringify([
      { slug: "attaboy-beer-frederick", email: "a@b.c", token: "tok", locationId: 12 },
      { slug: "", email: "a@b.c", token: "tok" }, // no slug
      { slug: "x", email: "a@b.c" }, // no token
      null,
    ]);
    const accounts = parseUntappdAccounts(raw);
    expect(accounts).toHaveLength(1);
    expect(accounts[0].slug).toBe("attaboy-beer-frederick");
    expect(accounts[0].locationId).toBe(12);
  });
});

describe("shapeTapItems", () => {
  it("keeps text facts, coerces numerics, and never invents a nameless beer", () => {
    const items = shapeTapItems([
      { name: "Crowd Control", style: "Double IPA", abv: "8.0", ibu: 80, description: "  Hazy, dank.  " },
      { name: "   " }, // blank name → dropped
      { style: "Pilsner" }, // no name → dropped
      { name: "Nitro Stout", abv: 0, ibu: "not-a-number" },
    ]);
    expect(items).toHaveLength(2);
    expect(items[0]).toMatchObject({ name: "Crowd Control", style: "Double IPA", abv: 8, ibu: 80 });
    expect(items[0].description).toBe("Hazy, dank.");
    // Zero / unparseable numerics are omitted, not rendered as 0s.
    expect(items[1]).toEqual({ name: "Nitro Stout" });
  });

  it("clamps runaway descriptions", () => {
    const items = shapeTapItems([{ name: "Long", description: "x".repeat(500) }]);
    expect(items[0].description).toHaveLength(240);
  });
});
