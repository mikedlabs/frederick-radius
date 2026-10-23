import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import { collectMerchantOfficialHours, fetchMerchantHoursPage, parseMerchantOfficialHours } from "../../scripts/lib/merchant-official-hours";
import { MERCHANT_HOURS_SOURCES, acceptReviewedMerchantHoursCandidate, merchantHoursForPlace, validateMerchantHoursArtifact, type MerchantHoursArtifact, type MerchantHoursSource } from "./merchant-hours";
import { getOpenStatus, hoursForDate } from "./hours";
import { openingHoursJsonLd, specialOpeningHoursJsonLd } from "./seo/jsonld";

const NOW = new Date("2026-10-20T23:45:00.000Z");
const sumittra = MERCHANT_HOURS_SOURCES.find((source) => source.slug === "sumittra-thai-cuisine")!;
const iguana = MERCHANT_HOURS_SOURCES.find((source) => source.slug === "the-curious-iguana-frederick")!;
const porto = MERCHANT_HOURS_SOURCES.find((source) => source.slug === "il-porto-restaurant")!;
const manual = [sumittra, iguana];
const fixture = (name: string) => readFileSync(`tests/fixtures/merchant-hours/${name}.html`, "utf8");
const sumittraHtml = fixture("sumittra-thai-cuisine");
const iguanaHtml = fixture("curious-iguana");
const portoHtml = fixture("il-porto-restaurant");
// Fixtures are fact-only excerpts, not full provider responses. Their comments
// identify the original private hashes; the parser hashes each supplied input.
// The first two timestamps are actual saved Firecrawl response file mtimes;
// Il Porto uses its native receipt observedAt. Future dates replay those facts
// solely to test temporal policy, never to claim a later source observation.
const observed = { [sumittra.slug]: "2026-10-20T11:49:26.851Z", [iguana.slug]: "2026-10-20T11:50:31.369Z", [porto.slug]: "2026-10-20T11:56:02.211Z" };
const bodies = { [sumittra.slug]: sumittraHtml, [iguana.slug]: iguanaHtml, [porto.slug]: portoHtml };
function parse(source: MerchantHoursSource, html?: string, observedAt?: string, now = NOW) {
  const body = html ?? (Object.hasOwn(bodies, source.slug) ? bodies[source.slug as keyof typeof bodies] : undefined);
  const stamp = observedAt ?? (Object.hasOwn(observed, source.slug) ? observed[source.slug as keyof typeof observed] : undefined);
  if (!body || !stamp) throw new Error("Explicit source fixture and observation are required.");
  return parseMerchantOfficialHours(source, { url: source.url, html: body, observedAt: stamp }, now);
}
const place = (source: MerchantHoursSource) => ({ slug: source.slug, category: source.category, website: source.url });
const artifact = (...places: MerchantHoursArtifact["places"]): MerchantHoursArtifact => ({ schema_version: 1, places, review: [] });
const nativeFixtures: Record<string, string> = {
  "brewers-alley-frederick": "brewers-alley", "gravel-and-grind-frederick": "gravel-and-grind",
  "beans-in-the-belfry-brunswick": "beans-in-the-belfry", "dublin-roasters-frederick": "dublin-roasters",
  pistarros: "pistarros", "jojos-restaurant-tap-house": "jojos-restaurant-tap-house", "thai-table-frederick": "thai-table-frederick",
  "thai-meric-eatery-bar-frederick": "thai-meric-eatery-bar-frederick", "white-rabbit-gastropub": "white-rabbit-gastropub",
  "il-porto-restaurant": "il-porto-restaurant",
  "kulfi-ice-creams-frederick": "kulfi-ice-creams-frederick",
  "delaplaine-arts-center-frederick": "delaplaine-arts-center",
  // Representative Aleko facts use this harness clock only, never public evidence.
  "alekos-middletown": "alekos-middletown",
  "common-market-frederick": "common-market", "common-market": "common-market",
  "safeway-middletown": "safeway-middletown", "safeway-walkersville": "safeway-walkersville",
  // These source excerpts use the harness clock only; their actual reviewed
  // observations remain in the separate source-replay evidence.
  "national-museum-civil-war-medicine-frederick": "qualified-museum",
  "the-tasting-room-frederick": "qualified-tasting-room",
  "hootch-and-banter-frederick": "qualified-hootch",
};
const native = MERCHANT_HOURS_SOURCES.filter((source) => !("collection" in source && source.collection === "manual"));
function baseline() {
  return artifact(...MERCHANT_HOURS_SOURCES.map((source) => manual.some((item) => item.slug === source.slug)
    ? parse(source)
    : parse(source, fixture(nativeFixtures[source.slug]), source.slug === "kulfi-ice-creams-frederick" ? "2026-10-20T23:40:48.409Z" : "2026-10-20T11:56:00.000Z")));
}
const nativeFetcher = () => vi.fn(async (url: string) => {
  const source = native.find((item) => item.url === url);
  if (!source) throw new Error("A manual source must never reach native transport.");
  return { url, html: fixture(nativeFixtures[source.slug]), observedAt: NOW.toISOString() };
});

