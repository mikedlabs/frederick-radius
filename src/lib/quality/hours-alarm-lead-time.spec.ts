import { describe, expect, it } from "vitest";
import {
  curatedFreshnessAnomalies,
  HOURS_SNAPSHOT_MAX_AGE_DAYS,
} from "@/lib/quality/curated-freshness";
import { HOURS_MAX_AGE_DAYS, isHoursFresh } from "@/lib/hours-freshness";
import HOURS_REFRESH from "@/data/places-hours-refresh.json";

/**
 * The hours alarm has to ring BEFORE the hours go dark.
 *
 * Verified-hours coverage does not decay gently. Every row expires exactly
 * HOURS_MAX_AGE_DAYS after its own stamp, so when the newest row crosses that
 * line the whole catalog loses its open/closed state in one step and the app
 * goes back to being unable to say anything about whether a place is open.
 *
 * The shipped threshold was 8 against a 7-day window, which put the warning a
 * full day after the outage it was supposed to warn about. That is the exact
 * defect these cases exist to prevent recurring, so they assert the LEAD TIME
 * rather than the constant — a future change to either number stays honest as
 * long as the alarm still precedes the cliff.
 */

const DAY = 86_400_000;
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

  it("keeps the alarm strictly tighter than the publication window", () => {
    // A threshold >= HOURS_MAX_AGE_DAYS - 1 reintroduces the shipped bug,
    // because snapshotFreshnessAnomaly first goes red at threshold + 1 day.
    expect(HOURS_SNAPSHOT_MAX_AGE_DAYS).toBeLessThanOrEqual(HOURS_MAX_AGE_DAYS - 2);
  });
});
