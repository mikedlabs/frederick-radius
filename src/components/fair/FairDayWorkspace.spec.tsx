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
    expect(fairModeFromHash("#plan")).toBe("my-day");
    expect(fairModeFromHash("#leave")).toBe("travel");
    expect(fairModeFromHash("#answers")).toBe("now");
    expect(fairModeFromHash("#not-a-fair-view")).toBeNull();
  });

  it("renders a dedicated Fair identity, independent-guide disclosure, and Mike D photo", () => {
    const html = renderToStaticMarkup(
      createElement(FairDayWorkspace, { data }),
    );

    expect(html).toContain("Fair Day");
    expect(html).toContain("Fair Day · Frederick Radius");
    expect(html).toContain(data.disclosure);
    expect(html).toContain("Photograph by Mike D");
    expect(html).toContain("fairgrounds-night-mike-d-960.jpg");
    expect(html).toContain("fairgrounds-night-mike-d-1920.jpg");
    expect(html).toContain('href="/today"');
    expect(html).toContain("instead of hunting across separate sites");
  });

  it("renders one app panel instead of the old long scrolling document", () => {
    const html = renderToStaticMarkup(
      createElement(FairDayWorkspace, { data }),
    );

    expect(html).not.toContain("<main");
    expect(html).toContain('data-fair-app="true"');
    expect(html).toContain(
      '<section id="fair-now-panel" aria-labelledby="fair-now-heading">',
    );
    expect(html).not.toContain('role="tabpanel"');
    expect(html).toContain('id="fair-now-heading"');
    expect(html).not.toContain('id="fair-find-heading"');
    expect(html).not.toContain('id="fair-my-day-heading"');
    expect(html).not.toContain('id="fair-travel-heading"');
    expect(html).not.toContain("Program by day");
    expect(html).not.toContain("Things people miss");
  });

  it("exposes four real task modes with a contextual mobile action bar", () => {
    const html = renderToStaticMarkup(
      createElement(FairDayWorkspace, { data }),
    );

    expect(html).toContain('data-mobile-action-bar="true"');
    expect(html).toContain('aria-label="Fair Day"');
    for (const label of ["Now", "Find", "My Day", "Travel"]) {
      expect(html).toContain(`aria-label="${label}"`);
    }
    expect(html).not.toContain('href="#now"');
    expect(html).not.toContain('href="#find"');
    expect(html).not.toContain('href="#my-day"');
    expect(html).not.toContain('href="#travel"');
  });

  it("reduces preparation to tickets, travel, and entry with one next action", () => {
    const html = renderToStaticMarkup(
      createElement(FairDayWorkspace, { data }),
    );

    expect(html).toContain("Start here");
    expect(html).toContain("Compare or mark ready");
    expect(html).toContain("Choose drive, transit, or drop-off");
    expect(html).toContain("Payment, gate, and ticket access");
    expect(html).toContain("Review tickets");
    expect(html).toContain('aria-label="Fair trip at a glance"');
    expect(html).toContain("Tickets + entry");
    expect(html).toContain("Arrive + return");
    expect(html).toContain("Your saved stops");
    expect(html).not.toContain("Return plan set");
    expect(html).not.toContain("Ready to Go checks");
  });

  it("keeps the first screen compact and defers external tools until their decision point", () => {
    const html = renderToStaticMarkup(
      createElement(FairDayWorkspace, { data }),
    );

    expect(html).toContain("Plan Friday at the Fair.");
    expect(html).toContain("Your plan stays on this device.");
    expect(html).not.toContain(data.externalGuide.url);
    expect(html).not.toContain("Open Radius Transit");
    expect(html).not.toContain("Compare tickets for your party");
    expect(html.match(/font-editorial/g)).toBeNull();
  });
});
