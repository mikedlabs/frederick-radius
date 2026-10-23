import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import type { Hours } from "@/data/places";
import { MERCHANT_HOURS_SOURCES, merchantHoursForPlace, type MerchantHoursSource } from "@/lib/merchant-hours";
import { parseMerchantOfficialHours } from "../../../scripts/lib/merchant-official-hours";
import { getOpenStatus } from "@/lib/hours";
import { askScopedSchedule } from "./scoped-schedule";

const now = new Date("2026-10-23T16:00:00.000Z");
const cases = [
  ["national-museum-civil-war-medicine-frederick", "qualified-museum", "2026-10-22T14:53:26.300Z"],
  ["the-tasting-room-frederick", "qualified-tasting-room", "2026-10-22T23:54:54.110Z"],
  ["hootch-and-banter-frederick", "qualified-hootch", "2026-10-22T23:55:03.072Z"],
] as const;
function fixture(slug = cases[0][0] as string, file?: string, observedAt?: string) {
  const source = MERCHANT_HOURS_SOURCES.find((item) => item.slug === slug)!;
  const example = cases.find((item) => item[0] === slug);
  // Fixed offline fixture replay. These excerpt hashes never become a public
  // observation or replace the separately reviewed original response hashes.
  const row = parseMerchantOfficialHours(source, { url: source.url,
    html: readFileSync(`tests/fixtures/merchant-hours/${file ?? example?.[1]}.html`, "utf8"),
    observedAt: observedAt ?? example![2] }, now);
  return { source, row, place: {
    slug, category: source.category, website: source.url as string, hours_source: "first_party",
    hours_verified: true, hours_updated_at: row.observed_at,
    hours: merchantHoursForPlace({ slug, category: source.category, website: source.url }, { schema_version: 1, places: [row], review: [] }, now).hours!,
  } };
}
describe("qualified Ask schedule context", () => {
  it.each(cases)("retains the separate scoped table, qualification and exact source clocks for %s", (slug) => {
    const { place, row } = fixture(slug);
    const result = askScopedSchedule(place, now)!;
    expect(result).toMatchObject({ ...row.qualification, source_url: row.source_url,
      observed_at: row.observed_at, expires_at: row.expires_at, posted_weekly: row.hours,
      today: { date: "2026-10-23", periods: row.hours.fri } });
    expect(Object.keys(result.posted_weekly)).toEqual(["mon", "tue", "wed", "thu", "fri", "sat", "sun"]);
    expect(getOpenStatus(place.hours, { verified: true }, now)).toEqual({ state: "unknown" });
    expect(result).not.toHaveProperty("open");
    expect(result).not.toHaveProperty("admission_available");
  });
  it("preserves museum last admission separately from its later closing time", () => {
    const result = askScopedSchedule(fixture().place, now)!;
    expect(result.label).toBe("Museum hours");
    expect(result.note).toContain("Gallery admission ends at 4 p.m.");
    expect(result.today.periods).toEqual([{ open: "10:00", close: "17:00" }]);
  });
  it.each(cases)("omits %s at exact expiry even if the browser retains its old verified flag", (slug) => {
    const { place, row } = fixture(slug);
    expect(askScopedSchedule(place, new Date(Date.parse(row.expires_at) - 1))).toBeDefined();
    expect(askScopedSchedule(place, new Date(row.expires_at))).toBeUndefined();
    expect(askScopedSchedule(place, new Date(Date.parse(row.expires_at) + 1))).toBeUndefined();
  });
  it.each([
    ["slug", (p: ReturnType<typeof fixture>["place"]) => { p.slug = "another-museum"; }],
    ["category", (p: ReturnType<typeof fixture>["place"]) => { p.category = "restaurant" as MerchantHoursSource["category"]; }],
    ["website", (p: ReturnType<typeof fixture>["place"]) => { p.website = "https://unrelated.example/"; }],
    ["verification", (p: ReturnType<typeof fixture>["place"]) => { p.hours_verified = false; }],
    ["source kind", (p: ReturnType<typeof fixture>["place"]) => { p.hours_source = "google_places"; }],
    ["observation", (p: ReturnType<typeof fixture>["place"]) => { p.hours_updated_at = now.toISOString(); }],
    ["qualification", (p: ReturnType<typeof fixture>["place"]) => { delete p.hours._official!.qualification; }],
    ["evidence", (p: ReturnType<typeof fixture>["place"]) => { delete p.hours._official; }],
    ["source URL", (p: ReturnType<typeof fixture>["place"]) => { p.hours._official!.source_url = "https://unrelated.example/"; }],
    ["source identity", (p: ReturnType<typeof fixture>["place"]) => { p.hours._official!.slug = "another-museum"; }],
    ["source name", (p: ReturnType<typeof fixture>["place"]) => { p.hours._official!.source_name = "Another museum"; }],
    ["partial week", (p: ReturnType<typeof fixture>["place"]) => { delete p.hours.sun; }],
    ["incomplete qualification", (p: ReturnType<typeof fixture>["place"]) => { p.hours._official!.qualification!.note = ""; }],
  ] as const)("omits stripped or mismatched %s instead of borrowing a different source", (_, change) => {
    const { place } = fixture(); change(place);
    expect(askScopedSchedule(place, now)).toBeUndefined();
  });
  it("leaves ordinary venue schedules unchanged and absent from scoped context", () => {
    const { place } = fixture("gravel-and-grind-frederick", "gravel-and-grind", "2026-10-22T12:00:00.000Z");
    expect(askScopedSchedule(place, now)).toBeUndefined();
    expect(getOpenStatus(place.hours, { verified: true }, now).state).toBe("open");
  });
  it("copies the projected periods so later model preparation cannot alter the source object", () => {
    const { place } = fixture();
    const original: Hours = structuredClone(place.hours);
    const result = askScopedSchedule(place, now)!;
    result.posted_weekly.mon[0].open = "01:00";
    result.today.periods[0].close = "23:00";
    expect(place.hours).toEqual(original);
  });
});
