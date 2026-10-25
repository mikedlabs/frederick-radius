import { createRequire } from "node:module";
import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { parseOfficialHoursCohort, type OfficialHoursCohort } from "../../scripts/lib/official-hours-cohort";
import { WEEKDAYS } from "./official-hours";

const { JSDOM } = createRequire(import.meta.url)("jsdom") as { JSDOM: new (html: string) => { window: { document: Document } } };
type ContactCohort = Extract<OfficialHoursCohort, { shape: "visible_weekly_contact_card" }>;
const actualWindow = { coverage_from: "2026-10-24", coverage_through: "2026-10-31" };
const archiveFixture = (caption: string, timestamp = "1774897200") => ({ selector: "#archive", item_selector: "article", timestamp_attribute: "data-date" as const,
  posts: [{ id: "fixture-archived-post", timestamp, href: "https://www.instagram.com/p/FixturePost/", text_sha256: createHash("sha256").update(caption).digest("hex") }] });
// Declared in-memory fixtures only. These are not sources or public enrollments.
function fixture(count = 1) {
  const bindings = Array.from({ length: count }, (_, i) => ({ slug: `fixture-${i}`, source_name: `Fixture branch ${i}`,
    identity: { name: "Fixture Civic Center", street: `${i + 1} Example Street`, locality: "Frederick", region: "MD", postalCode: "21701", phone: `301555${String(i).padStart(4, "0")}` } }));
  const config: ContactCohort = { shape: "visible_weekly_contact_card", ledger_id: "fixture_only", source_url: "https://official.example/locations/", canonical_url: "https://official.example/locations/", bindings,
    locations: Object.fromEntries(bindings.map((binding, i) => [binding.slug, {
      name: { selector: `#location-${i} h2`, expected: binding.identity.name },
      address: { selector: `#location-${i} address`, expected: `${binding.identity.street}, Frederick, MD 21701` },
      phone: { selector: `#location-${i} .phone`, attribute: "href", expected: `tel:${binding.identity.phone}` },
      weeks: [{ selector: `#location-${i} .hours`, count: 1, label: "Hours" }],
    }])) };
  const document = new JSDOM(`<!doctype html><html><head><link rel="canonical" href="${config.canonical_url}"></head><body>${bindings.map((binding, i) => `<section id="location-${i}"><h2>${binding.identity.name}</h2><address>${binding.identity.street}, Frederick, MD 21701</address><a class="phone" href="tel:${binding.identity.phone}">Call</a><div class="hours">Hours Monday–Friday: 9am–5pm Saturday: 10am–2pm Sunday: Closed</div></section>`).join("")}</body></html>`).window.document;
  return { config, document };
}
function parse(mutate?: (document: Document, config: ContactCohort) => void, count = 1) {
  const { document, config } = fixture(count); mutate?.(document, config);
  return config.bindings.map(binding => parseOfficialHoursCohort(document, document.body.textContent ?? "", config, binding, actualWindow));
}
function structured(document: Document, config: ContactCohort) {
  const identity = config.bindings[0].identity;
  config.locations[config.bindings[0].slug].structured = { schema_type: "CivicStructure", entity_url: "https://official.example/locations/fixture-0", name: identity.name, closed_representation: "midnight_equal" };
  const entity = { "@type": "CivicStructure", name: identity.name, url: "https://official.example/locations/fixture-0", telephone: identity.phone,
    address: { streetAddress: identity.street, addressLocality: "Frederick", addressRegion: "MD", postalCode: "21701", addressCountry: "US" },
    openingHoursSpecification: [
      { "@type": "OpeningHoursSpecification", dayOfWeek: ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"], opens: "09:00", closes: "17:00" },
      { "@type": "OpeningHoursSpecification", dayOfWeek: "Saturday", opens: "10:00", closes: "14:00" },
      { "@type": "OpeningHoursSpecification", dayOfWeek: "Sunday", opens: "00:00", closes: "00:00" },
    ] as Record<string, unknown>[] };
  const script = document.createElement("script"); script.type = "application/ld+json"; document.body.append(script);
  return { entity, script, save: () => { script.textContent = JSON.stringify({ "@graph": [{ "@type": "Organization", subOrganization: [entity] }] }); } };
}
describe("reviewed visible-week contact cohorts", () => {
  it("uses one parser for twenty independently bound visible-only locations", () => {
    const hours = parse(undefined, 20); expect(hours).toHaveLength(20);
    for (const week of hours) { expect(Object.keys(week)).toHaveLength(7); expect(week.mon).toEqual([{ open: "09:00", close: "17:00" }]); expect(week.sun).toEqual([]); }
  });
  it("expands wrapped and grouped weekdays with explicit a/p meridiem", () => {
    const [hours] = parse(document => { document.querySelector(".hours")!.textContent = "Hours Sun – Thur. . . . 7:00a – 8:00p Fri & Sat: 7:00a – 9:00p"; });
    expect(hours.sun).toEqual([{ open: "07:00", close: "20:00" }]); expect(hours.fri).toEqual([{ open: "07:00", close: "21:00" }]);
  });
  for (const [label, mutate] of [
    ["wrong address", (d: Document) => { d.querySelector("address")!.textContent = "999 Different Street, Frederick, MD 21701"; }],
    ["wrong phone", (d: Document) => { d.querySelector(".phone")!.setAttribute("href", "tel:3015559999"); }],
    ["wrong name", (d: Document) => { d.querySelector("h2")!.textContent = "Different Civic Center"; }],
    ["wrong canonical", (d: Document) => { d.querySelector("link")!.setAttribute("href", "https://official.example/another/"); }],
    ["duplicated contact", (d: Document) => { d.querySelector("address")!.after(d.querySelector("address")!.cloneNode(true)); }],
    ["hidden hours", (d: Document) => { d.querySelector(".hours")!.setAttribute("hidden", ""); }],
    ["inert location", (d: Document) => { d.querySelector("section")!.setAttribute("inert", ""); }],
    ["unknown notice", (d: Document) => { d.body.insertAdjacentHTML("beforeend", "<p>We are closing at 4pm today.</p>"); }],
    ["new weekday closure", (d: Document) => { d.body.insertAdjacentHTML("beforeend", "<p>Closed on Tuesday.</p>"); }],
    ["new dated Sunday closure", (d: Document) => { d.body.insertAdjacentHTML("beforeend", "<p>Closed on Sunday October 25.</p>"); }],
    ["unbound week", (d: Document) => { d.body.insertAdjacentHTML("beforeend", "<p>Monday: 8am–6pm</p>"); }],
  ] as const) it(`holds ${label}`, () => expect(() => parse(mutate)).toThrow());
  for (const week of ["Monday–Friday: 9am–5pm Saturday: 10am–2pm", "Monday–Friday: 9am–5pm Saturday: 10am–2pm Sunday: Closed Monday: 9am–5pm",
    "Monday–Friday: 9–5 Saturday: 10–2 Sunday: Closed", "Monday–Friday: 9am–5pm Saturday: 10am–2pm Sunday: Closed until sold out",
    "Monday–Friday: 9am–5pm Saturday: 10am–2pm Sunday: Closed except holidays", "Monday–Friday: 9pm–5am Saturday: 10am–2pm Sunday: Closed",
    "Monday–Friday: 9am–5pm Saturday: 10am–2pm Sunday: Closed Kitchen hours 11am–3pm"]) {
    it(`holds incomplete, duplicate or qualified primary text: ${week}`, () => expect(() => parse(document => { document.querySelector(".hours")!.textContent = "Hours " + week; })).toThrow());
  }
  it("requires repeated public copies to agree and never combines incomplete primary weeks", () => {
    expect(() => parse((document, config) => { document.querySelector("section")!.insertAdjacentHTML("beforeend", "<div class='hours'>Hours Monday–Friday: 9am–6pm Saturday: 10am–2pm Sunday: Closed</div>"); config.locations["fixture-0"].weeks[0].count = 2; })).toThrow(/Conflicting repeated/);
    expect(() => parse((document, config) => { document.querySelector(".hours")!.textContent = "Hours Monday–Friday: 9am–5pm"; document.querySelector("section")!.insertAdjacentHTML("beforeend", "<div class='hours'>Hours Saturday: 10am–2pm Sunday: Closed</div>"); config.locations["fixture-0"].weeks[0].count = 2; })).toThrow(/Incomplete primary/);
  });
  it("checks subordinate lunch/dinner partitions without using them to extend public hours", () => {
    const change = (document: Document, config: ContactCohort, end = "5pm") => { document.querySelector(".hours")!.textContent = `Hours Monday–Friday: 9am–5pm Lunch 9am–1pm | Dinner 1pm–${end} Saturday: 10am–2pm Sunday: Closed`; config.locations["fixture-0"].weeks[0].partitions = { labels: ["Lunch", "Dinner"], days: ["mon", "tue", "wed", "thu", "fri"] }; };
    expect(parse(change)[0].mon).toEqual([{ open: "09:00", close: "17:00" }]);
    expect(() => parse((d, c) => change(d, c, "6pm"))).toThrow(/extend or shorten/);
  });
  it("reads a publisher-encoded telephone action without inventing a contact number", () => {
    expect(parse((document, config) => { document.querySelector(".phone")!.setAttribute("href", "tel:%20(301)%20555-0000"); config.locations["fixture-0"].phone.expected = "tel:%20(301)%20555-0000"; })[0].sun).toEqual([]);
  });
  it("does not manufacture online-only hours by joining unrelated controls after extraction", () => {
    const change = (document: Document, config: ContactCohort) => { document.querySelector(".hours")!.before(Object.assign(document.createElement("p"), { textContent: "Order online" }), Object.assign(document.createElement("h3"), { textContent: "Hours", id: "hours-label" })); config.locations["fixture-0"].headings = ["#hours-label"]; };
    expect(parse(change)[0].mon).toEqual([{ open: "09:00", close: "17:00" }]);
    expect(() => parse((d, c) => { change(d, c); d.querySelector("#hours-label")!.textContent = "Online only hours"; })).toThrow(/changed public hours heading/);
    expect(() => parse((d, c) => { change(d, c); d.body.insertAdjacentHTML("beforeend", "<p>Online only hours apply.</p>"); })).toThrow(/outside schedule/);
  });
  it("distinguishes an exact unselected branch without approving or borrowing its hours", () => {
    const change = (document: Document, config: ContactCohort) => {
      document.body.insertAdjacentHTML("beforeend", "<section id='other'>Other Branch 2 Another Street Rockville MD 20850 Monday–Sunday 1pm–5pm <a href='tel:3015559999'>Call</a></section>");
      config.locations["fixture-0"].other_locations = [{ selector: "#other", expected_text: "Other Branch 2 Another Street Rockville MD 20850 Monday–Sunday 1pm–5pm Call", identity: { name: "Other Branch", street: "2 Another Street", locality: "Rockville", region: "MD", postalCode: "20850", phone: "3015559999" } }];
    };
    expect(parse(change)[0].sun).toEqual([]);
    expect(() => parse((d, c) => { change(d, c); d.querySelector("#other a")!.setAttribute("href", "tel:3015558888"); })).toThrow(/unselected location identity/);
    expect(() => parse((d, c) => { change(d, c); d.querySelector("#other")!.append(" Closed today."); })).toThrow(/unselected location identity/);
  });
  it("checks matching nested structured identity and its complete week", () => {
    expect(parse((document, config) => structured(document, config).save())[0].sun).toEqual([]);
    expect(() => parse((document, config) => { const s = structured(document, config); s.entity.openingHoursSpecification[0].closes = "18:00"; s.save(); })).toThrow(/Conflicting visible and structured/);
    expect(() => parse((document, config) => { const s = structured(document, config); s.entity.telephone = "3015559999"; s.save(); })).toThrow(/structured contact identity/);
    expect(() => parse((document, config) => { const s = structured(document, config); s.entity.openingHoursSpecification.pop(); s.save(); })).toThrow(/Incomplete/);
  });
  it("holds new structured claims rather than silently treating them as unrelated", () => {
    expect(() => parse((document, config) => { const s = structured(document, config); s.save(); delete config.locations["fixture-0"].structured; })).toThrow(/New structured/);
  });
  it("holds dated claims even outside this week instead of silently ignoring them", () => {
    for (const date of ["2026-10-25", "2026-11-26"]) expect(() => parse((document, config) => {
      const s = structured(document, config); s.entity.openingHoursSpecification.push({ "@type": "OpeningHoursSpecification", validFrom: date, validThrough: date, opens: "00:00", closes: "00:00" }); s.save();
    })).toThrow(/Unreviewed cohort specification qualifier/);
  });
  it("excludes only original dated archival posts, holding current or undated notices", () => {
    const change = (document: Document, config: ContactCohort, stamp = "1774897200") => { document.body.insertAdjacentHTML("beforeend", `<div id='archive'><article id='fixture-archived-post' data-date='${stamp}'><a href='https://www.instagram.com/p/FixturePost/'>Closing at4pm today</a></article></div>`); config.locations["fixture-0"].social_archive = archiveFixture("Closing at4pm today", stamp); };
    expect(parse(change)[0].mon).toEqual([{ open: "09:00", close: "17:00" }]);
    expect(() => parse((d, c) => change(d, c, "1792857600"))).toThrow(/Current, undated/);
    expect(() => parse((d, c) => change(d, c, "unknown"))).toThrow(/Current, undated/);
    expect(() => parse((d, c) => { change(d, c); d.querySelector("article a")!.setAttribute("href", "https://another.example/post"); })).toThrow(/ambiguous social/);
  });
  it("does not discard unknown notices placed outside dated archived entries", () => {
    expect(() => parse((document, config) => { document.body.insertAdjacentHTML("beforeend", "<div id='archive'><article id='fixture-archived-post' data-date='1774897200'><a href='https://www.instagram.com/p/FixturePost/'>Old post</a></article><p>Temporarily closed for repairs.</p></div>"); config.locations["fixture-0"].social_archive = archiveFixture("Old post"); })).toThrow(/outside schedule/);
  });
  for (const caption of ["Permanently closed.", "Seasonal closure until further notice.", "Closed Mondays.", "Closed for renovations."]) {
    it(`holds dated-old ongoing notices even with a matching declared hash: ${caption}`, () => {
      expect(() => parse((document, config) => { document.body.insertAdjacentHTML("beforeend", `<div id='archive'><article id='fixture-archived-post' data-date='1774897200'><a href='https://www.instagram.com/p/FixturePost/'>${caption}</a></article></div>`); config.locations["fixture-0"].social_archive = archiveFixture(caption); })).toThrow(/ongoing closure/);
    });
  }
  it("holds edited old post text or changed post identity without trusting its old date", () => {
    const change = (document: Document, config: ContactCohort) => { document.body.insertAdjacentHTML("beforeend", "<div id='archive'><article id='fixture-archived-post' data-date='1774897200'><a href='https://www.instagram.com/p/FixturePost/'>Closing at4pm today</a></article></div>"); config.locations["fixture-0"].social_archive = archiveFixture("Closing at4pm today"); };
    expect(() => parse((d, c) => { change(d, c); d.querySelector("article a")!.textContent = "Closed Mondays."; })).toThrow(/ambiguous social/);
    expect(() => parse((d, c) => { change(d, c); d.querySelector("article")!.id = "unreviewed-post"; })).toThrow(/ambiguous social/);
  });
  it("does not infer an unobserved phone or accept a review declaration for another address", () => {
    expect(() => parse((document, config) => { document.querySelector(".phone")!.remove(); config.locations["fixture-0"].phone.expected = "tel:3015559999"; })).toThrow();
    expect(() => parse((_document, config) => { config.locations["fixture-0"].address.expected = "2 Example Street, Frederick, MD 21701"; })).toThrow(/Invalid exact visible/);
  });
  it("does not turn an absent primary weekday into an implied closure", () => {
    expect(() => parse((document, config) => { document.querySelector(".hours")!.textContent = "Hours Monday–Friday: 9am–5pm Saturday: 10am–2pm"; document.querySelector("section")!.insertAdjacentHTML("beforeend", "<div class='service'>Sunday: Closed</div>"); config.locations["fixture-0"].weeks = [...config.locations["fixture-0"].weeks, { selector: ".service", count: 1, partial: true }]; })).toThrow(/Incomplete primary/);
  });
  it("allows an ordinary repeated Sunday closure only when the primary week explicitly closes Sunday", () => {
    expect(parse(document => { document.body.insertAdjacentHTML("beforeend", "<p>Closed on Sundays.</p><p>We are closed every Sunday.</p>"); })[0].sun).toEqual([]);
    expect(() => parse(document => { document.querySelector(".hours")!.textContent = "Hours Monday–Friday: 9am–5pm Saturday: 10am–2pm Sunday: 10am–2pm"; document.body.insertAdjacentHTML("beforeend", "<p>Closed on Sundays.</p>"); })).toThrow();
  });
  it("keeps a complete seven-day result for each accepted visible fixture", () => expect(Object.keys(parse()[0]).sort()).toEqual([...WEEKDAYS].sort()));
});
