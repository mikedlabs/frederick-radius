import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parseMerchantOfficialHours } from "../../scripts/lib/merchant-official-hours";
import { MERCHANT_HOURS_SOURCES, merchantHoursForPlace, type MerchantHoursArtifact } from "./merchant-hours";
import { decoratePlace, publicPlaces } from "./loaders/places";
import { getOpenStatus } from "./hours";

const source = MERCHANT_HOURS_SOURCES.find((row) => row.slug === "dublin-roasters-frederick")!;
const observedAt = "2026-10-20T04:54:00.113Z";
const now = new Date("2026-10-20T05:00:00.000Z");
const html = readFileSync("tests/fixtures/merchant-hours/dublin-roasters.html", "utf8");
const page: { url: string; html: string; observedAt: string } = { url: source.url, html, observedAt };
const parse = (body = html) => parseMerchantOfficialHours(source, { ...page, html: body }, now);
const structured = (extra: Record<string, unknown> = {}) => `<script type="application/ld+json">${JSON.stringify({
  "@type": "CafeOrCoffeeShop", name: "Dublin Roasters Coffee", address: "1780 N. Market Street, Frederick, MD 21701",
  telephone: "(240) 285-9146", openingHours: "Mo 07:00-15:00, Tu 07:00-15:00, We 07:00-15:00, Th 07:00-15:00, Fr 07:00-15:00, Sa 08:00-15:00, Su 08:00-15:00", ...extra,
})}</script>`;

describe("Dublin Roasters exact official location", () => {
  it("reads the full visible seven-day week without confusing a hidden header number with the location phone", () => {
    expect(html).toContain("240-674-1740");
    const row = parse();
    expect(row.hours).toEqual({
      mon: [{ open: "07:00", close: "15:00" }], tue: [{ open: "07:00", close: "15:00" }],
      wed: [{ open: "07:00", close: "15:00" }], thu: [{ open: "07:00", close: "15:00" }],
      fri: [{ open: "07:00", close: "15:00" }], sat: [{ open: "08:00", close: "15:00" }], sun: [{ open: "08:00", close: "15:00" }],
    });
    expect(row).toMatchObject({ observed_at: observedAt, expires_at: "2026-10-27T04:54:00.113Z", coverage_from: "2026-10-20", coverage_through: "2026-10-27" });
    const artifact: MerchantHoursArtifact = { schema_version: 1, places: [row], review: [] };
    const place = { slug: source.slug, website: source.url, category: source.category };
    expect(merchantHoursForPlace(place, artifact, new Date(Date.parse(row.expires_at) - 1)).hours).toBeDefined();
    expect(merchantHoursForPlace(place, artifact, new Date(row.expires_at)).hours).toBeUndefined();
    const hours = merchantHoursForPlace(place, artifact, now).hours!;
    expect(getOpenStatus(hours, { verified: true }, new Date("2026-10-21T11:30:00Z"))).toMatchObject({ state: "open", closesAt: "15:00" });
    expect(getOpenStatus(hours, { verified: true }, new Date("2026-10-24T11:30:00Z"))).toMatchObject({ state: "closed", opensAt: "08:00" });
  });

  it.each(["address", "phone", "days", "url"])("requires the reviewed location's %s instead of filling missing evidence", (kind) => {
    const changed = { ...page };
    if (kind === "address") changed.html = html.replace("1780 N. Market Street", "1780 Other Street");
    if (kind === "phone") changed.html = html.replace("(240) 285-9146", "(240) 285-9999");
    if (kind === "days") changed.html = html.replace("Sat – Sun: 8 AM – 3 PM", "Saturday: 8 AM – 3 PM");
    if (kind === "url") changed.url = "https://dublinroasterscoffee.com/unreviewed-location";
    expect(() => parseMerchantOfficialHours(source, changed, now)).toThrow();
  });

  it("deduplicates agreeing visible blocks and refuses a conflicting second hours block", () => {
    expect(parse(html + html).hours).toEqual(parse().hours);
    expect(() => parse(html + html.replace("7 AM – 3 PM", "7 AM – 4 PM"))).toThrow(/conflicting visible/);
  });

  it("compares admitted structured hours with the complete visible schedule", () => {
    expect(parse(html + structured()).hours).toEqual(parse().hours);
    expect(() => parse(html + structured({ openingHours: "Mo 07:00-16:00" }))).toThrow(/Conflicting visible and structured/);
  });

  it.each([
    { name: "Another coffee shop" }, { address: "1780 Other Street, Frederick, MD 21701" }, { telephone: "240-674-1740" },
  ])("does not borrow a structured schedule from another identity: %j", (identity) => {
    expect(() => parse(html + structured(identity))).toThrow(/Mismatched structured Dublin/);
  });

  it.each([
    { openingHoursSpecification: [{ dayOfWeek: "Monday", opens: "07:00", closes: "16:00" }] },
    { specialOpeningHoursSpecification: [{ validFrom: "2026-10-21", validThrough: "2026-10-21", opens: "09:00", closes: "12:00" }] },
  ])("holds unreviewed structured special/specification hours: %j", (hours) => {
    expect(() => parse(html + structured(hours))).toThrow(/Unreviewed structured/);
  });

  it("holds nested hours evidence until that format has its own review", () => {
    const nested = JSON.parse(structured().replace(/^<script[^>]*>/, "").replace(/<\/script>$/, ""));
    expect(() => parse(html + `<script type="application/ld+json">${JSON.stringify({ "@graph": [nested] })}</script>`)).toThrow(/Unreviewed structured/);
  });

  it("applies the exact Hootch contact correction without claiming unreviewed dining or bar hours", () => {
    const canonical = publicPlaces().find((place) => place.slug === "hootch-and-banter-frederick");
    expect(canonical).toBeDefined();
    const place = decoratePlace(canonical!, undefined, now);
    expect(place.phone).toBe("(301) 732-4971");
    expect(place.website).toBe("https://hootchandbanter.com");
    expect(place.hours_verified).toBe(false);
    expect(place.hours).toBeUndefined();
  });
});
