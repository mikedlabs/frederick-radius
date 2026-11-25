import { describe, it, expect } from "vitest";
import { duplicateNameQualifiers, normalizePlaceName, normalizeCity } from "./placeName";

describe("normalizePlaceName", () => {
  it("strips Google branch-id numbers on chain-type names", () => {
    expect(normalizePlaceName("Pnc Bank 8")).toBe("PNC Bank");
    expect(normalizePlaceName("Cvs Pharmacy 95")).toBe("CVS Pharmacy");
    expect(normalizePlaceName("City Hall 8")).toBe("City Hall");
    expect(normalizePlaceName("Post Office 4")).toBe("Post Office");
  });

  it("never strips a meaningful trailing number", () => {
    expect(normalizePlaceName("Hwy 15")).toBe("Hwy 15");
    expect(normalizePlaceName("Route 40 Diner")).toBe("Route 40 Diner");
    expect(normalizePlaceName("Studio 54")).toBe("Studio 54");
  });

  it("camel-cases Mc surnames", () => {
    expect(normalizePlaceName("Mcclintock Distillery")).toBe("McClintock Distillery");
    expect(normalizePlaceName("Alice Mccormick Acupuncture")).toBe("Alice McCormick Acupuncture");
    expect(normalizePlaceName("Mccurdy Field")).toBe("McCurdy Field");
  });

  it("does not touch Mac- words", () => {
    expect(normalizePlaceName("Machine Shop")).toBe("Machine Shop");
  });

  it("upper-cases known acronyms only", () => {
    expect(normalizePlaceName("Vr")).toBe("VR");
    expect(normalizePlaceName("Studio Twenty")).toBe("Studio Twenty"); // not an acronym
  });

  it("never invents apostrophes (left for curated overrides)", () => {
    // "Roros" stays as-is; we don't guess "Roro's".
    expect(normalizePlaceName("Roros Mexican Grill")).toBe("Roros Mexican Grill");
  });

  it("is idempotent", () => {
    const once = normalizePlaceName("Pnc Bank 8");
    expect(normalizePlaceName(once)).toBe(once);
  });
});

describe("normalizeCity", () => {
  it("folds the editorial 'Downtown Frederick' pseudo-city to the postal city", () => {
    expect(normalizeCity("Downtown Frederick")).toBe("Frederick");
    expect(normalizeCity("downtown frederick")).toBe("Frederick");
    expect(normalizeCity("  Downtown   Frederick ")).toBe("Frederick");
  });

  it("repairs case variants of known cities", () => {
    expect(normalizeCity("woodsboro")).toBe("Woodsboro");
    expect(normalizeCity("urbana")).toBe("Urbana");
    expect(normalizeCity("walkersville")).toBe("Walkersville");
    expect(normalizeCity("thurmont")).toBe("Thurmont");
  });

  it("fixes abbreviations and misspellings", () => {
    expect(normalizeCity("Mt Airy")).toBe("Mount Airy");
    expect(normalizeCity("Mt. Airy")).toBe("Mount Airy");
    expect(normalizeCity("Fredrick")).toBe("Frederick");
  });

  it("replaces non-city junk with the municipality-derived postal city", () => {
    expect(normalizeCity("MD", "middletown")).toBe("Middletown");
    expect(normalizeCity("Frederick County", "jefferson")).toBe("Jefferson");
    expect(normalizeCity("315", "frederick")).toBe("Frederick");
    expect(normalizeCity("129 W Patrick St", "frederick")).toBe("Frederick");
    expect(normalizeCity("Frederick County", "ijamsville")).toBe("Ijamsville");
    // "frederick" muni -> postal "Frederick", NOT the editorial "Downtown Frederick".
    expect(normalizeCity("MD", "frederick")).toBe("Frederick");
  });

  it("leaves junk alone when there's no municipality to fall back on", () => {
    expect(normalizeCity("MD")).toBe("MD");
    expect(normalizeCity("315")).toBe("315");
  });

  it("leaves real cities (incl. unlisted localities) untouched", () => {
    expect(normalizeCity("Frederick")).toBe("Frederick");
    expect(normalizeCity("Mount Airy")).toBe("Mount Airy");
    expect(normalizeCity("New Market")).toBe("New Market");
    expect(normalizeCity("Rosemont", "rosemont")).toBe("Rosemont");
    expect(normalizeCity("")).toBe("");
  });

  it("is idempotent", () => {
    expect(normalizeCity(normalizeCity("Downtown Frederick"))).toBe("Frederick");
    expect(normalizeCity(normalizeCity("woodsboro"))).toBe("Woodsboro");
  });
});

