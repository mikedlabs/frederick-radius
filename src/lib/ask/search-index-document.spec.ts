import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/loaders/places", () => ({
  decoratePlace: (place: unknown) => place,
  publicPlaces: () => [],
}));
import { buildRadiusSearchDocument } from "./search-index-document";

describe("search document decision evidence", () => {
  const place = {
    slug: "test-store", name: "Store", category: "services", city: "Brunswick", municipality: "brunswick",
    address: "12 Main St", postal_code: "21716", geom: { lat: 39.3134, lng: -77.628 },
    search_aliases: ["key cutting"], amenities: ["bike-rack"], known_for: ["Tool repair"],
    field_note_tip: "The entrance is on the side street.",
  };

  it("includes known service and branch evidence in the lexical corpus", () => {
    const document = buildRadiusSearchDocument(place as never);
    expect(document.content).toContain("Address: 12 Main St");
    expect(document.content).toContain("Postal code: 21716");
    expect(document.content).toContain("Listed amenities: bike-rack");
    expect(document.content).toContain("key cutting");
    expect(document.content).toContain("Tool repair");
    expect(document.metadata).toMatchObject({ municipality: "brunswick", address: "12 Main St" });
  });

  it("does not embed changing hours, unsupported access claims or review snippets", () => {
    const document = buildRadiusSearchDocument({ ...place,
      open_status: { state: "open" }, review_snippet: "The best secret place ever",
    } as never);
    expect(document.content).not.toMatch(/open now|wheelchair|best secret/i);
  });

  it("changes document identity when a branch address is corrected", () => {
    expect(buildRadiusSearchDocument(place as never).contentHash).not.toBe(
      buildRadiusSearchDocument({ ...place, address: "25 Main St" } as never).contentHash,
    );
  });
});
