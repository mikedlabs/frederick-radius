/**
 * normalizeEventbrite: the parse boundary for the Eventbrite organizer
 * registry feed. Same contract as the other ticketed feeds: surface only
 * what Eventbrite returns and drop anything unplaceable (no datetime, no
 * venue coordinates, outside the county, not live), so a fabricated or
 * mislocated row can never reach the live spine.
 */
import { describe, it, expect } from "vitest";
import { normalizeEventbrite } from "@/lib/integrations/eventbrite";
import { stampEventProvenance } from "@/lib/provenance";

function ebEvent(over: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: "987654",
    name: { text: "Brewery Tap Takeover" },
    url: "https://www.eventbrite.com/e/987654",
    start: { utc: "2026-06-01T23:00:00Z" },
    end: { utc: "2026-06-02T02:00:00Z" },
    status: "live",
    is_free: false,
    venue: {
      name: "A Frederick Brewery",
      address: { city: "Frederick", localized_address_display: "123 Market St, Frederick, MD" },
      // Downtown Frederick, inside the county bbox.
      latitude: "39.4143",
      longitude: "-77.4105",
    },
    ...over,
  };
}
const wrap = (events: unknown[]) => ({ events });

describe("normalizeEventbrite", () => {
  it("normalizes a well-formed in-county live event", () => {
    const out = normalizeEventbrite(wrap([ebEvent()]));
    expect(out).toHaveLength(1);
    expect(out[0].id).toBe("eb-987654");
    expect(out[0].title).toBe("Brewery Tap Takeover");
    expect(out[0].source).toBe("eventbrite");
    expect(out[0].municipality).toBe("frederick");
    expect(out[0].geom).toEqual({ lng: -77.4105, lat: 39.4143 });
  });

  it("drops events with no datetime, no coordinates, or no title", () => {
    expect(normalizeEventbrite(wrap([ebEvent({ start: {} })]))).toHaveLength(0);
    expect(normalizeEventbrite(wrap([ebEvent({ venue: { name: "x" } })]))).toHaveLength(0);
    expect(normalizeEventbrite(wrap([ebEvent({ name: {} })]))).toHaveLength(0);
  });

  it("drops out-of-county and non-live events", () => {
    expect(normalizeEventbrite(wrap([ebEvent({ venue: { latitude: "39.29", longitude: "-76.61" } })]))).toHaveLength(0);
    expect(normalizeEventbrite(wrap([ebEvent({ status: "draft" })]))).toHaveLength(0);
    expect(normalizeEventbrite(wrap([ebEvent({ status: "canceled" })]))).toHaveLength(0);
  });

  it("carries the free flag only when Eventbrite says so", () => {
    expect(normalizeEventbrite(wrap([ebEvent({ is_free: true })]))[0].is_free).toBe(true);
    expect(normalizeEventbrite(wrap([ebEvent({ is_free: false })]))[0].is_free).toBe(false);
    expect(normalizeEventbrite(wrap([ebEvent({ is_free: undefined })]))[0].is_free).toBe(false);
  });

  it("returns [] for a malformed payload, never throws", () => {
    expect(normalizeEventbrite(null)).toEqual([]);
    expect(normalizeEventbrite({})).toEqual([]);
    expect(normalizeEventbrite({ events: "nope" })).toEqual([]);
  });

  it("stamps at the scraped tier (organizer-published, not reviewed)", () => {
    expect(stampEventProvenance({ slug: "x", source: "eventbrite" }).confidence).toBe("scraped");
  });
});

describe("Eventbrite description", () => {
  it("prefers the tight summary over the long body", () => {
    const out = normalizeEventbrite(
      wrap([
        ebEvent({
          summary: "A hands-on cider pressing afternoon.",
          description: { text: "A much longer body about the cider press." },
        }),
      ]),
    );
    expect(out[0].description).toBe("A hands-on cider pressing afternoon.");
  });

  it("falls back to the body text and never fabricates", () => {
    const withBody = normalizeEventbrite(
      wrap([ebEvent({ description: { text: "Long-form listing text." } })]),
    );
    expect(withBody[0].description).toBe("Long-form listing text.");
    const bare = normalizeEventbrite(wrap([ebEvent()]));
    expect(bare[0].description).toBe("");
  });
});
