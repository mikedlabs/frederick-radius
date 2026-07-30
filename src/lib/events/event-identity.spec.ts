import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import type { EventWithMeta } from "@/lib/loaders/events";
import { archivedEventFromSnapshot } from "./event-identity";

function snapshot(): EventWithMeta {
  return {
    slug: "current-event-2026-07-30",
    title: "Current event",
    description: "",
    starts_at: "2026-07-30T22:00:00.000Z",
    ends_at: "2026-07-31T00:00:00.000Z",
    timezone: "America/New_York",
    venue_name: "Test venue",
    address: "Frederick, MD",
    geom: { lng: -77.4105, lat: 39.4143 },
    municipality: "frederick",
    category: "community",
    audience: [],
    is_free: true,
    source: "celebrate",
    is_verified: false,
    source_id: "stable-publisher-uid",
    source_url: "https://example.com/event",
    license: "test",
    first_seen_at: "2026-07-29T12:00:00.000Z",
    last_verified_at: "2026-07-29T12:00:00.000Z",
    confidence: "partner",
    geo_confidence: "exact_address",
    category_name: "Community",
    municipality_name: "Frederick",
  };
}

describe("event identity archive", () => {
  it("rebinds a valid snapshot to its canonical slug", () => {
    expect(
      archivedEventFromSnapshot(
        snapshot(),
        "renamed-event-2026-07-30",
      )?.slug,
    ).toBe("renamed-event-2026-07-30");
  });

  it("rejects malformed snapshots before an event page can render them", () => {
    expect(
      archivedEventFromSnapshot({
        ...snapshot(),
        geom: { lng: 900, lat: 39.4 },
      }),
    ).toBeNull();
  });

  it("keeps identity, aliases, tombstones, and saved snapshots server-only", () => {
    const sql = readFileSync(
      new URL(
        "../../../drizzle/0038_event_identity_archive.sql",
        import.meta.url,
      ),
      "utf8",
    );
    expect(sql).toContain("event_source_identities");
    expect(sql).toContain("event_slug_aliases");
    expect(sql).toContain("event_tombstones");
    expect(sql).toContain("ADD COLUMN IF NOT EXISTS event_snapshot jsonb");
    expect(sql).toContain("ENABLE ROW LEVEL SECURITY");
    expect(sql).toContain("FROM anon, authenticated");
  });
});