describe("duplicateNameQualifiers", () => {
  const store = (slug: string, name: string, municipality: string, address?: string) => ({ slug, name, municipality, address });
  const TOWN: Record<string, string> = { frederick: "Frederick City", thurmont: "Thurmont", "mount-airy": "Mount Airy" };
  const townName = (municipality: string) => TOWN[municipality];

  it("gives same-named stores in one town their street line and leaves unique names alone", () => {
    const qualifiers = duplicateNameQualifiers([
      store("food-lion-yellow-springs-frederick", "Food Lion", "frederick", "2060 Yellow Springs Rd"),
      store("food-lion-crestwood-frederick", "Food Lion", "frederick", "6920 Crestwood Blvd"),
      store("il-porto-restaurant", "Il Porto Restaurant", "frederick", "200 S Market St"),
    ]);
    expect([...qualifiers]).toEqual([
      ["food-lion-yellow-springs-frederick", "2060 Yellow Springs Rd"],
      ["food-lion-crestwood-frederick", "6920 Crestwood Blvd"],
    ]);
  });

  it("keeps the house number, because two stores can share a street", () => {
    const qualifiers = duplicateNameQualifiers([
      store("north-market-farmers-market", "Frederick City Market", "frederick", "622 N Market St"),
      store("frederick-city-market", "Frederick City Market", "frederick", "331 N Market St"),
    ]);
    expect(qualifiers.get("north-market-farmers-market")).toBe("622 N Market St");
    expect(qualifiers.get("frederick-city-market")).toBe("331 N Market St");
  });

  it("reads the street out of every stored address shape", () => {
    const street = (address: string) => duplicateNameQualifiers([
      store("a", "Starbucks", "frederick", address),
      store("b", "Starbucks", "frederick", "899 W 7th St"),
    ]).get("a");
    expect(street("151 Walkers Village Way, Walkersville, MD 21793")).toBe("151 Walkers Village Way");
    expect(street("Shopping Center, 441 E Ridgeville Blvd, Mt Airy, MD 21771")).toBe("441 E Ridgeville Blvd");
    expect(street("104 N Market St (104 Market Street)")).toBe("104 N Market St");
    expect(street("inside H Mart, 1063 W Patrick St, Frederick, MD 21702")).toBe("1063 W Patrick St");
    expect(street("  5   E Main St ,Middletown, MD 21769")).toBe("5 E Main St");
    expect(street("565-A E Church St, Frederick, MD 21701")).toBe("565-A E Church St");
    expect(street("Lead-in, 16-20 W Main St, Emmitsburg, MD 21727")).toBe("16-20 W Main St");
    // A named location with no house number is still a location.
    expect(street("Carroll Creek between East St and Bentz St")).toBe("Carroll Creek between East St and Bentz St");
    expect(street("McGowan Center, Emmitsburg, MD 21727")).toBe("McGowan Center");
    expect(street("2nd Ave, Brunswick, MD 21716")).toBe("2nd Ave");
  });

  it("joins a house number or an intersection that a stray comma split", () => {
    const street = (address: string) => duplicateNameQualifiers([
      store("a", "Starbucks", "frederick", address),
      store("b", "Starbucks", "frederick", "899 W 7th St"),
    ]).get("a");
    expect(street("12a, Poplar St, Myersville, MD 21773")).toBe("12a Poplar St");
    expect(street("714-1, Rocky Fountain Dr, Myersville, MD 21773")).toBe("714-1 Rocky Fountain Dr");
    expect(street("8925 D, Fingerboard Rd, Frederick, MD 21704")).toBe("8925 D Fingerboard Rd");
    // A stray number before a full numbered street is not joined to it.
    expect(street("2171, 7221 Michaels Mill Rd, Adamstown, MD 21710")).toBe("7221 Michaels Mill Rd");
    expect(street("Wolfsville Rd &, Baltimore National Pike, Myersville, MD 21773")).toBe("Wolfsville Rd & Baltimore National Pike");
    expect(street("Sandstone Dr &, Bedrock Dr, Walkersville, MD 21793")).toBe("Sandstone Dr & Bedrock Dr");
  });

  it("never reads a town, community, postal code or bare number as a street", () => {
    // Paired with a store that has a street, the store without one falls
    // back to its place in the group (see the next test), never to the town.
    const street = (address?: string) => duplicateNameQualifiers([
      store("a", "Starbucks", "frederick", address),
      store("b", "Starbucks", "frederick", "899 W 7th St"),
    ]).get("a");
    for (const address of [
      undefined,
      "",
      "Frederick",
      "Middletown, MD 21769",
      "Mt Airy, MD 21771",
      "MD 21701",
      "CH7V+3PR",
      // Real published shapes: a community followed by its state line, a
      // house number with no street, a placeholder, and two synthetic ones.
      "Jefferson, MD 21755",
      "Graceham, MD 21788",
      "Peace and Plenty, MD 21774",
      "Ijamsville, MD 21754",
      "25, Brunswick, MD 21716",
      "Parking lot, Brunswick, MD 21716",
      "Unnamed Road, Frederick, MD 21704",
      "21701",
      "Frederick MD 21701",
    ]) {
      expect(street(address), String(address)).toBe("Location 1 of 2");
    }
  });

  it("gives every store in a same-name, same-town group a distinct qualifier, even with no usable street", () => {
    const qualifiers = duplicateNameQualifiers([
      store("graceham-store-b", "Corner Store", "thurmont", "Graceham, MD 21788"),
      store("graceham-store-a", "Corner Store", "thurmont", "Graceham, MD 21788"),
      store("same-street-c", "Corner Store", "thurmont", "10 Main St, Thurmont, MD 21788"),
      store("same-street-d", "Corner Store", "thurmont", "10 Main St"),
      store("own-street-e", "Corner Store", "thurmont", "231 Tippin Dr"),
    ]);
    expect(Object.fromEntries(qualifiers)).toEqual({
      // Numbered in slug order, so the label does not depend on input order.
      "graceham-store-a": "Location 1 of 5",
      "graceham-store-b": "Location 2 of 5",
      // A shared street does not tell two stores apart either.
      "same-street-c": "Location 4 of 5",
      "same-street-d": "Location 5 of 5",
      "own-street-e": "231 Tippin Dr",
    });
    expect(new Set(qualifiers.values()).size).toBe(5);
  });

  it("leaves a store that is alone in its town to the town, which the caller may already print", () => {
    const places = [
      store("food-lion-yellow-springs-frederick", "Food Lion", "frederick", "2060 Yellow Springs Rd"),
      store("food-lion-crestwood-frederick", "Food Lion", "frederick", "6920 Crestwood Blvd"),
      store("food-lion-thurmont", "food lion ", "thurmont", "231 Tippin Dr"),
    ];
    // The map rows print the town themselves, so the Thurmont pin gets no field.
    expect(duplicateNameQualifiers(places).has("food-lion-thurmont")).toBe(false);
    // A list with no town on its rows asks for the town by name.
    const withTown = duplicateNameQualifiers(places, townName);
    expect(withTown.get("food-lion-thurmont")).toBe("Thurmont");
    expect(withTown.get("food-lion-crestwood-frederick")).toBe("6920 Crestwood Blvd");
  });

  it("tells two towns apart by town when the caller asks, and says nothing for an unnamed town", () => {
    const places = [
      store("starbucks-842", "Starbucks", "frederick", "899 W 7th St"),
      store("starbucks-mount-airy", "Starbucks", "mount-airy", "Shopping Center, 441 E Ridgeville Blvd, Mt Airy, MD 21771"),
      store("starbucks-elsewhere", "Starbucks", "unlisted", "1 Main St"),
    ];
    expect(duplicateNameQualifiers(places).size).toBe(0);
    expect([...duplicateNameQualifiers(places, townName)]).toEqual([
      ["starbucks-842", "Frederick City"],
      ["starbucks-mount-airy", "Mount Airy"],
    ]);
  });
});
