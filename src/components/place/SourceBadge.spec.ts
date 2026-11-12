import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { PlaceCardData } from "@/lib/loaders/places";
import SourceBadge, { SOURCE_BADGE_META, sourceBadgeMeta } from "./SourceBadge";

function badge(source: PlaceCardData["source"], size: "sm" | "md", verified = false) {
  const place = { source, is_verified: verified, google_verified: verified } as PlaceCardData;
  return renderToStaticMarkup(createElement(SourceBadge, { place, size }));
}

describe("sourceBadgeMeta", () => {
  it("recognizes both county-GIS source spellings as official", () => {
    for (const source of ["arcgis", "fc-gis"] as const) {
      expect(sourceBadgeMeta({ source, is_verified: true, google_verified: true })?.tier).toBe(
        "official",
      );
    }
  });

  it("does not turn a Google source check into owner verification", () => {
    const meta = sourceBadgeMeta({
      source: "discovered",
      is_verified: true,
      google_verified: true,
    });
    expect(meta?.label).toBe("Checked at source");
    expect(meta?.explanation).toMatch(/not owner verification/i);
  });

  it("describes seed records as reviewed without claiming every fact was hand-vetted", () => {
    expect(sourceBadgeMeta({ source: "seed", is_verified: true, google_verified: true })?.label).toBe(
      "Radius reviewed",
    );
  });

  it("colors every tier with a text-role token that stays readable in the dark appearance", () => {
    for (const meta of Object.values(SOURCE_BADGE_META)) {
      expect(meta.color).toMatch(/^var\(--app-(link|forest-text|cool-text)\)$/);
    }
  });
});

describe("SourceBadge", () => {
  it("marks a reviewed record with the field-note glyph, not a check or a sparkle", () => {
    // A person selected or edited the record. A sparkle reads as generated,
    // and the check belongs to the stronger "Checked at source" tier.
    const html = badge("seed", "md", true);
    expect(html).toContain("lucide-notebook-pen");
    expect(html).not.toContain("lucide-sparkles");
    expect(html).not.toMatch(/lucide-(circle-)?check/);
    expect(SOURCE_BADGE_META.reviewed.icon).not.toBe(SOURCE_BADGE_META.checked.icon);
    expect(badge("discovered", "md", true)).toContain("lucide-circle-check");
  });

  it("renders the detail size as a glyph and ink text with no tinted capsule", () => {
    const html = badge("seed", "md");
    expect(html).toContain("Radius reviewed");
    expect(html).toContain("Selected or edited by Frederick Radius");
    expect(html).not.toContain("rounded-full");
    expect(html).not.toContain("background");
    expect(html).toContain("color:var(--app-ink-2)");
    expect(html).toContain("color:var(--app-link)");
  });

  it("keeps the compact size as a tinted capsule for cards", () => {
    const html = badge("dfp", "sm");
    expect(html).toContain("Community source");
    expect(html).toContain("rounded-full");
    expect(html).toContain("color-mix(in srgb, var(--app-cool-text) 14%, transparent)");
  });

  it("renders nothing when there is no honest source claim", () => {
    expect(badge("unknown" as PlaceCardData["source"], "md")).toBe("");
  });
});
