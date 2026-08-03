import { readFileSync } from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { EmptyState } from "./SavedList";

describe("SavedList empty state", () => {
  it("offers clear discovery and transit next steps without repeating the app shell", () => {
    const html = renderToStaticMarkup(createElement(EmptyState));

    expect(html).toContain(
      "Save a place, event, bus trip, or stop to keep it here for later.",
    );
    expect(html).toContain("Find something to save");
    expect(html).toContain('href="/search"');
    expect(html).toContain("Find a bus or stop");
    expect(html).toContain('href="/transit"');
    expect(html).not.toContain('href="/map"');
    expect(html).not.toContain('href="/events"');
    expect(html).not.toContain('href="/ask"');
    expect(html).not.toContain("min-h-[34rem]");
  });

  it("leads with useful saved content and keeps transit quiet before one organizer reveal", () => {
    const source = readFileSync("src/components/saved/SavedList.tsx", "utf8");
    const useful = source.indexOf('id="saved-useful-now"');
    const saved = source.indexOf('id="saved-places-heading"');
    const upcoming = source.indexOf('aria-label="Upcoming saved events"');
    const transit = source.indexOf("<SavedTransitSection");
    const organizer = source.indexOf('id="saved-organizer"');

    expect(useful).toBeGreaterThan(-1);
    expect(saved).toBeGreaterThan(useful);
    expect(upcoming).toBeGreaterThan(saved);
    expect(transit).toBeGreaterThan(upcoming);
    expect(organizer).toBeGreaterThan(transit);
    expect(source).toContain("collapsed={hasOrganizerContent}");
    expect(source.match(/<details/g)).toHaveLength(1);
    expect(source).toContain("Lists, map, notes, visits, and sharing");
  });

  it("renders saved transit as an accessible quiet disclosure when collapsed", () => {
    const source = readFileSync(
      "src/components/saved/SavedTransitSection.tsx",
      "utf8",
    );

    expect(source).toContain("collapsed = false");
    expect(source).toContain("<details");
    expect(source).toContain("<summary");
    expect(source).toContain('id="saved-transit-heading"');
    expect(source).toContain('href="/transit"');
    expect(source).toContain("Open for live status.");
  });
});
