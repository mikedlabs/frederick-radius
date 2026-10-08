// @vitest-environment jsdom

import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import TodayEventsRecovery, {
  TodayEventsRecoveryView,
} from "./TodayEventsRecovery";

const event = {
  slug: "alive-at-five-2026-08-27",
  title: "Alive @ Five · Kate Cosentino",
  venue: "Carroll Creek Amphitheater",
  municipality: "frederick",
  time: "5:00 PM",
  moment: "Tonight" as const,
  image: null,
  free: false,
};

describe("TodayEventsRecoveryView", () => {
  it("restores a current event pick when the server snapshot missed", () => {
    const html = renderToStaticMarkup(
      createElement(TodayEventsRecoveryView, {
        response: { partial: false, events: [event] },
      }),
    );

    expect(html).toContain("Alive @ Five · Kate Cosentino");
    expect(html).toContain('href="/events/alive-at-five-2026-08-27"');
    expect(html).toContain("1 event pick today · 1 event pick tonight · Countywide");
    expect(html).toContain('data-today-event-recovery="true"');
  });

  it("states that it is checking instead of claiming there are no events", () => {
    const html = renderToStaticMarkup(
      createElement(TodayEventsRecoveryView, { response: null }),
    );

    expect(html).toContain("Today&#x27;s event picks are still loading.");
    expect(html).not.toContain("No events are on the calendar");
    expect(html).toContain('href="/events"');
    expect(html).not.toContain("Refreshing current picks");
  });

  it("names a failed recovery instead of looking stuck", () => {
    const html = renderToStaticMarkup(
      createElement(TodayEventsRecoveryView, {
        response: null,
        failed: true,
      }),
    );

    expect(html).toContain("Today&#x27;s event picks could not load.");
    expect(html).not.toContain("still loading");
  });

  it("distinguishes a healthy empty shortlist from a failed archive read", () => {
    const html = renderToStaticMarkup(
      createElement(TodayEventsRecoveryView, {
        response: { events: [], partial: false },
      }),
    );

    expect(html).toContain(
      "Nothing on the rest of today&#x27;s calendar stands out.",
    );
    expect(html).not.toContain("could not load");
    expect(html).not.toContain("No picks in this brief");
  });

  it("gives every empty state the normal events heading, not a small mono label", () => {
    const states = [
      { response: null },
      { response: null, failed: true },
      { response: { events: [], partial: false } },
      { response: { events: [], partial: true } },
    ];
    const populated = renderToStaticMarkup(
      createElement(TodayEventsRecoveryView, {
        response: { partial: false, events: [event] },
      }),
    );
    const headingOf = (html: string) =>
      html.match(/<h2[^>]*>([^<]*)<\/h2>/)?.[1];

    expect(headingOf(populated)).toBe("Events today");
    for (const props of states) {
      const html = renderToStaticMarkup(
        createElement(TodayEventsRecoveryView, props),
      );
      expect(html).toContain('data-today-section-heading="true"');
      expect(headingOf(html)).toBe("Events today");
      expect(html).toContain('aria-label="Full board: Events today"');
      expect(html).not.toContain("text-[10px]");
      // One plain sentence carries the state.
      const status = html.match(/<p role="status"[^>]*>([^<]*)<\/p>/)?.[1];
      expect(status).toMatch(/^[A-Z][^.]*\.$/);
    }
  });

  it("adds no heading of its own inside Today's events chapter", () => {
    // The chapter's h2 already names the daypart ("Tonight", "Overnight and
    // today"), so a second "Events today" heading would stack over one line.
    const html = renderToStaticMarkup(
      createElement(TodayEventsRecoveryView, { response: null, failed: true, headed: false }),
    );
    expect(html).not.toMatch(/<h[1-6]/);
    expect(html).toContain("Today&#x27;s event picks could not load.");
    expect(html).toContain('href="/events"');
    expect(html).toContain("See the full events board");
  });

  it("keeps partial coverage explicit when usable rows survive", () => {
    const html = renderToStaticMarkup(
      createElement(TodayEventsRecoveryView, {
        response: { events: [event], partial: true },
      }),
    );

    expect(html).toContain("Partial coverage");
    expect(html).toContain("Alive @ Five · Kate Cosentino");
  });
});

describe("TodayEventsRecovery", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("recovers without consuming the explicit refresh allowance", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ partial: false, events: [event] }),
    });
    vi.stubGlobal("fetch", fetchMock);
    const container = document.createElement("div");
    const root = createRoot(container);

    await act(async () => {
      root.render(createElement(TodayEventsRecovery));
    });
    await vi.waitFor(() => {
      expect(container.textContent).toContain("Alive @ Five · Kate Cosentino");
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/today/events",
      expect.objectContaining({ cache: "no-store" }),
    );

    await act(async () => root.unmount());
  });
});
