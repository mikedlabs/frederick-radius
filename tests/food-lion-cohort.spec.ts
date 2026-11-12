import { createRequire } from "node:module";
import { describe, it, expect } from "vitest";
import { MERCHANT_HOURS_COHORTS } from "../scripts/lib/merchant-hours-cohorts";
import { parseOfficialHoursCohort } from "../scripts/lib/official-hours-cohort";
const { JSDOM } = createRequire(import.meta.url)("jsdom") as { JSDOM: new (html: string) => { window: { document: Document } } };
const cohorts = MERCHANT_HOURS_COHORTS.filter(row => row.shape === "microdata_primary_store_week");
const days = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
const keys = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"];
const short = ["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"];
const machine = days.map(day => ({ day: day.toUpperCase(), intervals: [{ end: 2300, start: 700 }], isClosed: false }));
const json = (value: unknown) => JSON.stringify(value).replaceAll('"', "&quot;");
const config = { collapseDays: null, dayOfWeekMap: null, disableOpenUntil: null, disableTodayFirst: null, hideSchema: null, highlightToday: true, highlightTodayBackground: null, hours: machine, open24HoursMessage: null, showOpenToday: null, timeFormatString: null, twentyFourHourClock: null, utcOffsets: [], weekStartsOn: null, wholeWeekMessage: null };
/** Synthetic markup of factual fields, never an authenticated source receipt. */
function fixture(index = 0) {
  const c = cohorts[index]; if (c.shape !== "microdata_primary_store_week") throw Error("Wrong reviewed family");
  const b = c.bindings[0], i = b.identity;
  const rows = days.map((day, n) => `<tr itemprop="openingHours" content="${short[n]} 07:00-23:00" data-day-of-week-start-index="${(n + 1) % 7}" data-day-of-week-end-index="${(n + 1) % 7}"><td class="c-hours-details-row-day">${day}</td><td class="c-hours-details-row-intervals">7:00 AM - 11:00 PM</td></tr>`).join("");
  const repeated = short.map(day => `<span itemprop="openingHours" content="${day} 07:00-23:00">7:00 AM - 11:00 PM</span>`).join("");
  return `<!doctype html><html><head><link rel="canonical" href="${c.source_url}"></head><body><main id="main" itemscope itemtype="${c.schema_type}" itemid="${c.entity_ids[b.slug]}"><h1 id="location-name" itemprop="name">${i.name}</h1><address class="Address-content" itemprop="address"><span class="Address-line1">${i.street}</span><span class="Address-city">${i.locality}</span><span itemprop="addressRegion">${i.region}</span><span itemprop="postalCode">${i.postalCode}</span><meta itemprop="streetAddress" content="${i.street}"></address><span itemprop="telephone">${i.phone}</span><div class="Hero-hoursTodayRow"><span class="js-hours-today" data-days="${json(machine)}">${repeated}</span></div><div class="Core"><span class="Core-sectionTitle">Store Hours</span><div class="Core-storeToday"><span class="js-hours-today" data-days="${json(machine)}">${repeated}</span><button class="Core-toggleHoursBtn" data-hours="js-store-hours">Toggle store hours</button></div><div class="Core-storeHours js-store-hours"><div class="js-hours-table" data-days="${json(machine)}"><script type="application/json" class="js-hours-config">${JSON.stringify(config)}</script><table class="c-hours-details"><tbody>${rows}</tbody></table></div></div></div><section class="FAQ">The corporate Gift Card Sales Department is open Monday through Friday8:00AM–5:00PM.</section><aside class="Teaser"><span data-days="${json(machine)}">Unrelated nearby location</span></aside></main></body></html>`;
}
function parse(html = fixture(), index = 0) {
  const document = new JSDOM(html).window.document;
  document.querySelectorAll("p,div,li,br,h1,h2,h3,h4,section,footer").forEach(node => node.appendChild(document.createTextNode(" ")));
  const clone = document.body.cloneNode(true) as HTMLElement;
  clone.querySelectorAll("script,style,noscript").forEach(node => node.remove());
  return parseOfficialHoursCohort(document, clone.textContent ?? "", cohorts[index], cohorts[index].bindings[0]);
}
const expected = Object.fromEntries(keys.map(day => [day, [{ open: "07:00", close: "23:00" }]]));
describe("reviewed Food Lion primary-store family", () => {
  it.each([0, 1, 2])("parses the exact independently bound store %s", index => { expect(cohorts).toHaveLength(3); expect(parse(fixture(index), index)).toEqual(expected); });
  it.each([
    ["name", "Food Lion Grocery Store of Crestwood Plaza", "Food Lion Grocery Store of Another Town"],
    ["street", "6920 Crestwood Blvd", "16920 Crestwood Blvd"],
    ["locality", ">Frederick<", ">Brunswick<"],
    ["postal", ">21703<", ">21704<"],
    ["phone", ">3018464704<", ">3018464705<"],
    ["entity", "#5046692", "#5046693"],
    ["source", "https://stores.foodlion.com/md/frederick/6920-crestwood-blvd", "https://stores.foodlion.com/md/frederick/other"],
    ["week", ">Sunday<", ">Funday<"],
    ["meridiem", "7:00 AM - 11:00 PM", "7 - 11"],
    ["microdata", "Mo 07:00-23:00", "Mo 08:00-23:00"],
    ["machine", "&quot;end&quot;:2300", "&quot;end&quot;:2200"],
    ["configuration", '"end":2300', '"end":2200'],
    ["config qualifier", '"wholeWeekMessage":null', '"wholeWeekMessage":"Open 24 hours"'],
    ["label", ">Store Hours<", ">Pharmacy Hours<"],
    ["toggle binding", 'data-hours="js-store-hours"', 'data-hours="js-pharmacy-hours"'],
  ])("holds changed %s", (_kind, from, to) => { expect(() => parse(fixture().replaceAll(from, to))).toThrow(); });
  it("admits known presentation-only grouping, order, emphasis and status visibility changes", () => {
    const document = new JSDOM(fixture()).window.document;
    const node = document.querySelector(".js-hours-config")!;
    const presentation = JSON.parse(node.textContent!) as Record<string, unknown>;
    Object.assign(presentation, { collapseDays: true, disableOpenUntil: true, disableTodayFirst: true, hideSchema: true,
      highlightToday: false, highlightTodayBackground: "#ffe5dd", showOpenToday: false, twentyFourHourClock: true, weekStartsOn: 1 });
    node.textContent = JSON.stringify(presentation);
    expect(parse(document.documentElement.outerHTML)).toEqual(expected);
    // Removed optional decoration does not invalidate the independently complete week.
    delete presentation.highlightToday; delete presentation.highlightTodayBackground; delete presentation.collapseDays;
    presentation.weekStartsOn = 6;
    node.textContent = JSON.stringify(presentation);
    expect(parse(document.documentElement.outerHTML)).toEqual(expected);
  });
  it.each([
    ['dayOfWeekMap', { MONDAY: 'Sunday' }], ['timeFormatString', '[Closed today]'],
    ['open24HoursMessage', 'Open 24 hours'], ['wholeWeekMessage', 'Sunday8AM–8PM'],
    ['validFrom', '2026-12-01'], ['holidayHours', []], ['service', 'pharmacy'],
    ['unknownPresentationFlag', true], ['weekStartsOn', 7], ['collapseDays', { closed: true }],
  ])("holds semantic, dated, service or unreviewed configuration %s", (key, value) => {
    const document = new JSDOM(fixture()).window.document, node = document.querySelector(".js-hours-config")!;
    const changed = JSON.parse(node.textContent!) as Record<string, unknown>;
    changed[key] = value; node.textContent = JSON.stringify(changed);
    expect(() => parse(document.documentElement.outerHTML)).toThrow();
  });
  it.each(["hidden", "inert", 'aria-hidden="true"', 'style="display:none"'])("holds concealed store disclosure %s", attr => { expect(() => parse(fixture().replace('<div class="Core-storeHours', `<div ${attr} class="Core-storeHours`))).toThrow(); });
  it.each(["Closed today", "Holiday hours apply", "Store closes early", "Special hours tomorrow", "Reduced store hours", "Pickup hours only", "Closed on October 23 for inventory", "Closed October 23 for inventory"])("holds unreviewed notice %s", notice => { expect(() => parse(fixture().replace("</main>", `<p>${notice}</p></main>`))).toThrow(); });
  it.each([
    ['card', '<main id="main"', '<main data-valid-from="2026-12-01" id="main"'],
    ['store', '<div class="Core-storeHours', '<div data-holiday-hours="true" class="Core-storeHours'],
    ['hero parent', '<div class="Hero-hoursTodayRow"', '<div data-seasonal="true" class="Hero-hoursTodayRow"'],
    ['repeated microdata', '<span itemprop="openingHours" content="Mo 07:00-23:00">', '<span itemprop="openingHours" content="Mo 08:00-23:00">'],
    ['repeated visible', '<span itemprop="openingHours" content="Mo 07:00-23:00">7:00 AM', '<span itemprop="openingHours" content="Mo 07:00-23:00">8:00 AM'],
    ['repeated omission', '<span itemprop="openingHours" content="Mo 07:00-23:00">7:00 AM - 11:00 PM</span>', ''],
  ])("holds qualified or conflicting %s", (_label, from, to) => {
    expect(() => parse(fixture().replace(from, to))).toThrow();
  });
  it.each([
    ['row start date', 'tr', 'data-valid-from', '2026-12-25'],
    ['row end date', 'tr', 'data-valid-through', '2026-12-25'],
    ['row holiday', 'tr', 'data-holiday-hours', 'true'],
    ['day date', '.c-hours-details-row-day', 'data-date', '2026-12-25'],
    ['period service', '.c-hours-details-row-intervals', 'data-service-hours', 'pharmacy'],
    ['period scope', '.c-hours-details-row-intervals', 'data-hours-scope', 'pharmacy'],
    ['period holiday', '.c-hours-details-row-intervals', 'data-holiday-hours', 'true'],
  ])("holds primary weekday or descendant qualifier %s", (_label, selector, attribute, value) => {
    const document = new JSDOM(fixture()).window.document;
    document.querySelector(selector)!.setAttribute(attribute, value);
    expect(() => parse(document.documentElement.outerHTML)).toThrow(/qualifier/);
  });
  it("holds a dated primary table heading rather than treating it as ordinary weekly metadata", () => {
    expect(() => parse(fixture().replace('<tbody>', '<thead><tr data-valid-from="2026-12-25"><th>Day</th><th>Hours</th></tr></thead><tbody>'))).toThrow(/qualifier/);
  });
  it("holds a nested dated clock even when its parent and all hour copies still agree", () => {
    const document = new JSDOM(fixture()).window.document;
    document.querySelector('.c-hours-details-row-intervals')!.innerHTML = '<span data-valid-from="2026-12-25" data-valid-through="2026-12-25">7:00 AM - 11:00 PM</span>';
    expect(() => parse(document.documentElement.outerHTML)).toThrow(/qualifier/);
  });
  it("holds duplicate primary cards, missing weekdays and additional pharmacy timetables", () => {
    const document = new JSDOM(fixture()).window.document;
    document.querySelector("main")!.append(document.querySelector(".js-hours-table")!.cloneNode(true));
    expect(() => parse(document.documentElement.outerHTML)).toThrow();
    expect(() => parse(fixture().replace(/<tr itemprop="openingHours" content="Su[\s\S]+?<\/tr>/, ""))).toThrow();
    expect(() => parse(fixture().replace("</main>", '<section itemprop="openingHoursSpecification">Pharmacy Sunday8AM–6PM</section></main>'))).toThrow();
    expect(() => parse(fixture().replace("</main>", '<div itemprop="openingHours" content="Mo 08:00-17:00">Corporate hours</div></main>'))).toThrow();
  });
  it.each([
    '<script type="application/ld+json">{"@type":"GroceryStore","openingHoursSpecification":{"dayOfWeek":"Sunday","opens":"08:00","closes":"20:00"}}</script>',
    '<section><h2>Grocery Hours</h2><p>Sunday:8:00AM–8:00PM</p></section>',
    '<section><h2>Deli Hours</h2><p>Sunday:8:00AM–8:00PM</p></section>',
  ])("holds additional unreviewed claims %s", extra => {
    expect(() => parse(fixture().replace("</main>", `${extra}</main>`))).toThrow();
  });
  it("keeps corporate support clocks and unrelated nearby teaser data out of the primary grocery week", () => {
    expect(parse(fixture().replace("Friday8:00AM–5:00PM", "Friday9:00AM–4:00PM"))).toEqual(expected);
    const doc = new JSDOM(fixture()).window.document; doc.querySelector(".Teaser [data-days]")!.setAttribute("data-days", "unreviewed nearby source");
    expect(parse(doc.documentElement.outerHTML)).toEqual(expected);
  });
});