describe("manually reviewed first-party merchant evidence", () => {
  it.each(manual)("hashes the supplied $name evidence input and retains its actual observation without substitution", (source) => {
    const row = parse(source);
    expect(row.source_sha256).toBe(createHash("sha256").update(bodies[source.slug]).digest("hex"));
    expect(row.observed_at).toBe(observed[source.slug]);
    expect(row.expires_at).toBe(new Date(Date.parse(observed[source.slug]) + 7 * 86400000).toISOString());
    expect(row.coverage_from).toBe("2026-10-20"); expect(row.coverage_through).toBe("2026-10-27");
    expect(merchantHoursForPlace(place(source), artifact(row), NOW).hours).toBeDefined();
  });

  it("preserves Sumittra's lunch/dinner gap and ordinary Sunday without inventing a holiday calendar", () => {
    const row = parse(sumittra);
    expect(row.hours.mon).toEqual([{ open: "11:00", close: "14:30" }, { open: "16:30", close: "21:00" }]);
    expect(row.hours.fri).toEqual([{ open: "11:00", close: "14:30" }, { open: "16:30", close: "22:00" }]);
    expect(row.hours.sat).toEqual([{ open: "12:00", close: "22:00" }]);
    expect(row.hours.sun).toEqual([{ open: "12:00", close: "21:00" }]);
    const hours = merchantHoursForPlace(place(sumittra), artifact(row), NOW).hours!;
    expect(getOpenStatus(hours, { verified: true }, new Date("2026-10-20T18:45:00Z"))).toMatchObject({ state: "closed", opensAt: "16:30", opensToday: true });
    expect(getOpenStatus(hours, { verified: true }, new Date("2026-10-20T21:00:00Z"))).toMatchObject({ state: "open", closesAt: "21:00" });
    expect(hours._official?.exceptions).toEqual([]); expect(specialOpeningHoursJsonLd(hours)).toBeUndefined();
    expect(sumittraHtml).toContain("Hours of service may differ");
  });

  it("keeps Iguana's ordinary Saturdays separate from the source's first-Saturday extension", () => {
    const row = parse(iguana);
    expect(row.hours.sat).toEqual([{ open: "10:00", close: "20:00" }]);
    expect(row.hours.sun).toEqual([{ open: "10:00", close: "19:00" }]);
    const hours = merchantHoursForPlace(place(iguana), artifact(row), NOW).hours!;
    expect(hours._official?.exceptions).toEqual([]);
    expect(openingHoursJsonLd(hours)?.some((item) => item.closes === "21:00")).toBe(false);
    expect(specialOpeningHoursJsonLd(hours)).toBeUndefined();
  });

  it.each([
    [sumittra, "12 E Patrick St.", "12 Wrong Street"], [sumittra, "(301) 668 2303", "(301) 668 9999"],
    [iguana, "12 North Market Street", "12 Wrong Street"], [iguana, "301-695-2500", "301-695-9999"],
  ] as const)("refuses missing exact visible location evidence for %j", (source, original, replacement) => {
    expect(bodies[source.slug]).toContain(original);
    expect(() => parse(source, bodies[source.slug].replaceAll(original, replacement))).toThrow(/location identity/);
  });
  it.each(manual)("rejects an unreviewed source URL for $name", (source) => {
    expect(() => parseMerchantOfficialHours(source, { url: `${source.url}unreviewed`, html: bodies[source.slug], observedAt: observed[source.slug] }, NOW)).toThrow(/Unapproved/);
  });
  it("rejects conflicting duplicate schedules and an incomplete second Sumittra block", () => {
    expect(parse(sumittra, sumittraHtml + sumittraHtml).hours).toEqual(parse(sumittra).hours);
    expect(() => parse(sumittra, sumittraHtml + sumittraHtml.replaceAll("11AM–2:30PM", "12PM–2:30PM"))).toThrow(/conflicting visible/);
    expect(() => parse(sumittra, sumittraHtml + "<p>Monday - Thursday 10AM–9PM</p>")).toThrow(/conflicting visible/);
    expect(() => parse(iguana, iguanaHtml + iguanaHtml.replaceAll("10 am-7 pm", "10 am-6 pm"))).toThrow(/conflicting visible/);
  });
  it("holds an altered or missing first-Saturday qualifier instead of publishing the ordinary week across it", () => {
    expect(iguanaHtml).toContain("First Sat: 10 am-9 pm");
    expect(() => parse(iguana, iguanaHtml.replaceAll("First Sat: 10 am-9 pm", "First Sat: 10 am-10 pm"))).toThrow(/first-Saturday/);
    expect(() => parse(iguana, iguanaHtml.replaceAll("First Sat: 10 am-9 pm", "Special Saturday hours"))).toThrow();
  });
  it.each(manual)("holds new closure/structured hours notices at $name", (source) => {
    expect(() => parse(source, bodies[source.slug] + "<p>Closing early today</p>")).toThrow(/notice/);
    expect(() => parse(source, bodies[source.slug] + '<script type="application/ld+json">{"openingHours":"Mo 01:00-02:00"}</script>')).toThrow(/Unreviewed structured/);
  });

  it("caps Iguana before New York midnight on November's first Saturday and never extends JSON-LD onto that date", () => {
    const now = new Date("2026-11-03T12:00:00.000Z");
    const row = parse(iguana, iguanaHtml, now.toISOString(), now);
    expect(row).toMatchObject({ expires_at: "2026-11-07T05:00:00.000Z", coverage_from: "2026-11-03", coverage_through: "2026-11-06" });
    const bundle = artifact(row);
    const before = new Date(Date.parse(row.expires_at) - 1);
    const hours = merchantHoursForPlace(place(iguana), bundle, before).hours!;
    expect(hours).toBeDefined(); expect(openingHoursJsonLd(hours)?.every((item) => item.validThrough === "2026-11-06")).toBe(true);
    for (const at of [new Date(row.expires_at), new Date(Date.parse(row.expires_at) + 1)]) {
      expect(merchantHoursForPlace(place(iguana), bundle, at).hours).toBeUndefined();
      expect(getOpenStatus(hours, { verified: true }, at).state).toBe("unknown");
      expect(hoursForDate(hours, at)).toBeUndefined();
      expect(openingHoursJsonLd(merchantHoursForPlace(place(iguana), bundle, at).hours)).toBeUndefined();
    }
    const unbounded = { ...row, expires_at: "2026-11-10T12:00:00.000Z", coverage_through: "2026-11-10" };
    expect(() => validateMerchantHoursArtifact(artifact(unbounded))).toThrow(/source-specific limit/);
  });
  it.each(["2026-11-07T05:00:00.000Z", "2026-11-08T04:59:59.999Z"])("refuses a new ordinary-week approval during the first Saturday: %s", (stamp) => {
    expect(() => parse(iguana, iguanaHtml, stamp, new Date(stamp))).toThrow(/First-Saturday/);
  });
  it("resumes ordinary weekly eligibility after the entire exception day, keeping other merchants' seven days unchanged", () => {
    const stamp = "2026-11-08T05:00:00.000Z";
    const row = parse(iguana, iguanaHtml, stamp, new Date(stamp));
    expect(row.expires_at).toBe("2026-11-15T05:00:00.000Z");
    const ordinary = parse(sumittra, sumittraHtml, "2026-11-03T12:00:00.000Z", new Date("2026-11-03T12:00:00.000Z"));
    expect(ordinary.expires_at).toBe("2026-11-10T12:00:00.000Z");
  });

  it("never requests manual sources or freshens their approved rows during native upkeep", async () => {
    const previous = baseline(); const fetcher = nativeFetcher();
    const result = await collectMerchantOfficialHours(previous, fetcher, NOW);
    expect(fetcher.mock.calls.map(([url]) => url)).toEqual([...new Set(native.map((source) => source.url))]);
    for (const source of manual) expect(result.artifact.places.find((row) => row.slug === source.slug)).toEqual(previous.places.find((row) => row.slug === source.slug));
    expect(result.artifact.review).toEqual([]); expect(result.reviewRequired).toBe(false);
  });
  it("preserves an existing manual hold, candidate, and checked_at exactly, including after accepted proof expires", async () => {
    const previous = baseline(); const row = previous.places.find((item) => item.slug === sumittra.slug)!;
    previous.review.push({ slug: sumittra.slug, checked_at: "2026-10-20T11:52:00.000Z", reason: "changed_facts", candidate: { ...row, observed_at: "2026-10-20T11:52:00.000Z", expires_at: "2026-10-27T11:52:00.000Z" } });
    const result = await collectMerchantOfficialHours(previous, nativeFetcher(), new Date("2026-10-28T12:00:00.000Z"));
    expect(result.artifact.places.find((item) => item.slug === sumittra.slug)).toEqual(row);
    expect(result.artifact.review.find((item) => item.slug === sumittra.slug)).toEqual(previous.review[0]);
    expect(merchantHoursForPlace(place(sumittra), result.artifact, NOW).hours).toBeUndefined();
  });
  it("does not enroll, timestamp or hold an absent manual record merely because native upkeep ran", async () => {
    const previous = baseline(); previous.places = previous.places.filter((row) => !manual.some((source) => source.slug === row.slug));
    const result = await collectMerchantOfficialHours(previous, nativeFetcher(), NOW);
    for (const source of manual) {
      expect(result.artifact.places.some((row) => row.slug === source.slug)).toBe(false);
      expect(result.artifact.review.some((row) => row.slug === source.slug)).toBe(false);
      expect(merchantHoursForPlace(place(source), result.artifact, NOW).hours).toBeUndefined();
    }
  });
  it.each(manual)("rejects direct native transport for $name before any request", async (source) => {
    const fetcher = vi.fn(); await expect(fetchMerchantHoursPage(source.url, fetcher)).rejects.toThrow(/native fetching is disabled/);
    expect(fetcher).not.toHaveBeenCalled();
  });
  it("requires exact candidate proof for manual acceptance and cannot redate expired evidence", () => {
    const row = parse(iguana); const pending: MerchantHoursArtifact = { schema_version: 1, places: [], review: [{ slug: row.slug, checked_at: row.observed_at, reason: "changed_facts", candidate: row }] };
    expect(() => acceptReviewedMerchantHoursCandidate(pending, row.slug, { source_sha256: "0".repeat(64), observed_at: row.observed_at }, NOW)).toThrow(/exact pending source proof/);
    expect(acceptReviewedMerchantHoursCandidate(pending, row.slug, row, NOW)).toEqual(artifact(row));
    expect(() => acceptReviewedMerchantHoursCandidate(pending, row.slug, row, new Date(row.expires_at))).toThrow(/expired/);
  });
});

