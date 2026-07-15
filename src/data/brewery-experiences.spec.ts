import { existsSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { BREWERIES } from "./beers";
import {
  BREWERY_EXPERIENCE_BY_SLUG,
  BREWERY_EXPERIENCES,
  BREWERY_SOURCE_CHECKED_AT,
} from "./brewery-experiences";

describe("brewery experience data", () => {
  it("covers every brewery exactly once and nothing else", () => {
    const brewerySlugs = BREWERIES.map(({ slug }) => slug).sort();
    const experienceSlugs = BREWERY_EXPERIENCES.map(({ slug }) => slug).sort();

    expect(new Set(experienceSlugs).size).toBe(experienceSlugs.length);
    expect(experienceSlugs).toEqual(brewerySlugs);
    expect(Object.keys(BREWERY_EXPERIENCE_BY_SLUG).sort()).toEqual(brewerySlugs);
  });

  it("keeps local logo assets and their provenance auditable", () => {
    for (const experience of BREWERY_EXPERIENCES) {
      expect(experience.logoSrc).toBe(
        `/images/beer/logos/${experience.slug}.jpg`,
      );
      expect(
        existsSync(
          join(process.cwd(), "public", experience.logoSrc.slice(1)),
        ),
      ).toBe(true);
      expect(new URL(experience.logoSourceUrl).protocol).toBe("https:");
      expect(experience.logoSourceLabel.trim().length).toBeGreaterThan(0);
    }
  });

  it("keeps context sourced, dated, and deliberately cautious", () => {
    for (const experience of BREWERY_EXPERIENCES) {
      expect(new URL(experience.sourceUrl).protocol).toBe("https:");
      expect(experience.checkedAt).toBe(BREWERY_SOURCE_CHECKED_AT);
      expect(experience.story.trim().length).toBeGreaterThan(0);
      expect(experience.traits.length).toBeGreaterThan(0);
    }

    const cautionedSlugs = BREWERY_EXPERIENCES.filter(
      (experience) => experience.statusNote,
    )
      .map(({ slug }) => slug)
      .sort();

    expect(cautionedSlugs).toEqual(
      [
        "brudr-bier-co-frederick",
        "red-shedman-farm-brewery-and-hop-yard-mount-airy",
        "steinhardt-brewing-company-frederick",
      ].sort(),
    );
  });
});
