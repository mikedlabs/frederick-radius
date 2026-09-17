import { describe, expect, it } from "vitest";
import type { Event } from "@/data/events";
import { qualifiedSearch, search } from "@/lib/search";

const now = new Date("2099-07-15T16:00:00Z");
const tasting: Event = {
  slug: "brunswick-tasting", title: "Coffee Tasting", description: "Coffee tasting with local roasters.",
  category: "food", venue_name: "Brunswick Hall", municipality: "brunswick",
  starts_at: "2099-07-15T23:00:00Z", ends_at: "2099-07-16T01:00:00Z",
  geom: { lng: -77.628, lat: 39.3134 }, is_free: true,
} as Event;

describe("explicit search result kinds", () => {
  it("retrieves events for a place-category query before applying the result limit", () => {
    const weakMatch = { ...tasting, title: "Roaster Roundtable", description: "A coffee tasting." };
    const { hits } = qualifiedSearch("coffee", 1, [weakMatch], { resultKind: "event", now });
    expect(hits).toEqual([expect.objectContaining({ type: "event", event: weakMatch })]);
  });

  it("keeps exact titles in All even when they imply a place category", () => {
    expect(qualifiedSearch("Coffee Tasting", 80, [tasting], { resultKind: "all", now }).hits)
      .toContainEqual(expect.objectContaining({ type: "event", event: tasting }));
    const neutralTitle = { ...tasting, title: "Radius Investor Showcase" };
    expect(qualifiedSearch(neutralTitle.title, 5, [neutralTitle], { resultKind: "all", now }).hits[0])
      .toMatchObject({ type: "event", event: { slug: tasting.slug } });
  });

  it("keeps the requested date and town in Events", () => {
    const elsewhere = { ...tasting, slug: "frederick-tasting", municipality: "frederick" };
    const tomorrow = { ...tasting, slug: "tomorrows-tasting", starts_at: "2099-07-16T23:00:00Z", ends_at: "2099-07-17T01:00:00Z" };
    const { hits, meta } = qualifiedSearch("coffee in Brunswick tonight", 10, [elsewhere, tomorrow, tasting], {
      resultKind: "event", municipality: "thurmont", now,
    });
    expect(hits).toEqual([expect.objectContaining({ type: "event", event: tasting })]);
    expect(meta.scopeMunicipality).toBe("brunswick");
    expect(meta.eventWindow?.label).toBe("Tonight");
  });

  it("does not broaden a compound patio request to an event with only a dog mention", () => {
    const partial = { ...tasting, title: "Dog Adoption Day", description: "Meet a dog at the shelter." };
    const complete = { ...tasting, title: "Dog-friendly Patio Meetup", description: "A dog-friendly gathering on the patio." };
    const { hits } = qualifiedSearch("dog-friendly patio", 20, [partial, complete], { resultKind: "all", now });
    expect(hits.filter((hit) => hit.type === "event")).toEqual([expect.objectContaining({ event: complete })]);
  });

  it("keeps a Places tab free of higher-ranking guide and event results", () => {
    const hits = qualifiedSearch("coffee", 1, [tasting], { resultKind: "place", now }).hits;
    expect(hits).toHaveLength(1);
    expect(hits[0].type).toBe("place");
  });

  it("finds guides and category doors before a narrow result cap", () => {
    const hits = search("coffee", 1, [tasting], { resultKind: "page", now });
    expect(hits).toHaveLength(1);
    expect(["page", "category", "municipality"]).toContain(hits[0].type);
  });
});
