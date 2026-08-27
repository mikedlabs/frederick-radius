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

    expect(html).toContain("Radius is checking the current event board.");
    expect(html).not.toContain("No events are on the calendar");
    expect(html).toContain('href="/events"');
  });

  it("names a failed recovery instead of looking stuck", () => {
    const html = renderToStaticMarkup(
      createElement(TodayEventsRecoveryView, {
        response: null,
        failed: true,
      }),
    );

    expect(html).toContain("Current event picks could not load here.");
    expect(html).not.toContain("Radius is checking the current event board.");
  });

  it("distinguishes a healthy empty shortlist from a failed archive read", () => {
    const html = renderToStaticMarkup(
      createElement(TodayEventsRecoveryView, {
        response: { events: [], partial: false },
      }),
    );

    expect(html).toContain("No event picks");
    expect(html).toContain("No event picks are available for this Today brief.");
    expect(html).not.toContain("Current picks unavailable");
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

  it("requests one uncached runtime refresh and replaces the checking state", async () => {
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
      "/api/today/events?refresh=1",
      expect.objectContaining({ cache: "no-store" }),
    );

    await act(async () => root.unmount());
  });
});
