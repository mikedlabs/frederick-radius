import { createHash } from "node:crypto";
import { isDeepStrictEqual } from "node:util";
import { MERCHANT_HOURS_SOURCES, acceptReviewedMerchantHoursCandidate, validateMerchantHoursArtifact, type MerchantHoursArtifact } from "../../src/lib/merchant-hours";
import { parseMerchantOfficialHours } from "./merchant-official-hours";

export const hoursArtifactHash = (bytes: string) => createHash("sha256").update(bytes).digest("hex");
export type MerchantHoursBatchPlan = {
  schema_version: 1;
  artifact_sha256: string;
  decisions: {
    slug: string;
    decision: "accept" | "hold";
    source_url: string;
    source_sha256: string;
    observed_at: string;
    /** Local original HTML. Never a URL to fetch, fixture or generated client file. */
    evidence_file: string;
    /** Substantive identity, schedule and notice review, retained in the private plan. */
    review_note: string;
  }[];
};

/** A template is deliberately held. Generating it never approves a fact. */
export function merchantHoursBatchTemplate(bytes: string): MerchantHoursBatchPlan {
  const artifact: unknown = JSON.parse(bytes);
  validateMerchantHoursArtifact(artifact);
  return {
    schema_version: 1,
    artifact_sha256: hoursArtifactHash(bytes),
    decisions: artifact.review.flatMap(({ candidate }) => candidate ? [{
      slug: candidate.slug, decision: "hold" as const,
      source_url: candidate.source_url, source_sha256: candidate.source_sha256,
      observed_at: candidate.observed_at, evidence_file: "", review_note: "",
    }] : []),
  };
}

/** Offline, all-or-nothing review. Every accepted member has its own proof;
 * sharing an HTML receipt never shares acceptance or refreshes its capture date.
 */
export function reviewMerchantHoursBatch(bytes: string, value: unknown, readEvidence: (file: string) => string, now = new Date()): { artifact: MerchantHoursArtifact; accepted: string[]; held: string[] } {
  const plan = value as MerchantHoursBatchPlan;
  if (!plan || plan.schema_version !== 1 || plan.artifact_sha256 !== hoursArtifactHash(bytes)
    || !Array.isArray(plan.decisions) || !plan.decisions.length || plan.decisions.length > MERCHANT_HOURS_SOURCES.length) throw new Error("Batch plan must match the exact current artifact and contain explicit decisions.");
  const previous: unknown = JSON.parse(bytes);
  validateMerchantHoursArtifact(previous);
  let artifact = structuredClone(previous);
  const accepted: string[] = [], held: string[] = [];
  const seen = new Set<string>();
  const receipts = new Map<string, string>();
  for (const row of plan.decisions) {
    if (!row || typeof row.slug !== "string" || seen.has(row.slug) || !["accept", "hold"].includes(row.decision)) throw new Error("Duplicate or invalid batch decision.");
    seen.add(row.slug);
    const candidate = previous.review.find((item) => item.slug === row.slug)?.candidate;
    const source = MERCHANT_HOURS_SOURCES.find((item) => item.slug === row.slug);
    if (!candidate || !source || row.source_url !== candidate.source_url || row.source_sha256 !== candidate.source_sha256 || row.observed_at !== candidate.observed_at) throw new Error(`Batch proof does not match the pending candidate: ${row.slug}`);
    if (row.decision === "hold") { held.push(row.slug); continue; }
    if (typeof row.review_note !== "string" || row.review_note.trim().length < 20 || row.review_note.length > 4000
      || typeof row.evidence_file !== "string" || !row.evidence_file.trim()) throw new Error(`Accepted hours require original evidence and substantive review: ${row.slug}`);
    let html = receipts.get(row.evidence_file);
    if (html === undefined) {
      html = readEvidence(row.evidence_file);
      receipts.set(row.evidence_file, html);
    }
    if (hoursArtifactHash(html) !== row.source_sha256) throw new Error(`Original evidence hash mismatch: ${row.slug}`);
    const replay = parseMerchantOfficialHours(source, { url: row.source_url, html, observedAt: row.observed_at }, now);
    // Compare the complete validated record, including dates and expiry. A plan
    // cannot substitute an old snapshot, alter facts, or repair a stale clock.
    if (!isDeepStrictEqual(replay, candidate)) throw new Error(`Original evidence does not reproduce the candidate: ${row.slug}`);
    artifact = acceptReviewedMerchantHoursCandidate(artifact, row.slug, row, now);
    accepted.push(row.slug);
  }
  validateMerchantHoursArtifact(artifact);
  return { artifact, accepted, held };
}
