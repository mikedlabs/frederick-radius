import { readdirSync, readFileSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { describe, expect, it } from "vitest";
import { stripComments } from "../../../scripts/check-place-photo-usage.mjs";

/**
 * Every file that builds or paints a place-photo proxy URL must either render
 * through RadiusPhoto or ask the proxy for its failure signal.
 *
 * The proxy answers a daily cap, a rate limit or an upstream error with a 200
 * image of its own Radius plate. Without `fallback=signal` that plate decodes
 * like any photograph, and in October 2026 it was drawn as a happy-hour cover
 * photo and as map-list thumbnails. RadiusPhoto requests the signal and treats
 * it as missing, so painting through it is the default answer. A file passes
 * when its code (not its comments):
 *
 * - uses RadiusPhoto; or
 * - writes `fallback=signal` (as a query string, a URLSearchParams pair or an
 *   object key); or
 * - calls the shared helpers that add it (`placePhotoFailureSignalSrc`,
 *   `usePlacePhotoState`, `PlacePhotoScope`).
 *
 * Anything else is a deliberate exception listed below with its reason. The
 * list only shrinks: an entry whose file no longer mentions the proxy, or now
 * meets the contract, fails until it is removed.
 */

const PROXY_PATH = "/api/place-photo";
const ROOT = process.cwd();
const SCAN_ROOT = "src";
const SOURCE = /\.(?:[cm]?[jt]sx?)$/;
const NOT_SHIPPED = /\.(?:spec|test|stories)\.[cm]?[jt]sx?$|\.d\.ts$/;

const SIGNAL_CONTRACT = new RegExp(
  [
    String.raw`\bRadiusPhoto\b`,
    String.raw`fallback=signal`,
    String.raw`["']?fallback["']?\s*[:,]\s*["']signal["']`,
    String.raw`\bplacePhotoFailureSignalSrc\b`,
    String.raw`\busePlacePhotoState\b`,
    String.raw`\bPlacePhotoScope\b`,
  ].join("|"),
);

/**
 * Files that mention the proxy without painting it through the signal, each
 * with the reason. Data helpers build or inspect URLs that a painter later
 * renders through RadiusPhoto; pending painters mirror the PENDING list in
 * scripts/check-place-photo-usage.mjs and leave here when they migrate.
 */
const PLACE_PHOTO_EXCEPTIONS: Record<string, string> = {
  // Routes around the proxy serve URLs or bytes; they paint nothing. (The
  // proxy route itself reads fallback=signal, so it needs no entry.)
  "src/app/api/place/[slug]/enrich/route.ts": "Returns a proxy URL as JSON data for a painter to render.",
  "src/app/sw.js/route.ts": "Lists the proxy as a cacheable image prefix in the service worker.",
  // Data and policy helpers that build or inspect URLs without painting them.
  "src/lib/loaders/places.ts": "Builds catalog photo URLs; surfaces paint them through RadiusPhoto.",
  "src/lib/loaders/eventThumb.ts": "Classifies a URL as a proxy photo; paints nothing.",
  "src/lib/format/img.ts": "Narrows the proxy width; RadiusPhoto calls it before adding the signal.",
  "src/lib/google-photo-policy.ts": "Parses proxy URLs to apply the Google publishing policy.",
  "src/components/event/eventVisuals.ts": "Classifies event images; the event surfaces paint them.",
  // BreweryPhoto's sources come from src/lib/beer/brewery-media.ts, which sets
  // fallback=signal, and it swaps to its local plate on a 1x1 decode itself.
  "src/components/beer/BreweryPhoto.tsx": "Painted from brewery-media.ts URLs that already carry the signal.",
  // Pending migration to RadiusPhoto (the PENDING list in the lint script).
  "src/components/ui/PhotoLightbox.tsx": "Pending migration to RadiusPhoto.",
  "src/components/place/PlacePhoto.tsx": "Pending migration to RadiusPhoto.",
  "src/components/plan/PlanBuilder.tsx": "Pending migration to RadiusPhoto.",
  "src/components/today/PhotoMosaic.tsx": "Pending migration to RadiusPhoto.",
  "src/app/admin/discovered-review/page.tsx": "Internal review tool, not a public surface.",
};

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) walk(path, out);
    else if (SOURCE.test(entry.name) && !NOT_SHIPPED.test(entry.name)) out.push(path);
  }
  return out;
}

function proxyFiles(): Map<string, string> {
  const files = new Map<string, string>();
  for (const path of walk(join(ROOT, SCAN_ROOT))) {
    const code = stripComments(readFileSync(path, "utf8"));
    if (code.includes(PROXY_PATH)) {
      files.set(relative(ROOT, path).split(sep).join("/"), code);
    }
  }
  return files;
}

describe("place-photo failure signal", () => {
  const files = proxyFiles();

  it("finds the files that build proxy URLs", () => {
    // A sanity floor: the scan itself must be looking at the real tree.
    expect(files.has("src/components/ui/RadiusPhoto.tsx")).toBe(true);
    expect(files.has("src/lib/loaders/places.ts")).toBe(true);
  });

  it("paints every proxy URL through RadiusPhoto or the failure signal", () => {
    const offenders = [...files]
      .filter(([file, code]) => !SIGNAL_CONTRACT.test(code) && !(file in PLACE_PHOTO_EXCEPTIONS))
      .map(([file]) => file);
    expect(offenders).toEqual([]);
  });

  it("keeps the exception list honest", () => {
    const stale = Object.keys(PLACE_PHOTO_EXCEPTIONS).filter((file) => {
      const code = files.get(file);
      return code === undefined || SIGNAL_CONTRACT.test(code);
    });
    expect(stale).toEqual([]);
    for (const reason of Object.values(PLACE_PHOTO_EXCEPTIONS)) {
      expect(reason.trim().length).toBeGreaterThan(10);
    }
  });

  it("routes the happy-hour cover and the map list through RadiusPhoto", () => {
    for (const file of [
      "src/components/happy/HappyHourGuide.tsx",
      "src/components/map/MapList.tsx",
    ]) {
      const code = stripComments(readFileSync(join(ROOT, file), "utf8"));
      expect(code, file).toMatch(/\bRadiusPhoto\b/);
      expect(code, file).not.toMatch(/from "next\/image"/);
    }
  });
});
