/**
 * Builds a provenance-first review queue for brewery and food-truck media.
 *
 * This discovers one likely identity mark and one representative image from
 * each vendor-controlled website. Downloads stay local and are never copied
 * into `public/` automatically. A public page proves source, not permission to
 * republish its photography.
 *
 * Usage:
 *   npm run audit:vendor-media
 *   npm run audit:vendor-media -- --kind=food-truck
 *   npm run audit:vendor-media -- --kind=brewery --slug=attaboy-beer-frederick
 */

import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import { BREWERY_EXPERIENCES } from "../src/data/brewery-experiences";
import { FOOD_TRUCKS } from "../src/data/food-trucks";

type VendorKind = "brewery" | "food-truck";
type AssetRole = "mark" | "photo";
type ReviewStatus =
  | "downloaded-review-required"
  | "no-candidate"
  | "owner-upload-required"
  | "fetch-failed";

type Vendor = {
  kind: VendorKind;
  slug: string;
  name: string;
  website: string | null;
  social: string[];
};

type Candidate = {
  url: string;
  evidence: string;
  score: number;
};

type AssetResult = {
  role: AssetRole;
  status: ReviewStatus;
  sourceUrl?: string;
  sourcePage?: string;
  evidence?: string;
  localReviewFile?: string;
  contentType?: string;
  width?: number;
  height?: number;
  note: string;
};

type VendorResult = {
  kind: VendorKind;
  slug: string;
  name: string;
  officialPage: string | null;
  socialPages: string[];
  checkedAt: string;
  pageStatus: number | null;
  assets: AssetResult[];
};

const ROOT = process.cwd();
const REVIEW_ROOT = path.join(ROOT, "audit", "vendor-media");
const DOWNLOAD_ROOT = path.join(REVIEW_ROOT, "downloads");
const MANIFEST_PATH = path.join(REVIEW_ROOT, "manifest.json");
const USER_AGENT =
  "FrederickRadiusMediaAudit/1.0 (+https://frederickradius.app/trust)";
const MAX_BYTES = 8 * 1024 * 1024;
const FETCH_TIMEOUT_MS = 18_000;

function argValue(name: string): string | null {
  const prefix = `--${name}=`;
  return process.argv.find((arg) => arg.startsWith(prefix))?.slice(prefix.length) ?? null;
}

function isSocialUrl(value: string): boolean {
  try {
    const host = new URL(value).hostname.replace(/^www\./, "");
    return [
      "facebook.com",
      "instagram.com",
      "threads.net",
      "tiktok.com",
      "x.com",
      "twitter.com",
    ].some((domain) => host === domain || host.endsWith(`.${domain}`));
  } catch {
    return false;
  }
}

function normalizePageUrl(value: string): string | null {
  try {
    const url = new URL(value);
    url.hash = "";
    return url.toString();
  } catch {
    return null;
  }
}

function entities(value: string): string {
  return value
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, "\"")
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">");
}

function absoluteUrl(value: string, base: string): string | null {
  const decoded = entities(value.trim());
  if (!decoded || decoded.startsWith("data:") || decoded.startsWith("blob:")) return null;
  try {
    const url = new URL(decoded, base);
    if (!["http:", "https:"].includes(url.protocol)) return null;
    return url.toString();
  } catch {
    return null;
  }
}

