import { describe, expect, it } from "vitest";
import {
  getHiddenFromDiscovery,
  publicPlaceBySlug,
} from "@/lib/loaders/places";

describe("Frederick Deaf-community place data", () => {
  it("publishes the Maryland School for the Deaf as a community resource", () => {
    const place = publicPlaceBySlug("maryland-school-for-the-deaf");

    expect(place).toMatchObject({
      name: "Maryland School for the Deaf",
      category: "community",
      accessibility: {
        communication: {
          deaf_community: true,
          asl_environment: true,
          source_url:
            "https://www.msd.edu/apps/pages/index.jsp?pREC_ID=2690688&type=d&uREC_ID=1090021",
          verified_at: "2026-07-28",
        },
      },
    });
  });

  it("publishes the Maryland Deaf Community Center with written contact", () => {
    const place = publicPlaceBySlug("maryland-deaf-center");

    expect(place).toMatchObject({
      name: "Maryland Deaf Community Center",
      category: "community",
      address: "720 N East St",
      email: "info@deafmdcc.org",
      geom: { lng: -77.4025511, lat: 39.4238076 },
      accessibility: {
        communication: {
          deaf_community: true,
          written_contact: true,
          videophone: true,
          source_url: "https://www.deafmdcc.org/contact",
          verified_at: "2026-07-28",
        },
      },
    });
  });

  it("keeps Bjorlee Museum discoverable without inventing access claims", () => {
    const place = publicPlaceBySlug("bjorlee-museum");

    expect(place).toMatchObject({
      name: "Bjorlee Museum",
      category: "museum",
      address: "101 Clarke Pl",
    });
    expect(place?.accessibility).toBeUndefined();
    expect(
      getHiddenFromDiscovery().some(({ slug }) => slug === "bjorlee-museum"),
    ).toBe(false);
  });
});
