import { describe, expect, it } from "vitest";
import { buildHoursRefreshArtifact } from "../../../scripts/pull-hours-refresh.mjs";

const NOW = new Date("2026-07-26T13:00:00.000Z");
const recent = "2026-07-26T12:00:00.000Z";

function row(
  slug: string,
  overrides: Record<string, unknown> = {},
) {
  return {
    slug,
    weekday_hours: ["Monday: 9:00 AM – 5:00 PM"],
    business_status: "OPERATIONAL",
    refreshed_at: recent,
    ...overrides,
  };
}

describe("hours refresh artifact safety", () => {
  it("rejects an empty database snapshot", () => {
    expect(() =>
      buildHoursRefreshArtifact([], {
        now: NOW,
        knownSlugs: ["cafe"],
      }),
    ).toThrow("no rows for the current public catalog");
  });

  it("rejects a stale writer even when old database rows still exist", () => {
    expect(() =>
      buildHoursRefreshArtifact(
        [
          row("cafe", {
            refreshed_at: "2026-07-23T12:00:00.000Z",
          }),
        ],
        { now: NOW, knownSlugs: ["cafe"] },
      ),
    ).toThrow("more than 36 hours old");
  });

  it("does not let a recent status-only row masquerade as fresh hours", () => {
    expect(() =>
      buildHoursRefreshArtifact(
        [row("cafe", { weekday_hours: null })],
        { now: NOW, knownSlugs: ["cafe"] },
      ),
    ).toThrow("no usable hours schedules");
  });

  it("refuses an unexpected shrink of the current catalog snapshot", () => {
    expect(() =>
      buildHoursRefreshArtifact(
        [row("cafe")],
        {
          now: NOW,
          knownSlugs: ["cafe", "bakery"],
          existingArtifact: {
            _doc: "metadata",
            cafe: { refreshed_at: recent },
            bakery: { refreshed_at: recent },
          },
        },
      ),
    ).toThrow("Refusing to shrink");
  });

  it("filters orphaned rows and records an auditable snapshot summary", () => {
    const result = buildHoursRefreshArtifact(
      [
        row("cafe"),
        row("old-slug"),
      ],
      {
        now: NOW,
        knownSlugs: ["cafe"],
      },
    );

    expect(result.artifact).toMatchObject({
      _meta: {
        schema_version: 1,
        generated_at: NOW.toISOString(),
        rows: 1,
        with_schedule: 1,
        fresh_schedule_rows: 1,
        recent_rows: 1,
        unmatched_rows: 1,
      },
      cafe: {
        weekday_hours: ["Monday: 9:00 AM – 5:00 PM"],
        business_status: "OPERATIONAL",
        refreshed_at: recent,
      },
    });
    expect(result.artifact).not.toHaveProperty("old-slug");
  });

  it("rejects malformed schedules and future verification timestamps", () => {
    expect(() =>
      buildHoursRefreshArtifact(
        [row("cafe", { weekday_hours: "Monday: always" })],
        { now: NOW, knownSlugs: ["cafe"] },
      ),
    ).toThrow("malformed weekday_hours");

    expect(() =>
      buildHoursRefreshArtifact(
        [
          row("cafe", {
            refreshed_at: "2026-07-27T12:00:00.000Z",
          }),
        ],
        { now: NOW, knownSlugs: ["cafe"] },
      ),
    ).toThrow("dated in the future");
  });
});
