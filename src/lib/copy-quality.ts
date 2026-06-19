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
// Scraped directory-listing tells: a phone number, a contact CTA, or a
// link/email never belong in an editorial description ("Feel free to reach
// out to us at 703-524-…").
const PHONE = /\(\d{3}\)\s*\d{3}[-.\s]?\d{4}|\b\d{3}[-.\s]\d{3}[-.\s]\d{4}\b/;
const CONTACT = /\b(feel free to|reach out|contact us|call us|give us a call|email us|book (?:now|online)|find us on|follow us|dm us)\b/i;
const LINK = /https?:\/\/|www\.\S|\S+@\S+\.\w/i;

// The discovery/ingest backfill writes a generic "<Category> in <Town>."
// stub when a place has no real description ("Coffee in Downtown
// Frederick."). It reads as a sentence but says nothing the card's category
// + town line doesn't already, so STYLE.md treats it as scraped: an honest
// blank beats a padded non-answer. Anchored to the known Frederick County
// place names (the only locations the stub generator emits) so real prose
// that merely ends "... in <somewhere>." is never swept.
const PLACEHOLDER_TOWNS =
  "Downtown Frederick|Frederick County|Frederick|Brunswick|Thurmont|Middletown|" +
  "Walkersville|Emmitsburg|New Market|Mount Airy|Myersville|Woodsboro|" +
  "Burkittsville|Rosemont|Urbana|Ijamsville|Jefferson";
const PLACEHOLDER_BLURB = new RegExp(
  `^[A-Z][A-Za-z&'/ -]{1,40}? in (?:${PLACEHOLDER_TOWNS})\\.$`,
);

/**
 * True for the generated "<Category> in <Town>." filler stub. Exported so
 * the data audit and the render-time gates (knownFor, the detail page's
 * cleanCopy) share ONE definition and never drift.
 */
export function isPlaceholderBlurb(blurb: string | undefined | null): boolean {
  return PLACEHOLDER_BLURB.test((blurb ?? "").trim());
}

/** Classify a place description against the STYLE.md scraped patterns. */
export function classifyDescription(
  name: string,
  description: string | undefined | null,
  reviewed = false,
): CopyQuality {
  if (reviewed) return "reviewed";
  const t = (description ?? "").trim();
  if (!t || t.length < 25) return t ? "scraped" : "none";
  if (isPlaceholderBlurb(t)) return "scraped"; // "<Category> in <Town>." stub

  const nm = (name ?? "").trim().toLowerCase();
  const head = t.toLowerCase().slice(0, Math.max(8, Math.min(14, nm.length)));
  if (nm && head && nm.startsWith(head)) return "scraped"; // name-repeat opener
  if (STREET_SUFFIX.test(t) || ZIP.test(t)) return "scraped";
  if (SECOND_PERSON.test(t)) return "scraped";
  if (MARKETING.test(t)) return "scraped";
  if (NOISE.test(t)) return "scraped";
  if (PHONE.test(t) || CONTACT.test(t) || LINK.test(t)) return "scraped";

  // Single run-on: long with fewer than two sentence stops.
  const stops = (t.match(/[.!?](\s|$)/g) ?? []).length;
  if (t.length > 320 && stops < 2) return "scraped";

  return "auto_clean";
}
