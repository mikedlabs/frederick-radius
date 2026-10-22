import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import { collectMerchantOfficialHours, fetchMerchantHoursPage, parseMerchantOfficialHours } from "../../scripts/lib/merchant-official-hours";
import { MERCHANT_HOURS_SOURCES, acceptReviewedMerchantHoursCandidate, merchantHoursForPlace, type MerchantHoursArtifact } from "./merchant-hours";
import { getOpenStatus } from "./hours";

const source = MERCHANT_HOURS_SOURCES.find(row => row.slug === "delaplaine-arts-center-frederick")!;
const observedAt = "2026-10-22T14:53:25.837Z";
const now = new Date("2026-10-22T14:54:00.000Z");
const html = readFileSync("tests/fixtures/merchant-hours/delaplaine-arts-center.html", "utf8");
const page = { url: source.url, observedAt, html };
const place = { slug: source.slug, category: source.category, website: source.url };
const parse = (body = html) => parseMerchantOfficialHours(source, { ...page, html: body }, now);
const artifact = (): MerchantHoursArtifact => ({ schema_version: 1, places: [parse()], review: [] });
const weekdays = Object.fromEntries(["mon", "tue", "wed", "thu", "fri", "sat"].map(day => [day, [{ open: "09:00", close: "17:00" }]]));

