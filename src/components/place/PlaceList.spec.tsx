import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import type { PlaceCardData } from "@/lib/loaders/places";
import PlaceList from "./PlaceList";

vi.mock("./PlaceCard", () => ({
  default: ({ place }: { place: PlaceCardData }) => (
    <span data-place-card>{place.name}</span>
  ),
}));

const places = Array.from({ length: 60 }, (_, index) => ({
  slug: `place-${index + 1}`,
  name: `Place ${index + 1}`,
  tags: [],
})) as unknown as PlaceCardData[];

describe("PlaceList paging", () => {
  it("renders one bounded page instead of mounting a whole category", () => {
    const html = renderToStaticMarkup(
      <PlaceList places={places.slice(0, 30)} initialLayout="list" pageSize={24} />,
    );

    expect((html.match(/data-place-card/g) ?? [])).toHaveLength(24);
    expect(html).toContain("Place 24");
    expect(html).not.toContain("Place 25");
    expect(html).toContain("Show 6 more");
  });

  it("caps an oversized page request at 48 cards", () => {
    const html = renderToStaticMarkup(
      <PlaceList places={places} initialLayout="grid" pageSize={500} />,
    );

    expect((html.match(/data-place-card/g) ?? [])).toHaveLength(48);
    expect(html).toContain("Show 12 more");
  });
});
