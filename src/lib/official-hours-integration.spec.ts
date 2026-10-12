import { afterEach, describe, expect, it, vi } from "vitest";
import { publicPlaces, decoratePlace, getPlaceBySlug } from "@/lib/loaders/places";
import { clientPlaceBySlug } from "@/lib/loaders/places-client";
import { clientPlaceHours } from "@/lib/loaders/places-client-hours";
import { FCPL_BRANCHES } from "@/lib/official-hours";
import { getOpenStatus } from "@/lib/hours";
import { planOpenStateForWindow } from "@/lib/integrations/planner";
import { applyLivePlaceEvidence } from "@/lib/live-place-evidence";
import { openingHoursJsonLd, specialOpeningHoursJsonLd } from "@/lib/seo/jsonld";
import OFFICIAL from "@/data/places-official-hours.json";

const now = new Date(Math.max(Date.parse(OFFICIAL.weekly.observed_at), Date.parse(OFFICIAL.closures.observed_at)) + 1000);
// Use the committed observation for parity, and fixed source fixtures for holidays.
afterEach(() => vi.useRealTimers());
describe("published first-party schedule projections", () => {
  it("preserves all nine exact library identities independently of the Urbana market", () => {
    const rows = publicPlaces();
    for (const [slug] of FCPL_BRANCHES) expect(rows.filter((row) => row.slug === slug)).toHaveLength(1);
    const library = getPlaceBySlug("urbana-regional-library-new-market", undefined, now)!;
    const market = getPlaceBySlug("urbana-library-farmers-market-new-market", undefined, now)!;
    expect(library.slug).not.toBe(market.slug);
    expect(library.category).toBe("library");
    expect(library.municipality).toBe("urbana");
    expect(library.address).toContain("9020 Amelung");
    expect(market.category).toBe("market");
    expect(market.hours?._official).toBeUndefined();
  });
  it("keeps server, slim client, map and planner on the exact same date-aware evidence", () => {
    vi.useFakeTimers(); vi.setSystemTime(now);
    const map = new Map(clientPlaceHours(now).map((row) => [row.slug, row]));
    for (const [slug] of FCPL_BRANCHES) {
      const raw = publicPlaces().find((row) => row.slug === slug)!;
      const server = decoratePlace(raw, undefined, now);
      const client = clientPlaceBySlug(slug)!;
      expect(server.hours_source).toBe("first_party");
      expect(client.hours_source).toBe("first_party");
      expect(server.hours, slug).toEqual(client.hours);
      expect(map.get(slug)?.hours, slug).toEqual(server.hours);
      expect(client.open_status, slug).toEqual(server.open_status);
      expect(getOpenStatus(map.get(slug)?.hours, { verified: true }, now)).toEqual(server.open_status);
      if (server.open_status.state === "closed") expect(planOpenStateForWindow(client, now, 30)).toBe("closed");
    }
  });
  it("does not replace the holiday-aware source with a newer provider weekday projection", () => {
    const place = getPlaceBySlug(FCPL_BRANCHES[1][0], undefined, now)!;
    const result = applyLivePlaceEvidence(place, { slug: place.slug, placeId: place.google_place_id!, weekdayHours: ["Monday: Open 24 hours"], businessStatus: "OPERATIONAL", observedAt: now.toISOString() }, now);
    expect(result.hours).toEqual(place.hours);
    expect(result.hours_source).toBe("first_party");
  });
  it("expires both client projections and avoids indefinite ordinary-hour structured data", () => {
    const expired = new Date(Date.parse(OFFICIAL.expires_at) + 1);
    vi.useFakeTimers(); vi.setSystemTime(expired);
    expect(clientPlaceHours(expired).filter((row) => row.hours._official)).toEqual([]);
    for (const [slug] of FCPL_BRANCHES) expect(clientPlaceBySlug(slug)?.hours).toBeUndefined();
    const hours = getPlaceBySlug(FCPL_BRANCHES[1][0], undefined, now)!.hours!;
    expect(openingHoursJsonLd(hours)?.every((row) => "validThrough" in row)).toBe(true);
    const special = specialOpeningHoursJsonLd(hours);
    // This field may be absent on a normal refresh week, but it never includes
    // exceptions beyond the artifact's actual freshness window.
    expect(special?.every((row) => row.validThrough < OFFICIAL.expires_at.slice(0, 10)) ?? true).toBe(true);
  });
});
