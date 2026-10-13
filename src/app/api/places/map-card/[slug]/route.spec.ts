import { beforeEach, describe, expect, it, vi } from "vitest";
import type { PlaceCardData } from "@/lib/loaders/places";
import { GET } from "./route";

// The future generated index is represented by exact metadata fixtures. These
// tests do not repair, rewrite, or certify the checked-in legacy data artifact.
const fixture = vi.hoisted(() => {
  const credit = {
    photo_name: "places/ChIJtest/photos/photo-one",
    google_maps_uri: "https://www.google.com/maps/photos/photo-one",
    authors: [{ display_name: "A photographer" }],
  };
  // Independent fixed digest for the original fixture resource above. The
  // actual index-shaped route fixture must restore the same public metadata.
  const compactCredit = {
    photo_name_sha256: "730d30022cf9032684340fb3a68606f0eb36140923ffe6c05a01a6aff3b31e33",
    google_maps_uri: credit.google_maps_uri,
    authors: credit.authors,
  };
  return {
    places: new Map<string, PlaceCardData & { google_photo_policy_passed?: unknown }>(),
    evidence: vi.fn(async () => new Map()),
    credit,
    credits: {
      "gravel-and-grind-frederick": credit,
      "cafe-nola": compactCredit,
      "mismatched-digest": { ...compactCredit, photo_name_sha256: "0".repeat(64) },
      "legacy-credit": {
        google_maps_uri: credit.google_maps_uri,
        authors: credit.authors,
      },
      "mismatched-credit": { ...credit, photo_name: "places/ChIJtest/photos/old-photo" },
      "suppressed-place": credit,
      "quarantined-place": credit,
      "clear-photo-place": credit,
    },
  };
});
vi.mock("@/lib/loaders/places-client", () => ({
  clientPlaceBySlug: (slug: string) => fixture.places.get(slug),
}));
vi.mock("@/lib/loaders/livePlaceEvidence", () => ({
  loadLivePlaceEvidence: fixture.evidence,
}));
vi.mock("@/data/event-venue-photo-credits.json", () => ({ default: fixture.credits }));
vi.mock("@/data/photo-suppress.json", () => ({
  default: { slugs: ["suppressed-place"] },
}));
vi.mock("@/data/places-overrides.json", () => ({
  default: {
    patch: {
      "quarantined-place": { clearEnrichment: true },
      "clear-photo-place": { clearPhoto: true },
    },
  },
}));

function snapshot(slug: string): PlaceCardData & { google_photo_policy_passed?: unknown } {
  return {
    slug,
    name: "Selected place fixture",
    category: "coffee",
    short_blurb: "A selected-record transport fixture.",
    address: "1 Test Street",
    city: "Frederick",
    state: "MD",
    postal_code: "21701",
    municipality: "frederick",
    geom: { lng: -77.4105, lat: 39.4143 },
    is_verified: true,
    feature_score: 1,
    source: "manual",
    source_id: "fixture:" + slug,
    source_url: null,
    license: "Test fixture",
    confidence: "curated",
    first_seen_at: "2026-10-01T00:00:00Z",
    updated_at: "2026-10-01T00:00:00Z",
    last_verified_at: "2026-10-01T00:00:00Z",
    open_status: { state: "unknown" },
    google_photo_url:
      "/api/place-photo?name=" + encodeURIComponent(fixture.credit.photo_name) +
      "&w=800&slug=" + slug,
    google_photo_policy_passed: true,
  };
}

async function readCard(slug: string) {
  const response = await GET(
    new Request("http://localhost/api/places/map-card/" + slug),
    { params: Promise.resolve({ slug }) },
  );
  return {
    response,
    body: await response.json() as { place: Partial<PlaceCardData> | null },
  };
}

beforeEach(() => {
  fixture.places.clear();
  fixture.evidence.mockClear();
});

