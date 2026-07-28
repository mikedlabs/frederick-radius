import { readFileSync } from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { EmptyState } from "./SavedList";

describe("SavedList empty state", () => {
  it("offers one strong next step without repeating the app shell", () => {
    const html = renderToStaticMarkup(createElement(EmptyState));

    expect(html).toContain("Save a place or event to keep it here for later.");
    expect(html).toContain("Find something to save");
    expect(html).toContain('href="/search"');
    expect(html).not.toContain('href="/map"');
    expect(html).not.toContain('href="/events"');
    expect(html).not.toContain('href="/ask"');
    expect(html).not.toContain("min-h-[34rem]");
  });

  it("leads with useful, saved, and upcoming content before one organizer reveal", () => {
    const source = readFileSync("src/components/saved/SavedList.tsx", "utf8");
    const useful = source.indexOf('id="saved-useful-now"');
    const saved = source.indexOf('id="saved-places-heading"');
    const upcoming = source.indexOf('aria-label="Upcoming saved events"');
    const organizer = source.indexOf('id="saved-organizer"');

    expect(useful).toBeGreaterThan(-1);
    expect(saved).toBeGreaterThan(useful);
    expect(upcoming).toBeGreaterThan(saved);
    expect(organizer).toBeGreaterThan(upcoming);
    expect(source.match(/<details/g)).toHaveLength(1);
    expect(source).toContain("Lists, map, notes, visits, and sharing");
  });
});
