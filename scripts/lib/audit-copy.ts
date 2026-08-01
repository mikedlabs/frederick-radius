import {
  decisionCopyIssue,
  type CoveragePlace,
} from "@/lib/quality/coverage";

/**
 * Keep the audit's directory-template count aligned with the release gate.
 * A broad `X in Y.` shape is not enough evidence of boilerplate: useful,
 * source-backed sentences often end with a town or neighborhood in exactly
 * that form.
 */
export function isDirectoryTemplateBlurb(
  place: CoveragePlace,
  counts: ReadonlyMap<string, number>,
): boolean {
  return decisionCopyIssue(place, counts) === "category_template";
}
