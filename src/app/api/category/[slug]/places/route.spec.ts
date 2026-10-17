import { describe, expect, it } from "vitest";

import { CATEGORY_CACHE_CONTROL } from "@/lib/category/browse";

import { dynamic, GET } from "./route";

const request = (slug: string, query = "") =>
  new Request(`https://frederickradius.app/api/category/${slug}/places${query}`);

describe("GET /api/category/[slug]/places", () => {
  it("stays dynamic for query ranking and still publishes a public SWR header", async () => {
    const response = await GET(request("food"), {
      params: Promise.resolve({ slug: "food" }),
    });

    expect(dynamic).toBe("force-dynamic");
    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe(CATEGORY_CACHE_CONTROL);

    const body = (await response.json()) as { places: unknown[]; totalCount: number };
    expect(body.places).toHaveLength(32);
    expect(body.totalCount).toBeGreaterThan(32);
  });

  it("rejects amenity and unknown slugs without caching them as a directory", async () => {
    const unknown = await GET(request("not-a-category"), {
      params: Promise.resolve({ slug: "not-a-category" }),
    });
    const amenity = await GET(request("restroom"), {
      params: Promise.resolve({ slug: "restroom" }),
    });

    expect(unknown.status).toBe(404);
    expect(amenity.status).toBe(404);
    expect(unknown.headers.get("Cache-Control")).toBe("public, s-maxage=60");
  });

  it("honors a town scope on the continuation", async () => {
    const response = await GET(request("playground", "?scope=walkersville"), {
      params: Promise.resolve({ slug: "playground" }),
    });
    const body = (await response.json()) as {
      filterMuni: string | null;
      places: { municipality?: string }[];
    };

    expect(response.status).toBe(200);
    expect(body.filterMuni).toBe("walkersville");
    expect(body.places.every((place) => place.municipality === "walkersville")).toBe(
      true,
    );
  });
});
