import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";
import { collectMerchantOfficialHours, fetchMerchantHoursPage, parseMerchantOfficialHours } from "../../scripts/lib/merchant-official-hours";
import { acceptReviewedMerchantHoursCandidate, merchantHoursForPlace, MERCHANT_HOURS_SOURCES, type MerchantHoursArtifact } from "./merchant-hours";
import { getOpenStatus } from "./hours";

const source = MERCHANT_HOURS_SOURCES.find((row) => row.slug === "kulfi-ice-creams-frederick")!;
const observedAt = "2026-10-20T23:40:48.409Z";
const now = new Date("2026-10-20T23:45:00.000Z");
const html = readFileSync("tests/fixtures/merchant-hours/kulfi-ice-creams-frederick.html", "utf8");
const page = { url: source.url, html, observedAt };
const place = { slug: source.slug, category: source.category, website: source.url };
const parse = (body = html) => parseMerchantOfficialHours(source, { ...page, html: body }, now);
const expected = {
  mon: [{ open: "15:00", close: "21:00" }], tue: [{ open: "15:00", close: "21:00" }],
  wed: [{ open: "15:00", close: "21:00" }], thu: [{ open: "14:00", close: "21:00" }],
  fri: [{ open: "13:00", close: "23:00" }], sat: [{ open: "13:00", close: "23:00" }],
  sun: [{ open: "13:00", close: "21:00" }],
};
const artifact = (): MerchantHoursArtifact => ({ schema_version: 1, places: [parse()], review: [] });

afterEach(() => vi.unstubAllEnvs());

