import { describe, expect, it } from "vitest";

import {
  classifyFairObservation,
  extractFairSourceText,
} from "../scripts/fair-source-watch";

describe("Fair Source Watch", () => {
  it("fingerprints useful visible facts without navigation, forms, or scripts", () => {
    const text = extractFairSourceText(`
      <html><body>
        <header>Site navigation</header>
        <main>
          <h1>Parking</h1>
          <p>Lots A through D cost $10 and are cash only.</p>
          <script>window.random = 123</script>
          <form><label>Email</label><input /></form>
        </main>
        <footer>Copyright</footer>
      </body></html>
    `);

    expect(text).toContain("Parking");
    expect(text).toContain("$10 and are cash only");
    expect(text).not.toContain("Site navigation");
    expect(text).not.toContain("window.random");
    expect(text).not.toContain("Email");
  });

  it("distinguishes a baseline, unchanged page, and meaningful change", () => {
    const previous = {
      id: "fair-faq",
      url: "https://thegreatfrederickfair.com/faq/",
      finalUrl: "https://thegreatfrederickfair.com/faq/",
      contentHash: "abc",
      extractorVersion: "fair-visible-text-v1" as const,
      firstSeenAt: "2026-09-01T00:00:00Z",
      lastCheckedAt: "2026-09-01T00:00:00Z",
      lastChangedAt: "2026-09-01T00:00:00Z",
      characterCount: 500,
    };
    const same = {
      url: previous.url,
      finalUrl: previous.finalUrl,
      contentHash: "abc",
      extractorVersion: previous.extractorVersion,
    };

    expect(classifyFairObservation(undefined, same)).toBe("new");
    expect(classifyFairObservation(previous, same)).toBe("same");
    expect(
      classifyFairObservation(previous, { ...same, contentHash: "def" }),
    ).toBe("changed");
  });
});