describe("Il Porto exact Frederick location", () => {
  it("reads seven visible weekdays, hashes the supplied evidence and does not borrow the Gaithersburg phone", () => {
    expect(portoHtml).toContain("301-590-0735");
    const row = parse(porto);
    expect(row.source_sha256).toBe(createHash("sha256").update(portoHtml).digest("hex"));
    expect(row.hours.mon).toEqual([{ open: "11:30", close: "22:00" }]);
    expect(row.hours.sat).toEqual([{ open: "11:30", close: "22:00" }]);
    expect(row.hours.sun).toEqual([{ open: "11:30", close: "21:00" }]);
    expect(Object.keys(row.hours)).toHaveLength(7);
  });
  it.each([
    ["301.620.7480", "301.590.0735"], ["200 S. Market Street", "211 Muddy Branch Road"],
    ["11:30am am", "11:30pm pm"], ["Sunday:", "Unreviewed day:"],
  ])("rejects altered Frederick-local facts %s", (original, replacement) => {
    expect(portoHtml).toContain(original);
    expect(() => parse(porto, portoHtml.replaceAll(original, replacement))).toThrow();
  });
  it("rejects a conflicting second hours block and a Gaithersburg page URL", () => {
    expect(() => parse(porto, portoHtml + portoHtml.replaceAll("10:00 pm", "9:00 pm"))).toThrow(/conflicting visible/);
    expect(() => parseMerchantOfficialHours(porto, { url: "https://www.ilportorestaurant.com/location-gaithersburg/", html: portoHtml, observedAt: observed[porto.slug] }, NOW)).toThrow(/Unapproved/);
  });
});
