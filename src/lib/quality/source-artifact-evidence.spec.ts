import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import { MERCHANT_HOURS_SOURCES, type MerchantHoursArtifact } from "@/lib/merchant-hours";
import { parseMerchantOfficialHours } from "../../../scripts/lib/merchant-official-hours";
import type { SourceEvidence } from "./source-ledger";
import BUSINESS_INFO_RAW from "@/data/business-info.json" with { type: "json" };
import MERCHANT_HOURS_RAW from "@/data/places-merchant-hours.json" with { type: "json" };
import {
  businessInfoRowEvidenceTimestamp,
  buildSourceArtifactEvidence,
  bundledSourceArtifactEvidence,
  merchantSourceArtifactEvidence,
} from "./source-artifact-evidence";

const fixtureNow = new Date("2026-10-19T23:30:00.000Z");
function merchantFixture(): MerchantHoursArtifact {
  const names = ["brewers-alley", "gravel-and-grind", "beans-in-the-belfry", "dublin-roasters"];
  return { schema_version: 1, review: [], // Explicit legacy fixture cohort; added sources must not borrow its evidence.
  places: MERCHANT_HOURS_SOURCES.filter((source) => ["brewers-alley-frederick", "gravel-and-grind-frederick", "beans-in-the-belfry-brunswick", "dublin-roasters-frederick"].includes(source.slug)).map((source, i) => parseMerchantOfficialHours(source, { url: source.url, observedAt: "2026-10-19T23:24:49.283Z", html: readFileSync(`tests/fixtures/merchant-hours/${names[i]}.html`, "utf8") }, fixtureNow)) };
}
function expectHonestArtifactOutcomes(evidence: SourceEvidence[]) {
  for (const item of evidence) {
    expect(item.kind).toBe("artifact");
    expect(Number.isFinite(Date.parse(item.attemptedAt))).toBe(true);
    if (item.outcome === "success") {
      expect(Number.isFinite(Date.parse(item.publishedAt!))).toBe(true);
      expect(Number.isFinite(Date.parse(item.succeededAt!))).toBe(true);
      expect(typeof item.recordCount).toBe("number");
      expect(item.recordCount).toBeGreaterThanOrEqual(0);
    } else {
      expect(item.outcome).toBe("failure");
      expect(item.error).toBeTruthy();
      expect(item.publishedAt).toBeUndefined();
      expect(item.succeededAt).toBeUndefined();
      expect(item.recordCount).toBeUndefined();
    }
  }
}

