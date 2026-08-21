import { afterEach, describe, expect, it, vi } from "vitest";
import {
  availabilityAnomalies,
  eventSourceHealthAnomaly,
  photoMetadataCoverageAnomaly,
  tripwireWithDeadline,
} from "@/lib/quality/tripwires";

afterEach(() => {
  vi.useRealTimers();
});

describe("live-source availability tripwires", () => {
  it("does not flag a successful feed that happens to be empty", () => {
    expect(
      availabilityAnomalies([
        { source: "MDOT CHART", available: true },
        { source: "NWS alerts", available: true },
      ]),
    ).toEqual([]);
  });

  it("names every unavailable source instead of treating it as all-clear", () => {
    const anomalies = availabilityAnomalies([
      { source: "MDOT CHART", available: false },
      { source: "Potomac Edison", available: true },
      { source: "PulsePoint", available: false },
    ]);

    expect(anomalies.map((anomaly) => anomaly.source)).toEqual([
      "MDOT CHART",
      "PulsePoint",
    ]);
    expect(anomalies.every((anomaly) => anomaly.kind === "live_source_failed"))
      .toBe(true);
  });
});

describe("photo metadata coverage tripwire", () => {
  const name = "places/ChIJexample/photos/one";

  it("flags a photo catalog whose resource names have no exact source metadata", () => {
    expect(
      photoMetadataCoverageAnomaly([
        { photo_names: [name] },
        { photo_names: [`${name}-two`] },
      ]),
    ).toMatchObject({
      source: "google-photo-metadata",
      kind: "photo_rot",
    });
  });

  it("accepts publishable name-to-attribution pairs", () => {
    expect(
      photoMetadataCoverageAnomaly([
        {
          photo_names: [name],
          photo_attributions: [
            {
              photo_name: name,
              google_maps_uri:
                "https://www.google.com/maps/photos/example",
              authors: [],
            },
          ],
        },
      ]),
    ).toBeNull();
  });
});

describe("unified event source-health tripwire", () => {
  it("keeps one transient provider failure below the board-level threshold", () => {
    expect(
      eventSourceHealthAnomaly({
        degraded: true,
        unavailable: ["county"],
      }),
    ).toBeNull();
  });

  it("flags multi-source degradation even when fallback events can still render", () => {
    expect(
      eventSourceHealthAnomaly({
        degraded: true,
        unavailable: ["county", "Visit Frederick"],
      }),
    ).toMatchObject({
      source: "unified-events",
      kind: "events_sources_degraded",
    });
  });

  it("flags one umbrella failure for the full municipal-calendar fanout", () => {
    const anomaly = eventSourceHealthAnomaly({
      degraded: true,
      unavailable: ["municipal calendars"],
    });

    expect(anomaly?.kind).toBe("events_sources_degraded");
    expect(anomaly?.detail).toContain(
      "fallback events may still keep the board populated",
    );
  });

  // The 2026-08-20 outage: RLS denied the archive read, so /today served only
  // the compiled curated seeds. The archive contributed ONE unavailable entry,
  // which sat below EVENT_SOURCE_FAILURE_THRESHOLD, so this returned null and
  // nothing went red for two days. The archive is the whole live calendar, not
  // one provider among many, so any of its failure states must fire alone.
  it.each([
    "event archive (unreadable)",
    "event archive (last run failed)",
    "event archive (stale)",
  ])("flags a dark event archive on its own: %s", (source) => {
    const anomaly = eventSourceHealthAnomaly({
      degraded: true,
      unavailable: [source],
    });

    expect(anomaly?.kind).toBe("events_sources_degraded");
    expect(anomaly?.detail).toContain(source);
  });

  it("does not infer a failure from an honest healthy or empty source list", () => {
    expect(
      eventSourceHealthAnomaly({
        degraded: false,
        unavailable: [],
      }),
    ).toBeNull();
  });
});

describe("tripwire deadlines", () => {
  it("turns a hung probe red instead of letting it consume the cron budget", async () => {
    vi.useFakeTimers();
    const pending = new Promise<never>(() => undefined);
    const resultPromise = tripwireWithDeadline("slow-probe", pending, 25);

    await vi.advanceTimersByTimeAsync(25);

    await expect(resultPromise).resolves.toEqual([
      expect.objectContaining({
        source: "slow-probe",
        kind: "tripwire_failed",
      }),
    ]);
  });
});
