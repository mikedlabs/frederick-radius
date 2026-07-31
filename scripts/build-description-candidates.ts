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
import { isDescriptionMechanicallySafe } from "@/lib/copy-quality";
import { businessInfoSourceKind } from "./lib/business-info-source-policy";

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

function candidateSentence(
  name: string,
  value: string | undefined,
): string | null {
  const text = value?.replace(/\s+/g, " ").trim() ?? "";
  if (text.length < 35 || text.length > 220 || !/[.!?]$/.test(text)) return null;
  if (!isDescriptionMechanicallySafe(name, text)) return null;
  return text;
}

function main(): void {
  const dryRun = process.argv.includes("--dry-run");
  const business = JSON.parse(readFileSync(BUSINESS_PATH, "utf8")) as Record<string, BusinessInfo>;
  const existing = JSON.parse(readFileSync(OUT_PATH, "utf8")) as Record<string, PlaceDescriptionEntry>;
  const publicSlugs = new Set(publicPlaces().map((place) => place.slug));

  let added = 0;
  let refreshed = 0;
  const skipped = {
    unresolved_place: 0,
    not_public: 0,
    missing_evidence_name: 0,
    invalid_or_unsafe_sentence: 0,
    missing_source_url: 0,
    non_https_source: 0,
    ineligible_source: 0,
    unsafe_name_match: 0,
    protected_status: 0,
  };

  for (const [slug, info] of Object.entries(business)) {
    // Old ingest rows may use a folded/legacy slug. Resolve through the same
    // canonical alias map as public place pages, then write only to the
    // surviving slug so duplicate records cannot create duplicate copy.
    const place = getPlaceBySlug(slug);
    if (!place) {
      skipped.unresolved_place += 1;
      continue;
    }
    if (!publicSlugs.has(place.slug)) {
      skipped.not_public += 1;
      continue;
    }
    if (!info.name) {
      skipped.missing_evidence_name += 1;
      continue;
    }
    const blurb = candidateSentence(info.name, info.known_for);
    if (!blurb) {
      skipped.invalid_or_unsafe_sentence += 1;
      continue;
    }
    const sourceUrl = info.source?.url;
    if (!sourceUrl) {
      skipped.missing_source_url += 1;
      continue;
    }
    if (!/^https:\/\//.test(sourceUrl)) {
      skipped.non_https_source += 1;
      continue;
    }
    const sourceKind = businessInfoSourceKind(sourceUrl, place.name);
    if (!sourceKind) {
      skipped.ineligible_source += 1;
      continue;
    }
    if (!namesMatch(place.name, info.name)) {
      skipped.unsafe_name_match += 1;
      continue;
    }

    const targetSlug = place.slug;
    const prior = existing[targetSlug];
    if (prior?.status === "approved" || prior?.status === "rejected") {
      skipped.protected_status += 1;
      continue;
    }
    const next: PlaceDescriptionEntry = {
      blurb,
      status: "candidate",
      source: {
        kind: sourceKind,
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
  if (!dryRun) {
    writeFileSync(OUT_PATH, `${JSON.stringify(sorted, null, 2)}\n`);
  }
  console.log(
    `descriptions${dryRun ? " dry run" : ""}: ${added} candidate(s) added, ` +
      `${refreshed} refreshed, ${Object.keys(sorted).length} total.`,
  );
  console.log(`skipped: ${JSON.stringify(skipped)}`);
}

main();
