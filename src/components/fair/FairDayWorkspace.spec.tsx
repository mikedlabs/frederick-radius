import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import {
  greatFrederickFair2026Pack,
  greatFrederickFair2026PackPointer,
} from "@/data/fair/great-frederick-fair-2026-pack";

import FairDayWorkspace, { fairModeFromHash } from "./FairDayWorkspace";
import { buildFairDayWorkspaceData } from "./buildFairDayWorkspaceData";

const data = buildFairDayWorkspaceData(
  greatFrederickFair2026Pack,
  greatFrederickFair2026PackPointer,
  new Date("2026-09-01T20:00:00Z"),
);

describe("FairDayWorkspace server-rendered contract", () => {
  it("keeps original Fair links connected to the redesigned task views", () => {
    expect(fairModeFromHash("#now")).toBe("now");
    expect(fairModeFromHash("find")).toBe("find");
    expect(fairModeFromHash("#program")).toBe("find");
    expect(fairModeFromHash("#fair-map")).toBe("map");
    expect(fairModeFromHash("#plan")).toBe("my-day");
    expect(fairModeFromHash("#leave")).toBe("travel");
    expect(fairModeFromHash("#answers")).toBe("now");
    expect(fairModeFromHash("#not-a-fair-view")).toBeNull();
  });

  it("renders a dedicated Fair identity, disclosure, and authentic Fair photography", () => {
    const html = renderToStaticMarkup(
      createElement(FairDayWorkspace, { data }),
    );

    expect(html).toContain("Fair Day");
    expect(html).toContain("Radius at the Fair");
    expect(html).toContain(data.disclosure);
    expect(html).not.toContain("Photograph by Mike D");
    expect(html).not.toContain("Photo: Mike D");
    expect(html).toContain("fairgrounds-night-mike-d-960.jpg");
    expect(html).toContain("fairgrounds-night-mike-d-1920.jpg");
    expect(html).toContain('width="960" height="540"');
    expect(html).toContain("fairgrounds-night-mike-d-960.jpg 960w");
    expect(html).toContain("fairgrounds-night-mike-d-1920.jpg 1920w");
    expect(html).toContain('sizes="100vw"');
    expect(html).toContain('href="/today"');
    expect(html).toContain('<h1 id="fair-now-heading"');
    expect(html).toContain(data.eventName);
  });

  it("renders one app panel instead of the old long scrolling document", () => {
    const html = renderToStaticMarkup(
      createElement(FairDayWorkspace, { data }),
    );

    expect(html).not.toContain("<main");
    expect(html).toContain('data-fair-app="true"');
    expect(html).not.toContain("visibility:hidden");
    expect(html).toContain("Preparing the Fair guide.");
    expect(html).toContain(
      '<section id="fair-now-panel" aria-labelledby="fair-now-heading" data-fair-mode-panel="true">',
    );
    expect(html).not.toContain('role="tabpanel"');
    expect(html).toContain('id="fair-now-heading"');
    expect(html).not.toContain('id="fair-find-heading"');
    expect(html).not.toContain('id="fair-my-day-heading"');
    expect(html).not.toContain('id="fair-travel-heading"');
    expect(html).not.toContain("Program by day");
    expect(html).not.toContain("Things people miss");
  });

  it("exposes four direct task destinations with a contextual mobile action bar", () => {
    const html = renderToStaticMarkup(
      createElement(FairDayWorkspace, { data }),
    );

    expect(html).toContain('data-mobile-action-bar="true"');
    expect(html).toContain('aria-label="Fair Day"');
    for (const label of ["Today", "Program", "Map", "My Day"]) {
      expect(html).toContain(`aria-label="${label}"`);
    }
    expect(html).not.toContain('href="#now"');
    expect(html).not.toContain('href="#find"');
    expect(html).not.toContain('href="#my-day"');
    expect(html).not.toContain('href="#travel"');
  });

  it("shows one next action without repeating a preparation dashboard", () => {
    const html = renderToStaticMarkup(
      createElement(FairDayWorkspace, { data }),
    );

    expect(html).toContain("Your next best step");
    expect(html).toContain("Tickets still need review.");
    expect(html).toContain("Review tickets");
    expect(html.match(/0 of 3 ready/g)).toHaveLength(1);
    expect(html).toContain("No saved stops");
    expect(html).not.toContain('aria-label="Fair trip at a glance"');
    expect(html).not.toContain("Visitor essentials");
    expect(html).not.toContain("Check the details that can slow you down.");
    expect(html).not.toContain("Return plan set");
    expect(html).not.toContain("Ready to Go checks");
  });

  it("presents the three primary starts as a shallow mobile wallet stack", () => {
    const html = renderToStaticMarkup(
      createElement(FairDayWorkspace, { data }),
    );

    expect(html).toContain("What do you need first?");
    expect(html).toContain("data-fair-wallet-stack");
    expect(html.match(/data-fair-wallet-card=/g)).toHaveLength(3);
    expect(html).toContain('data-fair-wallet-card="2"');
    expect(html).toContain("-mt-2 ml-1");
    expect(html).toContain('data-fair-wallet-card="3"');
    expect(html).toContain("-mt-2 ml-2");
    expect(html).toContain("focus-visible:z-40");
  });

  it("offers the printable Fair extra after the primary planning choices", () => {
    const html = renderToStaticMarkup(
      createElement(FairDayWorkspace, { data }),
    );

    expect(html).toContain("data-fair-coloring-book");
    expect(html).toContain("Fair Nights");
    expect(html).toContain(
      'href="/downloads/fair-nights-frederick-coloring-book.pdf"',
    );
    expect(html.indexOf("What do you need first?")).toBeLessThan(
      html.indexOf("data-fair-coloring-book"),
    );
    expect(html.indexOf("data-fair-coloring-book")).toBeLessThan(
      html.indexOf("About this independent guide"),
    );
  });

  it("routes named vendor searches to the current official directory", () => {
    const html = renderToStaticMarkup(
      createElement(FairDayWorkspace, { data }),
    );

    expect(html).not.toContain("data-fair-vendor-search");
    expect(data.externalGuide.url).toContain("Show_ID=18209");
  });

  it("keeps the first screen compact and defers external tools until their decision point", () => {
    const html = renderToStaticMarkup(
      createElement(FairDayWorkspace, { data }),
    );

    expect(html).not.toContain("Plan Friday at the Fair.");
    expect(html).not.toContain("Before the Fair · Fri, Sep 18");
    expect(html.indexOf("Your next best step")).toBeLessThan(
      html.indexOf("About this independent guide"),
    );
    expect(html).not.toContain(data.externalGuide.url);
    expect(html).not.toContain("Open Radius Transit");
    expect(html).not.toContain("Compare tickets for your party");
    expect(html.match(/font-editorial/g)).toHaveLength(1);
  });
});
