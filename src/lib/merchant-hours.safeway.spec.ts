import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parseMerchantOfficialHours, collectMerchantOfficialHours } from "../../scripts/lib/merchant-official-hours";
import { MERCHANT_HOURS_SOURCES, acceptReviewedMerchantHoursCandidate, merchantHoursForPlace } from "./merchant-hours";
import { WEEKDAYS } from "./official-hours";

const { JSDOM } = createRequire(import.meta.url)("jsdom") as { JSDOM: new (html: string) => { window: { document: Document } } };
const now = new Date("2026-10-22T20:09:54.237Z");
const source = (town: string) => MERCHANT_HOURS_SOURCES.find((row) => row.slug === `safeway-${town}`)!;
const fixture = (town = "walkersville") => readFileSync(new URL(`../../tests/fixtures/merchant-hours/safeway-${town}.html`, import.meta.url), "utf8");
function parse(mutate?: (document: Document) => void, town = "walkersville") {
  const document = new JSDOM(fixture(town)).window.document;
  mutate?.(document);
  return parseMerchantOfficialHours(source(town), { url: source(town).url, html: document.documentElement.outerHTML, observedAt: now.toISOString() }, now);
}
const storePanel = (document: Document) => document.querySelector(".RedesignCore-hoursWrapper > .js-intent-core-hours")!;
function changeDays(document: Document, selector: string) {
  const node = document.querySelector(selector)!;
  const rows = JSON.parse(node.getAttribute("data-days")!);
  rows[0].intervals[0].end = 2200;
  node.setAttribute("data-days", JSON.stringify(rows));
}

