import { describe, expect, it } from "vitest";
import type { CommerceLink } from "./types";
import {
  commerceActionLabel,
  commerceCardLabel,
  isCommerceSearchLink,
  resolveCommerceLinks,
} from "./links";

const basePlace = {
  slug: "test-place",
  commerce_links: [],
  opentable_id: undefined,
  resy_slug: undefined,
  order_url: undefined,
  menu_url: undefined,
  doordash_url: undefined,
  ubereats_url: undefined,
  grubhub_url: undefined,
};

describe("commerce link trust", () => {
  it("labels provider-wide searches as searches", () => {
    const openTableSearch: CommerceLink = {
      type: "reservation",
      provider: "opentable",
      url: "https://www.opentable.com/s?term=Frederick",
    };
    const doorDashSearch: CommerceLink = {
      type: "delivery",
      provider: "doordash",
      url: "https://www.doordash.com/search/store/coffee",
    };

    expect(isCommerceSearchLink(openTableSearch)).toBe(true);
    expect(commerceActionLabel(openTableSearch)).toBe("Search OpenTable");
    expect(commerceCardLabel(doorDashSearch)).toBe("Search DoorDash");
  });

  it("keeps direct provider profiles as direct actions", () => {
    const directReservation: CommerceLink = {
      type: "reservation",
      provider: "opentable",
      url: "https://www.opentable.com/r/test-place-frederick",
    };
    const directOrder: CommerceLink = {
      type: "order",
      provider: "doordash",
      url: "https://www.doordash.com/store/test-place-12345/",
    };

    expect(isCommerceSearchLink(directReservation)).toBe(false);
    expect(commerceActionLabel(directReservation)).toBe("Reserve");
    expect(commerceActionLabel(directOrder)).toBe("Order online");
  });

  it("merges source-backed supplemental links after curated links", () => {
    const curated: CommerceLink = {
      type: "reservation",
      provider: "opentable",
      url: "https://www.opentable.com/r/test-place-frederick",
      source: "curated",
    };
    const officialSite: CommerceLink = {
      type: "reservation",
      provider: "website",
      url: "https://test-place.example/reservations",
      source: "imported",
    };

    const links = resolveCommerceLinks(
      { ...basePlace, commerce_links: [curated] },
      [officialSite],
    );

    expect(links).toEqual([
      { ...curated, place_id: "test-place" },
      { ...officialSite, place_id: "test-place" },
    ]);
  });
});
