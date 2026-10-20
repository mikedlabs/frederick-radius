import { createHash } from "node:crypto";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import type { Hours } from "@/data/places";
import { getOpenStatus } from "./hours";
import { WEEKDAYS } from "./official-hours";
import { acceptReviewedMerchantHoursCandidate, merchantHoursForPlace, MERCHANT_HOURS_SOURCES, type MerchantHoursArtifact } from "./merchant-hours";
import { collectMerchantOfficialHours, parseMerchantOfficialHours } from "../../scripts/lib/merchant-official-hours";

const { JSDOM } = createRequire(import.meta.url)("jsdom") as { JSDOM: new (html: string) => { window: { document: Document } } };
const now = new Date("2026-10-20T12:00:00.000Z");
const observations = {
  pistarros: "2026-10-20T11:42:20.553Z",
  "white-rabbit-gastropub": "2026-10-20T11:43:10.835Z",
  "jojos-restaurant-tap-house": "2026-10-20T11:42:21.312Z",
  "thai-table-frederick": "2026-10-20T11:42:21.785Z",
  "thai-meric-eatery-bar-frederick": "2026-10-20T11:42:21.627Z",
} as const;
type Slug = keyof typeof observations;
const sources = Object.keys(observations).map((slug) => MERCHANT_HOURS_SOURCES.find((source) => source.slug === slug)!);
const page = (slug: Slug) => ({ url: sources.find((source) => source.slug === slug)!.url, observedAt: observations[slug], html: readFileSync(`tests/fixtures/merchant-hours/${slug}.html`, "utf8") });
const parse = (slug: Slug, html = page(slug).html) => parseMerchantOfficialHours(sources.find((source) => source.slug === slug)!, { ...page(slug), html }, now);
const artifact = (slug: Slug): MerchantHoursArtifact => ({ schema_version: 1, places: [parse(slug)], review: [] });
const place = (slug: Slug) => { const source = sources.find((source) => source.slug === slug)!; return { slug, category: source.category, website: source.url }; };
const slot = (open: string, close: string) => ({ open, close });
const expected: Record<Slug, Hours> = {
  "white-rabbit-gastropub": Object.fromEntries(WEEKDAYS.map((day) => [day, [slot("11:00", "22:00")]])),
  pistarros: { mon: [slot("11:30", "21:00")], tue: [slot("11:30", "21:00")], wed: [slot("11:30", "21:00")], thu: [slot("11:30", "21:00")], fri: [slot("11:30", "21:30")], sat: [slot("11:30", "21:30")], sun: [slot("10:00", "21:00")] },
  "jojos-restaurant-tap-house": { mon: [], tue: [], wed: [slot("11:00", "00:00")], thu: [slot("11:00", "00:00")], fri: [slot("11:00", "02:00")], sat: [slot("10:00", "02:00")], sun: [slot("10:00", "00:00")] },
  "thai-table-frederick": { mon: [], tue: [slot("11:30", "14:30"), slot("16:30", "21:00")], wed: [slot("11:30", "14:30"), slot("16:30", "21:00")], thu: [slot("11:30", "14:30"), slot("16:30", "21:00")], fri: [slot("11:30", "14:30"), slot("16:30", "21:30")], sat: [slot("12:00", "21:30")], sun: [slot("12:00", "20:30")] },
  "thai-meric-eatery-bar-frederick": { mon: [slot("11:00", "14:15"), slot("16:00", "20:45")], tue: [slot("11:00", "14:15"), slot("16:00", "20:45")], wed: [slot("11:00", "14:15"), slot("16:00", "20:45")], thu: [slot("11:00", "14:15"), slot("16:00", "20:45")], fri: [slot("11:00", "14:15"), slot("16:00", "21:15")], sat: [slot("12:00", "21:15")], sun: [slot("12:00", "20:45")] },
};
function edit(slug: Slug, mutate: (document: Document) => void): string {
  const document = new JSDOM(page(slug).html).window.document;
  mutate(document);
  return document.documentElement.outerHTML;
}
function specification(slug: Slug, mutate: (entity: Record<string, unknown>) => void): string {
  return edit(slug, (document) => {
    let count = 0;
    for (const script of document.querySelectorAll("script[type='application/ld+json']")) {
      const value = JSON.parse(script.textContent!);
      if (value.openingHoursSpecification) { mutate(value); script.textContent = JSON.stringify(value); count++; }
    }
    expect(count).toBe(1);
  });
}
function replaceVisible(slug: Slug, from: string, to: string): string {
  return edit(slug, (document) => {
    let count = 0;
    const visit = (node: Node) => {
      if (node.nodeType === 3 && node.parentElement?.tagName !== "SCRIPT" && node.textContent?.includes(from)) { node.textContent = node.textContent.replaceAll(from, to); count++; }
      for (const child of node.childNodes) visit(child);
    };
    visit(document.body);
    expect(count).toBeGreaterThan(0);
  });
}

