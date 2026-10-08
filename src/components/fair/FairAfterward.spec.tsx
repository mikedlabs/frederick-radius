import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import {
  greatFrederickFair2026Pack,
  greatFrederickFair2026PackPointer,
} from "@/data/fair/great-frederick-fair-2026-pack";

import FairAfterward, {
  FAIR_AFTERWARD_FRAMES,
  FAIR_AFTERWARD_PHOTO_CREDIT,
} from "./FairAfterward";
import FairDayWorkspace from "./FairDayWorkspace";
import { buildFairDayWorkspaceData } from "./buildFairDayWorkspaceData";

const AFTERWARD_SENTENCE =
  "The 2026 Great Frederick Fair ran September 18 to 26.";
const WEEKEND_ACTION = "See what&#x27;s on this weekend";

function postFairWorkspaceHtml(
  afterwardMoment: { title: string; slug: string } | null = null,
) {
  const data = buildFairDayWorkspaceData(
    greatFrederickFair2026Pack,
    greatFrederickFair2026PackPointer,
    new Date("2026-10-07T16:00:00Z"),
  );
  return renderToStaticMarkup(
    createElement(FairDayWorkspace, { data, afterwardMoment }),
  );
}

describe("FairAfterward", () => {
  it("says when the Fair ran and hands visitors to this weekend", () => {
    const html = renderToStaticMarkup(createElement(FairAfterward));

    expect(html).toContain(AFTERWARD_SENTENCE);
    expect(html).toContain(
      "The 2027 dates appear here when the fair posts them.",
    );
    expect(html).toContain(WEEKEND_ACTION);
    expect(html).toContain('href="/events?lens=weekend"');
    expect(html).not.toContain("Open the");
    expect(html).not.toMatch(/—/);
  });

  it("shows the three owned frames on their own sources and credits none before load", () => {
    const html = renderToStaticMarkup(createElement(FairAfterward));

    for (const name of [
      "fairgrounds-night-mike-d",
      "fairgrounds-ferris-wheel-mike-d",
      "fairgrounds-midway-mike-d",
    ]) {
      expect(html).toContain(`src="/images/fair/${name}-960.jpg"`);
      expect(html).toContain(
        `/images/fair/${name}-960.jpg 960w, /images/fair/${name}-1920.jpg 1920w`,
      );
    }
    expect(html.match(/data-fair-afterward-frame=/g)).toHaveLength(3);
    expect(FAIR_AFTERWARD_FRAMES.every((frame) => frame.alt.includes("2024"))).toBe(
      true,
    );
    expect(html).not.toContain(FAIR_AFTERWARD_PHOTO_CREDIT);
  });

  it("links another live county guide only when the server names one", () => {
    const html = renderToStaticMarkup(
      createElement(FairAfterward, {
        nextMoment: { title: "Catoctin Colorfest", slug: "catoctin-colorfest-2026" },
      }),
    );

    expect(html).toContain("Open the Catoctin Colorfest guide");
    expect(html).toContain('href="/moments/catoctin-colorfest-2026"');
  });
});

describe("FairDayWorkspace after the Fair", () => {
  it("replaces the Fair-week home with the record and one weekend action", () => {
    const html = postFairWorkspaceHtml();

    expect(html).toContain('data-fair-home="afterward"');
    expect(html).toContain(AFTERWARD_SENTENCE);
    expect(html).toContain(WEEKEND_ACTION);
    expect(html).not.toContain("Today&#x27;s Grandstand Event");
    expect(html).not.toContain("Grandstand Event");
    expect(html).not.toContain("Review tickets");
    expect(html).not.toContain("data-fair-weather");
    expect(html).not.toContain("data-fair-at-a-glance");
    expect(html).not.toContain("data-fair-grandstand-highlight");
    expect(html).not.toContain("data-fair-up-next");
    expect(html).not.toContain('role="tablist"');
    expect(html).not.toContain("Special Admission");
    expect(html).not.toContain("Open now");
    expect(html).not.toContain("Closed today");
  });

  it("keeps the hero, its aerial photo action and the source disclosure", () => {
    const html = postFairWorkspaceHtml();

    expect(html).toContain('<h1 id="fair-now-heading"');
    expect(html).toContain("The Great Frederick Fair");
    expect(html).toContain("Sep 18–26 · 2026");
    expect(html).toContain("See the Fair from above");
    expect(html).toContain("About this independent guide");
    expect(html.match(/font-editorial/g)).toHaveLength(1);
  });

  it("keeps only Home and Map in the Fair dock", () => {
    const html = postFairWorkspaceHtml();
    const dock = html.slice(html.indexOf("data-mobile-action-bar"));

    expect(dock).toContain('aria-label="Home"');
    expect(dock).toContain('aria-label="Map"');
    expect(dock).not.toContain('aria-label="Program"');
    expect(dock).not.toContain('aria-label="My Day"');
    expect(dock).toContain("grid-cols-2");
  });

  it("passes another live guide through to the record", () => {
    const html = postFairWorkspaceHtml({
      title: "Catoctin Colorfest",
      slug: "catoctin-colorfest-2026",
    });

    expect(html).toContain("Open the Catoctin Colorfest guide");
  });

  it("leaves the Fair-week home unchanged on a mid-run day", () => {
    const data = buildFairDayWorkspaceData(
      greatFrederickFair2026Pack,
      greatFrederickFair2026PackPointer,
      new Date("2026-09-20T16:00:00Z"),
    );
    const html = renderToStaticMarkup(createElement(FairDayWorkspace, { data }));

    expect(html).not.toContain(AFTERWARD_SENTENCE);
    expect(html).toContain("data-fair-at-a-glance");
    expect(html).toContain("Sunday at a glance");
    expect(html).toContain("Today&#x27;s Grandstand Event");
    for (const label of ["Home", "Program", "Map", "My Day"]) {
      expect(html).toContain(`aria-label="${label}"`);
    }
  });

  it("names the selected weekday instead of today before the Fair opens", () => {
    const data = buildFairDayWorkspaceData(
      greatFrederickFair2026Pack,
      greatFrederickFair2026PackPointer,
      new Date("2026-09-01T20:00:00Z"),
    );
    const html = renderToStaticMarkup(createElement(FairDayWorkspace, { data }));

    expect(html).not.toContain(AFTERWARD_SENTENCE);
    expect(html).not.toContain("Today&#x27;s Grandstand Event");
    expect(html).toContain("Friday&#x27;s Grandstand Event");
  });
});
