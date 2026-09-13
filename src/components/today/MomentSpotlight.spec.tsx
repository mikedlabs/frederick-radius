import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import MomentSpotlight, { type SpotlightMoment } from "./MomentSpotlight";

const IN_THE_STREETS: SpotlightMoment = {
  slug: "in-the-street-2026",
  title: "In The Streets",
  spotlightLead: "Downtown Frederick's biggest block party runs 11 AM to 5 PM.",
  accent: "var(--app-brand)",
  spotlightFacts: [
    { label: "When", value: "Today · 11 AM to 5 PM" },
    { label: "Where", value: "Market Street, downtown" },
    { label: "Admission", value: "Free to attend" },
  ],
  spotlightImage: {
    src: "/images/moments/in-the-streets-2024-mike-d.jpg",
    alt: "A packed Market Street during In The Streets in downtown Frederick, photographed in 2024.",
    credit: "Photograph by Mike D · In The Streets 2024",
    width: 1920,
    height: 1078,
  },
  spotlightDirectionsUrl: "https://www.google.com/maps/search/?api=1&query=Market%20Street%2C%20Frederick%2C%20MD",
  spotlightSourceUrl: "https://www.celebratefrederick.com/events/in-the-street/",
};

describe("MomentSpotlight", () => {
  it("turns a same-day moment into a full visual event lead", () => {
    const html = renderToStaticMarkup(
      createElement(MomentSpotlight, { moment: IN_THE_STREETS, isDayOf: true }),
    );

    expect(html).toContain('data-moment-spotlight-day-of="true"');
    expect(html).toContain("aspect-[16/9]");
    expect(html).not.toContain("sm:aspect-[21/8]");
    expect(html).toContain(IN_THE_STREETS.spotlightImage!.alt);
    expect(html).toContain(IN_THE_STREETS.spotlightImage!.credit);
    expect(html).toContain("Today · 11 AM to 5 PM");
    expect(html).toContain("Market Street, downtown");
    expect(html).toContain("Free to attend");
    expect(html).toContain("Open the day plan");
    expect(html).toContain('href="/moments/in-the-street-2026"');
    expect(html).toContain("Get directions");
    expect(html).toContain("Official schedule");
    expect(html).not.toContain('aria-label="Dismiss"');
  });

  it("keeps an upcoming moment compact and dismissible", () => {
    const html = renderToStaticMarkup(
      createElement(MomentSpotlight, { moment: IN_THE_STREETS }),
    );

    expect(html).not.toContain('data-moment-spotlight-day-of="true"');
    expect(html).toContain("This weekend");
    expect(html).toContain("Plan your day");
    expect(html).toContain('aria-label="Dismiss"');
  });
});
