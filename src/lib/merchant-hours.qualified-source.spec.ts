import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parseQualifiedMerchantHours } from "../../scripts/lib/qualified-merchant-hours";
import { MERCHANT_HOURS_SOURCES, type MerchantHoursSource } from "./merchant-hours";
const { JSDOM } = createRequire(import.meta.url)("jsdom") as { JSDOM: new (html: string) => { window: { document: Document } } };

const cases = [
  ["national-museum-civil-war-medicine-frederick", "qualified-museum.html"],
  ["the-tasting-room-frederick", "qualified-tasting-room.html"],
  ["hootch-and-banter-frederick", "qualified-hootch.html"],
] as const;
const fixtures = Object.fromEntries(cases.map(([slug, file]) => [slug, readFileSync(`tests/fixtures/merchant-hours/${file}`, "utf8")]));
const source = (slug: string): MerchantHoursSource => {
  const value = MERCHANT_HOURS_SOURCES.find(item => item.slug === slug);
  if (!value) throw Error(`Missing reviewed source ${slug}`);
  return value;
};
function parse(slug: string, html = fixtures[slug], from = "2026-10-22", through = "2026-10-29") {
  const document = new JSDOM(html).window.document;
  document.querySelectorAll("p,div,li,br,h1,h2,h3,h4,section,footer").forEach(node => node.appendChild(document.createTextNode(" ")));
  const clone = document.body.cloneNode(true) as HTMLElement;
  clone.querySelectorAll("script").forEach(node => node.remove());
  const text = (clone.textContent ?? "").replace(/\s+/g, " ").trim();
  const selected = source(slug);
  return parseQualifiedMerchantHours(selected, { url: selected.url, html, observedAt: "2026-10-22T23:55:03.072Z" }, document, text, from, through);
}
const weekdays = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"];

