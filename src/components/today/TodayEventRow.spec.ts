import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { EventWithMeta } from "@/lib/loaders/events";
import { archivedEventFromSnapshot } from "@/lib/events/event-identity";
import { selectTodayEvents } from "@/lib/today-events";
import TodayEventRow from "./TodayEventRow";
import TonightHeadline from "./TonightHeadline";

// Expose whether either actual SSR leaf requests a walking hint. Real distance
// math remains separately tested; it cannot run before hydration.
vi.mock("./EventWalkTime", () => ({ default: () => createElement("span", { "data-walk-hint-fixture": true }, "Walking hint fixture") }));
const now = new Date("2026-07-16T17:45:00.000Z");
function event(patch: Partial<EventWithMeta> = {}): EventWithMeta {
  return {
    slug: "source-identity-fixture", title: "Live Theatre Production", presenter: "Other Voices Theatre",
    description: "Source identity fixture.", starts_at: "2026-07-16T23:00:00.000Z", ends_at: "2026-07-17T01:00:00.000Z",
    timezone: "America/New_York", venue_name: "Sky Stage", address: "59 S Carroll St, Frederick, MD",
    geom: { lng: -77.409, lat: 39.4113 }, municipality: "frederick", category: "arts", audience: [], is_free: false,
    source: "city-frederick", is_verified: false, source_id: "source-identity-fixture", source_url: "https://example.test/events/source-identity",
    license: "Test fixture", confidence: "verified", first_seen_at: "2026-07-15T12:00:00.000Z", last_verified_at: "2026-07-16T15:00:00.000Z",
    geo_confidence: "exact_address", category_name: "Arts", municipality_name: "Frederick", ...patch,
  };
}
function both(row: EventWithMeta) {
  return [renderToStaticMarkup(createElement(TodayEventRow, { event: row, quiet: false, now })),
    renderToStaticMarkup(createElement(TonightHeadline, { event: row, now, embedded: true }))];
}

describe("actual Today server event identity and attendance", () => {
  it("preserves supplied presenter, source title and occurrence link in both leaves", () => {
    const row = event();
    for (const html of both(row)) {
      expect(html).toContain("Other Voices Theatre: Live Theatre Production");
      expect(html).toContain('href="/events/source-identity-fixture"');
      expect(html).toContain("Sky Stage · Frederick");
      expect(html).toContain("data-walk-hint-fixture");
    }
    expect(row.title).toBe("Live Theatre Production");
  });
  it("labels online attendance and suppresses physical town/walk hints despite precise inherited geometry", () => {
    const row = event({ attendance_mode: "online", venue_name: "", online_url: "https://example.test/join/local-production" });
    for (const html of both(row)) {
      expect(html).toContain("Online");
      expect(html).not.toContain(" · Frederick");
      expect(html).not.toContain("data-walk-hint-fixture");
    }
  });
  it("retains online identity in the quieter program row", () => {
    const row = event({ attendance_mode: "online", venue_name: "", online_url: "https://example.test/join/local-production" });
    const html = renderToStaticMarkup(createElement(TodayEventRow, { event: row, quiet: true, now }));
    expect(html).toContain("Other Voices Theatre: Live Theatre Production");
    expect(html).toContain("Online");
    expect(html).not.toContain(" · Frederick");
  });
  it.each([42, { name: "Unexpected optional field" }])("keeps a malformed archived presenter from crashing either leaf or poisoning recovery", presenter => {
    const row = archivedEventFromSnapshot({ ...event(), presenter });
    expect(row).not.toBeNull();
    for (const html of both(row!)) {
      expect(html).toContain("Live Theatre Production");
      expect(html).not.toContain("Unexpected optional field");
    }
    const response = selectTodayEvents([row!], now)[0];
    expect(response.title).toBe("Live Theatre Production");
    expect(response).not.toHaveProperty("presenter");
  });
});
