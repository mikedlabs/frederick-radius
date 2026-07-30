import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { PARKING_GARAGES } from "@/data/parking-garages";

/**
 * Every garage slug in parking-garages.ts builds a /places/<slug> link on
 * /parking. Keep those links and the public payment claims aligned with the
 * canonical place catalog and the City of Frederick's published garage rules.
 */
const places = JSON.parse(
  readFileSync("src/data/places-client.json", "utf8"),
) as Array<{ slug: string }>;
const slugSet = new Set(places.map((place) => place.slug));
const parkingPageSource = readFileSync(
  "src/app/(app)/parking/page.tsx",
  "utf8",
);

describe("parking garage slugs resolve to real place records", () => {
  it("places-client.json parsed as a non-empty slug set", () => {
    expect(slugSet.size).toBeGreaterThan(100);
  });

  for (const garage of PARKING_GARAGES) {
    it(`"${garage.slug}" (${garage.name}) exists in places data`, () => {
      expect(slugSet.has(garage.slug)).toBe(true);
    });
  }
});

describe("parking payment claims stay source-aligned", () => {
  it("does not assign ParkMobile to City garages", () => {
    for (const garage of PARKING_GARAGES) {
      expect(garage.payment).not.toContain("park-mobile");
      expect(garage.payment).toContain("pay-station");
      expect(garage.payment).toContain("credit-card");
    }
  });

  it("keeps ParkMobile scoped to street parking in public copy", () => {
    expect(parkingPageSource).toContain("ParkMobile applies on the street");
    expect(parkingPageSource).toContain("ParkMobile is for on-street spaces");
    expect(parkingPageSource).not.toContain("every meter + every garage");
    expect(parkingPageSource).not.toContain("Pay with ParkMobile, cash");
  });

  it("keeps the official garage payment flow visible", () => {
    expect(parkingPageSource).toContain("first-level pay station");
    expect(parkingPageSource).toContain("Cash, coin, or card");
    expect(parkingPageSource).toContain("ticket already validated");
  });
});
