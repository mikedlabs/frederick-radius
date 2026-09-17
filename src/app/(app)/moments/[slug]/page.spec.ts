import { describe, expect, it } from "vitest";

import FairDayPage from "@/components/fair/FairDayPage";

import MomentPage, { generateMetadata } from "./page";

const FAIR_SLUG = "great-frederick-fair-2026";
const IN_THE_STREET_SLUG = "in-the-street-2026";

describe("Fair Day moment route", () => {
  it("renders the purpose-built Fair Day workspace", async () => {
    const result = await MomentPage({
      params: Promise.resolve({ slug: FAIR_SLUG }),
    });

    expect(result.type).toBe(FairDayPage);
  });

  it("keeps the independent guide explicit in discoverable metadata", async () => {
    const metadata = await generateMetadata({
      params: Promise.resolve({ slug: FAIR_SLUG }),
    });

    expect(metadata.title).toBe("Fair Day | The Great Frederick Fair 2026");
    expect(metadata.description).toContain("independent Frederick Radius guide");
    expect(metadata.alternates?.canonical).toBe(
      "/moments/great-frederick-fair-2026",
    );
    expect(metadata.openGraph?.images).toEqual([
      expect.objectContaining({
        url: "/images/fair/fairgrounds-night-mike-d-1920.jpg",
        width: 1920,
        height: 1080,
      }),
    ]);
    expect(metadata.twitter?.images).toEqual([
      expect.objectContaining({
        url: "/images/fair/fairgrounds-night-mike-d-1920.jpg",
        alt: "The Great Frederick Fairgrounds glowing at night, seen from above.",
      }),
    ]);
  });
});

describe("In The Streets moment route", () => {
  it("uses the finished, attributed photograph in accessible social metadata", async () => {
    const metadata = await generateMetadata({
      params: Promise.resolve({ slug: IN_THE_STREET_SLUG }),
    });

    const expectedImage = {
      url: "/images/moments/in-the-streets-2024-mike-d.jpg",
      width: 1920,
      height: 1078,
      alt: "A packed Market Street during In The Streets in downtown Frederick, photographed in 2024.",
    };
    expect(metadata.openGraph?.images).toEqual([
      expect.objectContaining(expectedImage),
    ]);
    expect(metadata.twitter?.images).toEqual([
      expect.objectContaining({
        url: expectedImage.url,
        alt: expectedImage.alt,
      }),
    ]);
  });
});
