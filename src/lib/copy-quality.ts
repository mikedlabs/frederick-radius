/**
 * Rule-based copy-quality detector. The rules are exactly the ones in
 * STYLE.md so the detector and the editorial standard never drift.
 *
 * Returns:
 *   "none"       no usable description
 *   "scraped"    trips a STYLE.md scraped pattern
 *   "auto_clean" reads as prose, no editor sign-off yet
 *   "reviewed"   an editor approved it (set via overrides, not inferred)
 *
 * Pure and dependency-free so it runs in the build script, the admin
 * tool, and the test with identical results.
 */
export type CopyQuality = "none" | "scraped" | "auto_clean" | "reviewed";

const STREET_SUFFIX =
  /\b\d{1,5}\s+[A-Za-z].*\b(St|Ave|Rd|Blvd|Ln|Dr|Way|Ct|Pl|Pkwy|Hwy|Street|Avenue|Road)\b/;
const ZIP = /\bMD\s*2170\d\b/;
const SECOND_PERSON =
  /\b(you|your|you'll|you're|yours|visit us|come in|we offer|we pride|our team is|our staff)\b/i;
const MARKETING =
  /\b(best|amazing|must[- ]visit|hidden gem|nestled|vibrant|elevated|curated experience|destination|exquisite|charm and elegance|unforgettable|one-of-a-kind)\b/i;
const NOISE = /[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}]|•|#[A-Za-z]|\b[A-Z][a-z]{2}\s+20\d{2}\b/u;

/** Classify a place description against the STYLE.md scraped patterns. */
export function classifyDescription(
  name: string,
  description: string | undefined | null,
  reviewed = false,
): CopyQuality {
  if (reviewed) return "reviewed";
  const t = (description ?? "").trim();
  if (!t || t.length < 25) return t ? "scraped" : "none";

  const nm = (name ?? "").trim().toLowerCase();
  const head = t.toLowerCase().slice(0, Math.max(8, Math.min(14, nm.length)));
  if (nm && head && nm.startsWith(head)) return "scraped"; // name-repeat opener
  if (STREET_SUFFIX.test(t) || ZIP.test(t)) return "scraped";
  if (SECOND_PERSON.test(t)) return "scraped";
  if (MARKETING.test(t)) return "scraped";
  if (NOISE.test(t)) return "scraped";

  // Discovery-pipeline placeholder shape ("Category in Town.") — not
  // editorial copy, just a filler the pipeline writes when no real
  // blurb exists. Flagged in the 2026-05 review as the most visible
  // "feels unfinished" leak.
  if (/^[A-Z][A-Za-z& ]+ in [A-Z][A-Za-z ]+\.?$/.test(t)) return "scraped";

  // Single run-on: long with fewer than two sentence stops.
  const stops = (t.match(/[.!?](\s|$)/g) ?? []).length;
  if (t.length > 320 && stops < 2) return "scraped";

  return "auto_clean";
}
