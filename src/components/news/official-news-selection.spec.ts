import { describe, expect, it } from "vitest";
import type { CivicPressItem, OfficialCivicNewsResult } from "@/lib/integrations/civic-press";
import { officialNewsSelection } from "./official-news-selection";
const row = (title: string, source: CivicPressItem["source"], publishedAt: string): CivicPressItem => ({
  title, source, sourceShort: source === "City of Frederick" ? "City" : "County", lane: "civic",
  publishedAt, url: `https://example.gov/${title}`,
});
const county = [row("County latest", "Frederick County", "2026-10-11T12:00:00.000Z"),
  row("County second", "Frederick County", "2026-10-10T12:00:00.000Z")];
const city = [row("City latest", "City of Frederick", "2026-10-08T12:00:00.000Z"),
  row("City second", "City of Frederick", "2026-10-07T12:00:00.000Z")];
const sources: NonNullable<OfficialCivicNewsResult["sources"]> = [
  { id: "city_official_news", source: "City of Frederick", scope: "city", channel: "news", status: "available",
    checkedAt: "2026-10-12T12:00:00.000Z", latestPublishedAt: city[0].publishedAt },
  { id: "county_official_news", source: "Frederick County", scope: "county", channel: "news", status: "available",
    checkedAt: "2026-10-12T12:00:00.000Z", latestPublishedAt: county[0].publishedAt },
];
const result = (): OfficialCivicNewsResult => ({ items: [...county, ...city], status: "available", sources });

describe("compact official newsroom selection", () => {
  it("shows each verified publisher's latest dated item while retaining the original order and publication times", () => {
    const selected = officialNewsSelection(result(), 2);
    expect(selected).toEqual([county[0], city[0]]);
    expect(selected[1].publishedAt).toBe("2026-10-08T12:00:00.000Z");
  });
  it("keeps Pulse's six-story selection newest-first without publisher balancing", () => {
    expect(officialNewsSelection(result(), 6)).toEqual([...county, ...city]);
  });
  it("does not promote an unavailable publisher's retained item over actual verified results", () => {
    const value = result();
    value.items[2] = { ...city[0], publishedAt: "2026-10-12T11:59:00.000Z" };
    value.sources = [{ ...sources[0], status: "unavailable", reason: "request_failed" }, sources[1]];
    expect(officialNewsSelection(value, 2)).toEqual(county);
  });
  it("does not resurrect a previous item from a source that successfully returned empty", () => {
    const value = result();
    value.sources = [{ ...sources[0], status: "empty", latestPublishedAt: null }, sources[1]];
    expect(officialNewsSelection(value, 2)).toEqual(county);
  });
  it("does not promote an undated City item over a second dated County result just to balance publishers", () => {
    const value = result();
    value.items = [...county, { ...city[0], publishedAt: "1970-01-01T00:00:00.000Z" }, { ...city[1], publishedAt: "not a date" }];
    expect(officialNewsSelection(value, 2)).toEqual(county);
  });
  it("leaves an unknown-date item readable when no better dated result exists", () => {
    const value = result();
    value.items = [county[0], { ...city[0], publishedAt: "1970-01-01T00:00:00.000Z" }];
    expect(officialNewsSelection(value, 2)).toEqual(value.items);
  });
  it("keeps dated historical reports readable when both checks expired, without pretending both sources are current", () => {
    const value = result();
    value.status = "unavailable";
    value.sources = sources.map((source) => ({ ...source, status: "unavailable", reason: "stale" }));
    expect(officialNewsSelection(value, 2)).toEqual(county);
  });
  it("does not infer checked publisher coverage from a legacy result without source clocks", () => {
    expect(officialNewsSelection({ items: [...city, ...county], status: "available" }, 2)).toEqual(county);
  });
  it("balances unique verified publishers when both City subscriptions are usable", () => {
    const value = result();
    const broad = { ...city[0], sourceId: "city_official_releases" as const, title: "Dated City recreation notice", url: "https://city.example/notice", publishedAt: "2026-10-11T13:00:00.000Z" };
    value.items = [broad, ...value.items];
    value.sources = [...sources, { ...sources[0], id: "city_official_releases", channel: "safety", latestPublishedAt: broad.publishedAt }];
    expect(officialNewsSelection(value, 2)).toEqual([broad, county[0]]);
  });
  it("uses the actual broad City feed when dedicated City news fails", () => {
    const value = result();
    const broad = { ...city[0], sourceId: "city_official_releases" as const, title: "Dated City recreation notice", url: "https://city.example/notice" };
    value.items = [...county, { ...city[0], sourceId: "city_official_news", publishedAt: "2026-10-12T11:59:00.000Z" }, broad];
    value.sources = [{ ...sources[0], status: "unavailable", reason: "request_failed" }, sources[1], { ...sources[0], id: "city_official_releases", channel: "safety" }];
    expect(officialNewsSelection(value, 2)).toEqual([county[0], broad]);
  });
  it.each(["unavailable", "empty"] as const)("does not borrow another City feed's successful check for a %s broad-feed row", (status) => {
    const value = result();
    const broad = { ...city[0], sourceId: "city_official_releases" as const, title: "Retained broad notice", url: "https://city.example/notice", publishedAt: "2026-10-12T11:59:00.000Z" };
    value.items = [broad, ...county, { ...city[0], sourceId: "city_official_news" }];
    value.sources = [...sources, { ...sources[0], id: "city_official_releases", channel: "safety", status }];
    expect(officialNewsSelection(value, 2)).toEqual([county[0], { ...city[0], sourceId: "city_official_news" }]);
  });
  it("shows one canonical City item when subscriptions repeat the same dated civic release", () => {
    const value = result();
    const dedicated = { ...city[0], sourceId: "city_official_news" as const };
    value.items = [...county, dedicated, { ...dedicated, sourceId: "city_official_releases" }];
    value.sources = [...sources, { ...sources[0], id: "city_official_releases", channel: "safety" }];
    expect(officialNewsSelection(value, 6)).toEqual([...county, dedicated]);
  });

});
