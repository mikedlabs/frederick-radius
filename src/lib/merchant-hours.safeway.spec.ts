import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parseMerchantOfficialHours, collectMerchantOfficialHours } from "../../scripts/lib/merchant-official-hours";
import { MERCHANT_HOURS_SOURCES, acceptReviewedMerchantHoursCandidate, merchantHoursForPlace } from "./merchant-hours";
import { getOpenStatus, hoursForDate } from "./hours";
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

type HolidayHours = { date: string; intervals: { start: number; end: number }[]; isClosed: boolean };
type StoreMachineDay = { day: string; dailyHolidayHours?: HolidayHours };
const novemberObservation = "2026-11-21T09:22:09.857Z";
const thursday = '[data-day-of-week-start-index="4"]';

function machineCopy(node: Element, mutator: (day: StoreMachineDay) => void, weekday = "THURSDAY") {
  const config = node.matches("script") ? JSON.parse(node.textContent!) : undefined;
  const days: StoreMachineDay[] = config ? config.hours : JSON.parse(node.getAttribute("data-days")!);
  mutator(days.find(day => day.day === weekday)!);
  if (config) node.textContent = JSON.stringify(config);
  else node.setAttribute("data-days", JSON.stringify(days));
}

function storeWidgets(document: Document) {
  const panel = storePanel(document);
  return [
    document.querySelector(".RedesignHero-hours > .js-hours-today")!,
    panel.querySelector(".js-hours-today")!,
    panel.querySelector(".js-hours-table")!,
  ];
}

function visibleClock(hhmm: number) {
  const hour = Math.floor(hhmm / 100);
  return `${hour % 12 || 12}:${String(hhmm % 100).padStart(2, "0")} ${hour < 12 ? "AM" : "PM"}`;
}

function setClosing(widgets: Element[], config: Element, { date = "20261126", start = 600, end = 1600, weekdayIndex = 4 } = {}) {
  const weekday = ["SUNDAY", "MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY", "SATURDAY"][weekdayIndex];
  for (const widget of [...widgets, config]) {
    machineCopy(widget, day => { day.dailyHolidayHours = { date, intervals: [{ start, end }], isClosed: false }; }, weekday);
  }
  for (const widget of widgets) {
    const row = widget.querySelector(`[data-day-of-week-start-index="${weekdayIndex}"]`)!;
    row.classList.add("is-holiday");
    const interval = row.querySelector(".c-hours-today-day-hours-intervals-instance,.c-hours-details-row-intervals-instance")!;
    // On the special day a single displayed interval replaces the pharmacy's usual split shift.
    interval.parentElement!.replaceChildren(interval);
    interval.classList.add("js-hours-interval-instance");
    interval.setAttribute("data-open-interval-start", String(start));
    interval.setAttribute("data-open-interval-end", String(end));
    interval.querySelector("[class$='-open']")!.textContent = visibleClock(start);
    interval.querySelector("[class$='-close']")!.textContent = visibleClock(end);
  }
}

function thanksgivingFixture(town = "walkersville") {
  const document = new JSDOM(fixture(town)).window.document;
  setClosing(storeWidgets(document), storePanel(document).querySelector("script.js-hours-config")!);
  return document;
}

function readAt(document: Document, town: string, observedAt: string) {
  const owner = source(town);
  const record = parseMerchantOfficialHours(owner, { url: owner.url, html: document.documentElement.outerHTML, observedAt }, new Date(observedAt));
  const artifact = { schema_version: 1, places: [record], review: [] };
  const { hours } = merchantHoursForPlace({ slug: owner.slug, category: owner.category, website: owner.url }, artifact, new Date(observedAt));
  if (!hours) throw new Error("The parsed schedule could not be read from the validated artifact.");
  return { record, hours };
}