describe("Kulfi's exact official shop hours", () => {
  it("reads both agreeing visible copies and retains the actual observation and seven-day expiry", () => {
    const row = parse();
    expect(html).toContain("5241 Bukeystown pike");
    expect(html).not.toContain('type="application/ld+json"');
    expect(row.hours).toEqual(expected);
    expect(row).toMatchObject({
      slug: source.slug, source_url: "https://kulfi-icecream.com/", source_name: "Kulfi Ice Creams",
      observed_at: observedAt, expires_at: "2026-10-27T23:40:48.409Z",
      coverage_from: "2026-10-20", coverage_through: "2026-10-27", kind: "weekly",
      source_sha256: createHash("sha256").update(html).digest("hex"),
    });
    expect(getOpenStatus(row.hours, { verified: true }, new Date("2026-10-23T16:30:00Z"))).toMatchObject({ state: "closed", opensAt: "13:00" });
    expect(getOpenStatus(row.hours, { verified: true }, new Date("2026-10-24T02:00:00Z"))).toMatchObject({ state: "closing-soon", closesAt: "23:00" });
    expect(merchantHoursForPlace(place, artifact(), new Date(Date.parse(row.expires_at) - 1)).hours).toBeDefined();
    vi.stubEnv("HOURS_FRESHNESS_ENFORCED", "0");
    expect(merchantHoursForPlace(place, artifact(), new Date(row.expires_at))).toEqual({ enrolled: true });
  });

  it.each([
    ["body name", "Kulfi Ice Cream experience", "Another Ice Cream experience"],
    ["exact footer address", "5241 BUCKEYSTOWN PIKE", "5242 BUCKEYSTOWN PIKE"],
    ["city", "FREDERICK MD 21704", "IJAMSVILLE MD 21704"],
    ["phone", "(240) 815-5466", "(240) 815-9999"],
  ])("requires the reviewed %s rather than relying on matching clocks", (_kind, from, to) => {
    expect(() => parse(html.replaceAll(from, to))).toThrow(/Kulfi location identity/);
  });

  it.each([
    ["incomplete footer", "Fri-Sat:1-11pm , Sunday:1-9pm", "Fri-Sat:1-11pm"],
    ["conflicting footer", "Fri-Sat:1-11pm , Sunday:1-9pm", "Fri-Sat:1-11pm , Sunday:1pm-8pm"],
    ["missing meridiem", "3-9pm", "3-9"],
    ["unreviewed shared AM", "3-9pm", "3-9am"],
    ["unreviewed afternoon typography", "3-9pm", "4-9pm"],
    ["overnight shop hours", "3-9pm", "11pm-9am"],
  ])("holds a %s without filling or overriding the source evidence", (_kind, from, to) => {
    expect(() => parse(html.replaceAll(from, to))).toThrow();
  });

  it("accepts identical repeats but holds an extra incomplete or differently formatted hours block", () => {
    expect(parse(html + html).hours).toEqual(expected);
    for (const extra of ["Hours unavailable", "Monday 4pm-9pm", "Mon-Thu:3-9pm", "Opening Hours Friday 1pm-10pm"]) {
      expect(() => parse(`${html}<p>${extra}</p>`)).toThrow(/conflicting visible/);
    }
  });

  it.each([
    "<h4>Opening Hours</h4><p>Mon-Wed: 3-9pm<br>Thursday:2-9pm<br>Fri-Sat:1-11pm<br>Sunday:1-9pm</p>",
    "<p>Mon-Wed: 3-9pm , Thursday:2-9pm<br>Fri-Sat:1-11pm , Sunday:1-9pm</p>",
  ])("requires both reviewed posted copies instead of admitting a single-copy redesign", (copy) => {
    expect(html).toContain(copy);
    expect(() => parse(html.replace(copy, ""))).toThrow(/conflicting visible/);
  });

  it.each([
    "Closed today for maintenance.", "Holiday hours apply.", "Kitchen hours differ.", "Delivery only.",
    "Pickup hours 3-9pm.", "Summer hours apply.", "Hours may change.", "By appointment.",
  ])("holds an unresolved notice or service qualifier: %s", (notice) => {
    expect(() => parse(`${html}<p>${notice}</p>`)).toThrow(/notice or service qualifier/);
  });

  it.each([
    { "@type": "LocalBusiness", openingHours: "Mo 15:00-21:00" },
    { "@type": "IceCreamShop", openingHoursSpecification: [{ dayOfWeek: "Monday", opens: "15:00", closes: "21:00" }] },
    { "@graph": [{ "@type": "IceCreamShop", openingHours: "Mo 15:00-21:00" }] },
    { specialOpeningHoursSpecification: [] },
  ])("requires review before using new structured hours: %j", (structured) => {
    expect(() => parse(`${html}<script type="application/ld+json">${JSON.stringify(structured)}</script>`)).toThrow(/Unreviewed structured/);
  });

  it("rejects another page, invalid/future/stale observation, category or host", () => {
    expect(() => parseMerchantOfficialHours(source, { ...page, url: `${source.url}other-location` }, now)).toThrow(/source/);
    for (const stamp of ["not-a-date", "2026-10-20T23:51:00.000Z", "2026-10-12T23:40:48.409Z"]) {
      expect(() => parseMerchantOfficialHours(source, { ...page, observedAt: stamp }, now)).toThrow(/observation/);
    }
    expect(merchantHoursForPlace({ ...place, category: "restaurant" }, artifact(), now).hours).toBeUndefined();
    expect(merchantHoursForPlace({ ...place, website: "https://another-shop.example/" }, artifact(), now).hours).toBeUndefined();
  });

  it("uses only the admitted fixed native GET without redirects, credentials or a paid provider", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(new Response(html, { headers: { "content-type": "text/html" } }));
    await expect(fetchMerchantHoursPage(source.url, fetcher)).resolves.toMatchObject({ url: source.url, html });
    expect(fetcher).toHaveBeenCalledExactlyOnceWith(source.url, expect.objectContaining({ redirect: "error", credentials: "omit" }));
    await expect(fetchMerchantHoursPage(`${source.url}other-location`, fetcher)).rejects.toThrow(/Unapproved/);
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it("keeps a new enrollment pending until exact acceptance and retains actual proof after a failed refresh", async () => {
    const empty: MerchantHoursArtifact = { schema_version: 1, places: [], review: [] };
    const fetcher = vi.fn(async (url: string) => {
      if (url !== source.url) throw new Error("Outside this exact source fixture");
      return page;
    });
    const staged = await collectMerchantOfficialHours(empty, fetcher, now);
    expect(staged.artifact.places).toEqual([]);
    const candidate = staged.artifact.review.find((row) => row.slug === source.slug)?.candidate;
    expect(candidate?.hours).toEqual(expected);
    expect(merchantHoursForPlace(place, staged.artifact, now)).toEqual({ enrolled: true });
    const accepted = acceptReviewedMerchantHoursCandidate(staged.artifact, source.slug, candidate!, now);
    expect(merchantHoursForPlace(place, accepted, now).hours).toBeDefined();
    const failed = await collectMerchantOfficialHours(accepted, async () => { throw new Error("Unavailable"); }, new Date("2026-10-21T23:45:00Z"));
    expect(failed.artifact.places).toEqual([candidate]);
    expect(failed.artifact.review.find((row) => row.slug === source.slug)).toEqual({ slug: source.slug, checked_at: "2026-10-21T23:45:00.000Z", reason: "source_unavailable" });
    expect(merchantHoursForPlace(place, failed.artifact, now)).toEqual({ enrolled: true });
  });
});
