import { afterEach, describe, expect, it } from "vitest";
import {
  curatedFreshnessAnomalies,
  HOURS_SNAPSHOT_MAX_AGE_DAYS,
} from "@/lib/quality/curated-freshness";
import { HOURS_MAX_AGE_DAYS, isHoursFresh } from "@/lib/hours-freshness";
import HOURS_REFRESH from "@/data/places-hours-refresh.json";
import {
  HOURS_PUBLISHABLE_MIN_SHARE,
  ingestFreshnessTripwire,
} from "@/lib/quality/tripwires";

/**
 * The hours alarm has to ring BEFORE the hours go dark.
 *
 * Every row expires exactly HOURS_MAX_AGE_DAYS after its own stamp. The
 * original reasoning here went one step further and said the catalog therefore
 * loses its open/closed state "in one step" when the newest row crosses that
 * line. That is wrong, and the wrongness cost the app a county-wide blackout
 * in August 2026. The refresh rotates a SIXTH of the catalog per day, so the
 * stamps are staggered across six days and coverage decays as a ramp. Measured
 * on the committed artifact, publishable rows go 1160, 1160, 950, 765, 593,
 * 372, 203, 0 across seven days without delivery.
 *
 * A newest-row alarm therefore watches the LAST thing to break. It stayed
 * green through five days of decay, with 68% of the county's hours already
 * gone, and first rang with 203 rows left. Both alarms are asserted below: the
 * newest-row one for the cliff, and the publishable-share one for the ramp.
 *
 * The shipped threshold was 8 against a 7-day window, which put the warning a
 * full day after the outage it was supposed to warn about. That is the exact
 * defect these cases exist to prevent recurring, so they assert the LEAD TIME
 * rather than the constant — a future change to either number stays honest as
 * long as the alarm still precedes the cliff.
 */

const DAY = 86_400_000;
const POLICY_APPROVAL = "written-google-authorization-confirmed";
const originalPolicyApproval = process.env.GOOGLE_MAPS_PLATFORM_POLICY_APPROVAL;
const originalRuntimeEnabled = process.env.GOOGLE_MAPS_PLATFORM_RUNTIME_ENABLED;

afterEach(() => {
  if (originalPolicyApproval === undefined) {
    delete process.env.GOOGLE_MAPS_PLATFORM_POLICY_APPROVAL;
  } else {
    process.env.GOOGLE_MAPS_PLATFORM_POLICY_APPROVAL = originalPolicyApproval;
  }
  if (originalRuntimeEnabled === undefined) {
    delete process.env.GOOGLE_MAPS_PLATFORM_RUNTIME_ENABLED;
  } else {
    process.env.GOOGLE_MAPS_PLATFORM_RUNTIME_ENABLED = originalRuntimeEnabled;
  }
});
const NEWEST = Date.parse(
  (HOURS_REFRESH as { _meta?: { newest_refreshed_at?: string } })._meta
    ?.newest_refreshed_at ?? "2026-08-01T08:00:33.740Z",
);

const alarmRedAt = (ageDays: number) =>
  curatedFreshnessAnomalies(new Date(NEWEST + ageDays * DAY)).some(
    (anomaly) => anomaly.source === "places-hours-refresh.json",
  );

