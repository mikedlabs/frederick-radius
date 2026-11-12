/**
 * The page a feedback note was sent from, as a path that can only stay on
 * this site.
 *
 * /api/feedback stores whatever `pathname` the sender supplied (trimmed and
 * length-capped, nothing more), and /admin/feedback turns it into a link. A
 * plain "starts with /" test is not enough for an href: a browser reads
 * "//other.example" and "/\other.example" as another site. This runs the
 * stored value through the same normalizer the redirect sinks use and returns
 * null for anything it rejects, so an unsafe value shows no link at all.
 */
import { safeRedirectPath } from "@/lib/safe-redirect";

// safeRedirectPath always returns a path, falling back when the input is
// unsafe. A fallback no real page uses tells "rejected" apart from a note
// that was really sent from "/".
const REJECTED = "/__rejected-feedback-source-path__";

export function feedbackSourcePath(raw: unknown): string | null {
  if (typeof raw !== "string" || !raw.trim()) return null;
  const safe = safeRedirectPath(raw, REJECTED);
  return safe === REJECTED ? null : safe;
}