describe("one-time early closing in Safeway's store schedule", () => {
  it.each(["walkersville", "middletown"])("clips only the indicated date at %s", town => {
    const { record, hours } = readAt(thanksgivingFixture(town), town, novemberObservation);
    expect(record.source_url).toBe(source(town).url);
    for (const day of WEEKDAYS) expect(record.hours[day]).toEqual([{ open: "06:00", close: "23:00" }]);
    expect(record.exceptions).toEqual([{ date: "2026-11-26", closes_at: "16:00", reason: "Store closes early." }]);
    expect(hoursForDate(hours, new Date("2026-11-26T17:00:00Z"))).toEqual([{ open: "06:00", close: "16:00" }]);
    expect(getOpenStatus(hours, { verified: true }, new Date("2026-11-26T21:00:00Z")).state).toBe("closed");
    expect(hoursForDate(hours, new Date("2026-11-27T17:00:00Z"))).toEqual([{ open: "06:00", close: "23:00" }]);
    expect(hoursForDate(hours, new Date("2026-12-03T17:00:00Z"))).toBeUndefined();
  });

  it("keeps a later ordinary Thursday intact on fresh regular-week evidence", () => {
    const document = new JSDOM(fixture()).window.document;
    const { hours } = readAt(document, "walkersville", "2026-11-29T15:00:00Z");
    expect(hoursForDate(hours, new Date("2026-12-03T17:00:00Z"))).toEqual([{ open: "06:00", close: "23:00" }]);
  });

  it("uses the confirmed date and clock rather than a fixed holiday label or date", () => {
    const document = new JSDOM(fixture("middletown")).window.document;
    setClosing(storeWidgets(document), storePanel(document).querySelector("script.js-hours-config")!, { date: "20261203", end: 1730 });
    const { record } = readAt(document, "middletown", "2026-11-29T15:00:00Z");
    expect(record.exceptions).toEqual([{ date: "2026-12-03", closes_at: "17:30", reason: "Store closes early." }]);
  });

  it.each([true, false])("ignores a separate pharmacy closing, with a grocery exception %s", storeHasException => {
    const document = storeHasException ? thanksgivingFixture() : new JSDOM(fixture()).window.document;
    const pharmacy = document.querySelectorAll(".RedesignCore-hoursWrapper > .js-intent-core-hours")[1];
    setClosing([...pharmacy.querySelectorAll("[data-days]")], pharmacy.querySelector("script.js-hours-config")!, { start: 900, end: 1300 });
    const { hours, record } = readAt(document, "walkersville", novemberObservation);
    expect(record.hours.thu).toEqual([{ open: "06:00", close: "23:00" }]);
    expect(hoursForDate(hours, new Date("2026-11-26T17:00:00Z"))).toEqual(
      storeHasException ? [{ open: "06:00", close: "16:00" }] : undefined,
    );
  });

  it.each([false, true])("keeps an independent pharmacy date out of the store week, with a second pharmacy date %s", multiple => {
    const document = thanksgivingFixture();
    const pharmacy = document.querySelectorAll(".RedesignCore-hoursWrapper > .js-intent-core-hours")[1];
    const widgets = [...pharmacy.querySelectorAll("[data-days]")];
    const config = pharmacy.querySelector("script.js-hours-config")!;
    setClosing(widgets, config, { date: "20261125", start: 900, end: 1200, weekdayIndex: 3 });
    if (multiple) setClosing(widgets, config, { start: 900, end: 1300 });
    const { record, hours } = readAt(document, "walkersville", novemberObservation);
    expect(record.exceptions).toEqual([{ date: "2026-11-26", closes_at: "16:00", reason: "Store closes early." }]);
    expect(hoursForDate(hours, new Date("2026-11-25T17:00:00Z"))).toEqual([{ open: "06:00", close: "23:00" }]);
  });

  it("holds Middletown bytes presented as evidence for Walkersville", () => {
    expect(() => readAt(thanksgivingFixture("middletown"), "walkersville", novemberObservation)).toThrow();
  });

  it.each(["20261125", "20261119", "20261203", "20261131", "2026-11-26"])("holds an invalid, out-of-window or foreign-weekday date %s", date => {
    const document = thanksgivingFixture();
    setClosing(storeWidgets(document), storePanel(document).querySelector("script.js-hours-config")!, { date });
    expect(() => readAt(document, "walkersville", novemberObservation)).toThrow();
  });

  it("requires the New York closing instant to fall strictly before source expiry", () => {
    const doc = thanksgivingFixture();
    // On November 26 the 4pm store closing is at 21:00 UTC.
    for (const observedAt of ["2026-11-19T20:59:59.999Z", "2026-11-19T21:00:00.000Z"]) {
      expect(() => readAt(doc, "walkersville", observedAt)).toThrow();
    }
    expect(readAt(doc, "walkersville", "2026-11-19T21:00:00.001Z").record.exceptions?.[0].closes_at).toBe("16:00");
  });

  it("holds a closing later than the ordinary closing even when all store copies agree", () => {
    const document = thanksgivingFixture();
    setClosing(storeWidgets(document), storePanel(document).querySelector("script.js-hours-config")!, { end: 2330 });
    expect(() => readAt(document, "walkersville", novemberObservation)).toThrow();
  });

  it("holds a changed opening time even when all store copies agree", () => {
    const document = thanksgivingFixture();
    setClosing(storeWidgets(document), storePanel(document).querySelector("script.js-hours-config")!, { start: 900 });
    expect(() => readAt(document, "walkersville", novemberObservation)).toThrow();
  });

  it.each([
    ["unexplained second flag", (d: Document) => storeWidgets(d)[2].querySelector('[data-day-of-week-start-index="5"]')!.classList.add("is-holiday")],
    ["hero date", (d: Document) => machineCopy(storeWidgets(d)[0], x => { x.dailyHolidayHours!.date = "20261203"; })],
    ["panel machine clock", (d: Document) => machineCopy(storeWidgets(d)[1], x => { x.dailyHolidayHours!.intervals[0].end = 1700; })],
    ["table machine clock", (d: Document) => machineCopy(storeWidgets(d)[2], x => { x.dailyHolidayHours!.intervals[0].end = 1500; })],
    ["configuration clock", (d: Document) => machineCopy(storePanel(d).querySelector("script.js-hours-config")!, x => { x.dailyHolidayHours!.intervals[0].end = 1500; })],
    ["missing date in one machine copy", (d: Document) => machineCopy(storeWidgets(d)[0], x => { delete x.dailyHolidayHours; })],
    ["extra interval in all machine copies", (d: Document) => {
      for (const element of [...storeWidgets(d), storePanel(d).querySelector("script.js-hours-config")!]) machineCopy(element, x => { x.dailyHolidayHours!.intervals.push({ start: 1800, end: 2000 }); });
    }],
    ["condition outside the schedule", (d: Document) => d.body.insertAdjacentHTML("beforeend", "<p>Holiday hours apply on other days as well.</p>")],
    ["incorrect weekly microdata", (d: Document) => storeWidgets(d)[2].querySelector(thursday)!.setAttribute("content", "Th 06:00-16:00")],
  ] as const)("holds %s", (_label, mutate) => {
    const document = thanksgivingFixture(); mutate(document);
    expect(() => readAt(document, "walkersville", novemberObservation)).toThrow();
  });

  for (const [name, index] of [["hero", 0], ["panel", 1], ["table", 2]] as const) {
    it.each([
      ["row flag", (row: Element) => row.classList.remove("is-holiday")],
      ["visible closing time", (row: Element) => { row.querySelector("[class$='-close']")!.textContent = "3:00 PM"; }],
      ["machine-readable opening time", (row: Element) => row.querySelector(".js-hours-interval-instance")!.setAttribute("data-open-interval-start", "700")],
      ["machine-readable closing time", (row: Element) => row.querySelector(".js-hours-interval-instance")!.setAttribute("data-open-interval-end", "1500")],
      ["missing closing time", (row: Element) => row.querySelector(".js-hours-interval-instance")!.removeAttribute("data-open-interval-end")],
    ] as const)(`holds a mismatched ${name} %s`, (_label, change) => {
      const document = thanksgivingFixture();
      change(storeWidgets(document)[index].querySelector(thursday)!);
      expect(() => readAt(document, "walkersville", novemberObservation)).toThrow();
    });
  }
});
