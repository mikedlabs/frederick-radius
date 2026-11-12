import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Hours } from "@/data/places";
import HoursBlock from "./HoursBlock";
import LiveOpenStatus from "./LiveOpenStatus";
import { parseFcplOfficialHours } from "../../../scripts/lib/fcpl-official-hours";
import { FCPL_HOURS_URL, FCPL_CLOSURES_URL, officialHoursForPlace } from "@/lib/official-hours";
import { placeHoursProvenance } from "@/lib/place-hours-provenance";
import { merchantHoursForPlace, MERCHANT_HOURS_SOURCES, type MerchantHoursArtifact } from "@/lib/merchant-hours";
import { parseMerchantOfficialHours } from "../../../scripts/lib/merchant-official-hours";
const { JSDOM } = createRequire(import.meta.url)("jsdom") as { JSDOM: new (html: string) => { window: { document: Document } } };
const now = new Date("2026-10-12T16:00:00Z");
const artifact = parseFcplOfficialHours(
  { url: FCPL_HOURS_URL, observedAt: "2026-10-12T09:13:00.000Z", html: readFileSync("tests/fixtures/fcpl-hours-index.html", "utf8") },
  { url: FCPL_CLOSURES_URL, observedAt: "2026-10-12T09:18:00.000Z", html: readFileSync("tests/fixtures/fcpl-holiday-closings.html", "utf8") }, now);
const row = artifact.places[1];
const hours = officialHoursForPlace({ slug: row.slug, website: row.source_url, category: "library" }, artifact, now).hours!;
function merchantFixture(slug: string, file: string, observedAt: string, at: Date): MerchantHoursArtifact {
  const source = MERCHANT_HOURS_SOURCES.find((item) => item.slug === slug)!;
  return { schema_version: 1, review: [], places: [parseMerchantOfficialHours(source, {
    url: source.url, html: readFileSync(`tests/fixtures/merchant-hours/${file}.html`, "utf8"), observedAt,
  }, at)] };
}
afterEach(() => vi.useRealTimers());
describe("official hours detail display", () => {
  it("shows today's dated closure, the unmodified normal week, and both actual official source links", () => {
    vi.useFakeTimers(); vi.setSystemTime(now);
    const html = renderToStaticMarkup(<HoursBlock hours={hours} verified provenance="Hours from Frederick County Public Libraries." />);
    expect(html).toContain("Hours today · Closed");
    expect(html).toContain("Libraries Closed - Staff Development Day");
    expect(html).toContain("10am–9pm");
    expect(html).toContain('href="https://www.fcpl.org/branches-hours/c-burr-artz-public-library"');
    expect(html).toContain('href="https://www.fcpl.org/holiday-closings"');
    expect(html).not.toContain("Hours from Google");
  });
  it("labels a retained long-session schedule as unconfirmed after expiry", () => {
    vi.useFakeTimers(); vi.setSystemTime(new Date("2026-10-19T16:00:00Z"));
    const html = renderToStaticMarkup(<HoursBlock hours={hours} verified />);
    expect(html).toContain("Hours today · Hours not confirmed");
    expect(html).toContain("not current enough to confirm a visit");
  });
});


