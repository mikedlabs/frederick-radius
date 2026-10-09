import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { TonightPick, TonightPreviewData } from "@/lib/today/tonight-preview";
import TonightExperience from "./TonightExperience";
import AERIAL_MANIFEST from "@/../public/images/seasons/aerial-manifest.json";

function pick(overrides: Partial<TonightPick> = {}): TonightPick {
  return {
    slug: "listed-place",
    name: "Listed place",
    categoryLabel: "Restaurant",
    town: "Brunswick",
    address: "Main Street, Brunswick",
    why: "This restaurant is listed in Brunswick.",
    hoursLabel: "Current hours have not been confirmed.",
    availabilityLabel: "Hours need confirmation",
    sourceLabel: "Radius place catalog",
    detailHref: "/places/listed-place?returnTo=%2Ftoday%2Ftonight%3Fintent%3Ddinner%26in%3Dbrunswick",
    ...overrides,
  };
}

function data(overrides: Partial<TonightPreviewData> = {}): TonightPreviewData {
  return {
    title: "Tonight in Brunswick",
    date: "Wednesday, September 30",
    windowLabel: "From 6:00 PM",
    scopeLabel: "Brunswick",
    scope: "town:brunswick",
    intent: "dinner",
    town: "brunswick",
    startsAt: "2026-09-30T22:00:00.000Z",
    endsAt: "2026-10-01T03:59:59.999Z",
    picks: [pick()],
    ...overrides,
  };
}

describe("TonightExperience", () => {
  it("retains the selected town on every intent and the supplied detail return path", () => {
    const input = data();
    const html = renderToStaticMarkup(createElement(TonightExperience, { data: input }));

    for (const intent of ["dinner", "drinks", "pizza"]) {
      expect(html).toContain(`href="/today/tonight?intent=${intent}&amp;in=brunswick"`);
    }
    expect(html).toContain(`href="${input.picks[0].detailHref}"`);
    expect(html).toContain('aria-current="page"');
    expect(html).not.toContain("Use my location");
  });

  it("preserves uncertainty and future opening information without inventing current availability", () => {
    const html = renderToStaticMarkup(createElement(TonightExperience, {
      data: data({ picks: [
        pick(),
        pick({
          slug: "evening-place",
          name: "Evening place",
          availabilityLabel: "Listed open at 6:00 PM",
          hoursLabel: "Listed hours: 5:00 PM to 9:00 PM.",
          detailHref: "/places/evening-place?returnTo=%2Ftoday%2Ftonight",
        }),
      ] }),
    }));

    expect(html).toContain("Hours need confirmation");
    expect(html).toContain("Current hours have not been confirmed.");
    expect(html).toContain("Listed open at 6:00 PM");
    expect(html).not.toContain("Open now");
    expect(html.match(/>View place details</g)).toHaveLength(1);
    expect(html).not.toContain("<dialog");
  });

  it("keeps explicit county on intent links instead of reviving a saved town", () => {
    const html = renderToStaticMarkup(createElement(TonightExperience, {
      data: data({ town: null, scope: "county", scopeLabel: "Whole county" }),
    }));
    for (const intent of ["dinner", "drinks", "pizza"]) {
      expect(html).toContain(`href="/today/tonight?intent=${intent}&amp;in=county"`);
    }
  });

  it("explains the county fallback for Near me while preserving the requested scope", () => {
    const note = "Showing the whole county. These places aren’t ranked by your location.";
    const html = renderToStaticMarkup(createElement(TonightExperience, {
      data: data({ town: null, scope: "nearme", scopeLabel: "Whole county", scopeNote: note }),
    }));
    expect(html).toContain(note);
    expect(html).toContain('href="/today/tonight?intent=pizza&amp;in=nearme"');
  });

  it("places weather and compact alerts ahead of the recommendation", () => {
    const html = renderToStaticMarkup(createElement(TonightExperience, {
      data: data(),
      weather: createElement("p", null, "The forecast is unavailable."),
      alerts: createElement("a", { href: "/pulse?returnTo=%2Ftoday%2Ftonight" }, "View the active alert"),
    }));

    expect(html.indexOf("The forecast is unavailable.")).toBeLessThan(html.indexOf("Start here"));
    expect(html.indexOf("View the active alert")).toBeLessThan(html.indexOf("Start here"));
  });

  it("keeps the owned Frederick photograph unlabelled, outside place links and out of other towns", () => {
    const townHtml = renderToStaticMarkup(createElement(TonightExperience, { data: data() }));
    const countyHtml = renderToStaticMarkup(createElement(TonightExperience, {
      data: data({ town: null, scope: "county", scopeLabel: "Frederick County", title: "Tonight in Frederick County" }),
    }));

    expect(townHtml).not.toContain("SUMMER%20CARROL%20CREEK");
    expect(townHtml).not.toContain("<figure");
    expect(countyHtml).toContain('alt="Carroll Creek in Frederick."');
    expect(countyHtml).not.toContain("Archive photograph");
    expect(countyHtml).not.toContain("Mike D");
    expect(countyHtml).not.toContain("June 2023");
    expect(countyHtml).not.toContain("<figcaption");
    const archivePhoto = AERIAL_MANIFEST.find((photo) =>
      photo.src === "/images/seasons/summer/SUMMER CARROL CREEK.jpg");
    expect(archivePhoto?.takenAt?.slice(0, 7)).toBe("2023-06");
    expect(countyHtml.indexOf("data-tonight-area-photo")).toBeLessThan(countyHtml.indexOf("</header>"));
    expect(countyHtml.indexOf("data-tonight-area-photo")).toBeLessThan(countyHtml.indexOf("data-tonight-lead"));
    expect(countyHtml).not.toContain("Pick a place for the evening.");
    expect(countyHtml).toMatch(/<figure[^>]*>.*<img/);
    expect(countyHtml).not.toMatch(/<a[^>]*>[^<]*<figure/);
  });

  it("does not fabricate a lead when the selected scope has no matching places", () => {
    const html = renderToStaticMarkup(createElement(TonightExperience, { data: data({ picks: [], town: null, scope: "county" }) }));

    expect(html).toContain("No matching places are listed for this area.");
    expect(html).toContain("change the area in the location control");
    expect(html).not.toContain("View place details");
    expect(html).not.toContain("Start here");
    expect(html).not.toContain("data-tonight-area-photo");
  });
});
