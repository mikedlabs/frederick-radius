import { describe, expect, it } from "vitest";
import { GET } from "./route";

describe("map-card place payload", () => {
  it("does not publish an uncredited legacy Blob photo", async () => {
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
      };
    };
    expect(body.place?.slug).toBe("gravel-and-grind-frederick");
    expect(body.place?.hero_image).toBeUndefined();
    expect(body.place?.google_photo_url).toBeUndefined();
  });
});
