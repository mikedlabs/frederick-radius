import { describe, expect, it } from "vitest";
import { CATEGORY_BY_SLUG } from "@/data/categories";
import { EVENT_BY_SLUG } from "@/data/events";
import { PLACE_BY_SLUG } from "@/data/places";
import { getEventBySlug } from "@/lib/loaders/events";
import { getPlaceBySlug } from "@/lib/loaders/places";
import { clientPlaceBySlug } from "@/lib/loaders/places-client";

const INHERITED_KEYS = ["__proto__", "constructor", "toString"] as const;

describe("public slug lookup contracts", () => {
  it.each(INHERITED_KEYS)("does not expose inherited key %s as an event", (slug) => {
    expect(EVENT_BY_SLUG[slug]).toBeUndefined();
    expect(() => getEventBySlug(slug)).not.toThrow();
    expect(getEventBySlug(slug)).toBeNull();
  });

  it.each(INHERITED_KEYS)("does not expose inherited key %s as a category", (slug) => {
    expect(CATEGORY_BY_SLUG[slug]).toBeUndefined();
  });

  it.each(INHERITED_KEYS)("does not expose inherited key %s as a place", (slug) => {
    expect(PLACE_BY_SLUG[slug]).toBeUndefined();
    expect(getPlaceBySlug(slug)).toBeNull();
    expect(clientPlaceBySlug(slug)).toBeUndefined();
  });
});
