import { describe, expect, it } from "vitest";
import { hasLocalMatch } from "next/dist/shared/lib/match-local-pattern";
import { CREDITED_LOCAL_PLACE_PHOTOS } from "../src/data/credited-local-place-photos";
import config from "../next.config";

describe("Wikimedia photo rendering", () => {
  it("allows Commons thumbnails returned by Wikipedia without broadening to arbitrary hosts", () => {
    expect(config.images?.remotePatterns).toContainEqual({
      protocol: "https",
      hostname: "thumb.wikimedia.org",
      pathname: "/wikipedia/commons/**",
    });
  });
});


describe("credited local photo optimizer admission", () => {
  it.each(Object.entries(CREDITED_LOCAL_PLACE_PHOTOS))("allows the reviewed source bytes for %s through the actual Next config", (_slug, { image }) => {
    expect(hasLocalMatch(config.images?.localPatterns, image.src)).toBe(true);
  });

  it.each([
    "/place-photos/unreviewed.jpg",
    "/place-photos/brewers-alley-2004.jpeg",
    "/place-photos/brewers-alley-2004.jpg/extra",
    "/place-photos/brewers-alley-2004.jpg?download=1",
    "/place-photos/brewers-alley-2004.jpg?v=2",
  ])("keeps unreviewed paths and query-bearing sources outside optimizer policy: %s", (src) => {
    expect(hasLocalMatch(config.images?.localPatterns, src)).toBe(false);
  });
});
