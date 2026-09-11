/**
 * Dear Frederick publication-consent contract.
 *
 * The accepted policy version is embedded in the managed Blob pathname. That
 * makes the consent boundary durable and reviewable without storing private
 * form content in a public asset or requiring a schema change. A scan without
 * this marker can be retained for private review, but it cannot be approved.
 */
export const LETTER_PUBLICATION_CONSENT_VERSION = "publication-v1";

export function letterScanStoragePath(id: string, extension: string): string {
  return `dear-frederick-scans/${LETTER_PUBLICATION_CONSENT_VERSION}/${id}.${extension}`;
}

export function hasLetterPublicationConsent(
  value: string | null | undefined,
): boolean {
  if (!value) return false;
  try {
    const url = new URL(value);
    return (
      url.protocol === "https:" &&
      url.username === "" &&
      url.password === "" &&
      url.port === "" &&
      url.hostname.endsWith(".public.blob.vercel-storage.com") &&
      url.pathname.startsWith(
        `/dear-frederick-scans/${LETTER_PUBLICATION_CONSENT_VERSION}/`,
      ) &&
      url.pathname.length >
        `/dear-frederick-scans/${LETTER_PUBLICATION_CONSENT_VERSION}/`.length
    );
  } catch {
    return false;
  }
}
