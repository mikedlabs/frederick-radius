import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import type { PlaceCardData } from "@/lib/loaders/places";
import PlaceList from "./PlaceList";

vi.mock("./PlaceCard", () => ({
  default: ({
    place,
    variant,
    compact,
  }: {
    place: PlaceCardData;
    variant?: string;
    compact?: boolean;
  }) => (
    <span data-place-card data-variant={variant} data-compact={compact ? "yes" : "no"}>
      {place.name}
    </span>
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

  it("lists full picture rows, stacked on their own rules", () => {
    const html = renderToStaticMarkup(
      <PlaceList places={places.slice(0, 3)} initialLayout="list" />,
    );

    // Compact rows dropped status, rating and price (October 2026 row audit).
    expect(html).not.toContain('data-compact="yes"');
    expect((html.match(/data-variant="row"/g) ?? [])).toHaveLength(3);
    // The rows draw a 1px rule each; a gap between them would split the
    // ruled column back into separate cards.
    expect(html).not.toMatch(/<ul[^>]*space-y-/);
  });

  it("caps an oversized page request at 48 cards", () => {
    const html = renderToStaticMarkup(
      <PlaceList places={places} initialLayout="grid" pageSize={500} />,
    );

    expect((html.match(/data-place-card/g) ?? [])).toHaveLength(48);
    expect(html).toContain("Show 12 more");
  });
});
