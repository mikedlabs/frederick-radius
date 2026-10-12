import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import FairDayPage from "@/components/fair/FairDayPage";

import MomentPage, { generateMetadata, generateStaticParams } from "./page";

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

async function renderMoment(slug: string): Promise<string> {
  const page = await MomentPage({ params: Promise.resolve({ slug }) });
  return renderToStaticMarkup(page);
}

describe("generic moment template", () => {
  it("draws no gradient wash, glow or sparkle eyebrow", async () => {
    for (const slug of ["catoctin-colorfest-2026", "fourth-of-july-2026"]) {
      const html = await renderMoment(slug);
      expect(html, slug).toContain(`data-moment-guide="${slug}"`);
      expect(html, slug).not.toContain("radial-gradient");
      expect(html, slug).not.toContain("140deg");
      // No sparkle eyebrow over the title (fireworks rows keep their icon).
      expect(html.slice(0, html.indexOf("</header>")), slug).not.toContain("lucide-sparkles");
      expect(html.match(/data-moment-rule/g), slug).toHaveLength(1);
    }
  });

  it("builds the Colorfest guide from sourced facts, both days and the park", async () => {
    const html = await renderMoment("catoctin-colorfest-2026");
    expect(html).toContain('data-moment-hero="licensed"');
    expect(html).toContain("Catoctin Colorfest</h1>");
    expect(html).toContain("OCT 10-11 · 2026");
    expect(html).toContain('data-moment-day="2026-10-10"');
    expect(html).toContain('data-moment-day="2026-10-11"');
    expect(html).toContain('data-moment-fact="Admission"');
    expect(html).toContain(">Free<");
    expect(html).toContain('data-moment-venue="thurmont-community-park-thurmont"');
    // The park has no car access during the show (the organizer closes
    // Frederick Road), so the one filled action is the parking and shuttle
    // section, and Directions is walking only. No link may drive anyone onto
    // the closed road.
    expect(html.match(/data-moment-arrival/g)).toHaveLength(1);
    expect(html).toContain('href="#getting-there"');
    expect(html).toContain('id="getting-there"');
    expect(html).toContain('data-moment-directions="walking"');
    expect(html).toMatch(/destination=39\.6213,-77\.4127594&amp;travelmode=walking/);
    expect(html).not.toContain("destination=19%20Frederick%20Rd");
    expect(html).toContain("Ride the free shuttle");
    // The credit waits for the photo to load.
    expect(html).not.toContain("CraigShipp.com Photos");
  });

  it("renders a fact tile only beside its source link", async () => {
    const html = await renderMoment("catoctin-colorfest-2026");
    const tiles = html.split('data-moment-fact="').slice(1);
    expect(tiles).toHaveLength(2);
    for (const tile of tiles) {
      expect(tile.slice(0, tile.indexOf("</div>"))).toMatch(/<a href="https:\/\//);
    }
  });

  it("prerenders the Colorfest slug with its own canonical", async () => {
    expect(generateStaticParams()).toContainEqual({ slug: "catoctin-colorfest-2026" });
    const metadata = await generateMetadata({
      params: Promise.resolve({ slug: "catoctin-colorfest-2026" }),
    });
    expect(metadata.title).toBe("Catoctin Colorfest");
    expect(metadata.alternates?.canonical).toBe("/moments/catoctin-colorfest-2026");
  });

  it("keeps a moment without a photo, venue or days on plain type", async () => {
    const html = await renderMoment("fourth-of-july-2026");
    expect(html).toContain('data-moment-hero="none"');
    expect(html).not.toContain("data-moment-directions");
    expect(html).not.toContain("data-moment-days");
    expect(html).toContain("FAQPage");
  });
});

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
