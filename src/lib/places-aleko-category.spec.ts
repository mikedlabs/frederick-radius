import { describe, expect, it, vi } from "vitest";
import { categoryFromPrimaryType } from "@/lib/categoryFromGoogle";
import { decoratePlace, publicPlaceBySlug } from "@/lib/loaders/places";

vi.mock("@/data/places-enrichment.json", async (importOriginal) => {
  const actual = await importOriginal<{ default: Record<string, Record<string, unknown>> }>();
  return { ...actual, default: { ...actual.default,
    "alekos-middletown": { ...actual.default["alekos-middletown"], primary_type: "coffee_shop" },
  } };
});

describe("Aleko's reviewed canonical category", () => {
  it("keeps restaurant ahead of the old coffee category and conflicting provider type", () => {
    const canonical = publicPlaceBySlug("alekos-middletown");
    expect(canonical).toBeDefined();
    expect(canonical).toMatchObject({ slug: "alekos-middletown", name: "Aleko's", category: "restaurant", address: "6 N Church St, Middletown, MD 21769", municipality: "middletown", website: "https://www.alekosvillagecafe.com/" });
    expect(canonical!.phone?.replace(/\D/g, "")).toBe("3013713500");
    const rendered = decoratePlace({ ...canonical!, category: "coffee" }, undefined, new Date("2026-10-21T16:00:00Z"));
    expect(rendered.primary_type).toBe("coffee_shop");
    expect(categoryFromPrimaryType(rendered.primary_type)).toBe("coffee");
    expect(rendered.category).toBe("restaurant");
    expect(rendered.slug).toBe(canonical!.slug);
    expect(rendered.phone?.replace(/\D/g, "")).toBe("3013713500");
  });
});
