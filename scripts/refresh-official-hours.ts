/** Bounded first-party refresh. A failed fetch/parse never rewrites the last good artifact or observation date. */
import { readFileSync, writeFileSync, renameSync, appendFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { collectMerchantOfficialHours, fetchMerchantHoursPage } from "./lib/merchant-official-hours";
import { FCPL_HOURS_URL, FCPL_CLOSURES_URL, validateOfficialHoursArtifact, type OfficialHoursArtifact } from "../src/lib/official-hours";
import { fetchOfficialHoursPage, parseFcplOfficialHours, officialHoursNeedsReview } from "./lib/fcpl-official-hours";
import { createOfficialHoursReviewEvidence } from "./lib/official-hours-review-evidence";
import { commitMerchantHours } from "./lib/commit-merchant-hours";
import { MERCHANT_HOURS_SOURCES } from "../src/lib/merchant-hours";

export async function refreshOfficialHours(args = process.argv.slice(2), options: {
  /** Dependency injection for offline failure/atomicity tests, never URL selection. */
  outputPath?: string;
  fetchPage?: typeof fetchOfficialHoursPage;
  now?: Date;
  merchantOutputPath?: string;
  fetchMerchantPage?: typeof fetchMerchantHoursPage;
} = {}) {
  for (const arg of args) if (!/^--(?:dry-run$|evidence-dir=|review-evidence-dir=|weekly-observed-at=|closures-observed-at=)/.test(arg)) throw new Error(`Unknown option: ${arg}`);
  const fetchPage = options.fetchPage ?? fetchOfficialHoursPage;
  const value = (name: string) => args.find((arg) => arg.startsWith(`--${name}=`))?.slice(name.length + 3);
  const evidence = value("evidence-dir");
  const weeklyObserved = value("weekly-observed-at");
  const closuresObserved = value("closures-observed-at");
  const reviewEvidence = value("review-evidence-dir");
  if (reviewEvidence && evidence) throw new Error("Historical library replay cannot create a native merchant capture bundle.");
  if (evidence && (!weeklyObserved || !closuresObserved)) throw new Error("Offline evidence requires both actual observation timestamps.");
  if (!evidence && (weeklyObserved || closuresObserved)) throw new Error("Live observations are recorded only after each successful response.");
  const output = options.outputPath ?? resolve("src/data/places-official-hours.json");
  let previous: unknown;
  try { previous = JSON.parse(readFileSync(output, "utf8")); } catch { previous = undefined; }
  let artifact: OfficialHoursArtifact;
  let libraryStatus: "current" | "source_unavailable" = "current";
  let libraryError: string | undefined;
  try {
    const weekly = evidence ? { url: FCPL_HOURS_URL, html: readFileSync(resolve(evidence, "fcpl-hours-index-20261012.html"), "utf8"), observedAt: weeklyObserved! } : await fetchPage(FCPL_HOURS_URL);
    const closures = evidence ? { url: FCPL_CLOSURES_URL, html: readFileSync(resolve(evidence, "fcpl-holiday-closings-20261012.html"), "utf8"), observedAt: closuresObserved! } : await fetchPage(FCPL_CLOSURES_URL);
    artifact = parseFcplOfficialHours(weekly, closures, options.now);
  } catch (error) {
    // Replay/library-only callers retain their original fail-loud behavior.
    // A live multi-source run can still update unrelated merchant evidence,
    // but only when a valid last-good FCPL artifact is available to preserve.
    if (evidence || (options.fetchPage && !options.fetchMerchantPage)) throw error;
    validateOfficialHoursArtifact(previous);
    artifact = previous;
    libraryStatus = "source_unavailable";
    libraryError = error instanceof Error ? error.message : "Official library source unavailable.";
  }
  const merchantOutput = options.merchantOutputPath ?? (options.outputPath ? resolve(dirname(output), "merchant-hours.json") : resolve("src/data/places-merchant-hours.json"));
  let previousMerchant: unknown;
  let previousMerchantBytes: string | undefined;
  try { previousMerchantBytes = readFileSync(merchantOutput, "utf8"); previousMerchant = JSON.parse(previousMerchantBytes); } catch { previousMerchant = undefined; }
  // Historical FCPL replay never makes fresh merchant requests or advances merchant evidence.
  // Injected FCPL-only tests likewise cannot accidentally use a live transport.
  const baseMerchantFetcher = options.fetchMerchantPage ?? (options.fetchPage ? async () => { throw new Error("No merchant test receipt supplied."); } : fetchMerchantHoursPage);
  const capture = reviewEvidence ? createOfficialHoursReviewEvidence(reviewEvidence, { now: options.now, sourceRevision: process.env.GITHUB_SHA }) : undefined;
  const merchantFetcher = capture ? (url: string) => capture(url, baseMerchantFetcher) : baseMerchantFetcher;
  const merchants = evidence || (options.fetchPage && !options.fetchMerchantPage) ? undefined : await collectMerchantOfficialHours(previousMerchant, merchantFetcher, options.now);
  const nativeSources = MERCHANT_HOURS_SOURCES.filter((source) => !("collection" in source && source.collection === "manual"));
  const cohortCounts = { native_source_count: new Set(nativeSources.map((source) => source.url)).size,
    native_listing_count: nativeSources.length, manual_listing_count: MERCHANT_HOURS_SOURCES.length - nativeSources.length };
  const reviewRequired = officialHoursNeedsReview(previous, artifact) || (merchants?.reviewRequired ?? false);
  if (!args.includes("--dry-run")) {
    if (libraryStatus === "current") {
      const temporary = `${output}.tmp`;
      writeFileSync(temporary, JSON.stringify(artifact, null, 2) + "\n");
      renameSync(temporary, output);
    }
    if (merchants) {
      if (previousMerchantBytes === undefined) throw new Error("Missing approved merchant baseline.");
      commitMerchantHours(merchantOutput, previousMerchantBytes, merchants.artifact);
    }
  }
  console.log(JSON.stringify({ status: libraryStatus === "current" ? "complete" : "partial", libraryStatus, ...(libraryError ? { libraryError } : {}), reviewRequired, dryRun: args.includes("--dry-run"), source: artifact.source_id, places: artifact.places.length, dateExceptions: artifact.closures.exceptions.length, observedAt: [artifact.weekly.observed_at, artifact.closures.observed_at], expiresAt: artifact.expires_at, ...cohortCounts, merchantSchedules: merchants?.artifact.places.length ?? "unchanged-offline", merchantPendingCount: merchants?.artifact.review.length ?? 0, merchantReview: merchants?.artifact.review.map(({ slug, reason }) => ({ slug, reason })) ?? [] }));
  return { reviewRequired, artifact, merchants, libraryStatus, libraryError, cohortCounts };
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  refreshOfficialHours().then(({ reviewRequired, merchants, libraryStatus, cohortCounts }) => {
    if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, `review_required=${reviewRequired}\nlibrary_status=${libraryStatus}\nmerchant_pending_count=${merchants?.artifact.review.length ?? 0}\nmerchant_pending_summary=${merchants?.artifact.review.map(({ slug, reason }) => `${slug}: ${reason}`).join(", ") || "none"}\n${Object.entries(cohortCounts).map(([name, count]) => `${name}=${count}`).join("\n")}\n`);
  }).catch((error) => { console.error(error instanceof Error ? error.message : error); process.exitCode = 1; });
}
