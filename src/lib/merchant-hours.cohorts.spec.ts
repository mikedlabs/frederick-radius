import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { MERCHANT_HOURS_COHORTS, merchantHoursCohort } from "../../scripts/lib/merchant-hours-cohorts";
import { parseOfficialHoursCohort, type OfficialHoursCohort } from "../../scripts/lib/official-hours-cohort";
import { MERCHANT_HOURS_SOURCES } from "./merchant-hours";
import { WEEKDAYS } from "./official-hours";

const { JSDOM } = createRequire(import.meta.url)("jsdom") as { JSDOM: new (html: string) => { window: { document: Document } } };
const fullDays = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
// Synthetic pipeline fixture, not source evidence, an enrollment or public facts.
const bindings = Array.from({ length: 20 }, (_, index) => ({
  slug: `fixture-branch-${index}`, source_name: `Fixture branch ${index}`,
  identity: { name: "Fixture Civic Center", street: `${index + 1} Example Street`, locality: "Frederick", region: "MD", postalCode: "21701", phone: `301555${String(index).padStart(4, "0")}` },
}));
const cohort: Extract<OfficialHoursCohort, { shape: "jsonld_weekly_location_cards" }> = {
  ledger_id: "fixture_only", source_url: "https://official.example/locations/", shape: "jsonld_weekly_location_cards",
  schema_type: "CivicStructure", closed_representation: "midnight_equal",
  selectors: { card: ".location", name: ".name", address: ".address", street: ".street", locality: ".city", region: ".region", postalCode: ".zip", phone: ".phone", schedule: ".hours" },
  schedule_row: "li", bindings,
  entity_urls: Object.fromEntries(bindings.map((binding) => [binding.slug, `https://official.example/locations/${binding.slug}`])),
};
const entities = () => bindings.map((binding, index) => ({
  "@type": "CivicStructure", name: binding.identity.name, url: cohort.entity_urls[binding.slug], telephone: binding.identity.phone,
  address: { "@type": "PostalAddress", streetAddress: binding.identity.street, addressLocality: "Frederick", addressRegion: "MD", postalCode: "21701", addressCountry: "US" },
  openingHoursSpecification: [
    { "@type": "OpeningHoursSpecification", dayOfWeek: fullDays.slice(0, 5), opens: index % 2 ? "10:00" : "09:00", closes: "17:00" },
    { "@type": "OpeningHoursSpecification", dayOfWeek: ["Saturday", "Sunday"], opens: "00:00", closes: "00:00" },
  ],
}));
function fixture() {
  return `<!doctype html><html><body>${bindings.map((binding, index) => `<section class="location"><h2 class="name">${binding.identity.name}</h2><address class="address"><span class="street">${binding.identity.street}</span><span class="city">Frederick</span><span class="region">MD</span><span class="zip">21701</span></address><p class="phone">${binding.identity.phone}</p><ul class="hours">${fullDays.map((day, dayIndex) => `<li>${day}: ${dayIndex > 4 ? "Closed" : `${index % 2 ? "10am" : "9am"} - 5pm`}</li>`).join("")}</ul></section>`).join("")}<script type="application/ld+json">${JSON.stringify({ "@graph": entities() })}</script></body></html>`;
}
function parse(index = 0, mutate?: (document: Document) => void, config = cohort) {
  const document = new JSDOM(fixture()).window.document;
  mutate?.(document);
  const clone = document.body.cloneNode(true) as HTMLElement;
  clone.querySelectorAll("script").forEach((node) => node.remove());
  return parseOfficialHoursCohort(document, clone.textContent ?? "", config, config.bindings[index]);
}
function changeEntity(document: Document, change: (entity: ReturnType<typeof entities>[number]) => void, index = 0) {
  const script = document.querySelector("script")!;
  const graph = JSON.parse(script.textContent!)["@graph"];
  change(graph[index]);
  script.textContent = JSON.stringify({ "@graph": graph });
}