function attributes(tag: string): Record<string, string> {
  const output: Record<string, string> = {};
  const pattern = /([:\w-]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/g;
  for (const match of tag.matchAll(pattern)) {
    output[match[1].toLowerCase()] = match[2] ?? match[3] ?? match[4] ?? "";
  }
  return output;
}

function addCandidate(
  map: Map<string, Candidate>,
  rawUrl: string | undefined,
  base: string,
  evidence: string,
  score: number,
): void {
  if (!rawUrl) return;
  const url = absoluteUrl(rawUrl, base);
  if (!url) return;
  const lowered = url.toLowerCase();
  if (
    lowered.includes("spacer") ||
    lowered.includes("pixel") ||
    lowered.includes("tracking") ||
    lowered.includes("analytics")
  ) return;
  const prior = map.get(url);
  if (!prior || score > prior.score) map.set(url, { url, evidence, score });
}

function valuesFromJsonLd(value: unknown, key: "logo" | "image"): string[] {
  const found: string[] = [];
  const visit = (node: unknown): void => {
    if (Array.isArray(node)) {
      node.forEach(visit);
      return;
    }
    if (!node || typeof node !== "object") return;
    const record = node as Record<string, unknown>;
    const candidate = record[key];
    if (typeof candidate === "string") found.push(candidate);
    if (Array.isArray(candidate)) {
      candidate.forEach((entry) => {
        if (typeof entry === "string") found.push(entry);
        else if (entry && typeof entry === "object") {
          const url = (entry as Record<string, unknown>).url;
          if (typeof url === "string") found.push(url);
        }
      });
    } else if (candidate && typeof candidate === "object") {
      const url = (candidate as Record<string, unknown>).url;
      if (typeof url === "string") found.push(url);
    }
    Object.values(record).forEach(visit);
  };
  visit(value);
  return found;
}

function discoverCandidates(html: string, pageUrl: string): Record<AssetRole, Candidate[]> {
  const marks = new Map<string, Candidate>();
  const photos = new Map<string, Candidate>();

  for (const tag of html.match(/<meta\b[^>]*>/gi) ?? []) {
    const attr = attributes(tag);
    const key = (attr.property ?? attr.name ?? "").toLowerCase();
    if (key === "og:image" || key === "og:image:url") {
      addCandidate(photos, attr.content, pageUrl, key, 100);
    } else if (key === "twitter:image" || key === "twitter:image:src") {
      addCandidate(photos, attr.content, pageUrl, key, 90);
    }
  }

  for (const tag of html.match(/<link\b[^>]*>/gi) ?? []) {
    const attr = attributes(tag);
    const rel = (attr.rel ?? "").toLowerCase();
    if (rel.includes("apple-touch-icon")) {
      addCandidate(marks, attr.href, pageUrl, "apple-touch-icon", 86);
    } else if (rel.split(/\s+/).includes("icon")) {
      const size = Number.parseInt((attr.sizes ?? "").split("x")[0], 10);
      addCandidate(
        marks,
        attr.href,
        pageUrl,
        "site icon",
        Number.isFinite(size) ? 60 + Math.min(size, 25) : 60,
      );
    }
  }

  const jsonLdBlocks =
    html.match(/<script\b[^>]*type=["']application\/ld\+json["'][^>]*>[\s\S]*?<\/script>/gi) ?? [];
  for (const block of jsonLdBlocks) {
    const body = block.replace(/^<script\b[^>]*>/i, "").replace(/<\/script>$/i, "").trim();
    try {
      const json = JSON.parse(entities(body)) as unknown;
      valuesFromJsonLd(json, "logo").forEach((url) =>
        addCandidate(marks, url, pageUrl, "structured-data logo", 120),
      );
      valuesFromJsonLd(json, "image").forEach((url) =>
        addCandidate(photos, url, pageUrl, "structured-data image", 96),
      );
    } catch {
      // Invalid third-party JSON-LD should not abort the rest of the page.
    }
  }

  for (const tag of html.match(/<img\b[^>]*>/gi) ?? []) {
    const attr = attributes(tag);
    const raw = attr.src ?? attr["data-src"] ?? attr["data-lazy-src"];
    const description =
      `${attr.alt ?? ""} ${attr.class ?? ""} ${attr.id ?? ""} ${raw ?? ""}`.toLowerCase();
    const width = Number.parseInt(attr.width ?? "0", 10);
    const height = Number.parseInt(attr.height ?? "0", 10);
    const likelyLogo = /\b(logo|brand|wordmark|identity|site-title)\b/.test(description);
    if (likelyLogo) {
      addCandidate(marks, raw, pageUrl, `image tag: ${attr.alt || "logo-like filename/class"}`, 104);
    }
    const tiny = (width > 0 && width < 180) || (height > 0 && height < 140);
    if (!likelyLogo && !tiny) {
      addCandidate(photos, raw, pageUrl, `image tag: ${attr.alt || "unlabeled"}`, 42);
    }
  }

  return {
    mark: [...marks.values()].sort((a, b) => b.score - a.score),
    photo: [...photos.values()].sort((a, b) => b.score - a.score),
  };
}

async function fetchWithTimeout(url: string): Promise<Response> {
  return fetch(url, {
    headers: {
      "User-Agent": USER_AGENT,
      Accept:
        "text/html,application/xhtml+xml,image/avif,image/webp,image/png,image/jpeg,image/svg+xml,*/*;q=0.5",
    },
    redirect: "follow",
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });
}

async function downloadCandidate(
  vendor: Vendor,
  pageUrl: string,
  role: AssetRole,
  candidates: Candidate[],
): Promise<AssetResult> {
  for (const candidate of candidates.slice(0, 8)) {
    try {
      const response = await fetchWithTimeout(candidate.url);
      if (!response.ok) continue;
      const declaredLength = Number(response.headers.get("content-length") ?? "0");
      if (declaredLength > MAX_BYTES) continue;
      const contentType = (response.headers.get("content-type") ?? "").split(";")[0].toLowerCase();
      if (!contentType.startsWith("image/")) continue;
      const bytes = Buffer.from(await response.arrayBuffer());
      if (bytes.byteLength === 0 || bytes.byteLength > MAX_BYTES) continue;

      const image = sharp(bytes, { failOn: "none" });
      const meta = await image.metadata();
      if (!meta.width || !meta.height) continue;
      if (role === "photo" && (meta.width < 500 || meta.height < 280)) continue;

      const vendorDir = path.join(DOWNLOAD_ROOT, vendor.kind, vendor.slug);
      await mkdir(vendorDir, { recursive: true });
      const fileName = role === "mark" ? "mark.png" : "photo.webp";
      const outputPath = path.join(vendorDir, fileName);
      if (role === "mark") {
        await image
          .resize({ width: 720, height: 720, fit: "inside", withoutEnlargement: true })
          .png({ compressionLevel: 9 })
          .toFile(outputPath);
      } else {
        await image
          .rotate()
          .resize({ width: 1600, height: 1000, fit: "cover", withoutEnlargement: true })
          .webp({ quality: 84 })
          .toFile(outputPath);
      }
      const optimized = await sharp(outputPath).metadata();
      return {
        role,
        status: "downloaded-review-required",
        sourceUrl: candidate.url,
        sourcePage: pageUrl,
        evidence: candidate.evidence,
        localReviewFile: path.relative(ROOT, outputPath),
        contentType,
        width: optimized.width,
        height: optimized.height,
        note:
          role === "mark"
            ? "Official-site identity candidate. Confirm it is the current vendor mark before publishing."
            : "Official-site photo candidate. Written permission or a compatible license is required before publishing.",
      };
    } catch {
      // Try the next candidate. One broken lazy-loaded image should not block a vendor.
    }
  }
  return {
    role,
    status: "no-candidate",
    sourcePage: pageUrl,
    note: `No usable ${
      role === "mark" ? "identity mark" : "representative photo"
    } was found on the official page.`,
  };
}

function vendors(): Vendor[] {
  const breweries: Vendor[] = BREWERY_EXPERIENCES.map((entry) => ({
    kind: "brewery",
    slug: entry.slug,
    name: entry.slug.replace(/-/g, " "),
    website:
      isSocialUrl(entry.sourceUrl) || entry.sourceUrl.includes("untappd.com")
        ? null
        : entry.sourceUrl,
    social: entry.sourceUrl.includes("untappd.com") ? [entry.sourceUrl] : [],
  }));
  const trucks: Vendor[] = FOOD_TRUCKS.map((entry) => ({
    kind: "food-truck",
    slug: entry.slug,
    name: entry.name,
    website: entry.website && !isSocialUrl(entry.website) ? entry.website : null,
    social: [entry.instagram, entry.facebook].filter(
      (value): value is string => Boolean(value),
    ),
  }));
  return [...breweries, ...trucks];
}

async function auditVendor(vendor: Vendor, checkedAt: string): Promise<VendorResult> {
  const base: VendorResult = {
    kind: vendor.kind,
    slug: vendor.slug,
    name: vendor.name,
    officialPage: vendor.website,
    socialPages: vendor.social,
    checkedAt,
    pageStatus: null,
    assets: [],
  };
  if (!vendor.website) {
    const note =
      vendor.social.length > 0
        ? "Only a social profile is recorded. Ask the owner for a current media kit or approved upload."
        : "No vendor-controlled website or social profile is recorded.";
    base.assets = (["mark", "photo"] as const).map((role) => ({
      role,
      status: "owner-upload-required",
      note,
    }));
    return base;
  }

  try {
    const response = await fetchWithTimeout(vendor.website);
    base.pageStatus = response.status;
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const contentType = response.headers.get("content-type") ?? "";
    if (!contentType.includes("text/html")) {
      throw new Error(`Expected HTML, received ${contentType}`);
    }
    const html = await response.text();
    const finalUrl = normalizePageUrl(response.url) ?? vendor.website;
    base.officialPage = finalUrl;
    const discovered = discoverCandidates(html, finalUrl);
    base.assets = await Promise.all([
      downloadCandidate(vendor, finalUrl, "mark", discovered.mark),
      downloadCandidate(vendor, finalUrl, "photo", discovered.photo),
    ]);
    return base;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    base.assets = (["mark", "photo"] as const).map((role) => ({
      role,
      status: "fetch-failed",
      sourcePage: vendor.website ?? undefined,
      note: `The official page could not be audited: ${message}`,
    }));
    return base;
  }
}

async function main(): Promise<void> {
  const kindArg = argValue("kind");
  const slugArg = argValue("slug");
  if (kindArg && !["brewery", "food-truck"].includes(kindArg)) {
    throw new Error("--kind must be brewery or food-truck");
  }

  const selected = vendors().filter(
    (vendor) =>
      (!kindArg || vendor.kind === kindArg) &&
      (!slugArg || vendor.slug === slugArg),
  );
  if (selected.length === 0) throw new Error("No vendors matched the requested filters.");

  await mkdir(REVIEW_ROOT, { recursive: true });
  const checkedAt = new Date().toISOString();
  const results: VendorResult[] = [];
  for (const vendor of selected) {
    process.stdout.write(`Auditing ${vendor.kind} ${vendor.name}... `);
    const result = await auditVendor(vendor, checkedAt);
    results.push(result);
    const downloaded = result.assets.filter(
      (asset) => asset.status === "downloaded-review-required",
    ).length;
    process.stdout.write(`${downloaded}/2 candidates downloaded\n`);
  }

  const manifest = {
    generatedAt: checkedAt,
    policy: {
      marks: "Identity candidates must be checked as current before public use.",
      photos:
        "Website discovery does not grant reuse. Publish only after owner approval or license review.",
      social:
        "Facebook and Instagram are not scraped. Vendors without a website need an owner media-kit upload.",
    },
    filters: { kind: kindArg, slug: slugArg },
    vendors: results,
  };
  await writeFile(MANIFEST_PATH, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");

  const foundMarks = results.filter((entry) =>
    entry.assets.some(
      (asset) => asset.role === "mark" && asset.status === "downloaded-review-required",
    ),
  ).length;
  const foundPhotos = results.filter((entry) =>
    entry.assets.some(
      (asset) => asset.role === "photo" && asset.status === "downloaded-review-required",
    ),
  ).length;
  process.stdout.write(
    `\nManifest: ${path.relative(ROOT, MANIFEST_PATH)}\n` +
      `Vendors checked: ${results.length}\n` +
      `Mark candidates: ${foundMarks}\n` +
      `Photo candidates: ${foundPhotos}\n`,
  );
}

void main().catch((error: unknown) => {
  const message = error instanceof Error ? error.stack ?? error.message : String(error);
  process.stderr.write(`${message}\n`);
  process.exitCode = 1;
});
