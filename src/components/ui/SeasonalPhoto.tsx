import Image from "next/image";
import path from "node:path";
import { promises as fs } from "node:fs";

/**
 * SeasonalPhoto — picks a real Frederick County photograph for the
 * current season, with daily rotation within season.
 *
 * Server component. Reads the manifest written by
 * scripts/optimize-seasonal-photos.ts at build/request time so we
 * always have an authoritative list of what's actually on disk.
 *
 * Picking strategy:
 *   1. Resolve the active season from the current Eastern-time date.
 *   2. Filter the manifest to that season's set.
 *   3. Hash the day (YYYY-MM-DD) into a seed; index modulo the
 *      count selects the photo. Same photo all day, rotates daily.
 *
 * If the manifest doesn't exist yet (fresh checkout, before the
 * optimize script has run) or the season set is empty, the
 * component renders the fallback gradient `fallback` prop or
 * `null`. Never breaks the page.
 *
 * Uses next/image with width/height for proper layout, and a
 * blur placeholder built from the dominant-color hex captured at
 * optimization time so the swap-in is calm, not janky.
 */

type ManifestEntry = {
  slug: string;
  src: string;
  width: number;
  height: number;
  blur: string;
};

type Manifest = {
  spring: ManifestEntry[];
  summer: ManifestEntry[];
  fall: ManifestEntry[];
  winter: ManifestEntry[];
  generatedAt: string;
};

let cachedManifest: Manifest | null = null;
async function loadManifest(): Promise<Manifest | null> {
  if (cachedManifest) return cachedManifest;
  try {
    const manifestPath = path.join(
      process.cwd(),
      "public",
      "images",
      "seasons",
      "manifest.json",
    );
    const raw = await fs.readFile(manifestPath, "utf-8");
    cachedManifest = JSON.parse(raw) as Manifest;
    return cachedManifest;
  } catch {
    // No manifest yet — script hasn't run, or images not on disk.
    return null;
  }
}

/** Determine the season from an Eastern-time date. Astronomical
 *  ranges (rough but readable): spring Mar 20 → Jun 20, summer
 *  Jun 21 → Sep 22, fall Sep 23 → Dec 20, winter Dec 21 → Mar 19. */
function seasonOf(d: Date): "spring" | "summer" | "fall" | "winter" {
  const m = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/New_York",
    month: "2-digit",
    day: "2-digit",
  }).format(d);
  const month = Number(m.slice(0, 2));
  const day = Number(m.slice(3, 5));
  if ((month === 3 && day >= 20) || (month >= 4 && month <= 5) || (month === 6 && day <= 20)) return "spring";
  if ((month === 6 && day >= 21) || (month >= 7 && month <= 8) || (month === 9 && day <= 22)) return "summer";
  if ((month === 9 && day >= 23) || (month >= 10 && month <= 11) || (month === 12 && day <= 20)) return "fall";
  return "winter";
}

function easternDayKey(d: Date): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);
}

function seedHash(s: string): number {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h * 33) ^ s.charCodeAt(i)) | 0;
  return Math.abs(h);
}

/** Generate a 1x1 SVG with the dominant color, base64-encoded.
 *  next/image accepts this as a `placeholder="blur"` / `blurDataURL`
 *  source — same fade-in behavior as a generated blurDataURL but
 *  without needing to extract one from the actual image bytes. */
function blurDataUrlFor(hex: string): string {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="8" height="5"><rect width="8" height="5" fill="${hex}"/></svg>`;
  // Buffer is server-only; encoded once per render and small.
  const b64 = Buffer.from(svg).toString("base64");
  return `data:image/svg+xml;base64,${b64}`;
}

export type SeasonalPhotoProps = {
  /** Force a season instead of using the current date. Useful for
   *  story-style previews or testing on /about. */
  season?: "spring" | "summer" | "fall" | "winter" | "auto";
  /** Class applied to the wrapper. The image fills it. */
  className?: string;
  /** Optional alt text. Defaults to a generic, decorative-leaning
   *  description because these are intentionally ambient. */
  alt?: string;
  /** next/image priority flag — pass true for above-the-fold hero
   *  placements so the photo is preloaded. */
  priority?: boolean;
  /** sizes attribute for responsive serving. Defaults to a full-
   *  viewport assumption; pass narrower for cards / chips. */
  sizes?: string;
};

export default async function SeasonalPhoto({
  season = "auto",
  className = "",
  alt = "Frederick County",
  priority = false,
  sizes = "100vw",
}: SeasonalPhotoProps) {
  const manifest = await loadManifest();
  if (!manifest) return null;

  const resolvedSeason = season === "auto" ? seasonOf(new Date()) : season;
  const set = manifest[resolvedSeason];
  if (!set || set.length === 0) return null;

  // Deterministic per-day pick within the season's set.
  const seed = seedHash(easternDayKey(new Date()) + ":" + resolvedSeason);
  const pick = set[seed % set.length];

  return (
    <div className={className}>
      <Image
        src={pick.src}
        alt={alt}
        width={pick.width}
        height={pick.height}
        priority={priority}
        sizes={sizes}
        placeholder="blur"
        blurDataURL={blurDataUrlFor(pick.blur)}
        className="h-full w-full object-cover"
      />
    </div>
  );
}
