import { describe, expect, it } from "vitest";

import FairDayPage from "@/components/fair/FairDayPage";

import MomentPage, { generateMetadata } from "./page";

const FAIR_SLUG = "great-frederick-fair-2026";

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
      "/images/fair/fairgrounds-night-mike-d-1920.jpg",
    ]);
  });
});
