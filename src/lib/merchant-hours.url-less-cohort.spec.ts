import { createRequire } from "node:module";
import { describe, expect, it } from "vitest";
import { parseOfficialHoursCohort, type OfficialHoursCohort } from "../../scripts/lib/official-hours-cohort";

const { JSDOM } = createRequire(import.meta.url)("jsdom") as { JSDOM: new (html: string) => { window: { document: Document } } };
type Cohort = Extract<OfficialHoursCohort, { shape: "visible_weekly_contact_card" }>;
const days = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
function fixture() {
  const binding = { slug: "fixture", source_name: "Fixture", identity: { name: "Fixture Cafe", street: "123 Example St Suite A", locality: "Frederick", region: "MD", postalCode: "21701", phone: "3015550000" } };
  const url = "https://official.example/location/fixture/";
  const config: Cohort = { shape: "visible_weekly_contact_card", ledger_id: "fixture", source_url: url, canonical_url: url, bindings: [binding], locations: { fixture: {
    name: { selector: "#name", expected: "Fixture Cafe" }, address: { selector: "#address", expected: "123 Example Street Suite A, Frederick MD 21701" },
    phone: { selector: "#phone", expected: "3015550000" }, weeks: [{ selector: "#schedule", count: 1 }],
    structured: { schema_type: "LocalBusiness", entity_url: url, name: "Fixture Cafe", url_absent_single_location: { street: "123 Example Street", country_object: true, zero_seconds: true, astro_hours_selector: "#schedule" } },
  } } };
  const d = new JSDOM(`<!doctype html><link rel="canonical" href="${url}"><body><h1 id="name">Fixture Cafe</h1><p id="address">123 Example Street Suite A, Frederick MD 21701</p><p id="phone">3015550000</p><div id="schedule">${days.map(day => `<p>${day} 6:00 AM - 9:00 PM</p>`).join("")}</div></body>`).window.document;
  const props: Record<string, unknown> = { timezone: [0, "America/New_York"], specialHours: [1, []], hours: [0, Object.fromEntries(days.map(day => [day, [0, { status: [0, "Open"], blocks: [1, [[0, { from: [0, "0600"], to: [0, "2100"] }]]] }]]))] };
  d.querySelector("#schedule")!.setAttribute("props", JSON.stringify(props));
  const entity: Record<string, unknown> = { "@type": "LocalBusiness", name: "Fixture Cafe", telephone: "3015550000", address: { streetAddress: "123 Example Street", addressLocality: "Frederick", addressRegion: "MD", postalCode: "21701", addressCountry: { "@type": "Country", name: "US" } }, openingHoursSpecification: days.map(day => ({ "@type": "OpeningHoursSpecification", dayOfWeek: day, opens: "06:00:00", closes: "21:00:00" })) };
  const script = d.createElement("script"); script.type = "application/ld+json"; script.textContent = JSON.stringify(entity); d.body.append(script);
  return { d, config, binding, entity, script, props };
}
function parse(change?: (f: ReturnType<typeof fixture>) => void) {
  const f = fixture(); change?.(f); f.script.textContent = JSON.stringify(f.entity); f.d.querySelector("#schedule")!.setAttribute("props", JSON.stringify(f.props));
  return parseOfficialHoursCohort(f.d, f.d.body.textContent ?? "", f.config, f.binding, { coverage_from: "2026-10-27", coverage_through: "2026-11-03" });
}
describe("URL-less, visibly bound structured contact week", () => {
  it("accepts only three agreeing complete weeks with an exact visible location", () => expect(parse().mon).toEqual([{ open: "06:00", close: "21:00" }]));
  const rejected: Array<[string, (f: ReturnType<typeof fixture>) => void]> = [
    ["changed canonical", (f: ReturnType<typeof fixture>) => f.d.querySelector("link[rel=canonical]")!.setAttribute("href", "https://official.example/other/")],
    ["different suite", (f: ReturnType<typeof fixture>) => { f.d.querySelector("#address")!.textContent = "123 Example Street Suite B, Frederick MD 21701"; }],
    ["Saint street-name collision", (f: ReturnType<typeof fixture>) => { f.binding.identity.street = "123 St John St Suite A"; f.config.locations.fixture.address.expected = "123 Street John Street Suite A, Frederick MD 21701"; f.d.querySelector("#address")!.textContent = f.config.locations.fixture.address.expected; f.config.locations.fixture.structured!.url_absent_single_location!.street = "123 Street John Street"; }],
    ["different structured street", (f: ReturnType<typeof fixture>) => { (f.entity.address as Record<string, unknown>).streetAddress = "999 Example Street"; }],
    ["configured structured street outside visible identity", (f: ReturnType<typeof fixture>) => { f.config.locations.fixture.structured!.url_absent_single_location!.street = "999 Example Street"; }],
    ["unexpected entity URL", (f: ReturnType<typeof fixture>) => { f.entity.url = "https://official.example/other/"; }],
    ["unexpected entity identifier", (f: ReturnType<typeof fixture>) => { f.entity["@id"] = "https://official.example/other/"; }],
    ["unexpected main page", (f: ReturnType<typeof fixture>) => { f.entity.mainEntityOfPage = "https://official.example/other/"; }],
    ["different country", (f: ReturnType<typeof fixture>) => { (f.entity.address as Record<string, unknown>).addressCountry = { "@type": "Country", name: "CA" }; }],
    ["nonzero seconds", (f: ReturnType<typeof fixture>) => { (f.entity.openingHoursSpecification as Record<string, unknown>[])[0].opens = "06:00:30"; }],
    ["dated structured row", (f: ReturnType<typeof fixture>) => { (f.entity.openingHoursSpecification as Record<string, unknown>[])[0].validFrom = "2026-12-01"; }],
    ["qualified structured entity", (f: ReturnType<typeof fixture>) => { f.entity.specialOpeningHoursSpecification = []; }],
    ["conflicting visible hours", (f: ReturnType<typeof fixture>) => { f.d.querySelector("#schedule p")!.textContent = "Monday 7:00 AM - 9:00 PM"; }],
    ["special hours in hidden props", (f: ReturnType<typeof fixture>) => { f.props.specialHours = [1, [{ date: "2026-12-25" }]]; }],
    ["conflicting serialized hours", (f: ReturnType<typeof fixture>) => { const hours = (f.props.hours as unknown[])[1] as Record<string, unknown>; hours.Monday = [0, { status: [0, "Open"], blocks: [1, [[0, { from: [0, "0700"], to: [0, "2100"] }]]] }]; }],
    ["wrong timezone", (f: ReturnType<typeof fixture>) => { f.props.timezone = [0, "America/Chicago"]; }],
    ["unknown props", (f: ReturnType<typeof fixture>) => { (f.props as Record<string, unknown>).closures = [1, []]; }],
    ["additional hidden serialized schedule", (f: ReturnType<typeof fixture>) => { const hidden = f.d.createElement("astro-island"); hidden.hidden = true; hidden.setAttribute("props", JSON.stringify({ specialHours: [1, [{ date: "2026-12-25" }]] })); f.d.body.append(hidden); }],
    ["standalone JSON holiday hours", (f: ReturnType<typeof fixture>) => { const script = f.d.createElement("script"); script.type = "application/json"; script.textContent = JSON.stringify({ holidayHours: [] }); f.d.body.append(script); }],
    ["standalone text/data closures", (f: ReturnType<typeof fixture>) => { const script = f.d.createElement("script"); script.type = "text/data"; script.textContent = JSON.stringify({ closures: [] }); f.d.body.append(script); }],
    ["hidden JSON-LD holiday alias", (f: ReturnType<typeof fixture>) => { const script = f.d.createElement("script"); script.type = "application/ld+json"; script.textContent = JSON.stringify({ metadata: { holidayHours: [] } }); f.d.body.append(script); }],
    ...["holidayHours", "special_hours", "closedDates", "closures", "temporarySchedule"].map((key): [string, (f: ReturnType<typeof fixture>) => void] => [key, (f) => { const hidden = f.d.createElement("astro-island"); hidden.hidden = true; hidden.setAttribute("props", JSON.stringify({ config: { [key]: [] } })); f.d.body.append(hidden); }]),
    ["duplicate entity", (f: ReturnType<typeof fixture>) => { const duplicate = f.d.createElement("script"); duplicate.type = "application/ld+json"; duplicate.textContent = JSON.stringify(f.entity); f.d.body.append(duplicate); }],
  ];
  it.each(rejected)("holds %s", (_name, change) => expect(() => parse(change)).toThrow());
});