describe("declarative exact official-hours cohorts", () => {
  it("keeps every production cohort bound to the existing reviewed owner, URL and source name", () => {
    const slugs: string[] = [];
    for (const item of MERCHANT_HOURS_COHORTS) for (const binding of item.bindings) {
      const source = MERCHANT_HOURS_SOURCES.find((row) => row.slug === binding.slug)!;
      expect(source).toBeDefined();
      expect(merchantHoursCohort(source)).toEqual({ cohort: item, binding });
      slugs.push(binding.slug);
      expect(() => merchantHoursCohort({ ...source, ledger_id: "different_owner" } as never)).toThrow(/ownership/);
      expect(() => merchantHoursCohort({ ...source, url: "https://other.example/" } as never)).toThrow(/ownership/);
    }
    expect(new Set(slugs).size).toBe(slugs.length);
    expect(merchantHoursCohort(MERCHANT_HOURS_SOURCES[0])).toBeUndefined();
  });

  it("extracts twenty independent exact locations from one already captured receipt and one reviewed shape", () => {
    for (let index = 0; index < bindings.length; index++) {
      const hours = parse(index);
      expect(Object.keys(hours).sort()).toEqual([...WEEKDAYS].sort());
      expect(hours.mon).toEqual([{ open: index % 2 ? "10:00" : "09:00", close: "17:00" }]);
      expect(hours.sat).toEqual([]);
      expect(hours.sun).toEqual([]);
    }
  });

  it.each([
    ["wrong structured street", (document: Document) => changeEntity(document, (row) => { row.address.streetAddress = "999 Wrong Street"; })],
    ["wrong structured locality", (document: Document) => changeEntity(document, (row) => { row.address.addressLocality = "Brunswick"; })],
    ["wrong structured contact", (document: Document) => changeEntity(document, (row) => { row.telephone = "3015559999"; })],
    ["wrong structured type", (document: Document) => changeEntity(document, (row) => { row["@type"] = "Restaurant"; })],
    ["wrong branch URL", (document: Document) => changeEntity(document, (row) => { row.url = "https://official.example/another-branch"; })],
    ["changed structured clocks", (document: Document) => changeEntity(document, (row) => { row.openingHoursSpecification[0].closes = "16:00"; })],
    ["missing structured weekdays", (document: Document) => changeEntity(document, (row) => { row.openingHoursSpecification[0].dayOfWeek = ["Monday"]; })],
    ["dated structured extension", (document: Document) => changeEntity(document, (row) => { Object.assign(row.openingHoursSpecification[0], { validThrough: "2026-12-01" }); })],
    ["special-date extension", (document: Document) => changeEntity(document, (row) => { Object.assign(row, { specialOpeningHoursSpecification: [] }); })],
    ["entity-level dated extension", (document: Document) => changeEntity(document, (row) => { Object.assign(row, { validThrough: "2026-12-01" }); })],
    ["ambiguous all-day specification", (document: Document) => changeEntity(document, (row) => { row.openingHoursSpecification[0].opens = "17:00"; })],
    ["missing visible weekday", (document: Document) => { document.querySelector(".location .hours li")!.remove(); }],
    ["duplicate visible card", (document: Document) => { const card = document.querySelector(".location")!; card.after(card.cloneNode(true)); }],
    ["hidden visible card", (document: Document) => { document.querySelector(".location")!.setAttribute("hidden", ""); }],
    ["hidden descendant clock", (document: Document) => { document.querySelector(".location .hours li")!.innerHTML = "Monday: <span hidden>9am - 5pm</span>"; }],
    ["hidden descendant identity", (document: Document) => { document.querySelector(".location .street")!.innerHTML = "<span aria-hidden='true'>1 Example Street</span>"; }],
    ["different visible contact", (document: Document) => { document.querySelector(".location .phone")!.textContent = "3015559999"; }],
    ["service-only visible clock", (document: Document) => { document.querySelector(".location .hours li")!.textContent = "Monday: Pickup 9am - 5pm"; }],
    ["second visible schedule", (document: Document) => { document.querySelector(".location")!.insertAdjacentHTML("beforeend", "<p>Monday: 9am - 4pm</p>"); }],
    ["additional service schedule", (document: Document) => { document.querySelector(".location")!.insertAdjacentHTML("beforeend", "<p>Lobby hours 8am - 6pm</p>"); }],
    ["additional closure notice", (document: Document) => { document.querySelector(".location")!.insertAdjacentHTML("beforeend", "<p>Closed Mondays.</p>"); }],
    ["cutoff notice", (document: Document) => { document.body.insertAdjacentHTML("beforeend", "<p>Last admission at 4pm.</p>"); }],
    ["holiday notice", (document: Document) => { document.body.insertAdjacentHTML("beforeend", "<p>Holiday hours apply.</p>"); }],
  ] as const)("holds %s rather than borrowing a neighboring branch’s facts", (_label, mutate) => {
    expect(() => parse(0, mutate)).toThrow();
  });

  it("holds a broken branch independently while retaining the other exact branch", () => {
    const broken = (document: Document) => changeEntity(document, (row) => { row.telephone = "3015559999"; });
    expect(() => parse(0, broken)).toThrow(/identity/);
    expect(parse(1, broken).mon).toEqual([{ open: "10:00", close: "17:00" }]);
    const missingStreet = (document: Document) => { document.querySelector(".location .street")!.remove(); };
    expect(() => parse(0, missingStreet)).toThrow(/location card/);
    expect(parse(1, missingStreet).mon).toEqual([{ open: "10:00", close: "17:00" }]);
  });

  it("rejects duplicate targeted JSON-LD identities and ambiguous zero-clock closures", () => {
    expect(() => parse(0, (document) => {
      const script = document.querySelector("script")!;
      const graph = entities(); graph.push(structuredClone(graph[0]));
      script.textContent = JSON.stringify({ "@graph": graph });
    })).toThrow(/ambiguous structured/);
    expect(() => parse(0, undefined, { ...cohort, closed_representation: undefined })).toThrow(/Ambiguous all-day/);
  });

  it("accepts explicitly corroborated split periods without filling their gap", () => {
    const hours = parse(0, (document) => {
      document.querySelector(".location .hours li")!.textContent = "Monday: 9am - 12pm, 1pm - 5pm";
      changeEntity(document, (row) => {
        row.openingHoursSpecification[0].dayOfWeek = fullDays.slice(1, 5);
        row.openingHoursSpecification.push(
          { "@type": "OpeningHoursSpecification", dayOfWeek: ["Monday"], opens: "09:00", closes: "12:00" },
          { "@type": "OpeningHoursSpecification", dayOfWeek: ["Monday"], opens: "13:00", closes: "17:00" },
        );
      });
    });
    expect(hours.mon).toEqual([{ open: "09:00", close: "12:00" }, { open: "13:00", close: "17:00" }]);
  });

  it("refuses unreviewed enrollment, duplicate URLs and different source authority", () => {
    const document = new JSDOM(fixture()).window.document;
    expect(() => parseOfficialHoursCohort(document, "", cohort, { ...bindings[0] })).toThrow(/bindings/);
    expect(() => parse(0, undefined, { ...cohort, entity_urls: { ...cohort.entity_urls, [bindings[0].slug]: "https://different.example/branch" } })).toThrow(/entity URLs/);
    expect(() => parse(0, undefined, { ...cohort, entity_urls: { ...cohort.entity_urls, [bindings[0].slug]: cohort.entity_urls[bindings[1].slug] } })).toThrow(/entity URLs/);
  });

  it("keeps the existing real shared-card fixture’s exact daily facts after migration", () => {
    const common = MERCHANT_HOURS_COHORTS[0];
    const document = new JSDOM(readFileSync("tests/fixtures/merchant-hours/common-market.html", "utf8")).window.document;
    for (const binding of common.bindings) expect(parseOfficialHoursCohort(document, document.body.textContent ?? "", common, binding).sun).toEqual([{ open: "08:00", close: "21:00" }]);
    document.querySelector(".hours .open")!.innerHTML = "<span style='display:none'>8am - 9pm Daily</span>";
    expect(() => parseOfficialHoursCohort(document, document.body.textContent ?? "", common, common.bindings[0])).toThrow(/visible cohort field/);
  });
});