describe("reviewed microdata store-hours cohort", () => {
  it.each(["middletown", "walkersville"])("extracts %s's own complete store week from its expandable disclosure", (town) => {
    const record = parse(undefined, town);
    for (const day of WEEKDAYS) expect(record.hours[day]).toEqual([{ open: "06:00", close: "23:00" }]);
    expect(record.observed_at).toBe(now.toISOString());
    expect(record.expires_at).toBe("2026-10-29T20:09:54.237Z");
    expect(record.source_url).toBe(source(town).url);
    expect(record.source_name).toBe(source(town).name);
  });

  it.each(["middletown", "walkersville"])("accepts %s's explicit false schema-display flag without changing its proven store week", (town) => {
    const record = parse((d) => {
      const node = storePanel(d).querySelector("script.js-hours-config")!;
      const config = JSON.parse(node.textContent!); config.hideSchema = false;
      node.textContent = JSON.stringify(config);
    }, town);
    for (const day of WEEKDAYS) expect(record.hours[day]).toEqual([{ open: "06:00", close: "23:00" }]);
  });

  it.each([["hideSchema", true], ["hideSchema", "false"], ["showOpenToday", false]])("holds an unreviewed %s configuration value %s", (key, value) => {
    expect(() => parse((d) => {
      const node = storePanel(d).querySelector("script.js-hours-config")!;
      const config = JSON.parse(node.textContent!); config[key as string] = value;
      node.textContent = JSON.stringify(config);
    })).toThrow(/configuration qualifier/);
  });

  it.each([
    ["wrong primary street", (d: Document) => { d.querySelector("#address .c-address-street-1")!.textContent = "999 Wrong St"; }],
    ["conflicting structured street", (d: Document) => { d.querySelector("#address meta[itemprop='streetAddress']")!.setAttribute("content", "999 Wrong St"); }],
    ["conflicting structured locality", (d: Document) => { d.querySelector("#address meta[itemprop='addressLocality']")!.setAttribute("content", "Frederick"); }],
    ["wrong country", (d: Document) => { d.querySelector("#address [itemprop='addressCountry']")!.textContent = "CA"; }],
    ["wrong phone", (d: Document) => { d.querySelector("[itemprop='telephone']")!.textContent = "3015550100"; }],
    ["wrong entity ID", (d: Document) => { d.querySelector("main")!.setAttribute("itemid", "https://local.safeway.com/#wrong"); }],
    ["wrong type", (d: Document) => { d.querySelector("main")!.setAttribute("itemtype", "http://schema.org/Pharmacy"); }],
    ["wrong name", (d: Document) => { d.querySelector("#location-name")!.setAttribute("content", "Different Store"); }],
    ["wrong canonical URL", (d: Document) => { d.querySelector("link[rel='canonical']")!.setAttribute("href", source("middletown").url); }],
    ["hidden store panel", (d: Document) => { storePanel(d).setAttribute("hidden", ""); }],
    ["hidden source address", (d: Document) => { d.querySelector("#address")!.setAttribute("aria-hidden", "true"); }],
    ["hidden clock", (d: Document) => { d.querySelector(".c-hours-details-row-intervals")!.setAttribute("style", "display:none"); }],
    ["missing weekday", (d: Document) => { d.querySelector(".c-hours-details tbody tr")!.remove(); }],
    ["wrong visible weekday", (d: Document) => { d.querySelector(".c-hours-details-row-day")!.textContent = "Tuesday"; }],
    ["wrong microdata clock", (d: Document) => { d.querySelector(".c-hours-details tbody tr")!.setAttribute("content", "Mo 06:00-22:00"); }],
    ["conflicting hero clock", (d: Document) => changeDays(d, ".RedesignHero-hours > .js-hours-today")],
    ["conflicting table clock", (d: Document) => changeDays(d, ".js-hours-table")],
    ["conflicting panel clock", (d: Document) => changeDays(d, ".js-intent-core-hours > .js-hours-today")],
    ["conflicting configuration", (d: Document) => { const n = d.querySelector("script.js-hours-config")!; const c = JSON.parse(n.textContent!); c.hours[0].intervals[0].end = 2200; n.textContent = JSON.stringify(c); }],
    ["dated configuration extension", (d: Document) => { const n = d.querySelector("script.js-hours-config")!; const c = JSON.parse(n.textContent!); c.validThrough = "2026-12-01"; n.textContent = JSON.stringify(c); }],
    ["primary dated qualifier", (d: Document) => { d.querySelector("main")!.setAttribute("data-valid-through", "2026-12-01"); }],
    ["hero dated qualifier", (d: Document) => { d.querySelector(".RedesignHero-hours > .js-hours-today")!.setAttribute("data-valid-through", "2026-12-01"); }],
    ["extra opening-hours row", (d: Document) => { d.querySelector("main")!.insertAdjacentHTML("beforeend", "<p itemprop='openingHours' content='Mo 08:00-21:00'>Monday 8am–9pm</p>"); }],
    ["store/pharmacy labels swapped", (d: Document) => { const n = d.querySelectorAll(".RedesignCore-hoursButtons button"); n[0].textContent = "Pharmacy Hours"; n[1].textContent = "Store Hours"; }],
    ["unknown store closure", (d: Document) => { d.body.insertAdjacentHTML("beforeend", "<p>Closed Mondays.</p>"); }],
    ["holiday notice", (d: Document) => { d.body.insertAdjacentHTML("beforeend", "<p>Holiday hours apply.</p>"); }],
    ["ambiguous additional store schedule", (d: Document) => { d.querySelector("main")!.insertAdjacentHTML("beforeend", "<div class='js-hours-table'>Monday 8am–9pm</div>"); }],
  ] as const)("holds %s", (_label, mutate) => {
    expect(() => parse(mutate)).toThrow();
  });

  it("does not mistake the computed closed-before-opening status for a weekly closure", () => {
    expect(parse((d) => {
      for (const node of d.querySelectorAll(".RedesignHero-hours .c-hours-today-day-status,.js-intent-core-hours .c-hours-today-day-status")) node.textContent = "Closed - Opens at 6:00 AM";
    }).hours.mon).toEqual([{ open: "06:00", close: "23:00" }]);
    expect(() => parse((d) => { d.querySelector(".RedesignHero-hours .c-hours-today-day-status")!.textContent = "Temporarily closed"; })).toThrow();
  });

  it("keeps pharmacy hours separate from grocery hours", () => {
    expect(parse((d) => {
      const pharmacy = d.querySelectorAll(".RedesignCore-hoursWrapper > .js-intent-core-hours")[1];
      pharmacy.querySelector(".c-hours-details-row-intervals")!.textContent = "Closed";
    }).hours.sun).toEqual([{ open: "06:00", close: "23:00" }]);
  });

  it("does not treat a separately typed reviewed delivery offer as grocery hours", () => {
    const addOffer = (d: Document) => d.body.insertAdjacentHTML("beforeend", "<div itemprop='makesOffer' itemtype='http://schema.org/Offer'><h3 itemprop='name'>Delivery in a Flash</h3><p>Service operating hours vary by store.</p></div>");
    expect(parse(addOffer).hours.mon).toEqual([{ open: "06:00", close: "23:00" }]);
    expect(() => parse((d) => { addOffer(d); d.querySelector("[itemprop='makesOffer']")!.insertAdjacentHTML("beforeend", "<p>Closed today.</p>"); })).toThrow();
    expect(() => parse((d) => { addOffer(d); d.querySelector("[itemprop='makesOffer']")!.removeAttribute("itemtype"); })).toThrow();
  });

  it("collects two independent pending proofs and requires each exact acceptance", async () => {
    const selected = new Map<string, string>(["middletown", "walkersville"].map((town) => [source(town).url, town]));
    const calls: string[] = [];
    const collected = await collectMerchantOfficialHours({ schema_version: 1, places: [], review: [] }, async (url) => {
      if (!selected.has(url)) throw new Error("Unselected source: no read.");
      calls.push(url);
      return { url, html: fixture(selected.get(url)), observedAt: now.toISOString() };
    }, now);
    expect(calls).toEqual([...selected.keys()]);
    const pending = collected.artifact.review.filter((row) => row.slug.startsWith("safeway-"));
    expect(pending).toHaveLength(2);
    for (const row of pending) {
      expect(row.reason).toBe("changed_facts");
      expect(merchantHoursForPlace({ slug: row.slug, category: "market", website: row.candidate!.source_url }, collected.artifact, now).hours).toBeUndefined();
      expect(() => acceptReviewedMerchantHoursCandidate(collected.artifact, row.slug, { source_sha256: "0".repeat(64), observed_at: now.toISOString() }, now)).toThrow(/exact/);
    }
    const first = pending[0];
    const accepted = acceptReviewedMerchantHoursCandidate(collected.artifact, first.slug, { source_sha256: first.candidate!.source_sha256, observed_at: first.candidate!.observed_at }, now);
    expect(accepted.places.map((row) => row.slug)).toEqual([first.slug]);
    expect(accepted.review.some((row) => row.slug === pending[1].slug)).toBe(true);
  });
});
