import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import HoursBlock from "./HoursBlock";
import { parseFcplOfficialHours } from "../../../scripts/lib/fcpl-official-hours";
import { FCPL_HOURS_URL, FCPL_CLOSURES_URL, officialHoursForPlace } from "@/lib/official-hours";
const now = new Date("2026-10-12T16:00:00Z");
const artifact = parseFcplOfficialHours(
  { url: FCPL_HOURS_URL, observedAt: "2026-10-12T09:13:00.000Z", html: readFileSync("tests/fixtures/fcpl-hours-index.html", "utf8") },
  { url: FCPL_CLOSURES_URL, observedAt: "2026-10-12T09:18:00.000Z", html: readFileSync("tests/fixtures/fcpl-holiday-closings.html", "utf8") }, now);
const row = artifact.places[1];
const hours = officialHoursForPlace({ slug: row.slug, website: row.source_url, category: "library" }, artifact, now).hours!;
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
  it("labels the exact merchant week and links its real source without inventing a library closure calendar", async () => {
    const data = (await import("@/data/places-merchant-hours.json")).default;
    const { merchantHoursForPlace } = await import("@/lib/merchant-hours");
    const at = new Date("2026-10-19T23:30:00Z");
    vi.useFakeTimers(); vi.setSystemTime(at);
    const schedule = merchantHoursForPlace({ slug: "brewers-alley-frederick", category: "restaurant", website: "https://brewers-alley.com/" }, data, at).hours!;
    const html = renderToStaticMarkup(<HoursBlock hours={schedule} verified />);
    expect(html).toContain("2026-10-19 through 2026-10-25");
    expect(html).toContain('href="https://brewers-alley.com/"');
    expect(html).toContain("Official business hours");
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
