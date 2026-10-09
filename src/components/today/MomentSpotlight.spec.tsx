import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { momentBySlug } from "@/data/civic-moments";
import MomentSpotlight, {
  momentSpotlightDecision,
  type SpotlightMoment,
} from "./MomentSpotlight";

const COLORFEST: SpotlightMoment = momentBySlug("catoctin-colorfest-2026")!;

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
    alt: "A crowd on Market Street during In The Streets in downtown Frederick.",
    credit: "",
    width: 1920,
    height: 1078,
  },
  spotlightDirectionsUrl: "https://www.google.com/maps/search/?api=1&query=Market%20Street%2C%20Frederick%2C%20MD",
  spotlightSourceUrl: "https://www.celebratefrederick.com/events/in-the-street/",
};

describe("MomentSpotlight", () => {
  it("uses the anonymous decision vocabulary for the featured event", () => {
    expect(momentSpotlightDecision(IN_THE_STREETS.slug, "impression")).toEqual({
      stage: "impression",
      surface: "today",
      entityKind: "event",
      entityId: "in-the-street-2026",
      position: "lead",
    });
    expect(momentSpotlightDecision(IN_THE_STREETS.slug, "action", "directions")).toMatchObject({
      stage: "action",
      action: "directions",
    });
  });

  it("turns a same-day moment into a full visual event lead", () => {
    const html = renderToStaticMarkup(
      createElement(MomentSpotlight, { moment: IN_THE_STREETS, isDayOf: true }),
    );

    expect(html).toContain('data-moment-spotlight-day-of="true"');
    expect(html).toContain("aspect-[16/9]");
    expect(html).not.toContain("sm:aspect-[21/8]");
    expect(html).toContain(IN_THE_STREETS.spotlightImage!.alt);
    expect(html).not.toContain("<figcaption");
    expect(html).not.toContain("Photograph by Mike D");
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

  it("leads a moment with its licensed town photo, credited only after load", () => {
    const html = renderToStaticMarkup(
      createElement(MomentSpotlight, { moment: COLORFEST }),
    );

    expect(html).toContain('data-moment-spotlight="catoctin-colorfest-2026"');
    expect(html).toContain('data-radius-photo="loading"');
    expect(html).toContain('width:96px;height:96px');
    expect(html).not.toContain("data-moment-spotlight-credit");
    // next/image encodes the already-encoded Commons file name once more.
    expect(html).toContain("Thurmont%2520Town%2520Square%2520Park.jpg");
    expect(html).not.toContain("CraigShipp.com Photos");
    expect(html).toContain("Sat Oct 10 and Sun Oct 11");
    expect(html).toContain(">Free<");
    expect(html).toContain('href="/moments/catoctin-colorfest-2026"');
    expect(html).not.toContain("gradient");
  });

  it("falls back to the first day's date plate without a photo", () => {
    const html = renderToStaticMarkup(
      createElement(MomentSpotlight, {
        moment: { ...COLORFEST, heroPhoto: undefined },
      }),
    );

    expect(html).not.toContain("<img");
    expect(html).toContain(">Oct<");
    expect(html).toContain(">10<");
    expect(html).not.toContain("gradient");
  });

  it("shows Sunday's plate on Sunday, not the day that already passed", () => {
    const html = renderToStaticMarkup(
      createElement(MomentSpotlight, {
        moment: { ...COLORFEST, heroPhoto: undefined },
        todayKey: "2026-10-11",
      }),
    );

    expect(html).toContain(">11<");
    expect(html).toContain(">Sun<");
    expect(html).not.toContain(">Sat<");
  });

  it("never states an unsourced fact in the compact lead", () => {
    const html = renderToStaticMarkup(
      createElement(MomentSpotlight, {
        moment: {
          ...COLORFEST,
          spotlightFacts: [{ label: "Parking", value: "$10 cash" }],
        },
      }),
    );

    expect(html).not.toContain("$10 cash");
  });
});
