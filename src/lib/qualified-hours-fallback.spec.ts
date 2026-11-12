import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { MERCHANT_HOURS_SOURCES, merchantHoursForPlace, validateMerchantHoursArtifact } from "./merchant-hours";
import { parseMerchantOfficialHours } from "../../scripts/lib/merchant-official-hours";
import { getOpenStatus } from "./hours";
import { mayUseLikelyOpenFallback } from "./likely-open";
import { likelyOpenPlaces } from "./loaders/places";
import { placesForMapClientTask } from "@/components/map/mapListTask";
import type { MapPinPlace } from "@/components/map/types";
import { isLikelyOpenNow } from "@/data/reliable-open-windows";
import { buildWantAnswer, selectOpeningSoonCandidate } from "./want-answer";

const source = MERCHANT_HOURS_SOURCES.find((row) => row.slug === "hootch-and-banter-frederick")!;
const observedAt = "2026-10-22T23:55:03.072Z";
const afterDinner = new Date("2026-10-23T02:30:00.000Z");
const row = parseMerchantOfficialHours(source, { url: source.url, html: readFileSync("tests/fixtures/merchant-hours/qualified-hootch.html", "utf8"), observedAt }, afterDinner);
const hours = merchantHoursForPlace({ slug: source.slug, category: source.category, website: source.url }, { schema_version: 1, places: [row], review: [] }, afterDinner).hours!;

describe("qualified hours cannot regain generic availability through curated fallbacks", () => {
  it("cannot silently strip the qualification from a qualified-only source artifact", () => {
    const altered = structuredClone(row); delete altered.qualification;
    expect(() => validateMerchantHoursArtifact({ schema_version: 1, places: [altered], review: [] })).toThrow(/retain.*qualification/);
    expect(merchantHoursForPlace({ slug: source.slug, category: source.category, website: source.url }, { schema_version: 1, places: [altered], review: [] }, afterDinner).hours).toBeUndefined();
  });

  it("blocks Hootch's old likely-open window while retaining ordinary unknown-place fallback", () => {
    expect(isLikelyOpenNow(source.slug, afterDinner)).toBe(true);
    expect(getOpenStatus(hours, { verified: true }, afterDinner)).toEqual({ state: "unknown" });
    expect(mayUseLikelyOpenFallback({ state: "unknown" }, { slug: source.slug, hours })).toBe(false);
    // Expired evidence and slim records omit the table, but retain identity.
    expect(mayUseLikelyOpenFallback({ state: "unknown" }, { slug: source.slug })).toBe(false);
    expect(mayUseLikelyOpenFallback({ state: "unverified" }, { slug: source.slug })).toBe(false);
    expect(mayUseLikelyOpenFallback({ state: "unknown" }, { slug: "dublin-roasters-frederick" })).toBe(true);
    expect(mayUseLikelyOpenFallback({ state: "unknown" }, { slug: "other-reviewed-service", hours })).toBe(false);
  });

  it("keeps the slim map Open now task and server fallback from promoting the qualified venue", () => {
    const pin: MapPinPlace = { slug: source.slug, name: source.name, category: source.category, subcategories: [], geom: { lng: -77.4105, lat: 39.4135 }, open_status: getOpenStatus(hours, { verified: true }, afterDinner), is_verified: true, source: "manual", municipality: "frederick", short_blurb: "" };
    expect("hours" in pin).toBe(false);
    expect(placesForMapClientTask([pin], "likely-open", afterDinner)).toEqual([]);
    expect(likelyOpenPlaces(undefined, afterDinner).some((place) => place.slug === source.slug)).toBe(false);
    const expired = new Date("2026-10-30T02:30:00.000Z");
    expect(isLikelyOpenNow(source.slug, expired)).toBe(true);
    expect(likelyOpenPlaces(undefined, expired).some((place) => place.slug === source.slug)).toBe(false);
  });

  it("does not turn the qualified venue into a likely upcoming opening or likely-open want answer", () => {
    const candidate = { slug: source.slug, name: source.name, feature_score: 10, open_status: { state: "unknown" as const } };
    expect(selectOpeningSoonCandidate([candidate], new Date("2026-10-22T19:30:00.000Z"))).toBeNull();
    const answer = buildWantAnswer("food", null, null, afterDinner, { refine: (place) => place.name === source.name });
    expect(answer?.total).toBe(1);
    const results = [answer?.hero, ...(answer?.also ?? []), ...(answer?.later ?? []), ...(answer?.notable ?? []), ...(answer?.open ?? []), answer?.soon].filter(Boolean);
    expect(results.some((result) => result?.confidence === "likely" || /Likely (?:open|opens)/.test(result?.fact ?? ""))).toBe(false);
  });
});
