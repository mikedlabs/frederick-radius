import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const PROXY_PHOTO_SURFACES = [
  "src/components/place/PlaceIndex.tsx",
  "src/components/deals/DealsBrowser.tsx",
  "src/components/happy/HappyHourBrowser.tsx",
  "src/components/happy/HappyHourGuide.tsx",
  "src/components/beer/BeerFinder.tsx",
  "src/components/today/PhotoMosaic.tsx",
  "src/components/plan/PlanBuilder.tsx",
] as const;

describe("place photo proxy rendering", () => {
  it.each(PROXY_PHOTO_SURFACES)("bypasses Next image optimization in %s", (file) => {
    const source = readFileSync(resolve(process.cwd(), file), "utf8");

    // /api/place-photo already performs the upstream fetch and can return a
    // same-origin SVG fallback. Sending it through /_next/image makes Vercel
    // reject that valid fallback with INVALID_IMAGE_OPTIMIZE_REQUEST.
    expect(source).toMatch(/unoptimized=\{[^}]*startsWith\("\/api\/place-photo"\)[^}]*\}/);
  });
});
