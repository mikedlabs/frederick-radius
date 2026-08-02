import { describe, expect, it } from "vitest";
import {
  buildRecoverableVenuePublication,
  promoteVenueInventory,
  suppressKnownCrossVenueDuplicates,
} from "../scripts/lib/venue-event-promotion";

type Row = {
  id: string;
  venue_slug: string;
};

const keyOf = (row: Row) => row.id;

describe("venue event inventory promotion", () => {
  it("replaces a successfully collected venue and retires ghost rows", () => {
    const inventory = new Map<string, Row>([
      ["old", { id: "old", venue_slug: "venue-a" }],
      ["still-current", { id: "still-current", venue_slug: "venue-a" }],
      ["other", { id: "other", venue_slug: "venue-b" }],
    ]);

    const result = promoteVenueInventory({
      inventory,
      venueSlug: "venue-a",
      status: "complete",
      rows: [
        { id: "still-current", venue_slug: "venue-a" },
        { id: "new", venue_slug: "venue-a" },
      ],
      keyOf,
    });

    expect([...inventory.keys()].sort()).toEqual([
      "new",
      "other",
      "still-current",
    ]);
    expect(result).toEqual({ added: 1, removed: 1 });
  });

  it("treats a verified empty result as an authoritative replacement", () => {
    const inventory = new Map<string, Row>([
      ["old", { id: "old", venue_slug: "venue-a" }],
      ["other", { id: "other", venue_slug: "venue-b" }],
    ]);

    const result = promoteVenueInventory({
      inventory,
      venueSlug: "venue-a",
      status: "complete",
      rows: [],
      keyOf,
    });

    expect([...inventory.keys()]).toEqual(["other"]);
    expect(result).toEqual({ added: 0, removed: 1 });
  });

  it.each(["failed", "unchanged"] as const)(
    "preserves last-known-good rows when collection is %s",
    (status) => {
      const inventory = new Map<string, Row>([
        ["old", { id: "old", venue_slug: "venue-a" }],
      ]);

      const result = promoteVenueInventory({
        inventory,
        venueSlug: "venue-a",
        status,
        rows: [{ id: "unexpected", venue_slug: "venue-a" }],
        keyOf,
      });

      expect([...inventory.keys()]).toEqual(["old"]);
      expect(result).toEqual({ added: 0, removed: 0 });
    },
  );
});

describe("known cross-venue duplicate suppression", () => {
  type EventRow = {
    venue_slug: string;
    title: string;
    starts_at: string;
    marker: string;
  };

  it("prefers New Spire for an exact title and local start match", () => {
    const rows: EventRow[] = [
      {
        venue_slug: "weinberg-center",
        title: "The Importance of Being Earnest",
        starts_at: "2026-08-02T15:00:00",
        marker: "broad Weinberg listing",
      },
      {
        venue_slug: "new-spire",
        title: "The Importance of Being Earnest",
        starts_at: "2026-08-02T15:00",
        marker: "specific New Spire listing",
      },
    ];

    const result = suppressKnownCrossVenueDuplicates(rows);

    expect(result.suppressed).toBe(1);
    expect(result.events).toEqual([rows[1]]);
  });

  it("is deterministic when the preferred listing appears first", () => {
    const preferred = {
      venue_slug: "new-spire",
      title: "  Improv   Class ",
      starts_at: "2026-09-14T18:30",
      marker: "specific",
    };
    const broad = {
      venue_slug: "weinberg-center",
      title: "improv class",
      starts_at: "2026-09-14T18:30:00",
      marker: "broad",
    };

    expect(suppressKnownCrossVenueDuplicates([preferred, broad])).toEqual({
      events: [preferred],
      suppressed: 1,
    });
  });

  it("preserves different titles, different performance times, and other venues", () => {
    const rows: EventRow[] = [
      {
        venue_slug: "new-spire",
        title: "Law and Order SIU 2026",
        starts_at: "2026-08-08T15:00",
        marker: "specific title",
      },
      {
        venue_slug: "weinberg-center",
        title: "Law and Order SIU 2026 DUN-DUN! These Are YOUR Stories",
        starts_at: "2026-08-08T15:00:00",
        marker: "different title",
      },
      {
        venue_slug: "weinberg-center",
        title: "Law and Order SIU 2026",
        starts_at: "2026-08-08T19:30:00",
        marker: "different time",
      },
      {
        venue_slug: "another-venue",
        title: "Law and Order SIU 2026",
        starts_at: "2026-08-08T15:00",
        marker: "unrelated venue",
      },
    ];

    expect(suppressKnownCrossVenueDuplicates(rows)).toEqual({
      events: rows,
      suppressed: 0,
    });
  });

  it("restores an unchanged parent listing after the preferred source clears it", () => {
    const broad: EventRow = {
      venue_slug: "weinberg-center",
      title: "The Importance of Being Earnest",
      starts_at: "2026-08-02T15:00:00",
      marker: "broad Weinberg listing",
    };
    const preferred: EventRow = {
      venue_slug: "new-spire",
      title: "The Importance of Being Earnest",
      starts_at: "2026-08-02T15:00",
      marker: "specific New Spire listing",
    };
    const key = (row: EventRow) =>
      `${row.venue_slug}::${row.title}::${row.starts_at}`;

    const firstRun = buildRecoverableVenuePublication([broad, preferred]);
    expect(firstRun.publishedEvents).toEqual([preferred]);
    expect(firstRun.sourceInventory).toEqual([broad, preferred]);

    // A later complete New Spire read is validly empty. Weinberg's page is
    // fingerprint-identical, so its source is skipped as unchanged. Promotion
    // must begin from the recoverable inventory, not the filtered public file.
    const nextInventory = new Map(
      firstRun.sourceInventory.map((row) => [key(row), row]),
    );
    promoteVenueInventory({
      inventory: nextInventory,
      venueSlug: "new-spire",
      status: "complete",
      rows: [],
      keyOf: key,
    });
    promoteVenueInventory({
      inventory: nextInventory,
      venueSlug: "weinberg-center",
      status: "unchanged",
      rows: [],
      keyOf: key,
    });

    const secondRun = buildRecoverableVenuePublication([
      ...nextInventory.values(),
    ]);
    expect(secondRun.suppressed).toBe(0);
    expect(secondRun.publishedEvents).toEqual([broad]);
    expect(secondRun.sourceInventory).toEqual([broad]);
  });
});