describe("map-card selected photo payload", () => {
  it("publishes an exact attributed proxy and never an uncredited legacy Blob", async () => {
    const slug = "gravel-and-grind-frederick";
    const place = snapshot(slug);
    fixture.places.set(slug, place);
    const { response, body } = await readCard(slug);
    expect(response.status).toBe(200);
    expect(body.place?.slug).toBe(slug);
    expect(body.place?.hero_image).toBeUndefined();
    expect(body.place?.google_photo_url).toBe(place.google_photo_url);
    expect(body.place?.google_photo_attribution).toEqual(fixture.credit);
    expect(body.place?.google_maps_uri).toBe(fixture.credit.google_maps_uri);
    expect(body.place?.address).toBe(place.address);
    expect(body.place?.open_status).toEqual({ state: "unknown" });
    expect(response.headers.get("Cache-Control")).toBe(
      "public, s-maxage=300, stale-while-revalidate=3600",
    );
    expect(fixture.evidence).toHaveBeenCalledExactlyOnceWith([slug]);
  });

  it("restores the selected Cafe Nola public resource from its exact compact index proof", async () => {
    const slug = "cafe-nola";
    fixture.places.set(slug, snapshot(slug));
    const { response, body } = await readCard(slug);
    expect(response.status).toBe(200);
    expect(body.place?.google_photo_url).toBe(snapshot(slug).google_photo_url);
    expect(body.place?.google_photo_attribution?.photo_name).toBe(fixture.credit.photo_name);
    expect(body.place?.google_photo_attribution).toEqual(fixture.credit);
    expect(body.place?.google_photo_attribution).not.toHaveProperty("photo_name_sha256");
  });

  it.each([
    "legacy-credit",
    "mismatched-credit",
    "mismatched-digest",
    "suppressed-place",
    "quarantined-place",
    "clear-photo-place",
  ])("keeps %s available without republishing its rejected image or credit", async (slug) => {
    fixture.places.set(slug, { ...snapshot(slug), hero_image: "/images/owned/place.jpg" });
    const { response, body } = await readCard(slug);
    expect(response.status).toBe(200);
    expect(body.place?.slug).toBe(slug);
    expect(body.place?.google_photo_url).toBeUndefined();
    expect(body.place?.google_photo_attribution).toBeUndefined();
    expect(body.place?.hero_image).toBe("/images/owned/place.jpg");
    expect(body.place?.address).toBe("1 Test Street");
    expect(body.place?.open_status).toEqual({ state: "unknown" });
  });

  it("does not allow an embedded wrong-resource credit to bypass rejection", async () => {
    const slug = "mismatched-credit";
    fixture.places.set(slug, {
      ...snapshot(slug),
      google_photo_attribution: {
        ...fixture.credit,
        photo_name: "places/ChIJtest/photos/another-photo",
      },
    });
    const { body } = await readCard(slug);
    expect(body.place?.google_photo_url).toBeUndefined();
    expect(body.place?.google_photo_attribution).toBeUndefined();
  });

  it("preserves an exact embedded credit without needing an index entry", async () => {
    const slug = "embedded-credit";
    fixture.places.set(slug, {
      ...snapshot(slug),
      google_photo_attribution: fixture.credit,
    });
    const { body } = await readCard(slug);
    expect(body.place?.google_photo_url).toBe(snapshot(slug).google_photo_url);
    expect(body.place?.google_photo_attribution).toEqual(fixture.credit);
  });

  it("does not let a differently bound selected record inherit the request slug's credit", async () => {
    fixture.places.set("cafe-nola", snapshot("another-place"));
    const { body } = await readCard("cafe-nola");
    expect(body.place?.slug).toBe("another-place");
    expect(body.place?.google_photo_url).toBeUndefined();
    expect(body.place?.google_photo_attribution).toBeUndefined();
  });

  it("rejects a truthy approval flag rather than re-publishing an unapproved resource", async () => {
    const slug = "cafe-nola";
    fixture.places.set(slug, { ...snapshot(slug), google_photo_policy_passed: "true" });
    const { body } = await readCard(slug);
    expect(body.place?.google_photo_url).toBeUndefined();
    expect(body.place?.google_photo_attribution).toBeUndefined();
  });

  it("retains unknown-place 404 behavior without optional evidence reads", async () => {
    const { response, body } = await readCard("unknown-place");
    expect(response.status).toBe(404);
    expect(body.place).toBeNull();
    expect(response.headers.get("Cache-Control")).toBe("public, max-age=60");
    expect(fixture.evidence).not.toHaveBeenCalled();
  });
});
