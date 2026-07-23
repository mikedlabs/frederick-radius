import { describe, expect, it } from "vitest";
import {
  coveragePriorities,
  decisionCopyCounts,
  hasActionableContact,
  hasPublishedFreshHours,
  hasUsefulDecisionCopy,
  hasUsefulPhoto,
  summarizeCoverage,
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

  it("counts only a publishable card photo field", () => {
    expect(hasUsefulPhoto(place())).toBe(false);
    expect(hasUsefulPhoto(place({ google_photo_url: "  " }))).toBe(false);
    expect(hasUsefulPhoto(place({ hero_image: "/owned/fixture.jpg" }))).toBe(true);
    expect(
      hasUsefulPhoto(place({ google_photo_url: "/api/place-photo?name=places%2F1%2Fphotos%2F1" })),
    ).toBe(true);
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
});
