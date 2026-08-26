/**
 * Read-only pre-flight for source-backed place-description candidates.
 *
 * The default command groups the queue into mechanically clean candidates and
 * entries that need closer editorial attention. It uses the same copy gates as
 * production but never publishes on its own. Explicit --approve or --reject
 * arguments change only the named candidate records; the public place artifact
 * still has to be rebuilt and pass the normal release gates afterwards.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { classifyDescription, isDescriptionMechanicallySafe } from "../src/lib/copy-quality";
import { lintSourceText } from "./style-lint";
import { namesMatch } from "./build-description-candidates";

const REGISTRY_PATH = resolve("src/data/descriptions.json");
const PLACES_PATH = resolve("src/data/places-client.json");

type RegistryEntry = {
  blurb: string;
  status: "candidate" | "approved" | "rejected";
  source?: { kind?: string; url?: string; fetched_at?: string };
  generated_at?: string;
  reviewed_at?: string;
  reviewer_note?: string;
};

type Registry = Record<string, RegistryEntry>;
type Place = { slug: string; name: string; category?: string; city?: string };

const CHAIN_SCOPE = /\b(locations|nationwide|across (?:the )?(?:country|states?)|multiple (?:states|locations))\b/i;

export type CandidateReview = {
  slug: string;
  name: string;
  blurb: string;
  flags: string[];
};

export function renderCandidateReviewSummary(reviews: CandidateReview[]): string {
  const flagged = reviews.filter((review) => review.flags.length > 0);
  const clean = reviews.filter((review) => review.flags.length === 0);
  const lines = [
    "## Description candidate review",
    "",
    `**${reviews.length} pending:** ${clean.length} mechanically clean; ${flagged.length} need closer review.`,
    "",
    "> Mechanical checks are decision support only. Every candidate still requires source and editorial review before approval.",
  ];

  if (flagged.length > 0) {
    lines.push("", "### Needs closer review", "", "| Place | Reason |", "| --- | --- |");
    for (const review of flagged) {
      lines.push(
        `| ${review.name.replaceAll("|", "\\|")} | ${review.flags.join("; ").replaceAll("|", "\\|")} |`,
      );
    }
  }

  if (clean.length > 0) {
    lines.push("", "<details>", `<summary>${clean.length} mechanically clean candidates</summary>`, "");
    for (const review of clean) lines.push(`- **${review.name}** (\`${review.slug}\`)`);
    lines.push("", "</details>");
  }

  return `${lines.join("\n")}\n`;
}

export function reviewCandidate(
  slug: string,
  blurb: string,
  place: Place | undefined,
  source: RegistryEntry["source"],
): CandidateReview {
  const flags: string[] = [];
  const name = place?.name ?? slug;
  const trimmed = blurb.replace(/\s+/g, " ").trim();

  const voiceFindings = lintSourceText(
    "description-candidate.ts",
    `const blurb = ${JSON.stringify(trimmed)};`,
  );
  for (const finding of voiceFindings) flags.push(`voice: ${finding.rule}`);

  if (!isDescriptionMechanicallySafe(name, trimmed)) {
    flags.push("reads as scraped directory copy");
  }
  const quality = classifyDescription(name, trimmed);
  if (quality === "scraped" || quality === "none") {
    flags.push(`copy-quality: ${quality}`);
  }

  if (!place) flags.push("no matching place in the public catalog");
  else if (!namesMatch(place.name, trimmed)) flags.push("blurb does not name the place");

  if (!source?.url) flags.push("no source URL");
  if (source?.url && !/^https:\/\//i.test(source.url)) flags.push("source is not HTTPS");
  if (source?.kind && source.kind !== "business_website" && source.kind !== "official_source") {
    flags.push(`source kind: ${source.kind}`);
  }
  if (trimmed.length < 40) flags.push("shorter than 40 characters");
  if (trimmed.length > 320) flags.push("longer than 320 characters");
  if (!/[.!?]$/.test(trimmed)) flags.push("does not end a sentence");
  if (CHAIN_SCOPE.test(trimmed)) flags.push("describes the company, not this location");

  return { slug, name, blurb: trimmed, flags: [...new Set(flags)] };
}

function loadRegistry(): Registry {
  return JSON.parse(readFileSync(REGISTRY_PATH, "utf8")) as Registry;
}

function requestedSlugs(args: string[], flag: "--approve" | "--reject"): string[] {
  const index = args.indexOf(flag);
  if (index < 0) return [];
  return args.slice(index + 1).filter((value) => !value.startsWith("--"));
}

function applyDecision(
  registry: Registry,
  slugs: string[],
  decision: "approved" | "rejected",
): number {
  const now = new Date().toISOString();
  let changed = 0;
  for (const slug of slugs) {
    const entry = registry[slug];
    if (!entry) {
      console.error(`  x ${slug}: not in the description registry`);
      continue;
    }
    if (entry.status !== "candidate") {
      console.error(`  - ${slug}: already ${entry.status}`);
      continue;
    }
    entry.status = decision;
    entry.reviewed_at = now;
    entry.reviewer_note =
      decision === "approved"
        ? "Editor-approved after source review; the mechanical pre-flight supplied decision support only."
        : "Editor-rejected after source review; the mechanical pre-flight supplied decision support only.";
    changed += 1;
    console.log(`  ${decision === "approved" ? "+" : "-"} ${slug}`);
  }
  return changed;
}

function main(): void {
  const args = process.argv.slice(2);
  const approve = requestedSlugs(args, "--approve");
  const reject = requestedSlugs(args, "--reject");
  if (approve.length > 0 && reject.length > 0) {
    throw new Error("Use --approve or --reject in one run, not both.");
  }

  const registry = loadRegistry();
  if (approve.length > 0 || reject.length > 0) {
    const decision = approve.length > 0 ? "approved" : "rejected";
    const changed = applyDecision(registry, approve.length > 0 ? approve : reject, decision);
    if (changed > 0) {
      writeFileSync(REGISTRY_PATH, `${JSON.stringify(registry, null, 2)}\n`);
      console.log(`\n${changed} marked ${decision}. Rebuild client places and run the release gates next.`);
    }
    return;
  }

  const places = new Map(
    (JSON.parse(readFileSync(PLACES_PATH, "utf8")) as Place[]).map((place) => [place.slug, place]),
  );
  const reviews = Object.entries(registry)
    .filter(([, entry]) => entry.status === "candidate")
    .map(([slug, entry]) => reviewCandidate(slug, entry.blurb, places.get(slug), entry.source));
  const flagged = reviews.filter((review) => review.flags.length > 0);
  const clean = reviews.filter((review) => review.flags.length === 0);

  if (args.includes("--github-summary")) {
    process.stdout.write(renderCandidateReviewSummary(reviews));
    return;
  }

  console.log(
    `description candidates: ${reviews.length} pending; ${clean.length} mechanically clean; ${flagged.length} need closer review.\n`,
  );
  if (flagged.length > 0) {
    console.log("NEEDS CLOSER REVIEW");
    for (const review of flagged) {
      console.log(`\n  ${review.name} (${review.slug})`);
      console.log(`    ${review.blurb}`);
      for (const flag of review.flags) console.log(`    ! ${flag}`);
    }
    console.log("");
  }
  if (clean.length > 0) {
    console.log("MECHANICALLY CLEAN; EDITORIAL REVIEW IS STILL REQUIRED");
    for (const review of clean) {
      console.log(`\n  ${review.name} (${review.slug})`);
      console.log(`    ${review.blurb}`);
    }
  }
}

if (process.argv[1]?.endsWith("review-description-candidates.ts")) main();
