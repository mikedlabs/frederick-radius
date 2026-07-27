import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { proxyPhotoAtWidth, sizedImage } from "@/lib/format/img";

const PROXY_PHOTO_SURFACES = [
  "src/components/place/PlaceIndex.tsx",
  "src/components/deals/DealsBrowser.tsx",
  "src/components/happy/HappyHourBrowser.tsx",
  "src/components/happy/HappyHourGuide.tsx",
  "src/components/today/PhotoMosaic.tsx",
  "src/components/plan/PlanBuilder.tsx",
] as const;

describe("place photo proxy rendering", () => {
  it("keeps map thumbnails out of the Next optimizer", () => {
    const photo =
      "/api/place-photo?name=places%2Fplace-id%2Fphotos%2Fphoto-id&w=800&slug=sample-place";

    const result = sizedImage(photo, 128);

    expect(result).toBe(
      "/api/place-photo?name=places%2Fplace-id%2Fphotos%2Fphoto-id&w=128&slug=sample-place",
    );
    expect(result).not.toContain("/_next/image");
  });

  it.each(PROXY_PHOTO_SURFACES)("bypasses Next image optimization in %s", (file) => {
    const source = readFileSync(resolve(process.cwd(), file), "utf8");

    // /api/place-photo already performs the upstream fetch and can return a
    // same-origin SVG fallback. Sending it through /_next/image makes Vercel
    // reject that valid fallback with INVALID_IMAGE_OPTIMIZE_REQUEST.
    expect(source).toMatch(/unoptimized=\{[^}]*startsWith\("\/api\/place-photo"\)[^}]*\}/);
  });
});

/**
 * `unoptimized` keeps the proxy out of /_next/image, but it also means nothing
 * downstream can shrink the image: whatever `w` is baked into the stored URL is
 * what the browser downloads. Dense rows paint 40px and were pulling the 800px
 * hero, so these lock the narrowing behaviour.
 */
describe("proxyPhotoAtWidth", () => {
  const NAME = encodeURIComponent("places/ChIJtest/photos/front");
  const proxy = (w: number) => `/api/place-photo?name=${NAME}&w=${w}`;
  const widthOf = (url: string) =>
    Number.parseInt(new URLSearchParams(url.slice(url.indexOf("?") + 1)).get("w") ?? "", 10);

  it("shrinks the stored hero to what a 40px medallion actually paints", () => {
    expect(widthOf(proxyPhotoAtWidth(proxy(800), 40))).toBe(80);
  });

  it("renders at 2x so it stays sharp on a retina screen", () => {
    expect(widthOf(proxyPhotoAtWidth(proxy(800), 52))).toBe(104);
  });

  it("keeps the photo resource name intact", () => {
    const out = proxyPhotoAtWidth(proxy(800), 52);
    expect(new URLSearchParams(out.slice(out.indexOf("?") + 1)).get("name"))
      .toBe("places/ChIJtest/photos/front");
  });

  it("never upscales a URL that already asks for less", () => {
    expect(proxyPhotoAtWidth(proxy(96), 400)).toBe(proxy(96));
  });

  it("honours the route's [80, 1600] clamp at both ends", () => {
    expect(widthOf(proxyPhotoAtWidth(proxy(800), 12))).toBe(80);
    expect(widthOf(proxyPhotoAtWidth(proxy(1600), 2000))).toBe(1600);
  });

  it("leaves Blob and remote URLs untouched so <Image> can still optimize them", () => {
    const blob = "https://example.public.blob.vercel-storage.com/places/x/hero.jpg";
    expect(proxyPhotoAtWidth(blob, 40)).toBe(blob);
  });
});
