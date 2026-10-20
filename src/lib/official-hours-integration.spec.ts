import { readFileSync } from "node:fs";
import { basename } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { publicPlaces, decoratePlace, getPlaceBySlug } from "@/lib/loaders/places";
import { clientPlaceBySlug } from "@/lib/loaders/places-client";
import { clientPlaceHours, type ClientPlaceHours } from "@/lib/loaders/places-client-hours";
import { MERCHANT_HOURS_SOURCES, type MerchantHoursArtifact } from "@/lib/merchant-hours";
import { parseMerchantOfficialHours } from "../../scripts/lib/merchant-official-hours";
import { FCPL_BRANCHES } from "@/lib/official-hours";
import { getOpenStatus } from "@/lib/hours";
import { planOpenStateForWindow } from "@/lib/integrations/planner";
import { applyLivePlaceEvidence } from "@/lib/live-place-evidence";
import { openingHoursJsonLd, specialOpeningHoursJsonLd } from "@/lib/seo/jsonld";
import OFFICIAL from "@/data/places-official-hours.json";
import MERCHANTS from "@/data/places-merchant-hours.json";
import CLIENT_HOURS from "@/data/places-client-hours.json";

const librarySlugs = new Set<string>(FCPL_BRANCHES.map(([slug]) => slug));
const shippedMerchantHours = (CLIENT_HOURS as ClientPlaceHours[]).filter((row) => row.hours._official?.kind === "merchant");

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
    expect(clientPlaceHours(expired).filter((row) => librarySlugs.has(row.slug))).toEqual([]);
    for (const [slug] of FCPL_BRANCHES) expect(clientPlaceBySlug(slug)?.hours).toBeUndefined();
    const hours = getPlaceBySlug(FCPL_BRANCHES[1][0], undefined, now)!.hours!;
    expect(openingHoursJsonLd(hours)?.every((row) => "validThrough" in row)).toBe(true);
    const special = specialOpeningHoursJsonLd(hours);
    // This field may be absent on a normal refresh week, but it never includes
    // exceptions beyond the artifact's actual freshness window.
    expect(special?.every((row) => row.validThrough < OFFICIAL.expires_at.slice(0, 10)) ?? true).toBe(true);
  });
  it("expires every shipped merchant at its own exact evidence boundary, including snapshots with no current merchant schedules", () => {
    vi.useFakeTimers();
    for (const { slug, hours } of shippedMerchantHours) {
      const expiresAt = hours._official!.expires_at;
      for (const offset of [-1, 0, 1]) {
        const at = new Date(Date.parse(expiresAt) + offset);
        vi.setSystemTime(at);
        const full = clientPlaceBySlug(slug)!;
        const compact = clientPlaceHours(at).find((row) => row.slug === slug);
        if (offset < 0) {
          expect(full.hours, `${slug} immediately before expiry`).toBeDefined();
          expect(full.hours_verified).toBe(true);
          expect(compact?.hours).toEqual(full.hours);
        } else {
          expect(full.hours, `${slug} at expiry + ${offset}ms`).toBeUndefined();
          expect(full.hours_verified).toBe(false);
          expect(full.open_status.state).toBe("unknown");
          expect(compact).toBeUndefined();
        }
      }
    }
  });
  it("keeps current review holds out of both shipped client projections", () => {
    vi.useFakeTimers();
    for (const held of MERCHANTS.review as MerchantHoursArtifact["review"]) {
      vi.setSystemTime(new Date(held.checked_at));
      expect(clientPlaceBySlug(held.slug)?.hours).toBeUndefined();
      expect(clientPlaceHours().find((row) => row.slug === held.slug)).toBeUndefined();
    }
  });
  it("builds a held merchant as unknown without shipping its retained approval or pending candidate", async () => {
    const source = MERCHANT_HOURS_SOURCES[0];
    const observedAt = "2026-10-19T23:24:49.283Z";
    const at = new Date("2026-10-19T23:30:00.000Z");
    const approved = parseMerchantOfficialHours(source, { url: source.url, observedAt, html: readFileSync("tests/fixtures/merchant-hours/brewers-alley.html", "utf8") }, at);
    const artifact: MerchantHoursArtifact = { schema_version: 1, places: [approved], review: [{ slug: source.slug, checked_at: at.toISOString(), reason: "unparseable_or_conflicted", candidate: approved }] };
    const writes = new Map<string, string>();
    vi.useFakeTimers(); vi.setSystemTime(at);
    vi.resetModules();
    vi.doMock("@/data/places-merchant-hours.json", () => ({ default: artifact }));
    vi.doMock("node:fs", async () => ({ ...await vi.importActual<typeof import("node:fs")>("node:fs"), writeFileSync: vi.fn((path: string, data: string) => writes.set(basename(path), data)) }));
    try {
      // Exercise the real transformation while keeping every generated file untouched.
      await import("../../scripts/build-client-places");
      const full = JSON.parse(writes.get("places-client.json")!) as { slug: string; hours?: unknown; hours_verified: boolean }[];
      const compact = JSON.parse(writes.get("places-client-hours.json")!) as ClientPlaceHours[];
      expect(full.find((row) => row.slug === source.slug)).toMatchObject({ hours_verified: false });
      expect(full.find((row) => row.slug === source.slug)?.hours).toBeUndefined();
      expect(compact.some((row) => row.slug === source.slug)).toBe(false);
      vi.doMock("@/data/places-client.json", () => ({ default: full }));
      vi.doMock("@/data/places-client-hours.json", () => ({ default: compact }));
      vi.resetModules();
      const { clientPlaceBySlug: heldClientPlace } = await import("@/lib/loaders/places-client");
      const { clientPlaceHours: heldClientHours } = await import("@/lib/loaders/places-client-hours");
      for (const clock of [new Date(observedAt), at]) {
        vi.setSystemTime(clock);
        expect(heldClientPlace(source.slug)?.hours).toBeUndefined();
        expect(heldClientPlace(source.slug)?.hours_verified).toBe(false);
        expect(heldClientPlace(source.slug)?.open_status.state).toBe("unknown");
        expect(heldClientHours(clock).some((row) => row.slug === source.slug)).toBe(false);
      }
    } finally {
      vi.doUnmock("node:fs");
      vi.doUnmock("@/data/places-merchant-hours.json");
      vi.doUnmock("@/data/places-client.json");
      vi.doUnmock("@/data/places-client-hours.json");
      vi.resetModules();
    }
  });
});