describe("bundled source artifact evidence", () => {
  it("uses commerce verification only when editorial evidence is absent", () => {
    expect(
      businessInfoRowEvidenceTimestamp({
        source: { fetchedAt: "2026-07-20T00:00:00.000Z" },
        commerce_source: { checkedAt: "2026-07-28T00:00:00.000Z" },
      }),
    ).toBe("2026-07-20T00:00:00.000Z");
    expect(
      businessInfoRowEvidenceTimestamp({
        commerce_source: { checkedAt: "2026-07-28T00:00:00.000Z" },
      }),
    ).toBe("2026-07-28T00:00:00.000Z");
    expect(businessInfoRowEvidenceTimestamp({})).toBeUndefined();
  });

  it("uses the oldest row timestamp so one fresh row cannot launder a stale batch", () => {
    expect(
      buildSourceArtifactEvidence([
        {
          sourceKey: "venue_event_extraction",
          timestamps: [
            "2026-07-26T12:00:00.000Z",
            "2026-07-28T09:00:00.000Z",
          ],
          recordCount: 2,
        },
      ]),
    ).toEqual([
      {
        sourceKey: "venue_event_extraction",
        kind: "artifact",
        attemptedAt: "2026-07-26T12:00:00.000Z",
        outcome: "success",
        succeededAt: "2026-07-26T12:00:00.000Z",
        publishedAt: "2026-07-26T12:00:00.000Z",
        recordCount: 2,
      },
    ]);
  });

  it("emits no evidence when any published row lacks a valid timestamp", () => {
    expect(
      buildSourceArtifactEvidence([
        {
          sourceKey: "municipal_civic_extraction",
          timestamps: [null, "", "unknown"],
          recordCount: 3,
        },
      ]),
    ).toEqual([]);
  });

  it("emits no evidence when row timestamp coverage is incomplete", () => {
    expect(
      buildSourceArtifactEvidence([
        {
          sourceKey: "business_info_extraction",
          timestamps: ["2026-07-22T00:00:00.000Z"],
          recordCount: 2,
        },
      ]),
    ).toEqual([]);
  });

  it("allows one timestamp to cover an atomic artifact", () => {
    expect(
      buildSourceArtifactEvidence([
        {
          sourceKey: "transit_gtfs",
          timestamps: ["2026-07-22"],
          recordCount: 17,
          timestampCoverage: "artifact",
        },
      ])[0],
    ).toMatchObject({
      publishedAt: "2026-07-22T00:00:00.000Z",
      recordCount: 17,
    });
  });

  it("dates a first-time commerce record so it cannot fail the evidence gate", async () => {
    // The gate below requires EVERY published row to be datable, so one fresh
    // row cannot make a stale batch look current. A place seen for the first
    // time whose extraction failed but whose home page yielded links used to
    // be written with commerce_links and no timestamp of any kind, which took
    // the whole business-info artifact out of evidence. Five such rows blocked
    // bot/business-info-refresh from 2026-08-04.
    const { mergeBusinessInfoCommerceEvidence } = await import(
      "../../../scripts/lib/business-info-refresh"
    );
    const link = {
      type: "menu",
      url: "https://example.com/menu",
      anchor_text: "Menu",
      source_url: "https://example.com/",
    };

    const firstTime = mergeBusinessInfoCommerceEvidence(undefined, {
      name: "Up on Market",
      commerceLinks: [link] as never,
      observed: { url: "https://example.com/", checkedAt: "2026-08-19T18:00:00.000Z" },
    });
    expect(firstTime.commerce_links).toHaveLength(1);
    expect(firstTime.commerce_source?.checkedAt).toBe("2026-08-19T18:00:00.000Z");

    // A dedicated commerce crawl's own timestamp always wins.
    const alreadyCrawled = mergeBusinessInfoCommerceEvidence(
      { name: "x", commerce_source: { url: "https://a", checkedAt: "2026-07-01T00:00:00.000Z" } },
      {
        name: "x",
        commerceLinks: [link] as never,
        observed: { url: "https://b", checkedAt: "2026-08-19T18:00:00.000Z" },
      },
    );
    expect(alreadyCrawled.commerce_source?.checkedAt).toBe("2026-07-01T00:00:00.000Z");

    // So does an existing extraction stamp; nothing incidental is added.
    const alreadyExtracted = mergeBusinessInfoCommerceEvidence(
      { name: "x", source: { url: "https://a", fetchedAt: "2026-07-01T00:00:00.000Z" } },
      {
        name: "x",
        commerceLinks: [link] as never,
        observed: { url: "https://b", checkedAt: "2026-08-19T18:00:00.000Z" },
      },
    );
    expect(alreadyExtracted.commerce_source).toBeUndefined();
  });

  it("recognizes every workflow artifact currently bundled for monitoring", () => {
    const evidence = bundledSourceArtifactEvidence();

    expect([...new Set(evidence.map((item) => item.sourceKey))].sort()).toEqual([
      "alekos_hours",      "beans_belfry_hours",
      "brewers_alley_hours",
      "business_info_extraction",
      "common_market_hours",
      "curious_iguana_hours",
      "delaplaine_hours",
      "dublin_roasters_hours",
      "fcpl_branch_hours",
      "gravel_grind_hours",
      "il_porto_frederick_hours",
      "jojos_hours",
      "kulfi_hours",
      "municipal_civic_extraction",
      "pistarros_hours",
      "sumittra_hours",
      "thai_meric_hours",
      "thai_table_hours",
      "transit_gtfs",
      "venue_event_extraction",
      "white_rabbit_hours",
    ]);
    expect(
      evidence.find((item) => item.sourceKey === "business_info_extraction"),
    ).toMatchObject({
      kind: "artifact",
      recordCount: Object.keys(BUSINESS_INFO_RAW).length,
    });
    expectHonestArtifactOutcomes(evidence);
  });
});


