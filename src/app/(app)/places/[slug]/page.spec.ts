import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync(new URL("./page.tsx", import.meta.url), "utf8");

describe("place page trust line", () => {
  it("writes one trust line from the trust-language table", () => {
    expect(source).toContain("placeTrustSegments({");
    expect(source).toContain("detailsCheckedAt: place.updated_at");
    expect(source).toContain("hoursStatus: place.open_status");
    expect(source).toContain("{REPORT_A_CHANGE}");
  });

  it("never prints a raw ISO date or a second relative-age format", () => {
    // The audit found "Updated 2026-05-14" beside "verified 3mo ago" and
    // "confirmed 3 months ago" on one page.
    expect(source).not.toContain("Updated {place.updated_at}");
    expect(source).not.toContain("confirmedAgo");
    expect(source).not.toContain("Report incorrect info");
    expect(source).toContain("formatTrustDate(place.hours_updated_at)");
  });
});
