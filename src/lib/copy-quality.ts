/**
 * Rule-based copy-quality detector. It applies the relevant docs/VOICE.md
 * rules plus scraped-directory tells such as phone numbers and contact CTAs.
 * Owner-authored source copy is enforced separately by scripts/style-lint.ts.
 *
 * Returns:
 *   "none"       no usable description
 *   "scraped"    trips a voice-guide scraped pattern
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
// Low-information scrape prose can be grammatical and still tell the reader
// nothing useful. Repeated hedging and "sometimes open" are strong signals
// that a directory excerpt was assembled from uncertain fragments.
const LOW_INFORMATION =
  /\b(?:is|are)\s+sometimes\s+open\b|\bsometimes\b[\s\S]{0,120}\bsometimes\b/i;

/**
 * Editor approval is a provenance decision, not a way around the mechanical
 * safety checks. Approved copy may begin with the place name when the rest is
 * a real sentence ("Baker Park has ..."), but a short name echo, address dump,
 * contact prompt, or marketing fragment must still be rejected.
 */
export function isDescriptionMechanicallySafe(
  name: string,
  description: string,
): boolean {
  if (description.length < 25) return false;

  const normalizedName = (name ?? "").trim().toLowerCase();
  const normalizedDescription = description.toLowerCase();
  if (normalizedName && normalizedDescription.startsWith(normalizedName)) {
    const remainderWords = description
      .slice(normalizedName.length)
      .trim()
      .split(/\s+/)
      .filter(Boolean);
    if (remainderWords.length < 5) return false;
  }

  if (STREET_SUFFIX.test(description) || ZIP.test(description)) return false;
  if (SECOND_PERSON.test(description)) return false;
  if (MARKETING.test(description)) return false;
  if (NOISE.test(description)) return false;
  if (PHONE.test(description) || CONTACT.test(description) || LINK.test(description)) return false;
  if (LOW_INFORMATION.test(description)) return false;

  const stops = (description.match(/[.!?](\s|$)/g) ?? []).length;
  return description.length <= 320 || stops >= 2;
}

/** Classify a place description against the voice-guide scraped patterns. */
export function classifyDescription(
  name: string,
  description: string | undefined | null,
  reviewed = false,
): CopyQuality {
  const t = (description ?? "").trim();
  if (reviewed) {
    if (!t) return "none";
    return isDescriptionMechanicallySafe(name, t)
      ? "reviewed"
      : "scraped";
  }
  if (!t || t.length < 25) return t ? "scraped" : "none";

  // Name-repeat opener. The test used to be "does the description START with
  // the place name" and nothing else, which is the wrong question: a scraped
  // echo ("Baker Park", "Baker Park - Frederick, MD") and a real sentence
  // ("Baker Park is a 44-acre downtown park with a band shell, lake, tennis,
  // and the Joseph D. Baker carillon tower.") both open with the name. The
  // reviewed path has always asked the right question instead — is there a
  // real sentence AFTER the name — so ask it here too. The crude version was
  // suppressing publishable copy for the county's best-known places:
  // Baker Park, Cunningham Falls, Monocacy Battlefield, Carroll Creek,
  // Gathland, Brewer's Alley, The Curious Iguana, and every public golf
  // course. Everything genuinely scraped is still caught below by the
  // address, contact, marketing, and low-information rules, and a bare echo
  // fails the 5-word remainder here exactly as it should.
  const nm = (name ?? "").trim().toLowerCase();
  if (nm && t.toLowerCase().startsWith(nm)) {
    const remainderWords = t
      .slice(nm.length)
      .trim()
      .split(/\s+/)
      .filter(Boolean);
    if (remainderWords.length < 5) return "scraped";
  }
  if (STREET_SUFFIX.test(t) || ZIP.test(t)) return "scraped";
  if (SECOND_PERSON.test(t)) return "scraped";
  if (MARKETING.test(t)) return "scraped";
  if (NOISE.test(t)) return "scraped";
  if (PHONE.test(t) || CONTACT.test(t) || LINK.test(t)) return "scraped";
  if (LOW_INFORMATION.test(t)) return "scraped";

  // Single run-on: long with fewer than two sentence stops.
  const stops = (t.match(/[.!?](\s|$)/g) ?? []).length;
  if (t.length > 320 && stops < 2) return "scraped";

  return "auto_clean";
}
