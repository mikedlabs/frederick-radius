import { describe, expect, it } from "vitest";

import { generateMetadata } from "./page";

const IN_THE_STREET_SLUG = "in-the-street-2026";

describe("In The Streets moment route", () => {
  it("uses the owned photograph with descriptive accessible social metadata", async () => {
    const metadata = await generateMetadata({
      params: Promise.resolve({ slug: IN_THE_STREET_SLUG }),
    });

    const expectedImage = {
      url: "/images/moments/in-the-streets-2024-mike-d.jpg",
      width: 1920,
      height: 1078,
      alt: "A crowd on Market Street during In The Streets in downtown Frederick.",
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