describe("missing and merchant hours", () => {
  it("renders merchant provenance from its own source and observation, distinct from library evidence", () => {
    const at = new Date("2026-10-20T16:00:00Z");
    vi.useFakeTimers(); vi.setSystemTime(at);
    const source = MERCHANT_HOURS_SOURCES.find(item => item.slug === "thai-meric-eatery-bar-frederick")!;
    // Offline replay of the saved source fixture at its original observation.
    const merchantRow = parseMerchantOfficialHours(source, {
      url: source.url,
      html: readFileSync("tests/fixtures/merchant-hours/thai-meric-eatery-bar-frederick.html", "utf8"),
      observedAt: "2026-10-20T11:42:21.627Z",
    }, at);
    const data: MerchantHoursArtifact = { schema_version: 1, places: [merchantRow], review: [] };
    const merchantHours = merchantHoursForPlace({ slug: "thai-meric-eatery-bar-frederick", category: "restaurant", website: "https://www.thaimeric.com/" }, data, at).hours;
    expect(merchantRow).toBeDefined();
    expect(merchantHours).toBeDefined();
    expect(merchantHours?._official).toMatchObject({ source_name: merchantRow.source_name, source_url: merchantRow.source_url, observed_at: merchantRow.observed_at });
    const merchantProvenance = placeHoursProvenance({ hours: merchantHours, hours_source: "first_party", hours_updated_at: "2026-10-20T15:59:00Z" });
    const merchantHtml = renderToStaticMarkup(<HoursBlock hours={merchantHours} verified provenance={merchantProvenance} />);
    expect(merchantHtml).toContain("Hours from Thai Meric Eatery &amp; Bar, observed Oct 20, 2026 at 7:42 AM ET.");
    expect(merchantHtml).toContain(`href="${merchantRow.source_url}"`);
    expect(merchantHtml).not.toContain("Frederick County Public Libraries");
    expect(merchantHtml).not.toContain("confirmed today");
    const libraryProvenance = placeHoursProvenance({ hours, hours_source: "first_party" }, now.getTime());
    const libraryHtml = renderToStaticMarkup(<HoursBlock hours={hours} verified provenance={libraryProvenance} />);
    expect(libraryHtml).toContain("Hours from Frederick County Public Libraries, observed Oct 12, 2026 at 5:13 AM ET.");
    expect(libraryHtml).toContain("Official branch hours");
    expect(libraryHtml).not.toContain("Thai Meric");
  });

  it("labels the exact merchant week and links its real source without inventing a library closure calendar", () => {
    const at = new Date("2026-10-19T23:30:00Z");
    vi.useFakeTimers(); vi.setSystemTime(at);
    // Immutable approved source replay; the current publication may be held.
    const data = merchantFixture("brewers-alley-frederick", "brewers-alley", "2026-10-19T23:24:49.283Z", at);
    const schedule = merchantHoursForPlace({ slug: "brewers-alley-frederick", category: "restaurant", website: "https://brewers-alley.com/" }, data, at).hours!;
    expect(schedule).toBeDefined();
    const html = renderToStaticMarkup(<HoursBlock hours={schedule} verified />);
    expect(html).toContain("2026-10-19 through 2026-10-25");
    expect(html).toContain('href="https://brewers-alley.com/"');
    expect(html).toContain("Official business hours");
    expect(html).not.toContain("FCPL");
  });
  it.each([
    ["brewers-alley-frederick", "brewers-alley", "2026-10-19T23:24:49.283Z"],
    ["gravel-and-grind-frederick", "gravel-and-grind", "2026-10-19T23:24:50.964Z"],
  ])("withholds %s's retained approved schedule after a failed verification and keeps its contact action", (slug, file, observedAt) => {
    const at = new Date("2026-10-20T12:00:00Z");
    vi.useFakeTimers(); vi.setSystemTime(at);
    const data = merchantFixture(slug, file, observedAt, at);
    data.review.push({ slug, checked_at: "2026-10-20T09:32:45.347Z", reason: "source_unavailable" });
    const source = MERCHANT_HOURS_SOURCES.find((item) => item.slug === slug)!;
    const result = merchantHoursForPlace({ slug, category: source.category, website: source.url }, data, at);
    expect(result).toEqual({ enrolled: true });
    expect(data.places[0].observed_at).toBe(observedAt);
    const html = renderToStaticMarkup(<HoursBlock hours={result.hours} verified={Boolean(result.hours)} website={source.url} />);
    expect(html).toContain("Hours not recently confirmed");
    expect(html).toContain(`href="${source.url}"`);
    expect(html).not.toContain("Official business hours");
    expect(html).not.toContain("The business published this schedule");
    expect(html).not.toContain("FCPL");
  });
  it("shows usable contact actions without inventing a historical schedule", () => {
    const html = renderToStaticMarkup(<HoursBlock website="https://example.org/" phone="(301) 555-0100" />);
    expect(html).toContain("Hours not recently confirmed");
    expect(html).toContain('href="https://example.org/"');
    expect(html).toContain('href="tel:3015550100"');
    expect(html).not.toContain("Hours not posted");
    expect(html).not.toContain("FCPL");
  });
});

