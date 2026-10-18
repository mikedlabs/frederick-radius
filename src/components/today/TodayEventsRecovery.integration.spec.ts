// @vitest-environment jsdom

import { act, createElement } from "react";
import { hydrateRoot, type Root } from "react-dom/client";
import { renderToString } from "react-dom/server";
import { afterEach, expect, it, vi } from "vitest";
import type { EventWithMeta } from "@/lib/loaders/events";

const database = vi.hoisted(() => ({ getSql: vi.fn() }));
vi.mock("@/lib/db/client", () => ({ getSql: database.getSql }));

import { GET } from "@/app/api/today/events/route";
import { loadTodayEventSnapshot } from "@/lib/loaders/todayEventSnapshot";
import { selectTodayEvents } from "@/lib/today-events";
import TodayEventsRecovery from "./TodayEventsRecovery";

// Fixed fixture time is beyond the promoted seed calendar, not a current-event
// claim. Only the database boundary and same-origin transport are substituted.
const NOW = new Date("2030-04-18T16:00:00.000Z");
const concert: EventWithMeta = {
  slug: "baker-park-community-concert-2030-04-18",
  title: "Live Theatre Production",
  presenter: "Other Voices Theatre",
  description: "A concert fixture from the canonical archive.",
  starts_at: "2030-04-18T22:00:00.000Z",
  ends_at: "2030-04-19T00:00:00.000Z",
  timezone: "America/New_York",
  venue_name: "Baker Park",
  venue_place_slug: "baker-park-frederick",
  address: "121 N Bentz St, Frederick, MD 21701",
  geom: { lng: -77.4201, lat: 39.4143 },
  municipality: "frederick",
  category: "community",
  audience: [],
  is_free: true,
  source: "city-frederick",
  is_verified: true,
  source_id: "recovery-integration-concert",
  source_url: "https://www.cityoffrederickmd.gov/calendar",
  license: "official-public-source",
  first_seen_at: "2030-04-17T12:00:00.000Z",
  last_verified_at: "2030-04-18T14:00:00.000Z",
  confidence: "verified",
  geo_confidence: "exact_address",
  category_name: "Community",
  municipality_name: "Frederick",
};

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

it("hydrates a degraded empty brief from the real archive reader and API without an explicit refresh", async () => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(NOW);
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  database.getSql.mockReturnValue(null);
  const initial = await loadTodayEventSnapshot(NOW);
  expect(initial.sourceHealth.degraded).toBe(true);
  expect(selectTodayEvents(initial.publicEvents, NOW)).toEqual([]);

  const html = renderToString(createElement(TodayEventsRecovery));
  expect(html).toContain("Updating today&#x27;s event picks");
  expect(html).toContain('href="/events"');
  expect(html).not.toContain(`/events/${concert.slug}`);

  const stale = { ...concert, slug: "stale-higher-prominence-concert-2030-04-18",
    title: "A different concert", presenter: undefined, ticket_url: "https://example.test/tickets/stale-concert",
    last_verified_at: "2030-04-16T14:00:00.000Z" };
  const sql = vi.fn().mockResolvedValue([{
    candidates: [{ canonical_slug: stale.slug, snapshot: stale }, { canonical_slug: concert.slug, snapshot: concert }],
    archive_status: "ok",
    archive_finished_at: "2030-04-18T15:00:00.000Z",
    archive_records_failed: 0,
  }]);
  database.getSql.mockReturnValue(sql);
  const restored = await loadTodayEventSnapshot(NOW);
  expect(restored.sourceHealth.degraded).toBe(false);
  expect(restored.publicEvents).toContainEqual(expect.objectContaining({
    slug: concert.slug, title: concert.title, presenter: concert.presenter, source: concert.source, source_url: concert.source_url,
    first_seen_at: concert.first_seen_at, last_verified_at: concert.last_verified_at,
  }));

  const replies: Array<{ status: number; cache: string | null; body: unknown }> = [];
  const fetchBridge = vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
    expect(url).toBe("/api/today/events");
    expect(init).toMatchObject({ cache: "no-store", headers: { Accept: "application/json" } });
    expect(init?.signal?.aborted).toBe(false);
    const response = await GET(new Request("https://frederickradius.app/api/today/events", {
      headers: init?.headers,
    }));
    replies.push({ status: response.status, cache: response.headers.get("Cache-Control"),
      body: await response.clone().json() });
    return response;
  });
  vi.stubGlobal("fetch", fetchBridge);
  const container = document.createElement("div");
  container.innerHTML = html;
  document.body.appendChild(container);
  let root: Root | undefined;
  try {
    await act(async () => { root = hydrateRoot(container, createElement(TodayEventsRecovery)); });
    await vi.waitFor(() => {
      expect(container.querySelector(`a[href="/events/${concert.slug}"]`)).not.toBeNull();
    });
    const link = container.querySelector(`a[href="/events/${concert.slug}"]`);
    expect(link?.textContent).toContain("Other Voices Theatre: Live Theatre Production");
    expect(container.querySelector(`a[href="/events/${stale.slug}"]`)).toBeNull();
    expect(concert.title).toBe("Live Theatre Production");
    expect(concert.presenter).toBe("Other Voices Theatre");
    expect(container.textContent).toContain("6:00 PM");
    expect(container.textContent).toContain("Baker Park · Free");
    const image = container.querySelector("img");
    expect(image, "the approved exact-venue visual survives archive to API to hydration").not.toBeNull();
    const source = new URL(image!.getAttribute("src")!, "https://frederickradius.app");
    expect(source.searchParams.get("url") ?? source.pathname).toBe("/images/seasons/fall/018.jpg");
    expect(container.textContent).toContain("Venue · Baker Park");
    expect(link?.querySelector("[data-event-photo-credit]")).toBeNull();
    expect(container.querySelector("a a")).toBeNull();
    expect(container.textContent).toContain("1 event pick today · 1 event pick tonight · Countywide");
    expect(container.textContent).not.toMatch(/Updating today's event picks|Event picks are unavailable|No picks in this brief|Partial coverage/);
    expect(fetchBridge).toHaveBeenCalledTimes(1);
    expect(sql).toHaveBeenCalledTimes(2);
    expect(replies).toEqual([expect.objectContaining({ status: 200,
      cache: "public, s-maxage=300, stale-while-revalidate=900",
      body: expect.objectContaining({ partial: false, issues: [], unavailable: [],
        events: [expect.objectContaining({ slug: concert.slug, title: concert.title, presenter: concert.presenter, free: true,
          visual: { src: "/images/seasons/fall/018.jpg", key: "radius-baker-park-bandshell",
            caption: "Venue · Baker Park", presentation: "photo" } })] }),
    })]);
  } finally {
    await act(async () => root?.unmount());
    container.remove();
  }
});
