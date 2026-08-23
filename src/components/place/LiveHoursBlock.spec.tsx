// @vitest-environment jsdom

import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import LiveHoursBlock from "@/components/place/LiveHoursBlock";
import LiveGooglePlaceContext from "@/components/place/GooglePlaceContext";

const hours = {
  mon: [{ open: "09:00", close: "17:00" }],
};

describe("LiveHoursBlock", () => {
  it("offers an explicit current-hours action for an eligible unverified place", () => {
    const html = renderToStaticMarkup(
      <LiveHoursBlock
        slug="test-place"
        hours={hours}
        verified={false}
        canCheckCurrentHours
      />,
    );

    expect(html).toContain("Check current hours");
    expect(html).toContain("Hours below are");
  });

  it("does not show a paid action when the place has no durable Google identity", () => {
    const html = renderToStaticMarkup(
      <LiveHoursBlock
        slug="test-place"
        hours={hours}
        verified={false}
        canCheckCurrentHours={false}
      />,
    );

    expect(html).not.toContain("Check current hours");
  });

  it("fails closed when a caller does not declare an eligible identity", () => {
    const html = renderToStaticMarkup(
      <LiveHoursBlock
        slug="test-place"
        hours={hours}
        verified={false}
      />,
    );

    expect(html).not.toContain("Check current hours");
  });

  it("does not ask for another check when stored hours are already current", () => {
    const html = renderToStaticMarkup(
      <LiveHoursBlock
        slug="test-place"
        hours={hours}
        verified
        canCheckCurrentHours
      />,
    );

    expect(html).not.toContain("Check current hours");
  });

  it("updates the schedule when a user checks the richer Google details", async () => {
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(JSON.stringify({
        hours: ["Monday: 10:00 AM–6:00 PM"],
        structured_hours: {
          mon: [{ open: "10:00", close: "18:00" }],
        },
        open_status: { state: "open", closesAt: "18:00", closingSoon: false },
        hours_checked_at: "2026-08-23T18:00:00.000Z",
        editorial_summary: "A current Google summary.",
      }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    await act(async () => {
      root.render(createElement("div", null,
        createElement(LiveHoursBlock, {
          slug: "shared-hours-place",
          hours,
          verified: false,
          canCheckCurrentHours: true,
        }),
        createElement(LiveGooglePlaceContext, {
          slug: "shared-hours-place",
        }),
      ));
    });

    const detailsButton = [...container.querySelectorAll("button")]
      .find((button) => button.textContent?.includes("Check current Google details"));
    expect(detailsButton).toBeDefined();
    await act(async () => {
      detailsButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(container.textContent).toContain("Hours from Google Maps, checked just now.");
    expect(container.textContent).not.toContain("Check current hours");

    await act(async () => root.unmount());
    container.remove();
    vi.unstubAllGlobals();
  });
});
