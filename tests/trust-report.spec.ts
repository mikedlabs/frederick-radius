import { describe, it, expect } from "vitest";
import { computePlaceTrustReport } from "@/lib/quality/trust-report";
import { publicPlaces } from "@/lib/loaders/places";

/**
 * The trust report turns the Section 8 gates into nightly numbers. These
 * tests pin the gates that must hold on the live catalog and the
 * structure the data-health cron reports.
 */
describe("computePlaceTrustReport", () => {
  const report = computePlaceTrustReport(new Date("2026-06-10T12:00:00Z"));

  it("provenance coverage is 100 percent (the brief's gate)", () => {
    expect(report.provenance.coverage_pct).toBe(100);
    expect(report.provenance.below_gate).toBe(false);
    expect(report.provenance.missing_sample).toEqual([]);
  });

  it("counts the whole catalog", () => {
    expect(report.places).toBe(publicPlaces().length);
  });

  it("the confidence distribution matches the current catalog and sums cleanly", () => {
    const { curated, partner, verified, scraped } = report.confidence;
    expect(curated).toBeGreaterThan(0);
    // Partner is reserved for a documented Radius relationship. A publisher's
    // public listing does not create one.
    expect(partner).toBe(0);
    expect(verified).toBeGreaterThan(0);
    expect(scraped).toBeGreaterThan(0);
    expect(curated + partner + verified + scraped).toBe(publicPlaces().length);
  });

  it("never reports more stale assertions than total assertions", () => {
    expect(report.open_assertions.stale_or_missing).toBeLessThanOrEqual(
      report.open_assertions.asserting,
    );
    // The freshness flag is off in tests, so the stale set is advisory and
    // does not trip the gate yet.
    expect(report.open_assertions.below_gate).toBe(false);
  });
});