describe("merchant source publication evidence", () => {
  it("counts both accepted Common Market store bindings under one canonical source owner", () => {
    const artifact = MERCHANT_HOURS_RAW as MerchantHoursArtifact;
    const slugs = ["common-market-frederick", "common-market"];
    const rows = slugs.map((slug) => {
      const row = artifact.places.find((item) => item.slug === slug);
      expect(row).toBeDefined();
      return row!;
    });
    expect(artifact.review.some((row) => slugs.includes(row.slug))).toBe(false);
    const expected = rows.map((row) => ({ sourceKey: "common_market_hours", kind: "artifact", attemptedAt: row.observed_at,
      outcome: "success", succeededAt: row.observed_at, publishedAt: row.observed_at, expiresAt: row.expires_at, recordCount: 1 }));
    for (const [index, row] of rows.entries()) {
      expect(merchantSourceArtifactEvidence({ schema_version: 1, places: [row], review: [] })).toEqual([expected[index]]);
    }
    const combined = merchantSourceArtifactEvidence(artifact).filter((row) => row.sourceKey === "common_market_hours");
    expect(combined).toEqual(expected);
    expect([...new Set(combined.map((row) => row.sourceKey))]).toEqual(["common_market_hours"]);
    expect(combined.reduce((count, row) => count + (row.recordCount ?? 0), 0)).toBe(2);
    expectHonestArtifactOutcomes(combined);
  });

  it("preserves the original source observations, expiry, and newer failed review attempt", () => {
    const original = merchantFixture();
    const artifact = structuredClone(original);
    artifact.review.push({ slug: artifact.places[0].slug, checked_at: "2026-10-20T10:00:00.000Z", reason: "unparseable_or_conflicted" });
    const evidence = merchantSourceArtifactEvidence(artifact);
    expect(evidence.filter((row) => row.outcome === "success")).toHaveLength(4);
    expect(evidence.find((row) => row.sourceKey === "brewers_alley_hours" && row.outcome === "success")).toMatchObject({ publishedAt: original.places[0].observed_at, expiresAt: original.places[0].expires_at, recordCount: 1 });
    expect(evidence.find((row) => row.outcome === "failure")).toMatchObject({ sourceKey: "brewers_alley_hours", attemptedAt: "2026-10-20T10:00:00.000Z" });
    expectHonestArtifactOutcomes(evidence);
    expect(evidence.find((row) => row.outcome === "failure")?.publishedAt).toBeUndefined();
    expect(merchantSourceArtifactEvidence({ ...artifact, places: [{ ...artifact.places[0], source_url: "https://unapproved.example/" }] })).toEqual([]);
  });
  it("monitors a bundled held source as old publication plus failed verification without blocking the other source evidence", async () => {
    const artifact = merchantFixture();
    const held = artifact.places[0];
    const checkedAt = "2026-10-20T10:00:00.000Z";
    artifact.review.push({ slug: held.slug, checked_at: checkedAt, reason: "unparseable_or_conflicted" });
    vi.resetModules();
    vi.doMock("@/data/places-merchant-hours.json", () => ({ default: artifact }));
    try {
      const { bundledSourceArtifactEvidence: bundledHeldEvidence } = await import("./source-artifact-evidence");
      const evidence = bundledHeldEvidence();
      expect(new Set(evidence.map((row) => row.sourceKey)).size).toBe(9);
      expect(evidence.filter((row) => row.sourceKey === "brewers_alley_hours")).toHaveLength(2);
      expect(evidence.find((row) => row.sourceKey === "brewers_alley_hours" && row.outcome === "success")).toMatchObject({ publishedAt: held.observed_at, succeededAt: held.observed_at, expiresAt: held.expires_at });
      expect(evidence.find((row) => row.outcome === "failure")).toMatchObject({ sourceKey: "brewers_alley_hours", attemptedAt: checkedAt });
      for (const sourceKey of ["fcpl_branch_hours", "gravel_grind_hours", "beans_belfry_hours", "dublin_roasters_hours"]) expect(evidence.find((row) => row.sourceKey === sourceKey && row.outcome === "success")).toBeDefined();
      expectHonestArtifactOutcomes(evidence);
    } finally {
      vi.doUnmock("@/data/places-merchant-hours.json");
      vi.resetModules();
    }
  });
});