describe("reviewed qualified official source adapters", () => {
  it("keeps museum hours, last admission and the other museum separate", () => {
    const row = parse(cases[0][0])!;
    expect(row.hours).toEqual({ ...Object.fromEntries(weekdays.slice(0, 6).map(day => [day, [{ open: "10:00", close: "17:00" }]])), sun: [{ open: "11:00", close: "17:00" }] });
    expect(row.qualification).toMatchObject({ scope: "venue", label: "Museum hours", usage: "display_only" });
    expect(row.qualification.note).toContain("Gallery admission ends at 4 p.m.");
    expect(parse(cases[0][0], fixtures[cases[0][0]].replace("Last admission4:30 PM", "Last admission2:00 PM"))).toEqual(row);
  });
  it("extracts Tasting Room dinner only and preserves explicit Sunday closed", () => {
    const row = parse(cases[1][0])!;
    expect(row.hours).toEqual({ ...Object.fromEntries(weekdays.slice(0, 4).map(day => [day, [{ open: "16:00", close: "21:00" }]])), fri: [{ open: "16:00", close: "22:00" }], sat: [{ open: "16:00", close: "22:00" }], sun: [] });
    expect(row.qualification).toMatchObject({ scope: "kitchen", label: "Dinner hours", usage: "display_only" });
    expect(row.hours.mon?.[0].close).not.toBe("23:00");
  });
  it("extracts Hootch dinner without extending it into brunch or unbounded late bar hours", () => {
    const row = parse(cases[2][0])!;
    expect(row.hours).toEqual({ ...Object.fromEntries(weekdays.slice(0, 4).map(day => [day, [{ open: "16:00", close: "21:00" }]])), fri: [{ open: "16:00", close: "22:00" }], sat: [{ open: "16:00", close: "22:00" }], sun: [{ open: "16:00", close: "20:00" }] });
    expect(row.qualification).toMatchObject({ scope: "kitchen", label: "Dinner hours", usage: "display_only" });
    expect(row.qualification.note).toContain("Weekend brunch runs from 11 a.m. to 2:45 p.m.");
  });
  it.each([
    [cases[0][0], "48 East Patrick Street", "148 East Patrick Street"],
    [cases[0][0], "21701", "21702"],
    [cases[0][0], "(301) 695-1864", "(301) 695-1865"],
    [cases[0][0], "National Museum of <br>Civil War Medicine", "National Museum of <br>Other Medicine"],
    [cases[1][0], "101 N. Market Street", "1101 N. Market Street"],
    [cases[1][0], "The Tasting Room</strong>", "Another Tasting Room</strong>"],
    [cases[1][0], "240.379.7772", "240.379.7773"],
    [cases[2][0], "49 S Market St", "149 S Market St"],
    [cases[2][0], "Hootch &amp; Banter | Frederick, MD", "Other Hootch &amp; Banter | Frederick, MD"],
    [cases[2][0], "(301) 732-4971", "(301) 732-4972"],
  ])("holds mismatched exact identity for %s", (slug, from, to) => {
    expect(() => parse(slug, fixtures[slug].replaceAll(from, to))).toThrow();
  });
  it.each(cases)("holds unreviewed notices and structured schedules for %s", (slug) => {
    for (const notice of ["Closed today", "Closing early", "Holiday hours apply", "Hours vary", "By appointment", "Closed on Saturday for maintenance"]) {
      expect(() => parse(slug, fixtures[slug].replace("</body>", `<p>${notice}</p></body>`))).toThrow(/notice/);
    }
    expect(() => parse(slug, fixtures[slug].replace("</body>", '<script type="application/ld+json">{"@type":"Restaurant","openingHours":"Mo-Su 08:00-23:00"}</script></body>'))).toThrow(/structured/);
  });
  it.each([
    [cases[0][0], "Monday - Saturday", "Monday - Friday"],
    [cases[0][0], "4:00 PM<br>Closed", "4:30 PM<br>Closed"],
    [cases[0][0], "Sunday 11:00 AM - 5:00 PM", ""],
    [cases[1][0], "Sunday</strong><br>Closed", "Sunday</strong><br>4:00PM - 9:00PM"],
    [cases[1][0], "Dinner</strong> 4:00PM - 9:00PM", "Dinner</strong> 4 - 9"],
    [cases[2][0], "MONDAY – THURSDAY", "MONDAY – WEDNESDAY"],
    [cases[2][0], "11:00 AM – 2:45 PM", "11:00 AM – 3:00 PM"],
    [cases[2][0], "DINNER HOURS", "BAR HOURS"],
  ])("holds missing or changed qualifications for %s", (slug, from, to) => {
    expect(() => parse(slug, fixtures[slug].replaceAll(from, to))).toThrow();
  });
  it.each(cases)("holds duplicate or hidden schedule sections for %s", (slug) => {
    const html = fixtures[slug];
    const document = new JSDOM(html).window.document;
    const selector = slug === cases[0][0] ? ".location-btn" : slug === cases[1][0] ? "section.hours" : ".wpb_wrapper";
    const section = document.querySelector(selector)!;
    expect(() => parse(slug, html.replace("</body>", `${section.outerHTML}</body>`))).toThrow();
    for (const attr of ["hidden", "inert", 'aria-hidden="true"', 'style="display:none"']) {
      const changed = new JSDOM(html).window.document;
      const [key, value = ""] = attr.replaceAll('"', "").split("=");
      changed.querySelector(selector)!.setAttribute(key, value);
      expect(() => parse(slug, changed.documentElement.outerHTML)).toThrow(/visible/);
    }
  });
  it("holds an extra hours disclosure, changed dinner gap or a conflicting repeated closure list", () => {
    for (const [slug] of cases) expect(() => parse(slug, fixtures[slug].replace("</body>", "<p>Hours Sunday 12PM - 2PM</p></body>"))).toThrow(/hours block/);
    const slug = cases[2][0];
    expect(() => parse(slug, fixtures[slug].replace("2:45 p.m. – 4:00 p.m.", "3:00 p.m. – 4:00 p.m."))).toThrow();
    expect(() => parse(slug, fixtures[slug].replace("</body>", "<p>We are closed on the following holidays: Thanksgiving.</p></body>"))).toThrow(/conflicting/);
  });
  it("holds duplicated Hootch contact identity instead of selecting one matching address or phone", () => {
    const slug = cases[2][0];
    for (const extra of ["<h3>49 S Market St, Frederick, MD 21701</h3>", "<p>(301) 732-4971</p>"]) expect(() => parse(slug, fixtures[slug].replace("</body>", `${extra}</body>`))).toThrow(/duplicate/);
  });
  it.each([
    [cases[0][0], "2026-11-25", "2026-11-27"],
    [cases[0][0], "2027-03-25", "2027-03-31"],
    [cases[0][0], "2026-04-03", "2026-04-09"],
    [cases[0][0], "2028-04-14", "2028-04-20"],
    [cases[0][0], "2026-12-23", "2026-12-29"],
    [cases[2][0], "2027-05-28", "2027-06-03"],
    [cases[2][0], "2027-07-03", "2027-07-09"],
    [cases[2][0], "2027-09-01", "2027-09-07"],
    [cases[2][0], "2026-12-30", "2027-01-06"],
  ])("holds annual closure boundary rather than inventing dated exceptions for %s", (slug, from, through) => {
    expect(() => parse(slug, fixtures[slug], from, through)).toThrow(/Annual closure boundary/);
  });
  it("does not hold ordinary museum weeks merely because they fall in the Easter season", () => {
    expect(parse(cases[0][0], fixtures[cases[0][0]], "2027-04-02", "2027-04-09")?.hours.mon).toEqual([{ open: "10:00", close: "17:00" }]);
  });
  it("does not enroll or change an existing ordinary source", () => {
    const existing = source("pistarros");
    const document = new JSDOM("<body>Unrelated source</body>").window.document;
    expect(parseQualifiedMerchantHours(existing, { url: existing.url, html: "", observedAt: "2026-10-22T00:00:00.000Z" }, document, "", "2026-10-22", "2026-10-29")).toBeUndefined();
  });
});
