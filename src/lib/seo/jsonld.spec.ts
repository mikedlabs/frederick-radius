import { describe, it, expect } from "vitest";
import {
  absoluteSiteUrl,
  breadcrumbJsonLd,
  easternOffsetIso,
  itemListJsonLd,
  openingHoursJsonLd,
  specialOpeningHoursJsonLd,
} from "./jsonld";
import type { Hours } from "@/data/places";

describe("easternOffsetIso", () => {
  it("re-expresses a UTC instant in Eastern wall time with offset (EDT)", () => {
    expect(easternOffsetIso("2026-06-11T21:00:00.000Z")).toBe("2026-06-11T17:00:00-04:00");
  });
  it("uses the winter offset across DST (EST)", () => {
    expect(easternOffsetIso("2026-01-15T22:00:00.000Z")).toBe("2026-01-15T17:00:00-05:00");
  });
  it("returns undefined for missing/garbage input", () => {
    expect(easternOffsetIso(null)).toBeUndefined();
    expect(easternOffsetIso("nope")).toBeUndefined();
  });
});

describe("builders", () => {
  it("breadcrumbJsonLd positions items 1-based with absolute URLs", () => {
    const b = breadcrumbJsonLd([
      { name: "Places", path: "/places" },
      { name: "Brunswick", path: "/m/brunswick" },
    ]);
    expect(b.itemListElement[1]).toMatchObject({ position: 2, name: "Brunswick" });
    expect(String(b.itemListElement[0].item)).toMatch(/^https?:\/\/.+\/places$/);
  });
  it("itemListJsonLd carries the count", () => {
    expect(itemListJsonLd("x", [{ name: "a", path: "/a" }]).numberOfItems).toBe(1);
  });

  it("publishes only the structured hours supplied by the trusted loader", () => {
    expect(
      openingHoursJsonLd({
        mon: [
          { open: "09:00", close: "17:00" },
          { open: "18:00", close: "21:00" },
        ],
      }),
    ).toEqual([
      {
        "@type": "OpeningHoursSpecification",
        dayOfWeek: "https://schema.org/Monday",
        opens: "09:00",
        closes: "17:00",
      },
      {
        "@type": "OpeningHoursSpecification",
        dayOfWeek: "https://schema.org/Monday",
        opens: "18:00",
        closes: "21:00",
      },
    ]);
    expect(openingHoursJsonLd(undefined)).toBeUndefined();
  });

  it("does not advertise a qualified service or admission schedule as whole-venue opening hours", () => {
    const hours: Hours = {
      mon: [{ open: "16:00", close: "21:00" }],
      _official: {
        slug: "reviewed-dinner", source_url: "https://example.test/",
        observed_at: "2026-10-19T14:00:00.000Z", expires_at: "2026-10-26T14:00:00.000Z",
        coverage_from: "2026-10-19", coverage_through: "2026-10-26",
        exceptions: [{ date: "2026-10-20", reason: "Dinner service closes early.", closes_at: "20:00" }],
        qualification: { scope: "kitchen", label: "Dinner hours", note: "Bar hours differ.", usage: "display_only" },
      },
    };
    expect(openingHoursJsonLd(hours)).toBeUndefined();
    expect(specialOpeningHoursJsonLd(hours)).toBeUndefined();
    delete hours._official!.qualification;
    expect(openingHoursJsonLd(hours)).toHaveLength(1);
    expect(specialOpeningHoursJsonLd(hours)).toBeDefined();
  });

  it("turns app-relative image paths into absolute structured-data URLs", () => {
    expect(absoluteSiteUrl("/api/place-photo?name=Cafe%20Nola")).toMatch(
      /^https?:\/\/[^/]+\/api\/place-photo\?name=Cafe%20Nola$/,
    );
    expect(absoluteSiteUrl("https://images.example/photo.jpg")).toBe(
      "https://images.example/photo.jpg",
    );
  });
});