describe("hours staleness alarm lead time", () => {
  it("rings at least a full day before any row can expire", () => {
    // The first age at which the alarm is red must be strictly less than the
    // first age at which the newest row stops being publishable, by >= 1 day.
    let firstRed: number | null = null;
    for (let tenths = 0; tenths <= 120; tenths++) {
      if (alarmRedAt(tenths / 10)) {
        firstRed = tenths / 10;
        break;
      }
    }
    expect(firstRed).not.toBeNull();
    expect(firstRed! + 1).toBeLessThanOrEqual(HOURS_MAX_AGE_DAYS);
  });

  it("is still green while every row publishes normally", () => {
    expect(alarmRedAt(0)).toBe(false);
    expect(alarmRedAt(HOURS_SNAPSHOT_MAX_AGE_DAYS)).toBe(false);
  });

  it("is red before the cliff, not at it and not after it", () => {
    const cliff = HOURS_MAX_AGE_DAYS;
    expect(alarmRedAt(cliff - 1)).toBe(true); // warned, still serving
    expect(isHoursFresh(new Date(NEWEST).toISOString(), new Date(NEWEST + (cliff - 1) * DAY))).toBe(
      true,
    );
    // And past the cliff the rows really are gone, so the warning was real.
    expect(
      isHoursFresh(new Date(NEWEST).toISOString(), new Date(NEWEST + (cliff + 0.1) * DAY)),
    ).toBe(false);
  });

  it("rings on the decay ramp, while most of the county still publishes", () => {
    // The alarm that actually matters. It must be red at a point where a large
    // majority of rows are still publishable, i.e. while there is something
    // left to save, not once the ramp has already run out.
    const rampRedAt = (ageDays: number) =>
      ingestFreshnessTripwire(new Date(NEWEST + ageDays * DAY)).some(
        (anomaly) =>
          anomaly.source === "places-hours-refresh" &&
          anomaly.detail.includes("publishing window"),
      );

    // The writer lands its slice at a fixed 08:00 UTC, so the ramp steps at day
    // boundaries rather than sloping: measured on this artifact the share holds
    // at 100% through +2d and drops to 66% by +3d. Assert either side of a step
    // rather than a round number that sits on one.
    expect(rampRedAt(0)).toBe(false); // a delivered artifact is quiet
    expect(rampRedAt(3)).toBe(true); // three days of missed delivery is loud

    // And it rings with real lead time: at least three days before the last row
    // expires, which is what the newest-row alarm could never offer.
    let firstRed: number | null = null;
    for (let tenths = 0; tenths <= 12 * 10; tenths++) {
      if (rampRedAt(tenths / 10)) {
        firstRed = tenths / 10;
        break;
      }
    }
    expect(firstRed).not.toBeNull();
    expect(firstRed!).toBeLessThanOrEqual(HOURS_MAX_AGE_DAYS - 3);
  });

  it("keeps the ramp threshold high enough to matter", () => {
    // Below ~0.6 the alarm would not fire until the ramp is half gone, which
    // is the failure this pair of alarms exists to prevent.
    expect(HOURS_PUBLISHABLE_MIN_SHARE).toBeGreaterThanOrEqual(0.6);
    expect(HOURS_PUBLISHABLE_MIN_SHARE).toBeLessThan(1);
  });

  it("keeps the alarm strictly tighter than the publication window", () => {
    // A threshold >= HOURS_MAX_AGE_DAYS - 1 reintroduces the shipped bug,
    // because snapshotFreshnessAnomaly first goes red at threshold + 1 day.
    expect(HOURS_SNAPSHOT_MAX_AGE_DAYS).toBeLessThanOrEqual(HOURS_MAX_AGE_DAYS - 2);
  });

  it("does not tell an operator to re-enable Google when policy holds it off", () => {
    delete process.env.GOOGLE_MAPS_PLATFORM_POLICY_APPROVAL;
    delete process.env.GOOGLE_MAPS_PLATFORM_RUNTIME_ENABLED;

    const anomalies = ingestFreshnessTripwire(
      new Date(NEWEST + (HOURS_MAX_AGE_DAYS + 2) * DAY),
    ).filter((anomaly) => anomaly.source === "places-hours-refresh");

    expect(anomalies.length).toBeGreaterThan(0);
    expect(anomalies.every((anomaly) =>
      anomaly.detail.includes("deliberately held by policy"),
    )).toBe(true);
    expect(anomalies.every((anomaly) =>
      !anomaly.detail.includes("GOOGLE_MAPS_PLATFORM_RUNTIME_ENABLED=1"),
    )).toBe(true);
  });

  it("keeps an actionable runtime diagnosis after authorization is enabled", () => {
    process.env.GOOGLE_MAPS_PLATFORM_POLICY_APPROVAL = POLICY_APPROVAL;
    process.env.GOOGLE_MAPS_PLATFORM_RUNTIME_ENABLED = "1";

    const anomaly = ingestFreshnessTripwire(
      new Date(NEWEST + (HOURS_MAX_AGE_DAYS + 2) * DAY),
    ).find((item) => item.source === "places-hours-refresh");

    expect(anomaly?.detail).toContain("authorized Google refresh should be running");
    expect(anomaly?.detail).toContain("HOURS_REFRESH_CRON=1");
  });
});
