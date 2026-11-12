import { describe, expect, it } from "vitest";
import { createRequire } from "node:module";
import { hasLocalMatch } from "next/dist/shared/lib/match-local-pattern";
import { hasRemoteMatch } from "next/dist/shared/lib/match-remote-pattern";
import { configSchema } from "next/dist/server/config-schema";
import fixture from "./fixtures/steinhardt-squarespace.json" with { type: "json" };
import { CREDITED_LOCAL_PLACE_PHOTOS } from "../src/data/credited-local-place-photos";
import { OWNED_PLACE_PHOTOS } from "../src/lib/owned-place-photos";
import { LANDMARK_PHOTOS } from "../src/lib/integrations/wikimedia";
import config from "../next.config";

// Use the same installed matcher and options as next/dist/build/index.js's
// writeImagesManifest(), rather than measuring the shorter authored glob.
const { makeRe } = createRequire(import.meta.url)("next/dist/compiled/picomatch") as {
  makeRe: (pattern: string, options: { dot: true }) => RegExp;
};
// next/dist/server/config.js adds these two image paths when static imports
// are enabled. Include them in both count and compiled-platform validation.
const internalLocalPatterns = [
  { pathname: "/_next/static/media/**", search: "" },
  { pathname: "/_next/static/immutable/media/**", search: "" },
];

function resolvedLocalPatterns() {
  const configured = config.images?.localPatterns ?? [];
  return [...configured, ...internalLocalPatterns.filter(internal =>
    !configured.some(pattern => pattern.pathname === internal.pathname && pattern.search === internal.search))];
}

function configuredPlacePhotoPaths(): string[] {
  const groups = config.images?.localPatterns?.filter(pattern => pattern.pathname?.startsWith("/place-photos/")) ?? [];
  expect(groups).toHaveLength(6);
  const members = groups.map(group => {
    expect(group.search).toBe("");
    const finite = /^\/place-photos\/\{([a-z0-9.,-]+)\}$/.exec(group.pathname ?? "");
    expect(finite, "closed filename union, without wildcard, range or extglob").not.toBeNull();
    return finite![1].split(",").map(file => `/place-photos/${file}`);
  });
  expect(members.map(group => group.length)).toEqual([7, 6, 6, 5, 3, 2]);
  const paths = members.flat();
  expect(new Set(paths).size).toBe(paths.length);
  return paths;
}

describe("installed Next image configuration schema", () => {
  it("admits the actual images configuration within the installed 25-pattern limit", () => {
    const localPatterns = resolvedLocalPatterns();
    const result = configSchema.safeParse({ images: { ...config.images, localPatterns } });
    expect(result.success, result.success ? undefined : JSON.stringify(result.error.issues)).toBe(true);
    expect(localPatterns).toHaveLength(15);
    expect(localPatterns.length).toBeLessThanOrEqual(25);
  });

  it("keeps every Next-compiled local pathname within Vercel's 256-character bound", () => {
    // https://openapi.vercel.sh/vercel.json images.localPatterns limits the
    // COMPILED pathname string, unlike Next's authored-config schema.
    for (const pattern of resolvedLocalPatterns()) {
      const compiled = makeRe(pattern.pathname ?? "**", { dot: true }).source;
      expect(compiled.length, `${pattern.pathname}: ${compiled.length} compiled characters`).toBeLessThanOrEqual(256);
    }
    const grouped = resolvedLocalPatterns().filter(pattern => pattern.pathname?.startsWith("/place-photos/"));
    expect(grouped.map(pattern => makeRe(pattern.pathname!, { dot: true }).source.length))
      .toEqual([223, 238, 246, 242, 160, 129]);
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
