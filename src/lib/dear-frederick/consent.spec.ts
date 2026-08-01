import { describe, expect, it } from "vitest";
import {
  hasLetterPublicationConsent,
  LETTER_PUBLICATION_CONSENT_VERSION,
  letterScanStoragePath,
} from "./consent";

describe("Dear Frederick publication consent", () => {
  it("versions new managed scan paths", () => {
    expect(letterScanStoragePath("scan-id", "jpg")).toBe(
      `dear-frederick-scans/${LETTER_PUBLICATION_CONSENT_VERSION}/scan-id.jpg`,
    );
  });

  it("accepts only the current managed Blob consent path", () => {
    expect(
      hasLetterPublicationConsent(
        `https://store.public.blob.vercel-storage.com/dear-frederick-scans/${LETTER_PUBLICATION_CONSENT_VERSION}/letter.jpg`,
      ),
    ).toBe(true);
    expect(
      hasLetterPublicationConsent(
        "https://store.public.blob.vercel-storage.com/dear-frederick-scans/letter.jpg",
      ),
    ).toBe(false);
    expect(
      hasLetterPublicationConsent(
        `https://store.public.blob.vercel-storage.com.evil.example/dear-frederick-scans/${LETTER_PUBLICATION_CONSENT_VERSION}/letter.jpg`,
      ),
    ).toBe(false);
  });
});