describe("qualified official schedules", () => {
  const checkedAt = new Date("2026-10-23T16:00:00Z");
  const museum: Hours = {
    mon: [], tue: [], wed: [{ open: "10:00", close: "17:00" }],
    thu: [{ open: "10:00", close: "17:00" }], fri: [{ open: "10:00", close: "17:00" }],
    sat: [{ open: "10:00", close: "17:00" }], sun: [{ open: "11:00", close: "17:00" }],
    _official: {
      kind: "merchant", schedule_kind: "weekly", slug: "demonstration-museum",
      source_name: "Demonstration museum", source_url: "https://example.org/museum-hours",
      observed_at: "2026-10-23T11:00:00Z", expires_at: "2026-10-30T11:00:00Z",
      coverage_from: "2026-10-23", coverage_through: "2026-10-29", exceptions: [],
      qualification: {
        scope: "venue", label: "Museum hours", usage: "display_only",
        note: "Last admission is at 4:30pm. The museum closes at 5pm.",
      },
    },
  };

  it("keeps the admission qualification visible before expansion and separates it from the closing time", () => {
    vi.useFakeTimers(); vi.setSystemTime(checkedAt);
    const html = renderToStaticMarkup(<HoursBlock hours={museum} verified />);
    const doc = new JSDOM(html).window.document;
    const section = doc.querySelector('section[aria-label="Museum hours"]')!;
    const note = section.querySelector("p")!;
    expect(note.textContent).toBe("Last admission is at 4:30pm. The museum closes at 5pm.");
    expect(note.closest("details")).toBeNull();
    expect(doc.querySelector("details")?.hasAttribute("open")).toBe(false);
    expect(doc.querySelector("summary")?.textContent).toContain("Museum hours today · 10am–5pm");
    expect(html).toContain("Checked at source");
    expect(html).not.toContain("Unconfirmed");
    expect(html).not.toContain("not current enough");
    expect(html).not.toContain("needs a new source check");
    expect(html).not.toContain("10am–4:30pm");
    expect(doc.querySelector('ul[aria-label="Museum hours by day"]')?.children).toHaveLength(7);
  });

  it("keeps scoped kitchen hours checked without claiming the restaurant is closed outside those hours", () => {
    vi.useFakeTimers(); vi.setSystemTime(checkedAt);
    const kitchen: Hours = {
      ...museum, fri: [{ open: "16:00", close: "21:00" }],
      _official: { ...museum._official!, qualification: {
        scope: "kitchen", label: "Kitchen hours", usage: "display_only",
        note: "The kitchen follows this schedule. Bar hours may differ.",
      } },
    };
    const html = renderToStaticMarkup(<HoursBlock hours={kitchen} verified />);
    expect(html).toContain("Kitchen hours today · 4pm–9pm");
    expect(html).toContain("Checked at source");
    expect(new JSDOM(html).window.document.querySelector("summary")?.textContent).not.toContain("Closed");
    const hero = renderToStaticMarkup(<LiveOpenStatus hours={kitchen} verified initial={{ state: "closed" }} />);
    expect(hero).toContain("Venue opening not confirmed");
    expect(hero).not.toContain("Hours not recently confirmed");
    expect(hero).not.toContain("Closed");
  });

  it("withholds an expired today's schedule without hiding its qualification or erasing the posted week", () => {
    vi.useFakeTimers(); vi.setSystemTime(new Date("2026-10-30T16:00:00Z"));
    const html = renderToStaticMarkup(<HoursBlock hours={museum} verified />);
    expect(html).toContain("Museum hours today · Hours not confirmed");
    expect(html).toContain("Needs a new check");
    expect(html).toContain("This posted schedule needs a new source check.");
    expect(html).toContain("Last admission is at 4:30pm. The museum closes at 5pm.");
    expect(html).toContain("10am–5pm");
    expect(html).not.toContain("Checked at source");
    expect(html).not.toContain("No posted hours");
  });

  it("does not expose a stale server open claim before hydration for display-only schedules", () => {
    const html = renderToStaticMarkup(<LiveOpenStatus hours={museum} verified initial={{ state: "open", closesAt: "17:00", closingSoon: false }} />);
    expect(html).toContain("Venue opening not confirmed");
    expect(html).not.toContain("Open now");
    expect(html).not.toContain("Closes");
  });
});
