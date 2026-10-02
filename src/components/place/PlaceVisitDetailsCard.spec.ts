import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { PlaceVisitDetails } from "@/lib/loaders/placeVisitDetails";
import PlaceVisitDetailsCard from "./PlaceVisitDetailsCard";

const details: PlaceVisitDetails = {
  reviewed_at: "2026-10-02T17:34:09.000Z",
  facts: [
    { text: "Public Wi-Fi is listed among the branch services.", source_url: "https://www.fcpl.org/branches-hours" },
    { text: "Printing is available at the library.", source_url: "https://www.fcpl.org/branches-hours" },
  ],
  actions: [{ label: "Library services", url: "https://www.fcpl.org/services" }],
  unknowns: ["noise_level", "wheelchair_access"],
};

describe("PlaceVisitDetailsCard", () => {
  it("keeps verified facts, their review date and official next steps together", () => {
    const html = renderToStaticMarkup(createElement(PlaceVisitDetailsCard, { details }));
    expect(html).toContain("Public Wi-Fi is listed among the branch services.");
    expect(html).toContain("These sources were checked on Oct 2, 2026.");
    expect(html).toContain('href="https://www.fcpl.org/services"');
    expect(html.match(/>Official source</g)).toHaveLength(1);
    expect(html).not.toContain("Open now");
    expect(html).not.toContain("Closed");
  });

  it("describes missing evidence without asserting that amenities are absent", () => {
    const html = renderToStaticMarkup(createElement(PlaceVisitDetailsCard, {
      details: { ...details, unknowns: ["wifi", "noise_level", "wheelchair_access"] },
    }));
    expect(html).toContain("We have not confirmed");
    expect(html).toContain("Check with the venue before your visit.");
    expect(html).not.toContain("No Wi-Fi");
    expect(html).not.toContain("Not accessible");
  });

  it("distinguishes sources when facts come from different official pages", () => {
    const html = renderToStaticMarkup(createElement(PlaceVisitDetailsCard, {
      details: { ...details, facts: [details.facts[0], { text: "A separate official fact.", source_url: "https://www.fcpl.org/other" }] },
    }));
    expect(html).toContain("Official source 1");
    expect(html).toContain("Official source 2");
    expect(html).toContain('aria-label="Source 2"');
  });

  it("does not create a placeholder panel for an unreviewed place", () => {
    expect(renderToStaticMarkup(createElement(PlaceVisitDetailsCard, { details: null }))).toBe("");
  });
});
