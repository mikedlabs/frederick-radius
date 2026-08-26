import { describe, expect, it } from "vitest";
import { venueEventFreshnessAnomalies } from "./curated-freshness";

describe("venue event artifact freshness", () => {
  const now = new Date("2026-08-22T12:00:00Z");

  it("reports only the stale venue when another venue refreshed today", () => {
    const anomalies = venueEventFreshnessAnomalies(
      [
        {
          venue_slug: "current-venue",
          source: { fetchedAt: "2026-08-22T09:00:00Z" },
        },
        {
          venue_slug: "stale-venue",
          source: { fetchedAt: "2026-07-10T09:00:00Z" },
        },
      ],
      now,
    );

    expect(anomalies.map((anomaly) => anomaly.source)).toEqual([
      "venue-events:stale-venue",
    ]);
    expect(anomalies[0]?.detail).toContain("43 days ago");
  });

  it("reports a represented venue whose rows have no valid timestamp", () => {
    expect(
      venueEventFreshnessAnomalies(
        [{ venue_slug: "missing-evidence", source: {} }],
        now,
      ),
    ).toMatchObject([
      {
        source: "venue-events:missing-evidence",
        kind: "snapshot_expired",
      },
    ]);
  });
});
