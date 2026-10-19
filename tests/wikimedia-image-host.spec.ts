import { describe, expect, it } from "vitest";
import { hasLocalMatch } from "next/dist/shared/lib/match-local-pattern";
import { hasRemoteMatch } from "next/dist/shared/lib/match-remote-pattern";
import fixture from "./fixtures/steinhardt-squarespace.json" with { type: "json" };
import { CREDITED_LOCAL_PLACE_PHOTOS } from "../src/data/credited-local-place-photos";
import { OWNED_PLACE_PHOTOS } from "../src/lib/owned-place-photos";
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


describe("exact local photo optimizer admission", () => {
  it.each(Object.entries(OWNED_PLACE_PHOTOS))("allows the owned source bytes for %s through the actual Next config without allowing query variants", (_slug, photo) => {
    expect(hasLocalMatch(config.images?.localPatterns, photo.src)).toBe(true);
    expect(hasLocalMatch(config.images?.localPatterns, `${photo.src}?download=1`)).toBe(false);
  });

  it.each(Object.entries(CREDITED_LOCAL_PLACE_PHOTOS))("allows the reviewed source bytes for %s through the actual Next config", (_slug, { image }) => {
    expect(hasLocalMatch(config.images?.localPatterns, image.src)).toBe(true);
    expect(hasLocalMatch(config.images?.localPatterns, `${image.src}?download=1`)).toBe(false);
    expect(hasLocalMatch(config.images?.localPatterns, `${image.src}?v=2`)).toBe(false);
  });

  it.each(Object.entries(CREDITED_LOCAL_PLACE_PHOTOS).filter(([, { image }]) => image.src.startsWith("/place-photos/")))
    ("does not admit an unreviewed sibling or suffix of the exact %s source", (_slug, { image }) => {
      expect(hasLocalMatch(config.images?.localPatterns, image.src.replace(/\.jpg$/, ".jpeg"))).toBe(false);
      expect(hasLocalMatch(config.images?.localPatterns, `${image.src}/extra`)).toBe(false);
      expect(hasLocalMatch(config.images?.localPatterns, image.src.replace(/\.jpg$/, "-unreviewed.jpg"))).toBe(false);
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


describe("source-bound publisher art optimizer admission", () => {
  it("admits the actual Steinhardt fixture account but not other Squarespace accounts or HTML hosting", () => {
    const image = fixture.upcoming[0].assetUrl;
    const approved = (value: string) => hasRemoteMatch(config.images?.domains ?? [], config.images?.remotePatterns ?? [], new URL(value));
    expect(approved(image)).toBe(true);
    expect(approved(image.replace("5f9ef850cc5c2c1189e6fb4a", "583ddb1815d5dbc22734fd0e"))).toBe(false);
    expect(approved("https://static1.squarespace.com/static/5f9ef850cc5c2c1189e6fb4a/page")).toBe(false);
  });
});
