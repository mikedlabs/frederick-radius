// @vitest-environment jsdom
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import CivicCard from "./CivicCard";
import type { MunicipalCivic } from "@/lib/loaders/municipalCivic";

const NOW = new Date("2026-10-12T15:00:00.000Z");
const HOURS = "Monday-Friday 8AM-4PM";
const record = (hours?: string, fetchedAt = "2026-08-18T15:34:31.695Z"): MunicipalCivic => ({
  slug: "woodsboro", name: "Woodsboro",
  townHall: { label: "Town Hall", phone: "301-898-3800", address: "605 S. Main Street, Woodsboro, MD 21798", hours },
  source: { url: "https://woodsboro.org/", fetchedAt },
});
function mount(rec: MunicipalCivic) {
  const container = document.createElement("div");
  container.innerHTML = renderToStaticMarkup(createElement(CivicCard, { rec, now: NOW }));
  return container;
}
describe("municipal office hours and contact actions", () => {
  it("does not present council meetings as office opening hours", () => {
    const container = mount(record("Council meetings are held on the second Tuesday at 7:00 pm."));
    expect(container.textContent).not.toContain("second Tuesday");
    expect(container.textContent).toContain("Office hours are unconfirmed.");
    expect(container.querySelector('a[href="tel:3018983800"]')).not.toBeNull();
    expect(container.querySelector('a[href="https://woodsboro.org/"]')).not.toBeNull();
    expect(container.textContent).not.toMatch(/office.*closed/i);
  });
  it("dates previously posted hours and asks the resident to confirm before a trip", () => {
    const container = mount(record(HOURS));
    expect(container.textContent).toContain(`The town previously posted ${HOURS}`);
    expect(container.textContent).toContain("last checked Aug 18, 2026. Confirm with the town before visiting.");
    expect(container.textContent).toContain("Confirm with the town before visiting.");
    expect(container.querySelector('a[href="tel:3018983800"]')).not.toBeNull();
  });
  it.each(["", "invalid", "2026-10-12T15:06:00.000Z"])("withholds undated or future-dated hours (%s) while retaining contacts", (fetchedAt) => {
    const container = mount(record(HOURS, fetchedAt));
    expect(container.textContent).not.toContain(HOURS);
    expect(container.textContent).toContain("Office hours are unconfirmed.");
    expect(container.textContent).not.toContain("checked today");
    expect(container.querySelector('a[href="tel:3018983800"]')).not.toBeNull();
  });
});
