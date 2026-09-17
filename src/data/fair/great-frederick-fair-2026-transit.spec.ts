import { describe, expect, it } from "vitest";

import {
  fairTransitDateStatus,
  fairTransitStopServiceSummary,
  greatFrederickFair2026TransitReview,
  greatFrederickFair2026TransitStops,
  reviewSupportsFullFairService,
} from "./great-frederick-fair-2026-transit";

describe("reviewed Great Frederick Fair transit truth", () => {
  it("covers every Fair date before exposing exact published departures", () => {
    expect(reviewSupportsFullFairService(greatFrederickFair2026TransitReview)).toBe(
      true,
    );
    expect(fairTransitDateStatus("2026-09-18")).toMatchObject({
      kind: "service",
      detail: expect.stringContaining("6:17 AM through 9:17 PM"),
    });
    expect(fairTransitDateStatus("2026-09-19")).toMatchObject({
      kind: "no-service",
      detail: expect.stringContaining("does not publish"),
    });
  });

  it("suppresses exact times when the reviewed feed does not cover the Fair", () => {
    const unsupportedReview = {
      ...greatFrederickFair2026TransitReview,
      feedWindow: { startsOn: "2026-09-03", endsOn: "2026-09-21" },
    };
    const stop = greatFrederickFair2026TransitStops[4];
    const summary = fairTransitStopServiceSummary(stop, unsupportedReview);

    expect(reviewSupportsFullFairService(unsupportedReview)).toBe(false);
    expect(summary).toContain("Fair-date service and departure times are not confirmed");
    expect(summary).not.toContain("6:17 AM");
    expect(fairTransitDateStatus("2026-09-24", unsupportedReview).kind).toBe(
      "unconfirmed",
    );
  });
});
