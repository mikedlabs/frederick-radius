import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { JOJOS_WINE_SPECIAL } from "@/data/jojos-wine-special";
import { allDeals } from "@/lib/loaders/todaysDeals";
import { isPublicEvent } from "@/lib/events/classify";
import { eventPlanEligibility } from "@/lib/plan/event-plan-eligibility";
import type { EventWithMeta } from "@/lib/loaders/events";
import { planAroundEvent, type PlanEventSources } from "@/lib/plan/resolve-shared-plan";
import { resolveEventPageBySlug, resolveEventMetadataBySlug } from "@/lib/loaders/eventResolver";
import EventPage, { generateMetadata } from "@/app/(app)/events/[slug]/page";

vi.mock("@/lib/loaders/eventResolver", async (importOriginal) => ({
  ...await importOriginal<typeof import("@/lib/loaders/eventResolver")>(),
  resolveEventPageBySlug: vi.fn(),
  resolveEventMetadataBySlug: vi.fn(),
}));
vi.mock("@/components/place/MapReturnLink", () => ({ default: () => null }));

const now = new Date("2026-11-24T15:30:00Z");
const offer: EventWithMeta = {
  slug: JOJOS_WINE_SPECIAL.slug,
  title: "Wind Down Wednesday at JoJo’s - 50% Off Bottles of Wine",
  source_url: JOJOS_WINE_SPECIAL.listingUrl,
  venue_place_slug: JOJOS_WINE_SPECIAL.venueSlug,
  description: "The dated listing supplied conflicting times.",
  starts_at: "2026-11-25T20:00:00.000Z", ends_at: "2026-11-25T23:00:00.000Z",
  timezone: "America/New_York", venue_name: "JoJo’s Restaurant & Tap House",
  address: "16–18 East Patrick St", geom: { lng: -77.4098, lat: 39.4141 },
  municipality: "frederick", category: "food", audience: ["adults"], is_free: false,
  source: "dfp", source_id: "dfp:wine-offer", is_verified: true, license: "Publisher",
  confidence: "verified", first_seen_at: now.toISOString(), last_verified_at: now.toISOString(),
  geo_confidence: "venue_match", category_name: "Food", municipality_name: "Frederick",
};

describe("JoJo’s Thanksgiving Eve wine listing", () => {
  it("keeps the weekly deal available with its purchase terms and out of timed discovery", async () => {
    expect(isPublicEvent(offer)).toBe(false);
    const deal = allDeals().find((item) => item.slug === JOJOS_WINE_SPECIAL.venueSlug && item.source_url === JOJOS_WINE_SPECIAL.termsUrl);
    expect(deal?.offer).toContain("two entrées");
    expect(deal?.offer).toContain("holiday availability");

    vi.mocked(resolveEventPageBySlug).mockResolvedValue({ kind: "live", event: offer });
    vi.mocked(resolveEventMetadataBySlug).mockResolvedValue({ kind: "live", event: offer });
    const params = Promise.resolve({ slug: offer.slug });
    const html = renderToStaticMarkup(await EventPage({ params, searchParams: Promise.resolve({}) }));
    expect(html).toContain(JOJOS_WINE_SPECIAL.termsUrl);
    expect(html).toContain(JOJOS_WINE_SPECIAL.dateNote);
    expect(html).toContain(`/places/${offer.venue_place_slug}`);
    expect(html).not.toMatch(/Plan around this event|Add to calendar|application\/ld\+json|3:00 PM/);
    expect((await generateMetadata({ params })).title).toBe(JOJOS_WINE_SPECIAL.title);
  });

  it("retains a saved reference without scheduling the offer or revealing a deleted row", async () => {
    const sources: PlanEventSources = {
      archive: async () => ({ matches: [{ requestedSlug: offer.slug, canonicalSlug: offer.slug, id: "id", event: offer, tombstoned: false, lastSeenAt: now.toISOString() }], unresolvedSlugs: [] }),
      seed: () => null, served: () => null,
    };
    const current = await planAroundEvent(offer.slug, undefined, { sources, now });
    expect(current?.stops).toEqual([]);
    expect(current?.notices?.[0]).toMatchObject({ code: "does_not_fit", event_href: `/events/${offer.slug}` });
    const tombstone = await planAroundEvent(offer.slug, undefined, {
      now, sources: { ...sources, archive: async () => ({ matches: [{ requestedSlug: offer.slug, canonicalSlug: offer.slug, id: "id", event: offer, tombstoned: true, lastSeenAt: now.toISOString() }], unresolvedSlugs: [] }) },
    });
    expect(tombstone?.notices?.[0]).toMatchObject({ code: "unavailable" });
    expect(tombstone?.notices?.[0].event_href).toBeUndefined();
  });

  it("preserves genuine performances and unrelated listings at the same venue", () => {
    const concert = { ...offer, title: "Music – Homecoming with Freddie Long", slug: "freddie-long-2026-11-25", source_url: "https://jojosrestauranttaphouse.com/events" };
    expect(eventPlanEligibility(concert, { nowMs: now.getTime(), hasResolvedVenue: true }).eligible).toBe(true);
    expect(isPublicEvent({ ...offer, slug: "other-occurrence-2026-12-02" })).toBe(true);
    expect(isPublicEvent({ ...offer, source_url: "https://example.org/other" })).toBe(true);
  });
});
