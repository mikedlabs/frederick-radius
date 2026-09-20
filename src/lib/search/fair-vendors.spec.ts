import { describe, expect, it } from "vitest";
import { greatFrederickFair2026Vendors } from "@/data/fair/great-frederick-fair-2026-vendors";
import { qualifiedSearch, search } from "@/lib/search";
import { qualifiedSearchIndex, searchIndex } from "@/lib/search/index";
import { isNamedFairVendorPlace, namedFairVendorMatches } from "./fair-vendors";

const VENDOR_HREF = "/moments/great-frederick-fair-2026?vendor=vendor-white-rabbit-rad-pies#fair-map";
const isVendor = (hit: ReturnType<typeof search>[number]) => hit.type === "page" && hit.page.href === VENDOR_HREF;

describe("named Fair vendors in countywide discovery", () => {
  it.each(["Rad Pies", "RadPies", "White Rabbit", "White Rabbit Gastropub", "White Rabbit x Rad Pies"])("recognizes %s as the same reviewed joint exhibitor", (query) => {
    const matches = namedFairVendorMatches(query, "frederick");
    expect(matches).toHaveLength(1);
    expect(matches[0].page.href).toBe(VENDOR_HREF);
    expect(matches[0].page.title).toBe("White Rabbit x Rad Pies at the 2026 Fair");
    expect(matches[0].page.blurb).toContain("587, 588");
    expect(matches[0].page.blurb).toContain("not a permanent business location");
    expect(matches[0].page.blurb).toContain("hours are not confirmed");
    expect(Object.keys(matches[0].page).sort()).toEqual(["blurb", "href", "keywords", "title"]);
  });

  it("recognizes canonical vendor names without promoting generic food aliases", () => {
    for (const vendor of greatFrederickFair2026Vendors) {
      expect(namedFairVendorMatches(vendor.name).some((match) => match.page.href.includes(`vendor=${vendor.id}`))).toBe(true);
    }
    for (const query of ["pizza", "Detroit pizza", "beer", "ice cream", "burgers", "rabbit", "white", "rad", "rad piesology", "JB"]) {
      expect(namedFairVendorMatches(query), query).toEqual([]);
    }
  });

  it("does not move the Fair into another town or invent a future Fair appearance", () => {
    expect(namedFairVendorMatches("Rad Pies", "brunswick")).toEqual([]);
    expect(namedFairVendorMatches("Rad Pies", null)).toHaveLength(1);
    expect(namedFairVendorMatches("Rad Pies 2027")).toEqual([]);
    expect(qualifiedSearch("Rad Pies in Brunswick", 12, [], { municipality: "frederick" }).hits.some(isVendor)).toBe(false);
    expect(qualifiedSearch("Rad Pies", 12, [], { municipality: "brunswick" }).hits.some(isVendor)).toBe(false);
    expect(qualifiedSearch("Rad Pies downtown", 12, []).hits.some(isVendor)).toBe(false);
  });

  it.each([null, "frederick"])("leads Rad Pies with the real vendor destination in scope %s", (municipality) => {
    expect(qualifiedSearch("Rad Pies", 1, [], { municipality }).hits[0]).toMatchObject({ type: "page", page: { href: VENDOR_HREF } });
    expect(qualifiedSearchIndex("Rad Pies", 1, [], { municipality }).results[0]).toMatchObject({ type: "action", href: VENDOR_HREF });
    expect(searchIndex("RadPies", 1, [])[0]?.href).toBe(VENDOR_HREF);
  });

  it("keeps the permanent White Rabbit first unless the request specifies the Fair", () => {
    const bare = qualifiedSearch("White Rabbit", 8, [], { municipality: "frederick" }).hits;
    expect(bare[0]).toMatchObject({ type: "place", place: { slug: "white-rabbit-gastropub" } });
    expect(bare[1]).toMatchObject({ type: "page", page: { href: VENDOR_HREF } });
    expect(isNamedFairVendorPlace("Whitesell Pharmacy", namedFairVendorMatches("White Rabbit"))).toBe(false);
    for (const query of ["White Rabbit at the fair", "Rad Pies at the Fair", "find Rad Pies at the fairgrounds"]) {
      expect(qualifiedSearchIndex(query, 1, [], { municipality: "frederick" }).results[0]?.href).toBe(VENDOR_HREF);
    }
  });

  it("keeps place-only filters and date-qualified guide copy truthful after the Fair", () => {
    expect(qualifiedSearch("Rad Pies", 12, [], { resultKind: "place" }).hits.some(isVendor)).toBe(false);
    const archived = qualifiedSearchIndex("Rad Pies", 1, [], { now: new Date("2027-01-01T12:00:00Z") }).results[0];
    expect(archived.title).toContain("2026 Fair");
    expect(archived.subtitle).not.toMatch(/open now|happening now/i);
    expect(archived).not.toHaveProperty("lat");
    expect(archived).not.toHaveProperty("lng");
  });

  it("indexes the guide itself without answering ordinary Frederick queries with a campaign", () => {
    expect(searchIndex("Great Frederick Fair", 1, [])[0]?.href).toBe("/moments/great-frederick-fair-2026");
    for (const query of ["Frederick", "jazz 2026", "guide", "2026"]) {
      expect(search(query, 100, []).some((hit) => hit.type === "page" && hit.page.href.includes("great-frederick-fair")), query).toBe(false);
    }
  });
});
