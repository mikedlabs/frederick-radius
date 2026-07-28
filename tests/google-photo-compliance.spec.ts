import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

describe("Google photo storage guardrails", () => {
  it("keeps the photo transport no-store and free of permanent Blob writes", () => {
    const route = read("src/app/api/place-photo/route.ts");
    expect(route).not.toContain("@vercel/blob");
    expect(route).not.toMatch(/\b(?:list|put)\s*\(/);
    expect(route).toContain('cache: "no-store"');
    expect(route).toContain('"Cache-Control": "private, no-store, max-age=0"');
    expect(route).not.toContain("revalidate: 604800");
    expect(route).toContain('placeholderResponse(name, w, "rate-limited", slug, signalFallback)');
    expect(route).not.toContain('new Response("Too Many Requests"');
  });

  it("leaves the legacy download command as a hard refusal", () => {
    const script = read("scripts/download-photos.ts");
    expect(script).toContain("Refusing to mirror Google Places photos.");
    expect(script).not.toContain("@vercel/blob");
    expect(script).not.toMatch(/\bput\s*\(/);
  });

  it("does not select the legacy permanent Blob map for public place photos", () => {
    const loader = read("src/lib/loaders/places.ts");
    expect(loader).not.toContain('from "@/lib/places-photos"');
    expect(loader).not.toContain("placePhotoBlob(");

    const clientLoader = read("src/lib/loaders/places-client.ts");
    expect(clientLoader).toContain("withoutUnpublishableGooglePhoto");
    expect(clientLoader).toContain("google_photo_policy_passed");
    const clientBuild = read("scripts/build-client-places.ts");
    expect(clientBuild).toContain("google_photo_attribution: _gpaHero");
    expect(clientBuild).toContain("google_photo_policy_passed");
  });

  it("requires exact source metadata before server or runtime loaders publish a photo", () => {
    const loader = read("src/lib/loaders/places.ts");
    const route = read("src/app/api/place/[slug]/enrich/route.ts");
    expect(loader).toContain("publishableGooglePhotoNames");
    expect(route).toContain("publishableGooglePhotoNames");
  });

  it("keeps Google content reporting attached to full photos and reviews", () => {
    const lightbox = read("src/components/ui/PhotoLightbox.tsx");
    const context = read("src/components/place/GooglePlaceContext.tsx");
    expect(lightbox).toContain("flag_content_uri");
    expect(lightbox).toContain("Report photo");
    expect(context).toContain("review_flag_content_uri");
    expect(context).toContain("reviewFlagContentUri");
  });

  it("keeps on-demand Places enrichment out of Next's persistent cache", () => {
    const route = read("src/app/api/place/[slug]/enrich/route.ts");
    expect(route).not.toContain("unstable_cache");
    expect(route).toContain('"Cache-Control": "private, no-store, max-age=0"');
  });
});
