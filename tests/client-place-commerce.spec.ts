import { describe, expect, it } from "vitest";
import type { Place } from "@/data/places";
import { commerceLinksFromBusinessInfo } from "@/lib/loaders/businessInfo";
import { placeActions } from "@/lib/place-actions";
import { mergeClientCommerceLinks } from "../scripts/lib/client-commerce-links";

function restaurant(overrides: Partial<Place> = {}): Place {
  return {
    slug: "business-info-only",
    name: "Business Info Only",
    category: "restaurant",
    short_blurb: "A local restaurant.",
    address: "1 Market Street",
    city: "Frederick",
    state: "MD",
    postal_code: "21701",
    municipality: "frederick",
    geom: { lat: 39.414, lng: -77.411 },
    is_verified: false,
    feature_score: 5,
    source: "manual",
    updated_at: "2026-07-27",
    ...overrides,
  };
}

describe("client place commerce artifact", () => {
  it("turns business-info-only reservation and order links into direct sheet actions", () => {
    const supplemental = commerceLinksFromBusinessInfo(
      "business-info-only",
      {
        commerce_links: [
          {
            type: "reservation",
            url: "https://business.example/reservations",
            source_url: "https://business.example",
          },
          {
            type: "order",
            url: "https://order.toasttab.com/online/business-info-only",
            source_url: "https://business.example",
          },
        ],
        source: {
          url: "https://business.example",
          fetchedAt: "2026-07-27T12:00:00.000Z",
        },
      },
    );
    const commerceLinks = mergeClientCommerceLinks(undefined, supplemental);
    const actions = placeActions(
      restaurant({ commerce_links: commerceLinks }),
    );

    expect(actions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          key: "reserve",
          label: "Reserve",
          href: "https://business.example/reservations",
        }),
        expect.objectContaining({
          key: "order",
          label: "Order on Toast",
          href: "https://order.toasttab.com/online/business-info-only",
        }),
      ]),
    );
    expect(
      actions.some(
        (action) =>
          action.key === "reserve-search" || action.key === "order-search",
      ),
    ).toBe(false);
  });

  it("keeps a curated link ahead of an exact business-info duplicate", () => {
    const curated = {
      provider: "website" as const,
      type: "reservation" as const,
      url: "https://business.example/reservations",
      source: "owner" as const,
      is_verified: true,
    };
    const supplemental = {
      ...curated,
      source: "imported" as const,
      is_verified: false,
      notes: "Server-only extraction note.",
      place_id: "business-info-only",
    };

    expect(
      mergeClientCommerceLinks([curated], [supplemental]),
    ).toEqual([curated]);
  });
});
