/**
 * Build reviewable Radius-description candidates from first-party evidence.
 *
 * This never publishes copy. It reads the business's own website extraction,
 * requires a confident place-name match, and writes status="candidate" to
 * descriptions.json. An editor must change the status to "approved" before
 * the canonical place loader will expose the sentence.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { getPlaceBySlug, publicPlaces } from "@/lib/loaders/places";
import type { PlaceDescriptionEntry } from "@/lib/loaders/placeDescriptions";

type BusinessInfo = {
  known_for?: string;
  name?: string;
  source?: { url?: string; fetchedAt?: string };
};

const BUSINESS_PATH = resolve("src/data/business-info.json");
const OUT_PATH = resolve("src/data/descriptions.json");

function normalizeName(value: string): string[] {
  return value
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/\b(the|llc|inc|company|co|cafe|restaurant|frederick|md|maryland)\b/g, " ")
    .replace(/[^a-z0-9 ]/g, " ")
    .split(/\s+/)
    .filter((token) => token.length > 2);
}

export function namesMatch(placeName: string, evidenceName: string): boolean {
  const place = new Set(normalizeName(placeName));
  const evidence = new Set(normalizeName(evidenceName));
  if (place.size === 0 || evidence.size === 0) return false;

  let shared = 0;
  for (const token of place) if (evidence.has(token)) shared += 1;
  return shared / Math.min(place.size, evidence.size) >= 0.6;
}

function candidateSentence(value: string | undefined): string | null {
  const text = value?.replace(/\s+/g, " ").trim() ?? "";
  if (text.length < 35 || text.length > 220 || !/[.!?]$/.test(text)) return null;
  return text;
}

function main(): void {
  const business = JSON.parse(readFileSync(BUSINESS_PATH, "utf8")) as Record<string, BusinessInfo>;
  const existing = JSON.parse(readFileSync(OUT_PATH, "utf8")) as Record<string, PlaceDescriptionEntry>;
  const publicSlugs = new Set(publicPlaces().map((place) => place.slug));

  let added = 0;
  let refreshed = 0;
  let rejectedMatch = 0;

  for (const [slug, info] of Object.entries(business)) {
    // Old ingest rows may use a folded/legacy slug. Resolve through the same
    // canonical alias map as public place pages, then write only to the
    // surviving slug so duplicate records cannot create duplicate copy.
    const place = getPlaceBySlug(slug);
    const blurb = candidateSentence(info.known_for);
    const sourceUrl = info.source?.url;
    if (!place || !publicSlugs.has(place.slug) || !info.name || !blurb || !sourceUrl || !/^https:\/\//.test(sourceUrl)) continue;
    if (!namesMatch(place.name, info.name)) {
      rejectedMatch += 1;
      continue;
    }

    const targetSlug = place.slug;
    const prior = existing[targetSlug];
    if (prior?.status === "approved" || prior?.status === "rejected") continue;
    const next: PlaceDescriptionEntry = {
      blurb,
      status: "candidate",
      source: {
        kind: "business_website",
        url: sourceUrl,
        fetched_at: info.source?.fetchedAt,
      },
      generated_at: info.source?.fetchedAt,
    };
    if (prior) refreshed += 1;
    else added += 1;
    existing[targetSlug] = next;
  }

  const sorted = Object.fromEntries(
    Object.entries(existing).sort(([a], [b]) => a.localeCompare(b)),
  );
  writeFileSync(OUT_PATH, `${JSON.stringify(sorted, null, 2)}\n`);
  console.log(
    `descriptions: ${added} candidate(s) added, ${refreshed} refreshed, ` +
      `${rejectedMatch} unsafe name match(es) skipped, ${Object.keys(sorted).length} total.`,
  );
}

main();
