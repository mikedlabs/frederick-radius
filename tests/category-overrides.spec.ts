import { describe, it, expect } from "vitest";
import { publicPlaces } from "@/lib/loaders/places";
import { CATEGORY_BY_SLUG } from "@/data/categories";
import OVERRIDES from "@/data/places-overrides.json";
import { placeActions } from "@/lib/place-actions";

/**
 * Category mis-tag cleanup via places-overrides.json `patch`. Two jobs:
 *   1. Service/practitioner businesses dumped into destination categories
 *      (mostly `shopping`) are demoted to services/wellness so they leave the
 *      discovery lanes.
 *   2. Genuine miscategorizations are corrected to their RIGHT lane — a
 *      restaurant filed under shopping moves to `restaurant`, the police HQ to
 *      `public-safety`, a children's chorus to `music`.
 * Patches are the final word (they win over Google's primaryType in the
 * loader). Deterministic + reviewable; legit retail must NOT move.
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

  it("keeps 7th Sister in restaurant discovery with its direct reservation", () => {
    const seventh = publicPlaces().find((place) => place.slug === "7th-sister");
    expect(seventh?.category).toBe("restaurant");
    expect(
      seventh
        ? placeActions(seventh).find((action) => action.key === "reserve")
        : undefined,
    ).toMatchObject({
      href: "https://7thsister.com/reservations",
      label: "Reserve",
    });
  });

  it("no high-precision service name remains in a destination category", () => {
    const HI =
      /physical therap|chiropract|psycholog|psychiatr|psychotherap|counsel|\bdental\b|dentist|acupunctur|\bmassage\b|aesthetics|medspa|pain management|dialysis|\bsalon\b|barber|\bnails?\b|auto repair|transmission|financial center|lawn ?care|landscap|personal train|crossfit/i;
    const leaks = [...bySlug.values()].filter((p) => DEST.has(p.category) && HI.test(p.name || ""));
    expect(leaks).toHaveLength(0);
  });

  it("every category patch targets a real, known category slug", () => {
    // Patches now fix genuine miscategorizations to the CORRECT lane, not only
    // demotions to services/wellness. The guardrail that remains: every target
    // must be a REAL category slug (a typo'd or dead slug fails), while the
    // leak + no-over-reach tests above hold the line against junk.
    for (const [slug, v] of Object.entries(OVERRIDES.patch as Record<string, { category?: string }>)) {
      if (v.category)
        expect(
          CATEGORY_BY_SLUG[v.category],
          `patch ${slug} targets unknown category "${v.category}"`,
        ).toBeDefined();
    }
  });
});
