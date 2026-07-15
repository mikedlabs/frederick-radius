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
    expect(clientLoader).toContain("withoutLegacyGoogleBlobMirror");
    expect(clientLoader).toContain('.public.blob.vercel-storage.com');
  });

  it("keeps on-demand Places enrichment out of Next's persistent cache", () => {
    const route = read("src/app/api/place/[slug]/enrich/route.ts");
    expect(route).not.toContain("unstable_cache");
    expect(route).toContain('"Cache-Control": "private, no-store, max-age=0"');
  });
});
