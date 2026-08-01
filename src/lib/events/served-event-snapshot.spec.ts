import { beforeEach, describe, expect, it } from "vitest";
import type { EventWithMeta } from "@/lib/loaders/events";
import {
  rememberServedEvents,
  resetServedEventSnapshotForTests,
  servedEventBySlug,
  SERVED_EVENT_SNAPSHOT_MAX_AGE_MS,
} from "./served-event-snapshot";

function event(slug: string): EventWithMeta {
  return {
    slug,
    title: slug,
    description: "A published event.",
    starts_at: "2026-08-01T22:00:00.000Z",
    ends_at: "2026-08-02T00:00:00.000Z",
    timezone: "America/New_York",
    is_all_day: false,
    is_recurring: false,
    venue_name: "Frederick",
    address: "Frederick, MD",
    geom: { lng: -77.4105, lat: 39.4143 },
    municipality: "frederick",
    category: "community",
    audience: [],
    is_free: true,
    attendance_mode: "physical",
    source: "manual",
    is_verified: false,
    source_id: "published-event",
    source_url: "https://example.com/event",
    license: "Test fixture",
    confidence: "partner",
    first_seen_at: "2026-08-01T12:00:00.000Z",
    last_verified_at: "2026-08-01T12:00:00.000Z",
    geo_confidence: "exact_address",
    category_name: "Community",
    municipality_name: "Frederick",
  };
}

describe("served event snapshot", () => {
  beforeEach(() => resetServedEventSnapshotForTests());

  it("reuses a recently published event without I/O", () => {
    rememberServedEvents([event("summer-concert-2026-08-01")], 1_000);

    expect(servedEventBySlug("summer-concert-2026-08-01", 2_000)?.title)
      .toBe("summer-concert-2026-08-01");
  });

  it("expires old board rows instead of becoming a durable authority", () => {
    rememberServedEvents([event("expired-event-2026-08-01")], 1_000);

    expect(servedEventBySlug(
      "expired-event-2026-08-01",
      1_000 + SERVED_EVENT_SNAPSHOT_MAX_AGE_MS + 1,
    )).toBeNull();
  });

  it("keeps recently served rows when a later partial board is remembered", () => {
    rememberServedEvents([event("first-event-2026-08-01")], 1_000);
    rememberServedEvents([event("second-event-2026-08-01")], 2_000);

    expect(servedEventBySlug("first-event-2026-08-01", 3_000)).not.toBeNull();
    expect(servedEventBySlug("second-event-2026-08-01", 3_000)).not.toBeNull();
  });
});
