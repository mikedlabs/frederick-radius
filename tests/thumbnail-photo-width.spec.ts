import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { proxyPhotoAtWidth } from "@/lib/format/img";

const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8");

/**
 * Small place thumbnails must narrow the photo proxy to their painted size.
 *
 * `places-client.json` stores one photo URL per place at `w=800`, the size a
 * hero needs. Proxy responses render with `unoptimized` because Next cannot
 * resize an opaque route, which ALSO makes the `sizes` attribute inert for
 * them. So a component that passes the stored URL straight to `<Image>` at
 * 40px downloads the full 800px asset — measured against production, 226 KB
 * where 8.5 KB would do, repeated for every card in a scrolling list.
 *
 * Nothing catches this at runtime: the image renders correctly, just far too
 * large. It stayed broken in PlaceCard while PlaceMedallion, DealsBrowser and
 * HappyHourBrowser all did it right, which is precisely the kind of drift a
 * test has to hold.
 */

const THUMBNAIL_COMPONENTS = [
  "src/components/place/PlaceCard.tsx",
  "src/components/place/PlaceMedallion.tsx",
];

describe("thumbnail photo width", () => {
  it.each(THUMBNAIL_COMPONENTS)("%s narrows the proxy URL", (file) => {
    expect(read(file)).toContain("proxyPhotoAtWidth");
  });

  it("does not hand the stored hero URL straight to Image in PlaceCard", () => {
    const source = read("src/components/place/PlaceCard.tsx");
    // The raw field must not be the src. It may still be read to build the
    // narrowed URL and to test for presence.
    expect(source).not.toMatch(/src=\{place\.google_photo_url\}/);
  });

  it("requests 2x the painted size and never upscales", () => {
    const stored = "/api/place-photo?name=places%2FX%2Fphotos%2FY&w=800";

    // 40px thumb -> 80px asset, not 800.
    expect(proxyPhotoAtWidth(stored, 40)).toContain("w=80");
    expect(proxyPhotoAtWidth(stored, 52)).toContain("w=104");

    // A hero at its natural size is left alone rather than widened.
    expect(proxyPhotoAtWidth(stored, 800)).toBe(stored);

    // Never upscale past what is stored.
    expect(proxyPhotoAtWidth(stored, 1200)).toBe(stored);
  });

  it("leaves non-proxy sources untouched", () => {
    for (const url of [
      "https://images.example.com/hero.jpg",
      "/_next/image?url=%2Fhero.jpg&w=640&q=75",
      "data:image/png;base64,AAAA",
      "",
    ]) {
      expect(proxyPhotoAtWidth(url, 40)).toBe(url);
    }
  });
});
