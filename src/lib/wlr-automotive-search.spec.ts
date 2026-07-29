import { describe, expect, it } from "vitest";
import { askFrederick } from "@/lib/ask/answer";
import { getPlaceBySlug, publicPlaces } from "@/lib/loaders/places";
import { qualifiedSearch } from "@/lib/search";

const WLR_SLUGS = [
  "route-40-lube-center-frederick",
  "route-85-lube-center-frederick",
  "jefferson-street-lube-center-frederick",
  "frederick-auto-repair",
  "frederick-auto-spa-route-40",
  "frederick-auto-spa-express-route-85",
  "frederick-auto-spa-express-route-26",
] as const;

const WLR_COORDINATES = {
  "route-40-lube-center-frederick": { lng: -77.4600143, lat: 39.4199638 },
  "route-85-lube-center-frederick": { lng: -77.408797, lat: 39.39129 },
  "jefferson-street-lube-center-frederick": { lng: -77.430772, lat: 39.407312 },
  "frederick-auto-repair": { lng: -77.4600237, lat: 39.4199729 },
  "frederick-auto-spa-route-40": { lng: -77.468537, lat: 39.422295 },
  "frederick-auto-spa-express-route-85": { lng: -77.4111144, lat: 39.3918069 },
  "frederick-auto-spa-express-route-26": { lng: -77.3881256, lat: 39.4492136 },
} satisfies Record<(typeof WLR_SLUGS)[number], { lng: number; lat: number }>;

const preciseContext = (
  lng: number,
  lat: number,
) => ({
  origin: { lng, lat },
  municipality: "frederick",
  contextLabel: "your location",
  canShowDistance: true,
});

function leadingPlaceSlug(
  query: string,
  context: ReturnType<typeof preciseContext>,
): string | undefined {
  const hit = qualifiedSearch(query, 12, undefined, context).hits.find(
    (hit) => hit.type === "place",
  );
  return hit?.type === "place" ? hit.place.slug : undefined;
}

describe("WLR Automotive Group place coverage", () => {
  it("publishes all seven current Frederick service locations", () => {
    const publicSlugs = new Set(publicPlaces().map((place) => place.slug));
    expect(WLR_SLUGS.every((slug) => publicSlugs.has(slug))).toBe(true);
  });

  it("carries first-party listing and hours provenance on every location", () => {
    for (const slug of WLR_SLUGS) {
      const place = getPlaceBySlug(slug);
      expect(place, slug).not.toBeNull();
      expect(place?.category, slug).toBe("auto-care");
      expect(place?.website, slug).toMatch(
        /^https:\/\/www\.washluberepair\.com\/location\//,
      );
      expect(place?.source_url, slug).toBe(place?.website);
      expect(place?.last_verified_at, slug).toBe(
        "2026-07-29T12:23:10.000Z",
      );
      expect(place?.hours_verified, slug).toBe(true);
      expect(place?.hours_updated_at, slug).toBe(
        "2026-07-29T12:23:10.000Z",
      );
      expect(place?.geom, slug).toEqual(WLR_COORDINATES[slug]);
    }
  });
});

describe("WLR Automotive Group search and Ask journeys", () => {
  it("distinguishes oil changes, repairs, and car washes and ranks each nearby location first", () => {
    expect(
      leadingPlaceSlug(
        "oil change near me",
        preciseContext(-77.408797, 39.39129),
      ),
    ).toBe("route-85-lube-center-frederick");
    expect(
      leadingPlaceSlug(
        "auto repair near me",
        preciseContext(-77.4600237, 39.4199729),
      ),
    ).toBe("frederick-auto-repair");
    expect(
      leadingPlaceSlug(
        "car wash near me",
        preciseContext(-77.3881256, 39.4492136),
      ),
    ).toBe("frederick-auto-spa-express-route-26");
  });

  it("understands the WLR brand and official service language", () => {
    const downtown = preciseContext(-77.414, 39.414);
    const route40 = preciseContext(-77.4600143, 39.4199638);
    const route26 = preciseContext(-77.3881256, 39.4492136);

    expect(leadingPlaceSlug("WLR", downtown)).toBe(
      "jefferson-street-lube-center-frederick",
    );
    expect(leadingPlaceSlug("Wash Lube Repair", downtown)).toBe(
      "jefferson-street-lube-center-frederick",
    );
    expect(leadingPlaceSlug("rt 40 lube", route40)).toBe(
      "route-40-lube-center-frederick",
    );
    expect(leadingPlaceSlug("free vacuums", route26)).toBe(
      "frederick-auto-spa-express-route-26",
    );
    expect(leadingPlaceSlug("state inspection", route40)).toBe(
      "frederick-auto-repair",
    );
    expect(leadingPlaceSlug("mechanic", route40)).toBe(
      "frederick-auto-repair",
    );
  });

  it("gives Ask nearby, actionable answers without blending the three services", async () => {
    const cases = [
      {
        query: "Where is the nearest oil change?",
        context: preciseContext(-77.408797, 39.39129),
        slug: "route-85-lube-center-frederick",
        name: "Route 85 Lube Center",
        phone: "(301) 668-1151",
      },
      {
        query: "Where is the nearest auto repair shop?",
        context: preciseContext(-77.4600237, 39.4199729),
        slug: "frederick-auto-repair",
        name: "Frederick Auto Repair",
        phone: "(301) 663-6304",
      },
      {
        query: "Where is the nearest car wash?",
        context: preciseContext(-77.3881256, 39.4492136),
        slug: "frederick-auto-spa-express-route-26",
        name: "Frederick Auto Spa Express – Route 26",
        phone: "(240) 815-7995",
      },
    ] as const;

    for (const testCase of cases) {
      const result = await askFrederick(testCase.query, testCase.context);
      expect(result.usedModel, testCase.query).toBe(false);
      expect(result.sources[0], testCase.query).toMatchObject({
        slug: testCase.slug,
        name: testCase.name,
        category: "auto-care",
        phone: testCase.phone,
      });
      expect(result.sources[0]?.distance, testCase.query).toBeTruthy();
      expect(result.answer, testCase.query).not.toMatch(
        /\bwait time\b|\bavailable bay\b/i,
      );
    }
  });
});
