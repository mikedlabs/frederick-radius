import { describe, expect, it } from "vitest";
import { filterCommerceLinksForPlace, sanitizeStoredCommerceLinks } from "../scripts/lib/official-commerce-refresh";
import { classifyOfficialCommerceLinks, extractPageAnchors } from "../scripts/lib/official-commerce-links";
const source = "https://merchant.example.com/";
const opaque = "ab12cd_4464a45c84fc4eda92569f7a47da88da.pdf";
const menu = (suffix: string) => ({ type: "menu" as const, url: source + suffix, anchor_text: "Menu", source_url: source });
const selected = (suffix: string) => filterCommerceLinksForPlace([menu(suffix)], { postalCode: "21771" });

describe("postal evidence in commerce menu assets", () => {
  it("keeps a source-linked full-menu PDF whose opaque identifier contains five digits", () => {
    const link = menu("_files/ugd/" + opaque);
    const html = `<a href="${link.url}">Menu</a>`;
    const classified = classifyOfficialCommerceLinks(extractPageAnchors(html, source), source);
    expect(classified).toEqual([link]);
    expect(filterCommerceLinksForPlace(classified, { postalCode: "21771" })).toEqual([link]);
    expect(sanitizeStoredCommerceLinks([link], { postalCode: "21771" })).toEqual([link]);
  });
  it("preserves the exact original URL, including encoded opaque identifiers", () => {
    const encoded = opaque.replace("92569", "%39%32%35%36%39").replace(".pdf", ".PDF");
    const link = menu("_files/ugd/" + encoded);
    expect(filterCommerceLinksForPlace([link], { postalCode: "21771" })).toEqual([link]);
    expect(link.url).toContain("%39%32%35%36%39");
  });
  it.each([
    "locations/hagerstown-21740/menu",
    "locations/miami33139/menu",
    "locations/94103/" + opaque,
    "locations/hagerstown-21740/" + opaque,
    "_files/ugd/menu-33139-" + opaque,
    "_files/ugd/" + opaque + "?zip=33139",
    "_files/ugd/" + opaque + "?postal=%33%33%31%33%39",
    "_files/ugd/short92569f.pdf",
  ])("retains foreign or nonopaque ZIP evidence for %s", suffix => {
    expect(selected(suffix)).toEqual([]);
  });
  it("retains a matching explicit location ZIP beside an opaque identifier", () => {
    const link = menu("locations/frederick-21771/" + opaque + "?zip=21771");
    expect(filterCommerceLinksForPlace([link], { postalCode: "21771" })).toEqual([link]);
  });
  it("does not relax order or gift-card postal filtering", () => {
    for (const type of ["order", "gift_card"] as const) {
      const link = { ...menu("_files/ugd/" + opaque), type };
      expect(filterCommerceLinksForPlace([link], { postalCode: "21771" })).toEqual([]);
    }
  });
  it("retains foreign-location ordering holds", () => {
    const link = { type: "order" as const, url: "https://order.toasttab.com/online/florida-restaurant-33139", source_url: source, anchor_text: "Order Online" };
    expect(filterCommerceLinksForPlace([link], { postalCode: "21771" })).toEqual([]);
  });
  it("does not add an unreviewed asset host or ordering provider", () => {
    const unrelated = { ...menu("_files/ugd/" + opaque), url: "https://unreviewed-assets.example.net/" + opaque };
    expect(sanitizeStoredCommerceLinks([unrelated], { postalCode: "21771" })).toEqual([]);
    expect(sanitizeStoredCommerceLinks([{ type: "order", url: "https://www.ezordernow.com/modernasiaonline", source_url: "https://modernasiaonline.com/", anchor_text: "Order Online" }], { postalCode: "21703" })).toEqual([]);
  });
});
