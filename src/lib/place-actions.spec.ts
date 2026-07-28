import { describe, expect, it } from "vitest";
import type { Place } from "@/data/places";
import { groupPlaceActions, placeActions } from "./place-actions";

function restaurant(overrides: Partial<Place> = {}): Place {
  return {
    slug: "test-restaurant",
    name: "Test Restaurant",
    category: "restaurant",
    short_blurb: "A test restaurant.",
    address: "1 Market Street",
    city: "Frederick",
    state: "MD",
    postal_code: "21701",
    municipality: "frederick",
    geom: { lat: 39.414, lng: -77.411 },
    is_verified: false,
    feature_score: 1,
    source: "manual",
    updated_at: "2026-07-27",
    ...overrides,
  };
}

describe("place commerce actions", () => {
  it("labels and demotes generic provider searches", () => {
    const actions = placeActions(
      restaurant({ website: "https://restaurant.example" }),
    );

    expect(actions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          key: "reserve-search",
          label: "Search OpenTable",
        }),
        expect.objectContaining({
          key: "order-search",
          label: "Search DoorDash",
        }),
        expect.objectContaining({ key: "website", label: "Website" }),
      ]),
    );

    const grouped = groupPlaceActions(actions, "restaurant");
    expect(grouped.secondary.map(({ key }) => key)).toEqual([
      "website",
      "parking",
    ]);
    expect(grouped.more.map(({ key }) => key)).toEqual([
      "reserve-search",
      "order-search",
    ]);
  });

  it("keeps confirmed direct links as Reserve and Order", () => {
    const actions = placeActions(
      restaurant({
        opentable_id: "12345",
        order_url: "https://order.restaurant.example",
      }),
    );

    expect(actions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ key: "reserve", label: "Reserve" }),
        expect.objectContaining({ key: "order", label: "Order online" }),
      ]),
    );
    expect(actions.some(({ key }) => key === "reserve-search")).toBe(false);
    expect(actions.some(({ key }) => key === "order-search")).toBe(false);
  });

  it("prefers a normalized direct reservation over provider searches", () => {
    const actions = placeActions(
      restaurant({
        commerce_links: [
          {
            type: "reservation",
            provider: "opentable",
            url: "https://www.opentable.com/r/test-restaurant-frederick",
            source: "curated",
          },
        ],
      }),
    );

    expect(actions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          key: "reserve",
          label: "Reserve",
          href: "https://www.opentable.com/r/test-restaurant-frederick",
        }),
      ]),
    );
    expect(actions.some(({ key }) => key === "reserve-search")).toBe(false);
  });

  it("does not present a DoorDash search URL as direct ordering", () => {
    const actions = placeActions(
      restaurant({
        doordash_url:
          "https://www.doordash.com/search/store/Test%20Restaurant",
      }),
    );

    expect(actions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          key: "order-search",
          label: "Search DoorDash",
        }),
      ]),
    );
  });
});