describe("Delaplaine public gallery hours", () => {
  it("keeps both agreeing public copies, the Sunday distinction and actual evidence window", () => {
    const row = parse();
    expect(row.hours).toEqual({ ...weekdays, sun: [{ open: "11:00", close: "17:00" }] });
    expect(row).toMatchObject({ slug: source.slug, source_name: "Delaplaine Arts Center", source_url: "https://delaplaine.org/", kind: "weekly", observed_at: observedAt,
      source_sha256: createHash("sha256").update(html).digest("hex"), coverage_from: "2026-10-22", coverage_through: "2026-10-29", expires_at: "2026-10-29T14:53:25.837Z" });
    const hours = merchantHoursForPlace(place, artifact(), now).hours!;
    expect(getOpenStatus(hours, { verified: true }, new Date("2026-10-24T13:00:00Z"))).toMatchObject({ state: "open" });
    expect(getOpenStatus(hours, { verified: true }, new Date("2026-10-25T13:00:00Z"))).toMatchObject({ state: "closed", opensAt: "11:00" });
    expect(getOpenStatus(hours, { verified: true }, new Date("2026-10-25T15:00:00Z"))).toMatchObject({ state: "open" });
    expect(getOpenStatus(hours, { verified: true }, new Date("2026-10-25T21:00:00Z"))).toMatchObject({ state: "closed" });
    expect(merchantHoursForPlace(place, artifact(), new Date(row.expires_at))).toEqual({ enrolled: true });
  });

  it.each([
    ["name", "The Delaplaine Arts Center", "Another Arts Center"],
    ["prefixed name", "The Delaplaine Arts Center", "FakeDelaplaine Arts Center"],
    ["street", "40 S Carroll St", "41 S Carroll St"],
    ["prefixed street number", "40 S Carroll St", "140 S Carroll St"],
    ["postal identity", "Frederick, MD 21701", "Brunswick, MD 21716"],
    ["phone", "301-698-0656", "301-698-0657"],
    ["phone suffix", "301-698-0656", "301-698-06560"],
    ["phone prefix", "301-698-0656", "1301-698-0656"],
  ])("rejects a different %s even with matching clocks", (_label, from, to) => {
    expect(() => parse(html.replaceAll(from, to))).toThrow(/gallery identity/);
  });

  it.each([
    ["missing Sunday", "Sunday, 11 AM–5 PM", ""],
    ["partial week", "Monday–Saturday", "Monday–Friday"],
    ["missing meridiem", "9 AM–5 PM", "9–5"],
    ["classes instead of public visit", "Plan Your</h2><h2>VISIT", "Plan Your</h2><h2>CLASSES"],
    ["class hours label", "OPEN DAILY", "Classes OPEN DAILY"],
  ])("holds %s without completing a schedule from class or event clocks", (_label, from, to) => {
    expect(() => parse(html.replaceAll(from, to))).toThrow();
  });

  it("requires every existing public copy to agree and rejects partial extra copies", () => {
    expect(() => parse(html.replace("Sunday, 11 AM–5 PM", "Sunday, 12 PM–5 PM"))).toThrow(/conflicting/);
    expect(() => parse(html.replace("</main>", "<p>OPEN DAILY Monday 9 AM–5 PM</p></main>"))).toThrow();
    expect(() => parse(html.replace("</main>", "<p>Sunday 12 PM–4 PM</p></main>"))).toThrow(/additional/);
    expect(() => parse(html.replaceAll("9 AM–5 PM", "9 PM–5 AM"))).toThrow(/overnight/);
  });

  it.each(["Closed today", "Gallery closures for maintenance", "Holiday hours apply", "Last admission 4 PM", "Last admittance 4 PM", "Hours subject to change", "By appointment", "Class hours 6 PM–9 PM"])("holds the unreviewed qualifier %s", notice => {
    expect(() => parse(html.replace("</main>", `<p>${notice}</p></main>`))).toThrow(/notice or service qualifier/);
  });

  it.each(['hidden', 'inert', 'aria-hidden="true"', 'style="display:none"'])("rejects a hidden public schedule: %s", hidden => {
    expect(() => parse(html.replace('<div class="elementor-widget-text-editor">', `<div ${hidden} class="elementor-widget-text-editor">`))).toThrow(/visible/);
  });

  it("keeps unrelated dated program clocks separate and refuses unsupported structured hours", () => {
    expect(parse(html.replace("Friday, Mar 12 • 8 am–3 pm", "Friday, Mar 12 • 7 pm–9 pm")).hours).toEqual(parse().hours);
    expect(() => parse(html.replace("</body>", '<script type="application/ld+json">{"@type":"Museum","openingHours":"Mo-Sa 08:00-20:00"}</script></body>'))).toThrow(/structured merchant hours/);
    expect(merchantHoursForPlace({ ...place, category: "museum" }, artifact(), now)).toEqual({ enrolled: true });
    expect(merchantHoursForPlace({ ...place, website: "https://another.example/" }, artifact(), now)).toEqual({ enrolled: true });
    for (const stamp of ["2026-10-22T15:00:00.000Z", "2026-10-14T14:53:25.837Z"]) expect(() => parseMerchantOfficialHours(source, { ...page, observedAt: stamp }, now)).toThrow();
    expect(() => parseMerchantOfficialHours(source, { ...page, url: source.url + "classes/" }, now)).toThrow(/source/);
  });

  it("stages new evidence for exact approval and preserves the old timestamp on failed refresh", async () => {
    const previous: MerchantHoursArtifact = { schema_version: 1, places: [], review: [] };
    const fetcher = vi.fn(async (url: string) => { if (url === source.url) return page; throw Error("Other sources outside this offline cohort"); });
    const staged = await collectMerchantOfficialHours(previous, fetcher, now);
    expect(fetcher.mock.calls.filter(([url]) => url === source.url)).toHaveLength(1);
    expect(staged.artifact.places).toEqual([]);
    const candidate = staged.artifact.review.find(row => row.slug === source.slug)!.candidate!;
    expect(candidate).toEqual(parse());
    expect(merchantHoursForPlace(place, staged.artifact, now)).toEqual({ enrolled: true });
    expect(() => acceptReviewedMerchantHoursCandidate(staged.artifact, source.slug, { ...candidate, source_sha256: "0".repeat(64) }, now)).toThrow(/exact pending/);
    const accepted = acceptReviewedMerchantHoursCandidate(staged.artifact, source.slug, candidate, now);
    expect(accepted.places).toEqual([candidate]);
    expect(accepted.review).toEqual(staged.artifact.review.filter(row => row.slug !== source.slug));
    const failed = await collectMerchantOfficialHours(accepted, vi.fn(async () => { throw Error("Offline failure"); }), new Date("2026-10-23T14:54:00.000Z"));
    expect(failed.artifact.places).toEqual(accepted.places);
    expect(failed.artifact.review.find(row => row.slug === source.slug)?.reason).toBe("source_unavailable");
    expect(merchantHoursForPlace(place, failed.artifact, now)).toEqual({ enrolled: true });
  });

  it("retains ordinary native transport caps without providers or alternate URLs", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(new Response(html, { headers: { "content-type": "text/html" } }));
    await expect(fetchMerchantHoursPage(source.url, fetcher)).resolves.toMatchObject({ url: source.url, html });
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(fetcher.mock.calls[0][1]).toMatchObject({ redirect: "error", credentials: "omit" });
    expect("max_response_bytes" in source).toBe(false);
    await expect(fetchMerchantHoursPage(source.url, vi.fn(async () => new Response("x".repeat(512001), { headers: { "content-type": "text/html" } })))).rejects.toThrow(/512 KB/);
    await expect(fetchMerchantHoursPage(source.url + "classes/", fetcher)).rejects.toThrow(/Unapproved/);
  });
});
