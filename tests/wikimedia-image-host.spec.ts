import { describe, expect, it } from "vitest";
import { hasLocalMatch } from "next/dist/shared/lib/match-local-pattern";
import { hasRemoteMatch } from "next/dist/shared/lib/match-remote-pattern";
import { configSchema } from "next/dist/server/config-schema";
import fixture from "./fixtures/steinhardt-squarespace.json" with { type: "json" };
import { CREDITED_LOCAL_PLACE_PHOTOS } from "../src/data/credited-local-place-photos";
import { OWNED_PLACE_PHOTOS } from "../src/lib/owned-place-photos";
import { LANDMARK_PHOTOS } from "../src/lib/integrations/wikimedia";
import config from "../next.config";

function configuredPlacePhotoPaths(): string[] {
  const groups = config.images?.localPatterns?.filter(pattern => pattern.pathname?.startsWith("/place-photos/")) ?? [];
  expect(groups).toHaveLength(1);
  expect(groups[0].search).toBe("");
  const finite = /^\/place-photos\/\{([a-z0-9.,-]+)\}$/.exec(groups[0].pathname ?? "");
  expect(finite, "one closed filename union, without wildcard, range or extglob").not.toBeNull();
  return finite![1].split(",").map(file => `/place-photos/${file}`);
}

describe("installed Next image configuration schema", () => {
  it("admits the actual images configuration within the installed 25-pattern limit", () => {
    const result = configSchema.safeParse({ images: config.images });
    expect(result.success, result.success ? undefined : JSON.stringify(result.error.issues)).toBe(true);
    expect(config.images?.localPatterns?.length).toBeLessThanOrEqual(25);
  });

  it("detects the real framework limit rather than weakening schema validation", () => {
    const result = configSchema.safeParse({ images: { ...config.images,
      localPatterns: Array.from({ length: 26 }, () => ({ pathname: "/reviewed.jpg", search: "" })) } });
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.issues.some((issue: { path: PropertyKey[] }) => issue.path.join(".") === "images.localPatterns")).toBe(true);
  });

  it("keeps the finite union equal to all reviewed existing and County place-photo files", () => {
    const expected = [...new Set([
      ...Object.values(CREDITED_LOCAL_PLACE_PHOTOS).map(({ image }) => image.src),
      ...Object.values(LANDMARK_PHOTOS).flatMap(photo => photo.verified && photo.localSrc ? [photo.localSrc] : []),
    ].filter(src => src.startsWith("/place-photos/")))].sort();
    expect(configuredPlacePhotoPaths().sort()).toEqual(expected);
    expect(expected).toHaveLength(29);
  });
});

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
  it.each(Object.entries(LANDMARK_PHOTOS).flatMap(([slug, photo]) => photo.verified && photo.localSrc
    ? [{ slug, src: photo.localSrc }] : []))
    ("allows the bundled curated source for $slug through the real optimizer policy", ({ src }) => {
      expect(hasLocalMatch(config.images?.localPatterns, src)).toBe(true);
      expect(hasLocalMatch(config.images?.localPatterns, `${src}?download=1`)).toBe(false);
      expect(hasLocalMatch(config.images?.localPatterns, `${src}?v=2`)).toBe(false);
      if (src.startsWith("/place-photos/")) {
        expect(configuredPlacePhotoPaths()).toContain(src);
        expect(hasLocalMatch(config.images?.localPatterns, `${src}/extra`)).toBe(false);
        expect(hasLocalMatch(config.images?.localPatterns, src.replace(/\.(\w+)$/, "-unreviewed.$1"))).toBe(false);
      }
    });

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

  it("admits exactly fourteen reviewed County local files without a County wildcard", () => {
    const reviewed = Object.values(CREDITED_LOCAL_PLACE_PHOTOS)
      .filter(({ image }) => image.src.startsWith("/place-photos/county-"))
      .map(({ image }) => image.src).sort();
    const configured = configuredPlacePhotoPaths().filter(src => src.startsWith("/place-photos/county-"));
    expect(reviewed).toHaveLength(14);
    expect(configured.sort()).toEqual(reviewed);
  });

  it.each(Object.entries(CREDITED_LOCAL_PLACE_PHOTOS).filter(([, { image }]) => image.src.startsWith("/place-photos/county-")))
    ("keeps the %s permission record separate from remote image optimization", (_slug, { image }) => {
      expect(image.license.label).toBe("Used with permission");
      expect(hasRemoteMatch(config.images?.domains ?? [], config.images?.remotePatterns ?? [], new URL(image.source_url))).toBe(false);
      expect(hasLocalMatch(config.images?.localPatterns, `${image.src}/../unreviewed.jpg`)).toBe(false);
      expect(hasLocalMatch(config.images?.localPatterns, image.src.replace("/place-photos/", "/place-photos/%2e%2e/"))).toBe(false);
      expect(hasLocalMatch(config.images?.localPatterns, image.src.replace("/county-", "/%2Fcounty-"))).toBe(false);
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
