import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { momentBySlug } from "@/data/civic-moments";
import MomentDays from "./MomentDays";
import MomentFacts from "./MomentFacts";
import MomentHero from "./MomentHero";
import { momentDateLine, momentHeroImage } from "./momentGuide";

const colorfest = momentBySlug("catoctin-colorfest-2026")!;
const streets = momentBySlug("in-the-street-2026")!;

function hero(props: Parameters<typeof MomentHero>[0]): string {
  return renderToStaticMarkup(createElement(MomentHero, props));
}

describe("MomentHero", () => {
  it("sets the title on Cream under a licensed photo and draws nothing on it", () => {
    const html = hero({
      title: colorfest.title,
      dateLine: momentDateLine(colorfest.days),
      image: momentHeroImage(colorfest),
    });
    expect(html).toContain('data-moment-hero="licensed"');
    const figure = html.slice(html.indexOf("<figure"), html.indexOf("</figure>"));
    expect(figure).toContain("Thurmont");
    expect(figure).not.toContain("<h1");
    expect(figure).not.toContain("gradient");
    // The h1 follows the figure, on paper.
    expect(html.indexOf("<h1")).toBeGreaterThan(html.indexOf("</figure>"));
    expect(html).toContain("Catoctin Colorfest</h1>");
    expect(html).toContain("OCT 10-11 · 2026");
    expect(html).toContain("Saturday, October 10, 2026 and Sunday, October 11, 2026");
    // No credit before the photo loads.
    expect(html).not.toContain("data-moment-photo-credit");
    expect(html).not.toContain("CraigShipp.com Photos");
    expect(html.match(/data-moment-rule/g)).toHaveLength(1);
  });

  it("puts the title on an owned photo over a bottom scrim, with no credit for an owner photo", () => {
    const html = hero({
      title: streets.title,
      dateLine: null,
      image: momentHeroImage(streets),
    });
    expect(html).toContain('data-moment-hero="owned"');
    expect(html).toContain("In The Streets</h1>");
    expect(html).toContain(streets.spotlightImage!.alt);
    expect(html).not.toContain("data-moment-photo-credit");
    expect(html).not.toContain("radial-gradient");
  });

  it("sets only type and the rule when there is no photo", () => {
    const html = hero({ title: "The Fourth in Frederick County", image: { kind: "none" } });
    expect(html).toContain('data-moment-hero="none"');
    expect(html).not.toContain("<img");
    expect(html).toContain("The Fourth in Frederick County</h1>");
    expect(html.match(/data-moment-rule/g)).toHaveLength(1);
  });
});

describe("MomentDays", () => {
  it("prints one plate per day with no counts", () => {
    const html = renderToStaticMarkup(createElement(MomentDays, { days: colorfest.days }));
    expect(html.match(/data-moment-day=/g)).toHaveLength(2);
    expect(html).toContain('data-moment-day="2026-10-10"');
    expect(html).toContain('data-moment-day="2026-10-11"');
    expect(html).toContain("Sunday, October 11, 2026");
  });

  it("renders nothing without valid days", () => {
    expect(renderToStaticMarkup(createElement(MomentDays, { days: undefined }))).toBe("");
    expect(renderToStaticMarkup(createElement(MomentDays, { days: [{ date: "soon" }] }))).toBe("");
  });
});

describe("MomentFacts", () => {
  it("shows each sourced fact with the site that published it", () => {
    const html = renderToStaticMarkup(createElement(MomentFacts, { facts: colorfest.spotlightFacts }));
    expect(html).toContain('data-moment-fact="Dates"');
    expect(html).toContain("Sat Oct 10 and Sun Oct 11");
    expect(html).toContain('data-moment-fact="Admission"');
    expect(html).toContain(">Free<");
    expect(html).toContain('href="https://www.thurmont.com/2236/Colorfest"');
    expect(html).toContain('href="https://colorfest.org/plan-your-visit/"');
    expect(html).not.toContain("truncate");
  });

  it("never renders a fact without its source", () => {
    const html = renderToStaticMarkup(
      createElement(MomentFacts, {
        facts: [
          { label: "Parking", value: "$10 cash" },
          { label: "Admission", value: "Free", source_url: "https://colorfest.org/plan-your-visit/" },
        ],
      }),
    );
    expect(html).not.toContain("Parking");
    expect(html).not.toContain("$10 cash");
    expect(html).toContain("Admission");
    expect(
      renderToStaticMarkup(createElement(MomentFacts, { facts: [{ label: "Hours", value: "9 to 5" }] })),
    ).toBe("");
  });
});
