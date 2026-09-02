import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import type { FairArrivalStatus } from "@/lib/fair/arrival-status";

import { FairArrivalStatusView } from "./FairArrivalStatus";

function render(status: FairArrivalStatus): string {
  return renderToStaticMarkup(
    createElement(FairArrivalStatusView, { status }),
  );
}

function status(
  overrides: Partial<FairArrivalStatus> = {},
): FairArrivalStatus {
  return {
    schemaVersion: 1,
    generatedAt: "2026-09-18T16:00:00.000Z",
    state: "attention",
    coverage: "configured-sources-current",
    headline: "1 official update may affect your trip.",
    summary: "Review the current official details before you leave.",
    signals: [
      {
        id: "chart:i70",
        kind: "traffic",
        severity: "critical",
        title: "Crash on I-70 East",
        detail: "I-70 East has a reported crash.",
        observedAt: "2026-09-18T15:45:00.000Z",
        evidence: {
          id: "mdot-chart",
          label: "MDOT CHART traffic",
          url: "https://chart.maryland.gov/DataFeeds/GetDataFeeds",
          state: "current",
          checkedAt: "2026-09-18T16:00:00.000Z",
          providerUpdatedAt: "2026-09-18T15:59:00.000Z",
        },
      },
    ],
    hiddenSignalCount: 0,
    sources: [
      {
        id: "mdot-chart",
        label: "MDOT CHART traffic",
        url: "https://chart.maryland.gov/DataFeeds/GetDataFeeds",
        state: "current",
        checkedAt: "2026-09-18T16:00:00.000Z",
        providerUpdatedAt: "2026-09-18T15:59:00.000Z",
      },
    ],
    transit: null,
    limitsLabel:
      "Official feeds do not measure Fair attendance, parking-space availability, or gate waits.",
    ...overrides,
  };
}

describe("FairArrivalStatusView", () => {
  it("shows a compact official update with source, state, and checked time", () => {
    const html = render(status());

    expect(html).toContain("Before you leave · Official checks");
    expect(html).toContain("Crash on I-70 East");
    expect(html).toContain("MDOT CHART traffic");
    expect(html).toContain("Current · Checked 12:00 PM");
    expect(html).toContain("Sources, freshness, and limits");
    expect(html).toContain("parking-space availability");
    expect(html).toContain('aria-live="polite"');
  });

  it("keeps an unavailable feed explicit instead of implying an all-clear", () => {
    const html = render(
      status({
        state: "partial",
        coverage: "partial",
        headline: "Some live arrival information could not be verified.",
        summary: "An unavailable or stale feed is unknown, not an all-clear.",
        signals: [],
        sources: [
          {
            id: "nws",
            label: "National Weather Service",
            url: "https://www.weather.gov/lwx/",
            state: "unavailable",
            checkedAt: "2026-09-18T16:00:00.000Z",
            providerUpdatedAt: null,
          },
        ],
      }),
    );

    expect(html).toContain("unknown, not an all-clear");
    expect(html).toContain("Unavailable · Checked 12:00 PM");
    expect(html).not.toContain("Roads are clear");
    expect(html).not.toContain("Parking is available");
  });

  it("explains a healthy empty transit result without claiming no service", () => {
    const html = render(
      status({
        state: "no-current-update",
        signals: [],
        transit: {
          state: "no-live-arrival",
          message:
            "No live Fair-stop arrival was returned right now. This does not mean service is not running.",
          arrivals: [],
        },
      }),
    );

    expect(html).toContain("Live arrivals near the Fair");
    expect(html).toContain("does not mean service is not running");
    expect(html).not.toContain("No service today");
  });

  it("keeps future-day planning separate from current live conditions", () => {
    const html = render(
      status({
        state: "not-today",
        coverage: "not-checked",
        headline: "Radius will check live arrival feeds on your selected Fair day.",
        summary:
          "The check uses official road, weather, and civic feeds, plus County Transit when you choose it.",
        signals: [],
        sources: [],
      }),
    );

    expect(html).toContain("selected Fair day");
    expect(html).not.toContain("Sources, freshness, and limits");
    expect(html).not.toContain("Checked 12:00 PM");
  });
});
