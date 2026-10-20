import { describe, expect, it } from "vitest";
import {
  coveragePriorities,
  decisionCopyIssue,
  decisionCopyCounts,
  hasActionableContact,
  hasPublishedFreshHours,
  hasUsefulDecisionCopy,
  hasUsefulPhoto,
  summarizeCoverage,
  summarizeCoverageByCategory,
  summarizeCoverageByTown,
  type CoveragePlace,
} from "./coverage";

function place(
  overrides: Partial<CoveragePlace> = {},
): CoveragePlace {
  return {
    slug: "fixture",
    name: "Fixture Place",
    municipality: "frederick",
    ...overrides,
  };
}

describe("coverage quality metrics", () => {
  it("counts only recently verified hours that may support an open-now claim", () => {
    const now = new Date("2026-07-23T12:00:00-04:00");
    expect(hasPublishedFreshHours(place(), now)).toBe(false);
    expect(hasPublishedFreshHours(place({ hours: null, hours_verified: true, hours_updated_at: now.toISOString() }), now)).toBe(false);
    expect(
      hasPublishedFreshHours(
        place({
          hours: { mon: [{}] },
          hours_verified: true,
          hours_updated_at: "2026-07-23T12:00:00-04:00",
        }),
        now,
      ),
    ).toBe(true);
    expect(
      hasPublishedFreshHours(
        place({
          hours: { mon: [{}] },
          hours_verified: true,
          hours_updated_at: "2026-07-01T12:00:00-04:00",
        }),
        now,
      ),
    ).toBe(false);
  });

  it("stops counting a first-party schedule at its actual date horizon even within seven days", () => {
    const checkedAt = "2026-10-19T16:00:00.000Z";
    const datedPlace = place({
      hours_verified: true,
      hours_updated_at: checkedAt,
      hours: {
        mon: [{ open: "09:00", close: "17:00" }],
        _official: {
          slug: "fixture",
          source_url: "https://example.com/hours",
          observed_at: checkedAt,
          expires_at: "2026-10-21T03:59:59.999Z",
          coverage_from: "2026-10-20",
          coverage_through: "2026-10-20",
          exceptions: [],
        },
      },
    });

    expect(hasPublishedFreshHours(datedPlace, new Date("2026-10-19T17:00:00Z"))).toBe(false);
    expect(hasPublishedFreshHours(datedPlace, new Date("2026-10-20T16:00:00Z"))).toBe(true);
    expect(hasPublishedFreshHours(datedPlace, new Date("2026-10-21T04:00:00Z"))).toBe(false);
  });

  it("counts only a publishable card photo field", () => {
    expect(hasUsefulPhoto(place())).toBe(false);
    expect(hasUsefulPhoto(place({ google_photo_url: "  " }))).toBe(false);
    expect(hasUsefulPhoto(place({ hero_image: "/owned/fixture.jpg" }))).toBe(true);
    expect(
      hasUsefulPhoto(place({ google_photo_url: "/api/place-photo?name=places%2F1%2Fphotos%2F1" })),
    ).toBe(true);
  });

  it("counts exact reviewed local imagery even when no Google photo field exists", () => {
    for (const slug of ["carroll-creek-linear-park-frederick", "new-market-historic-district-new-market", "catoctin-mountain-park"]) {
      expect(hasUsefulPhoto(place({ slug }))).toBe(true);
    }
    expect(hasUsefulPhoto(place({ slug: "unreviewed-nearby-merchant" }))).toBe(false);
  });

  it("requires a stored contact or transaction action", () => {
    expect(hasActionableContact(place())).toBe(false);
    expect(hasActionableContact(place({ website: "https://example.com" }))).toBe(true);
    expect(
      hasActionableContact(
        place({
          commerce_links: [
            { type: "gift_card", url: "https://example.com/gift" },
            { type: "menu", url: "https://example.com/menu" },
          ],
        }),
      ),
    ).toBe(true);
    expect(
      hasActionableContact(
        place({ commerce_links: [{ type: "delivery", url: "https://example.com/delivery" }] }),
      ),
    ).toBe(false);
  });

  it("rejects directory boilerplate and blurbs repeated across the catalog", () => {
    const useful = place({
      short_blurb:
        "This East Patrick Street bakery makes laminated pastries and serves espresso each morning.",
    });
    const boilerplate = place({
      short_blurb: "Restaurants in Frederick. Click here to learn more.",
    });
    const repeated = [
      place({ slug: "one", short_blurb: useful.short_blurb }),
      place({ slug: "two", short_blurb: useful.short_blurb }),
      place({ slug: "three", short_blurb: useful.short_blurb }),
      place({ slug: "four", short_blurb: useful.short_blurb }),
    ];

    expect(hasUsefulDecisionCopy(useful, decisionCopyCounts([useful]))).toBe(true);
    expect(hasUsefulDecisionCopy(boilerplate, decisionCopyCounts([boilerplate]))).toBe(false);
    expect(
      repeated.every((entry) =>
        hasUsefulDecisionCopy(entry, decisionCopyCounts(repeated)),
      ),
    ).toBe(false);
    expect(
      decisionCopyIssue(boilerplate, decisionCopyCounts([boilerplate])),
    ).toBe("category_template");
    expect(
      decisionCopyIssue(place(), decisionCopyCounts([place()])),
    ).toBe("missing");
    expect(
      decisionCopyIssue(repeated[0], decisionCopyCounts(repeated)),
    ).toBe("shared_boilerplate");
  });

  it("rejects directory address prefixes without rejecting useful street context", () => {
    const fullStreetDump = place({
      name: "The Vox Lounge",
      short_blurb:
        "228 North Market Street Frederick, MD 21701 The Vox Lounge is a music venue.",
    });
    const cityZipDump = place({
      name: "Swinging Bridge",
      short_blurb:
        "Frederick, MD, 21701 The bridge in Baker Park was stabilized.",
    });
    const useful = place({
      name: "Patrick Street Bakery",
      short_blurb:
        "This bakery on East Patrick Street makes laminated pastries each morning.",
    });
    const usefulWithExactLocation = place({
      name: "Carroll Creek Parking Deck",
      short_blurb:
        "This city garage sits near Carroll Creek at 44 E Patrick Street.",
    });

    expect(
      decisionCopyIssue(fullStreetDump, decisionCopyCounts([fullStreetDump])),
    ).toBe("address_dump");
    expect(
      decisionCopyIssue(cityZipDump, decisionCopyCounts([cityZipDump])),
    ).toBe("address_dump");
    expect(
      decisionCopyIssue(useful, decisionCopyCounts([useful])),
    ).toBeNull();
    expect(
      decisionCopyIssue(
        usefulWithExactLocation,
        decisionCopyCounts([usefulWithExactLocation]),
      ),
    ).toBeNull();
  });

  it("keeps empty towns visible and ranks only dimensions below target", () => {
    const places = [
      place({
        hours: { mon: [{}] },
        hours_verified: true,
        hours_updated_at: new Date().toISOString(),
        website: "https://example.com",
        short_blurb:
          "This small cafe roasts its own coffee and serves breakfast near the square.",
      }),
    ];
    const towns = summarizeCoverageByTown(places, [
      { slug: "frederick", name: "Frederick City" },
      { slug: "rosemont", name: "Rosemont" },
    ]);

    expect(towns.find((town) => town.slug === "rosemont")?.total).toBe(0);

    const priorities = coveragePriorities(summarizeCoverage(places));
    expect(priorities.map((priority) => priority.dimension)).toEqual([
      "photo",
    ]);
    expect(priorities[0]?.needed).toBe(1);
  });

  it("shows field readiness by normalized category", () => {
    const places = [
      place({
        slug: "cafe",
        category: "coffee",
        hero_image: "/owned/cafe.jpg",
        website: "https://example.com/cafe",
        short_blurb:
          "This neighborhood cafe serves espresso and breakfast near the square.",
      }),
      place({
        slug: "restaurant",
        category: "restaurant",
        website: "https://example.com/restaurant",
      }),
    ];

    const categories = summarizeCoverageByCategory(places, [
      { slug: "coffee", name: "Coffee" },
      { slug: "restaurant", name: "Restaurants" },
    ]);

    expect(categories).toHaveLength(2);
    expect(categories.find((category) => category.slug === "coffee")).toMatchObject({
      name: "Coffee",
      total: 1,
      photo: 1,
      copy: 1,
      action: 1,
    });
    expect(
      categories.find((category) => category.slug === "restaurant"),
    ).toMatchObject({
      name: "Restaurants",
      total: 1,
      photo: 0,
      copy: 0,
      action: 1,
    });
  });
});
