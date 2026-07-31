import { describe, expect, it } from "vitest";
import {
  isTrustedBusinessWebsiteRedirect,
  needsRenderedBusinessSnapshot,
  preferredBusinessWebsiteUrls,
} from "../scripts/lib/business-info-source";

describe("business-info source trust", () => {
  it("prefers HTTPS while retaining a legacy HTTP fallback", () => {
    expect(
      preferredBusinessWebsiteUrls("http://www.example.com/menu"),
    ).toEqual([
      "https://www.example.com/menu",
      "http://www.example.com/menu",
    ]);
    expect(
      preferredBusinessWebsiteUrls("https://example.com/menu"),
    ).toEqual(["https://example.com/menu"]);
    expect(preferredBusinessWebsiteUrls("ftp://example.com/menu")).toEqual([]);
    expect(preferredBusinessWebsiteUrls("not a URL")).toEqual([]);
  });

  it("allows protocol, www, and same-site subdomain redirects", () => {
    expect(
      isTrustedBusinessWebsiteRedirect(
        "http://example.com",
        "https://www.example.com/menu",
      ),
    ).toBe(true);
    expect(
      isTrustedBusinessWebsiteRedirect(
        "https://www.example.com",
        "https://order.example.com/start",
      ),
    ).toBe(true);
    expect(
      isTrustedBusinessWebsiteRedirect(
        "https://example.com",
        "https://events.example.com/calendar",
      ),
    ).toBe(true);
  });

  it("rejects unrelated and deceptively similar redirect hosts", () => {
    expect(
      isTrustedBusinessWebsiteRedirect(
        "https://example.com",
        "https://unrelated.example/menu",
      ),
    ).toBe(false);
    expect(
      isTrustedBusinessWebsiteRedirect(
        "https://example.com",
        "https://example.com.evil.test/menu",
      ),
    ).toBe(false);
    expect(
      isTrustedBusinessWebsiteRedirect(
        "https://example.com",
        "https://example-menu.com",
      ),
    ).toBe(false);
    expect(
      isTrustedBusinessWebsiteRedirect(
        "https://example.com",
        "https://com",
      ),
    ).toBe(false);
  });

  it("renders only missing or text-thin snapshots", () => {
    const textRichWithoutCommerce = {
      text: "x".repeat(800),
      links: [],
      requestedUrl: "https://example.com",
      finalUrl: "https://example.com",
    };
    expect(
      needsRenderedBusinessSnapshot(textRichWithoutCommerce, 500),
    ).toBe(false);
    expect(
      needsRenderedBusinessSnapshot(
        { ...textRichWithoutCommerce, text: "short" },
        500,
      ),
    ).toBe(true);
    expect(needsRenderedBusinessSnapshot(null, 500)).toBe(true);
  });
});
