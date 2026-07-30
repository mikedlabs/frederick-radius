import { createHash } from "node:crypto";

/**
 * Normalize source text only enough to ignore transport and rendering noise.
 *
 * Do not remove dates, numbers, punctuation, navigation, or repeated text:
 * those can carry real business hours, prices, and event changes. The
 * normalization is intentionally conservative so a skipped model call always
 * means the model-visible payload is materially identical.
 */
export function normalizeSourceContent(text: string): string {
  return text
    .normalize("NFKC")
    .replace(/\r\n?/g, "\n")
    .replace(/\u00a0/g, " ")
    .replace(/[\u200B-\u200D\uFEFF]/g, "")
    .split("\n")
    .map((line) => line.trim().replace(/[ \t]+/g, " "))
    .filter(Boolean)
    .join("\n");
}

/** Stable SHA-256 fingerprint of the exact normalized model input. */
export function hashSourceContent(text: string): string {
  return createHash("sha256")
    .update(normalizeSourceContent(text), "utf8")
    .digest("hex");
}

/** Stable SHA-256 fingerprint for an image or other binary source. */
export function hashSourceBytes(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

export type StoredSourceFingerprint = {
  contentHash?: string;
  finalUrl?: string;
  method?: string;
  extractorVersion?: string;
};

export type CurrentSourceFingerprint = {
  contentHash: string;
  finalUrl: string;
  method?: string;
  extractorVersion?: string;
};

/**
 * Content equality alone is not enough to skip a source. Requiring the exact
 * final URL (and collection method when present) prevents a redirect or source
 * registry change from inheriting another page's successful extraction.
 */
export function sourceFingerprintMatches(
  previous: StoredSourceFingerprint | undefined,
  current: CurrentSourceFingerprint,
): boolean {
  if (
    !previous?.contentHash ||
    previous.contentHash !== current.contentHash ||
    previous.finalUrl !== current.finalUrl ||
    (current.method !== undefined && previous.method !== current.method) ||
    (current.extractorVersion !== undefined &&
      previous.extractorVersion !== current.extractorVersion)
  ) {
    return false;
  }
  return true;
}
