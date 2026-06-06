import { describe, it, expect } from "vitest";
import { publicPlaces } from "@/lib/loaders/places";
import OVERRIDES from "@/data/places-overrides.json";

/**
 * Category mis-tag cleanup — service/practitioner businesses dumped into
 * destination categories (mostly `shopping`) are reclassified to
 * wellness/services via places-overrides.json `patch`, so they leave the
 * destination lanes and (once cards go typographic) wear the right mark.
 * Deterministic + reviewable; legit retail must NOT move.
 */
const bySlug = new Map((publicPlaces() as { slug: string; category: string; name: string }[]).map((p) => [p.slug, p]));

const DEST = new Set([
  "food","restaurant","coffee","bar","brewery","bakery","pizza","food-truck",
  "arts","museum","gallery","theater","music","public-art","park","trail",
  "outdoors","playground","family","shopping","antiques","book-store","market",
  "lodging","sports",
]);

describe("category overrides — services leave destination lanes", () => {
  it("known practitioners/services are reclassified through the loader", () => {
    expect(bySlug.get("red-canyon-physical-therapy")?.category).toBe("wellness");
    expect(bySlug.get("wastlers-barber-shop")?.category).toBe("services");
    expect(bySlug.get("vital-sources-psychological-services")?.category).toBe("wellness");
    expect(bySlug.get("kens-automotive-transmission")?.category).toBe("services");
  });

  it("legit retail is NOT moved (no over-reach)", () => {
    // Matched the broad LLC token but is a real shop — must stay shopping.
    const midar = bySlug.get("midar-fashion-llc");
    if (midar) expect(midar.category).toBe("shopping");
    expect((OVERRIDES.patch as Record<string, unknown>)["midar-fashion-llc"]).toBeUndefined();
  });

  it("no high-precision service name remains in a destination category", () => {
    const HI =
      /physical therap|chiropract|psycholog|psychiatr|psychotherap|counsel|\bdental\b|dentist|acupunctur|\bmassage\b|aesthetics|medspa|pain management|dialysis|\bsalon\b|barber|\bnails?\b|auto repair|transmission|financial center|lawn ?care|landscap|personal train|crossfit/i;
    const leaks = [...bySlug.values()].filter((p) => DEST.has(p.category) && HI.test(p.name || ""));
    expect(leaks).toHaveLength(0);
  });

  it("every category patch targets wellness or services (non-destination)", () => {
    const ok = new Set(["wellness", "services"]);
    for (const [, v] of Object.entries(OVERRIDES.patch as Record<string, { category?: string }>)) {
      if (v.category) expect(ok.has(v.category)).toBe(true);
    }
  });
});