describe("five exact official merchant hours adapters", () => {
  it.each(sources)("parses every visible weekday for $slug with its own seven-day evidence", (source) => {
    const slug = source.slug as Slug;
    const row = parse(slug);
    expect(row.hours).toEqual(expected[slug]);
    expect(Object.keys(row.hours).sort()).toEqual([...WEEKDAYS].sort());
    expect(row).toMatchObject({ slug, source_url: source.url, source_name: source.name, observed_at: observations[slug], coverage_from: "2026-10-20", coverage_through: "2026-10-27", kind: "weekly", source_sha256: createHash("sha256").update(page(slug).html).digest("hex") });
    expect(Date.parse(row.expires_at) - Date.parse(row.observed_at)).toBe(7 * 86_400_000);
    expect(merchantHoursForPlace(place(slug), artifact(slug), new Date(Date.parse(row.expires_at) - 1)).hours).toBeDefined();
    expect(merchantHoursForPlace(place(slug), artifact(slug), new Date(row.expires_at))).toEqual({ enrolled: true });
  });
  it("keeps JoJo’s closed days and actual overnight venue hours, without promising dining-room service", () => {
    const row = parse("jojos-restaurant-tap-house");
    expect(getOpenStatus(row.hours, { verified: true }, new Date("2026-10-24T05:30:00Z"))).toMatchObject({ state: "closing-soon", closesAt: "02:00" });
    expect(getOpenStatus(row.hours, { verified: true }, new Date("2026-10-26T16:00:00Z"))).toMatchObject({ state: "closed" });
    expect(row.hours.mon).toEqual([]);
    expect(page("jojos-restaurant-tap-house").html).toContain("late-night menu");
  });
  it.each(["thai-table-frederick", "thai-meric-eatery-bar-frederick"] as const)("does not turn %s’s between-service gap into open hours", (slug) => {
    expect(getOpenStatus(parse(slug).hours, { verified: true }, new Date("2026-10-23T19:00:00Z"))).toMatchObject({ state: "closed", opensAt: slug === "thai-table-frederick" ? "16:30" : "16:00" });
  });
  it.each(sources)("rejects $slug’s alternate source, future observation, stale proof, category and website mismatch", (source) => {
    const slug = source.slug as Slug;
    for (const observation of ["2026-10-20T12:06:00.000Z", "2026-10-12T12:00:00.000Z"]) expect(() => parseMerchantOfficialHours(source, { ...page(slug), observedAt: observation }, now)).toThrow();
    expect(() => parseMerchantOfficialHours(source, { ...page(slug), url: "https://other.example/" }, now)).toThrow(/source/);
    expect(merchantHoursForPlace({ ...place(slug), category: "coffee" }, artifact(slug), now).hours).toBeUndefined();
    expect(merchantHoursForPlace({ ...place(slug), website: "https://another-location.example/" }, artifact(slug), now).hours).toBeUndefined();
  });
  it.each([
    { slug: "white-rabbit-gastropub", from: "18 Market Space", to: "18 Other Space" },
    { slug: "pistarros", from: "221 N East St", to: "999 N East St" },
    { slug: "jojos-restaurant-tap-house", from: "16-18 East Patrick Street", to: "18 Other Street" },
    { slug: "thai-table-frederick", from: "5221 Buckeystown Pike Suite A", to: "5221 Buckeystown Pike Suite B" },
    { slug: "thai-meric-eatery-bar-frederick", from: "1170 W Patrick St Ste E", to: "1170 W Patrick St Ste F" },
  ] as const)("does not use matching clocks from the wrong visible $slug location", ({ slug, from, to }) => {
    expect(() => parse(slug, replaceVisible(slug, from, to))).toThrow(/location identity/);
  });
  it.each(sources)("rejects a second unresolved Hours block or closure notice at $slug", (source) => {
    const slug = source.slug as Slug;
    expect(() => parse(slug, `${page(slug).html}<p>Hours Monday 9am - 5pm</p>`)).toThrow(/conflicting visible/);
    for (const notice of ["Closed today for maintenance.", "Holiday hours apply.", "Kitchen hours differ.", "Drinks only."]) expect(() => parse(slug, `${page(slug).html}<p>${notice}</p>`)).toThrow(/notice or service qualifier/);
  });
  it.each(sources)("allows an identical visible repeat but rejects a conflicting full schedule for $slug", (source) => {
    const slug = source.slug as Slug;
    expect(parse(slug, page(slug).html + page(slug).html).hours).toEqual(expected[slug]);
    const mutations: Record<Slug, [string, string]> = { pistarros: ["9PM", "8PM"], "jojos-restaurant-tap-house": ["11:00 AM - 2:00 AM", "11:00 AM - 3:00 AM"], "white-rabbit-gastropub": ["11am-10pm", "11am-9pm"], "thai-table-frederick": ["2:30pm", "3:00pm"], "thai-meric-eatery-bar-frederick": ["2:15 PM", "3:15 PM"] };
    expect(() => parse(slug, page(slug).html + replaceVisible(slug, ...mutations[slug]))).toThrow(/conflicting visible/);
  });
  it.each(["jojos-restaurant-tap-house", "thai-meric-eatery-bar-frederick"] as const)("uses only exact-entity $slug structured hours to corroborate visible periods", (slug) => {
    const bad = [
      (row: Record<string, unknown>) => { row.name = "Another Restaurant"; },
      (row: Record<string, unknown>) => { row.telephone = "3015550100"; },
      (row: Record<string, unknown>) => { (row.address as Record<string, unknown>).streetAddress = "999 Other Street"; },
      (row: Record<string, unknown>) => { row.url = "https://another-location.example/"; },
      (row: Record<string, unknown>) => { row["@type"] = "Organization"; },
    ];
    for (const mutation of bad) expect(() => parse(slug, specification(slug, mutation))).toThrow(/structured merchant location identity/);
    const partial = specification(slug, (row) => { row.openingHoursSpecification = (row.openingHoursSpecification as { dayOfWeek: unknown }[]).slice(0, 1); });
    expect(parse(slug, partial).hours).toEqual(expected[slug]);
    const graph = edit(slug, (document) => {
      for (const script of document.querySelectorAll("script[type='application/ld+json']")) {
        const row = JSON.parse(script.textContent!);
        if (row.openingHoursSpecification) script.textContent = JSON.stringify({ "@graph": [row] });
      }
    });
    expect(parse(slug, graph).hours).toEqual(expected[slug]);
  });
  it.each(["jojos-restaurant-tap-house", "thai-meric-eatery-bar-frederick"] as const)("rejects $slug structured conflicts, duplicate windows, date exceptions and nonzero seconds", (slug) => {
    const bad = [
      (row: Record<string, unknown>) => { (row.openingHoursSpecification as Record<string, unknown>[])[0].closes = "23:00"; },
      (row: Record<string, unknown>) => { const periods = row.openingHoursSpecification as unknown[]; periods.push(periods[0]); },
      (row: Record<string, unknown>) => { row.specialOpeningHoursSpecification = []; },
      (row: Record<string, unknown>) => { (row.openingHoursSpecification as Record<string, unknown>[])[0].validThrough = "2026-10-24"; },
      (row: Record<string, unknown>) => { (row.openingHoursSpecification as Record<string, unknown>[])[0].opens = "12:00:30"; },
    ];
    for (const mutation of bad) expect(() => parse(slug, specification(slug, mutation))).toThrow();
  });
  it("cannot fill a missing visible JoJo’s weekday from JSON-LD or mistake 00:00/00:00 for 24-hour access", () => {
    expect(() => parse("jojos-restaurant-tap-house", replaceVisible("jojos-restaurant-tap-house", "Closed", "Open 24 hours"))).toThrow();
    const wrongClosed = specification("jojos-restaurant-tap-house", (row) => { (row.openingHoursSpecification as Record<string, unknown>[])[0].opens = "00:00"; });
    expect(() => parse("jojos-restaurant-tap-house", wrongClosed)).toThrow(/Conflicting/);
  });
  it("keeps the whole White Rabbit week while requiring its brunch subset to agree", () => {
    expect(parse("white-rabbit-gastropub").hours.sun).toEqual([slot("11:00", "22:00")]);
    expect(() => parse("white-rabbit-gastropub", replaceVisible("white-rabbit-gastropub", "11am-3pm", "10am-3pm"))).toThrow(/brunch/);
    expect(() => parse("white-rabbit-gastropub", replaceVisible("white-rabbit-gastropub", "Open 7 days a week", "Open most days"))).toThrow(/visible/);
  });
  it("rejects missing or overlapping visible service periods even with matching structured data", () => {
    expect(() => parse("thai-table-frederick", replaceVisible("thai-table-frederick", "4:30pm", "1:30pm"))).toThrow(/Overlapping/);
    expect(() => parse("thai-meric-eatery-bar-frederick", replaceVisible("thai-meric-eatery-bar-frederick", "Monday:", "Monday unavailable:"))).toThrow(/visible/);
  });
  it("stages every new enrollment until exact manual acceptance and never re-dates failed/conflicted evidence", async () => {
    const before: MerchantHoursArtifact = { schema_version: 1, places: [], review: [] };
    const fetcher = vi.fn(async (url: string) => { const source = sources.find((source) => source.url === url); if (!source) throw new Error("Unrepresented legacy fixture."); return page(source.slug as Slug); });
    const staged = await collectMerchantOfficialHours(before, fetcher, now);
    expect(fetcher.mock.calls.map(([url]) => url)).toEqual(MERCHANT_HOURS_SOURCES.filter((source) => !("collection" in source && source.collection === "manual")).map((source) => source.url));
    expect(staged.artifact.places).toEqual([]);
    for (const source of sources) {
      const slug = source.slug as Slug;
      expect(staged.artifact.review.find((row) => row.slug === slug)?.candidate?.hours).toEqual(expected[slug]);
      expect(merchantHoursForPlace(place(slug), staged.artifact, now)).toEqual({ enrolled: true });
    }
    const candidate = staged.artifact.review.find((row) => row.slug === "thai-table-frederick")!.candidate!;
    const accepted = acceptReviewedMerchantHoursCandidate(staged.artifact, candidate.slug, candidate, now);
    expect(merchantHoursForPlace(place("thai-table-frederick"), accepted, now).hours).toBeDefined();
    const failed = await collectMerchantOfficialHours(accepted, async () => { throw new Error("Unavailable"); }, new Date("2026-10-21T12:00:00Z"));
    expect(failed.artifact.places).toEqual([candidate]);
    expect(failed.artifact.review.find((row) => row.slug === candidate.slug)?.candidate).toBeUndefined();
    expect(merchantHoursForPlace(place("thai-table-frederick"), failed.artifact, now).hours).toBeUndefined();
  });
});
