import { describe, expect, it } from "vitest";
import { GET } from "./route";

describe("map-card place payload", () => {
  it("publishes the attributed proxy photo, never an uncredited legacy Blob", async () => {
    const response = await GET(
      new Request("http://localhost/api/places/map-card/gravel-and-grind-frederick"),
      {
        params: Promise.resolve({ slug: "gravel-and-grind-frederick" }),
      },
    );

    expect(response.status).toBe(200);
    const body = (await response.json()) as {
      place?: {
        slug?: string;
        hero_image?: string;
        google_photo_url?: string;
        google_photo_attribution?: {
          google_maps_uri?: string;
        };
      };
    };
    expect(body.place?.slug).toBe("gravel-and-grind-frederick");
    expect(body.place?.hero_image).toBeUndefined();
    expect(body.place?.google_photo_url).toMatch(/^\/api\/place-photo\?/);
    expect(
      body.place?.google_photo_attribution?.google_maps_uri,
    ).toMatch(/^https:\/\/www\.google\.com\/maps\//);
  });

  it("returns the known Cafe Nola photo used by the selected map card", async () => {
    const response = await GET(
      new Request("http://localhost/api/places/map-card/cafe-nola"),
      { params: Promise.resolve({ slug: "cafe-nola" }) },
    );
    const body = (await response.json()) as {
      place?: { google_photo_url?: string };
    };

    expect(response.status).toBe(200);
    expect(body.place?.google_photo_url).toMatch(/^\/api\/place-photo\?/);
  });
});
