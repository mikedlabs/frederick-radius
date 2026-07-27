import { describe, expect, it, vi } from "vitest";
import {
  buildHoursRefreshArtifact,
  fetchHoursRefreshRows,
} from "../../../scripts/pull-hours-refresh.mjs";
import {
  hoursRefreshForAcceptedIdentity,
  resolveRefreshedBusinessStatusForAcceptedIdentity,
} from "@/lib/loaders/places";

const NOW = new Date("2026-07-26T13:00:00.000Z");
const recent = "2026-07-26T12:00:00.000Z";

function row(
  slug: string,
  overrides: Record<string, unknown> = {},
) {
  return {
    slug,
    place_id: `ChIJ-${slug}`,
    weekday_hours: ["Monday: 9:00 AM – 5:00 PM"],
    business_status: "OPERATIONAL",
    refreshed_at: recent,
    ...overrides,
  };
}

describe("hours refresh artifact safety", () => {
  it("paginates the read-only Data API without sending a privileged credential", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify([
            row("cafe"),
            row("bakery"),
          ]),
          { status: 200 },
        ),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify([]), { status: 200 }),
      );

    const rows = await fetchHoursRefreshRows({
      supabaseUrl: "https://example.supabase.co/",
      publishableKey: "sb_publishable_example",
      fetchImpl,
    });

    expect(rows).toHaveLength(2);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    const [firstUrl, firstInit] = fetchImpl.mock.calls[0];
    expect(String(firstUrl)).toContain(
      "select=slug%2Cplace_id%2Cweekday_hours%2Cbusiness_status%2Crefreshed_at",
    );
    expect(String(firstUrl)).toContain("offset=0");
    expect(firstInit?.headers).toEqual({
      accept: "application/json",
      apikey: "sb_publishable_example",
    });
    expect(JSON.stringify(firstInit)).not.toContain("DATABASE_URL");
    expect(String(fetchImpl.mock.calls[1][0])).toContain("offset=2");
  });

  it("turns a denied Data API read into an actionable migration error", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ message: "permission denied" }), {
        status: 403,
      }),
    );

    await expect(
      fetchHoursRefreshRows({
        supabaseUrl: "https://example.supabase.co",
        publishableKey: "sb_publishable_example",
        fetchImpl,
      }),
    ).rejects.toThrow("0034_expose_place_hours_refresh_read_only.sql");
  });

  it("applies a refresh row only to its currently accepted provider identity", () => {
    const refresh = {
      place_id: "ChIJCurrentPlace123",
      weekday_hours: ["Monday: 9:00 AM – 5:00 PM"],
      business_status: "CLOSED_PERMANENTLY",
      refreshed_at: recent,
    };

    expect(
      hoursRefreshForAcceptedIdentity(refresh, "ChIJCurrentPlace123"),
    ).toBe(refresh);
    expect(
      hoursRefreshForAcceptedIdentity(refresh, "ChIJDifferentPlace456"),
    ).toBeUndefined();
    expect(
      hoursRefreshForAcceptedIdentity(refresh, undefined),
    ).toBeUndefined();
    expect(
      hoursRefreshForAcceptedIdentity(
        refresh,
        "5ba71092-6783-4abd-abc9-3af18d0a401f",
      ),
    ).toBeUndefined();
    expect(
      hoursRefreshForAcceptedIdentity(
        { place_id: undefined, refreshed_at: recent },
        "ChIJCurrentPlace123",
      ),
    ).toBeUndefined();
    expect(
      resolveRefreshedBusinessStatusForAcceptedIdentity(
        undefined,
        refresh,
        "ChIJDifferentPlace456",
      ),
    ).toBeUndefined();
    expect(
      resolveRefreshedBusinessStatusForAcceptedIdentity(
        undefined,
        refresh,
        "ChIJCurrentPlace123",
      ),
    ).toMatchObject({
      status: "closed_permanently",
      source: "hours_refresh",
    });

    const business = {
      place_id: "ChIJCurrentPlace123",
      is_operational: "closed_temporarily" as const,
      refreshed_at: recent,
    };
    expect(
      resolveRefreshedBusinessStatusForAcceptedIdentity(
        business,
        undefined,
        "ChIJCurrentPlace123",
      ),
    ).toMatchObject({
      status: "closed_temporarily",
      source: "business_status",
    });
    expect(
      resolveRefreshedBusinessStatusForAcceptedIdentity(
        business,
        undefined,
        "ChIJDifferentPlace456",
      ),
    ).toBeUndefined();
    expect(
      resolveRefreshedBusinessStatusForAcceptedIdentity(
        {
          is_operational: "closed_permanently",
          refreshed_at: recent,
        },
        undefined,
        "ChIJCurrentPlace123",
      ),
    ).toBeUndefined();
  });

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
        knownPlaces: [
          { slug: "cafe", google_place_id: "ChIJ-cafe" },
        ],
      },
    );

    expect(result.artifact).toMatchObject({
      _meta: {
        schema_version: 2,
        generated_at: NOW.toISOString(),
        rows: 1,
        with_schedule: 1,
        fresh_schedule_rows: 1,
        recent_rows: 1,
        unmatched_rows: 1,
      },
      cafe: {
        place_id: "ChIJ-cafe",
        weekday_hours: ["Monday: 9:00 AM – 5:00 PM"],
        business_status: "OPERATIONAL",
        refreshed_at: recent,
      },
    });
    expect(result.artifact).not.toHaveProperty("old-slug");
  });

  it("rejects a database identity that no longer matches the public catalog", () => {
    expect(() =>
      buildHoursRefreshArtifact(
        [row("cafe", { place_id: "ChIJ-old-cafe" })],
        {
          now: NOW,
          knownPlaces: [
            { slug: "cafe", google_place_id: "ChIJ-current-cafe" },
          ],
        },
      ),
    ).toThrow(
      "Hours snapshot row cafe has place_id ChIJ-old-cafe, but the public catalog maps it to ChIJ-current-cafe.",
    );
  });

  it("requires place_id when validating against the current public catalog", () => {
    expect(() =>
      buildHoursRefreshArtifact(
        [row("cafe", { place_id: undefined })],
        {
          now: NOW,
          knownPlaces: [
            { slug: "cafe", google_place_id: "ChIJ-current-cafe" },
          ],
        },
      ),
    ).toThrow("Hours snapshot row cafe is missing place_id.");
  });

  it("keeps the legacy knownSlugs test harness compatible", () => {
    const result = buildHoursRefreshArtifact(
      [row("cafe", { place_id: undefined })],
      {
        now: NOW,
        knownSlugs: ["cafe"],
      },
    );

    expect(result.artifact).toMatchObject({
      cafe: {
        weekday_hours: ["Monday: 9:00 AM – 5:00 PM"],
        business_status: "OPERATIONAL",
        refreshed_at: recent,
      },
    });
    expect(result.artifact._meta).toMatchObject({ schema_version: 1 });
  });

  it("rejects ambiguous catalog identities and duplicate database slugs", () => {
    expect(() =>
      buildHoursRefreshArtifact([row("cafe")], {
        now: NOW,
        knownPlaces: [
          { slug: "cafe", google_place_id: "ChIJ-shared" },
          { slug: "bakery", google_place_id: "ChIJ-shared" },
        ],
      }),
    ).toThrow(
      "The public catalog maps Google Place ID ChIJ-shared to both cafe and bakery.",
    );

    expect(() =>
      buildHoursRefreshArtifact(
        [row("cafe"), row("cafe")],
        {
          now: NOW,
          knownPlaces: [
            { slug: "cafe", google_place_id: "ChIJ-cafe" },
          ],
        },
      ),
    ).toThrow("Hours snapshot contains duplicate row cafe.");
  });

  it("rejects invalid provider IDs and unsupported business statuses", () => {
    expect(() =>
      buildHoursRefreshArtifact(
        [
          row("cafe", {
            place_id: "5ba71092-6783-4abd-abc9-3af18d0a401f",
          }),
        ],
        { now: NOW, knownSlugs: ["cafe"] },
      ),
    ).toThrow("Hours snapshot row cafe has invalid place_id");

    expect(() =>
      buildHoursRefreshArtifact(
        [row("cafe", { business_status: "MAYBE_OPEN" })],
        { now: NOW, knownSlugs: ["cafe"] },
      ),
    ).toThrow(
      "Hours snapshot row cafe has unsupported business_status MAYBE_OPEN.",
    );
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
