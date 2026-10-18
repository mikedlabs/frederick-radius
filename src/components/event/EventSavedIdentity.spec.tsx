// @vitest-environment jsdom
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { EventWithMeta } from "@/lib/loaders/events";
import { prepareEventsForBrowse } from "@/lib/events/browsePayload";
import { buildHorizonBounds } from "@/lib/eventHorizon";
import SavedEventWallet from "@/components/saved/SavedEventWallet";

const now = new Date("2030-04-18T16:00:00.000Z");
const source: EventWithMeta = {
  slug: "saved-presenter-fixture", title: "Live Theatre Production", presenter: "Other Voices Theatre",
  description: "Declared source identity fixture, not a current schedule.",
  starts_at: "2030-04-18T22:00:00.000Z", ends_at: "2030-04-19T00:00:00.000Z", timezone: "America/New_York",
  venue_name: "Fixture venue", address: "Frederick County", geom: { lng: -77.41, lat: 39.41 },
  municipality: "frederick", category: "arts", audience: [], is_free: true, source: "manual",
  source_id: "saved-presenter-fixture", source_url: "https://example.test/source", license: "Test fixture",
  is_verified: true, confidence: "curated", first_seen_at: "2030-04-17T12:00:00.000Z",
  last_verified_at: "2030-04-18T14:00:00.000Z", geo_confidence: "area", category_name: "Arts", municipality_name: "Frederick",
};

describe("event identity after a browse payload is saved", () => {
  it.each([true, false])("retains the same visible and accessible identity with presenter=%s", (presenter) => {
    const row = { ...source, presenter: presenter ? source.presenter : undefined };
    const [payload] = JSON.parse(JSON.stringify(prepareEventsForBrowse([row], buildHorizonBounds(now)))) as EventWithMeta[];
    const host = document.createElement("div");
    host.innerHTML = renderToStaticMarkup(createElement(SavedEventWallet, { events: [payload], now }));
    const label = presenter ? "Other Voices Theatre: Live Theatre Production" : "Live Theatre Production";
    expect(host.querySelector(`a[href^="/events/${source.slug}"]`)?.textContent).toContain(label);
    expect(host.querySelector('button[aria-expanded]')?.getAttribute("aria-label")).toContain(label);
    expect(payload.title).toBe(source.title);
    expect(row.title).toBe(source.title);
    expect(host.textContent).not.toContain("undefined");
  });
});
