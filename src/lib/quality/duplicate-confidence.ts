export type DuplicateEvidence = {
  jaccard: number;
  meters: number;
  coreOverlap: number;
  distinctTokenConflict: boolean;
  categoryConflict: boolean;
  providerMatch: boolean;
  providerConflict: boolean;
};

export type DuplicateConfidence = "HIGH" | "MEDIUM" | "LOW";

/**
 * A proximity/name match is useful review evidence, but it is not sufficient
 * to auto-merge two public places. HIGH is reserved for candidates that also
 * share the same real provider identity. Different provider identities or a
 * structural sub-feature conflict are explicit evidence against auto-merge.
 */
export function classifyDuplicateConfidence(
  evidence: DuplicateEvidence,
): DuplicateConfidence {
  if (evidence.distinctTokenConflict || evidence.providerConflict) return "LOW";

  const strongNameAndDistance =
    (evidence.coreOverlap >= 2 &&
      evidence.meters <= 60 &&
      evidence.jaccard >= 0.4) ||
    (evidence.jaccard >= 0.75 && evidence.meters <= 100);

  if (
    strongNameAndDistance &&
    evidence.providerMatch &&
    !evidence.categoryConflict
  ) {
    return "HIGH";
  }

  if (strongNameAndDistance) return "MEDIUM";
  if (
    evidence.meters <= 25 &&
    evidence.coreOverlap >= 1 &&
    evidence.jaccard >= 0.25
  ) {
    return "MEDIUM";
  }
  if (evidence.jaccard >= 0.6 && evidence.meters <= 300) return "MEDIUM";
  return "LOW";
}
