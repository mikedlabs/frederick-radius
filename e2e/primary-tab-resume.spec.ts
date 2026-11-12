import { expect, test, type Page } from "@playwright/test";
import { registerWebkitLoopbackDocumentSeam } from "./webkit-loopback-document";
import { dismissReturnBridge, emptyReturnBridgeState, RETURN_BRIDGE_STORAGE_KEY } from "../src/lib/return-bridge";
import catalog from "../src/data/places-client.json";
import type { EventWithMeta } from "../src/lib/loaders/events";

test.use({ isMobile: true, hasTouch: true, serviceWorkers: "block" });

const camera = "-77.4105,39.4143,13.40";
const start = `/map?in=frederick&c=${encodeURIComponent(camera)}&layers=parks&q=coffee`;
const fixtures = catalog.filter(place => ["carroll-creek-linear-park-frederick", "baker-park-frederick"].includes(place.slug));
const eventQuery = "continuity rehearsal";
function declaredEvents(): EventWithMeta[] {
  const now = Date.now();
  return Array.from({ length: 32 }, (_, index) => ({
    slug: `declared-tab-continuity-${index}`,
    title: `Continuity rehearsal ${String(index + 1).padStart(2, "0")}`,
    description: "Fictional event used only to test the local tab journey; not a public listing.",
    starts_at: new Date(now + 3_600_000 + index * 60_000).toISOString(),
    ends_at: new Date(now + 3 * 3_600_000).toISOString(), timezone: "America/New_York",
    venue_name: "Declared local fixture venue", address: "Fictional acceptance address",
    geom: { lat: 39.414, lng: -77.41 }, municipality: "frederick", municipality_name: "Frederick",
    category: "arts", category_name: "Arts & culture", audience: [], is_free: true,
    attendance_mode: "physical", geo_confidence: "venue_match", source: "manual",
    source_id: `declared-tab-continuity-${index}`, source_url: `https://example.test/tab-continuity/${index}`,
    confidence: "curated", license: "Fictional local acceptance facts only.",
    first_seen_at: new Date(now).toISOString(), last_verified_at: new Date(now).toISOString(),
    is_verified: true, status: "scheduled",
  }));
}
async function boundary(page: Page, baseURL: string | undefined) {
  if (!baseURL || !["localhost", "127.0.0.1"].includes(new URL(baseURL).hostname)) throw Error("Tab continuity fixtures require loopback.");
  const origin = new URL(baseURL).origin;
  const blocked: string[] = [];
  const events = declaredEvents();
  let eventBrowseReads = 0;
  await page.context().addCookies([{ name: "fr_onboarded", value: "1", url: origin }]);
  await page.addInitScript(({ key, bridge }) => {
    localStorage.setItem(key, JSON.stringify(bridge)); localStorage.setItem("fr_map_location_intro_v1", "dismissed");
    const original = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (this: HTMLCanvasElement, type: string, ...args: unknown[]) {
      return /webgl/.test(type) ? null : original.call(this, type as "2d", ...args);
    } as typeof original;
  }, { key: RETURN_BRIDGE_STORAGE_KEY, bridge: dismissReturnBridge(emptyReturnBridgeState()) });
  await page.context().route("**/*", async route => {
    const request = route.request(), url = new URL(request.url());
    if (url.origin !== origin || !["GET", "HEAD"].includes(request.method())) {
      blocked.push(`${request.method()} ${url.hostname}${url.pathname}`); return route.abort("blockedbyclient");
    }
    if (url.pathname === "/api/auth/me") return route.fulfill({ json: { user: null } });
    if (url.pathname === "/api/map/places") return route.fulfill({ json: { generatedAt: "2026-10-29T12:00:00Z", places: fixtures.map(place => ({ ...place, open_status: { state: "unknown" } })) } });
    if (url.pathname === "/api/search") return route.fulfill({ json: { results: [] } });
    if (url.pathname === "/api/events/browse") {
      if (++eventBrowseReads > 2) {
        blocked.push("Exceeded declared two-read event fixture boundary");
        return route.abort("blockedbyclient");
      }
      return route.fulfill({ json: { events, liveSlugs: [], generatedAt: events[0].last_verified_at,
        sourceHealth: { degraded: false, issues: [] } } });
    }
    if (url.pathname === "/api/places/by-slugs") return route.fulfill({ json: { places: fixtures.filter(place => (url.searchParams.get("slugs") ?? "").split(",").includes(place.slug)) } });
    if (url.pathname.startsWith("/api/")) return route.fulfill({ status: 503, json: { error: "Declared unavailable tab fixture transport" } });
    return route.fallback();
  });
  return blocked;
}
const search = (page: Page) => page.getByRole("combobox", { name: /Search this map|Search Frederick Radius/ });
const tabs = (page: Page) => page.getByRole("navigation", { name: "Primary", exact: true });
for (const width of [320, 390]) {
  test(`Map tabs restore query camera layers and latest local typing at ${width}px`, async ({ page, baseURL }, info) => {
    await page.setViewportSize({ width, height: 844 }); await page.emulateMedia({ reducedMotion: "reduce" });
    const blocked = await boundary(page, baseURL);
    await page.goto(start, { waitUntil: "domcontentloaded" });
    await expect(search(page)).toHaveValue("coffee", { timeout: 30_000 });
    // Leave during the ordinary URL debounce. No search provider is involved:
    // the local search boundary returns an explicit empty result.
    await search(page).fill("latest local phrase");
    await tabs(page).getByRole("link", { name: "Events", exact: true }).tap();
    await expect(page).toHaveURL(/\/events(?:\?|$)/);
    const eventsHref = page.url();
    await expect(tabs(page).getByRole("link", { name: "Map", exact: true })).toHaveAttribute("href", "/map");
    await tabs(page).getByRole("link", { name: "Map", exact: true }).tap();
    await expect.poll(() => new URL(page.url()).searchParams.get("q")).toBe("latest local phrase");
    await expect(search(page)).toHaveValue("latest local phrase");
    expect(new URL(page.url()).searchParams.get("c")).toBe(camera);
    expect(new URL(page.url()).searchParams.get("layers")).toBe("parks");
    expect(await page.evaluate(() => sessionStorage.getItem("fr:primary-tabs:v1"))).not.toContain("latest local phrase");
    await search(page).fill("");
    await expect.poll(() => new URL(page.url()).searchParams.get("q")).toBeNull();
    await expect(search(page)).toHaveValue("");
    await page.goBack(); await expect(page).toHaveURL(eventsHref);
    await info.attach("tab-fixture-boundary", { contentType: "application/json", body: JSON.stringify({ width, blocked, scope: "Actual app navigation/search field; declared loopback catalog, empty local search and unavailable WebGL. All writes/external origins blocked before transmission." }) });
  });
}
test("direct Map query including an explicit empty query wins over an earlier tab snapshot", async ({ page, baseURL }) => {
  await page.setViewportSize({ width: 390, height: 844 }); await boundary(page, baseURL);
  await page.goto(start, { waitUntil: "domcontentloaded" }); await expect(search(page)).toHaveValue("coffee", { timeout: 30_000 });
  await tabs(page).getByRole("link", { name: "Events", exact: true }).tap(); await expect(page).toHaveURL(/\/events(?:\?|$)/);
  for (const q of ["tea", ""]) {
    await page.goto(`/map?in=frederick&layers=parks&q=${q}`, { waitUntil: "domcontentloaded" });
    await expect(search(page)).toHaveValue(q, { timeout: 30_000 }); expect(new URL(page.url()).searchParams.get("q")).toBe(q);
  }
});
test("Events tabs restore private search, Compact view, filters and nonzero list scroll on mobile", async ({ page, baseURL }, info) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  const blocked = await boundary(page, baseURL);
  await page.goto("/events?in=frederick&lens=week&free=true", { waitUntil: "domcontentloaded" });
  const board = page.locator("[data-events-interaction-ready]");
  const declaredLinks = board.locator('a[href^="/events/declared-tab-continuity-"]');
  const expectedHrefs = Array.from({ length: 32 }, (_, index) => `/events/declared-tab-continuity-${index}`).sort();
  const display = page.locator(".eb-display-options > summary");
  await expect(board).toHaveAttribute("data-events-interaction-ready", "true");
  const filter = page.getByRole("button", { name: /^Filters/ });
  const dialog = page.getByRole("dialog", { name: "Event filters" });
  await filter.tap();
  await dialog.getByRole("tab", { name: "What", exact: true }).tap();
  await dialog.getByRole("textbox", { name: "Filter the events shown" }).fill(eventQuery);
  await dialog.getByRole("button", { name: "Done", exact: true }).tap();
  await expect(dialog).toBeHidden();
  await display.tap();
  await page.getByRole("button", { name: "Compact view", exact: true }).tap();
  await expect(board).toHaveAttribute("data-events-complete", "true");
  await expect(declaredLinks).toHaveCount(32);
  expect(await declaredLinks.evaluateAll(links => links.map(link => link.getAttribute("href")).sort())).toEqual(expectedHrefs);
  await expect(display).toHaveAccessibleName(/Compact view/);
  await expect(filter).toHaveAccessibleName(new RegExp(eventQuery));
  await expect(page.locator("[data-event-filter-scope]")).toHaveText("Frederick City");
  await expect(page.locator("[data-event-filter-time]")).toHaveText("Later this week");
  const eventsHref = page.url();
  expect(new URL(eventsHref).searchParams.get("free")).toBe("true");
  expect(new URL(eventsHref).searchParams.has("q")).toBe(false);
  // Exact position is established before the touch on the fixed tab bar.
  // The navigation action must not scroll an off-screen target into view.
  await page.evaluate(() => window.scrollTo(0, 600));
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(600);
  const before = await page.evaluate(() => window.scrollY);
  await tabs(page).getByRole("link", { name: "Map", exact: true }).tap();
  await expect(search(page)).toBeVisible({ timeout: 30_000 });
  await tabs(page).getByRole("link", { name: "Events", exact: true }).tap();
  await expect(page).toHaveURL(eventsHref);
  await expect(board).toHaveAttribute("data-events-interaction-ready", "true");
  await expect(board).toHaveAttribute("data-events-complete", "true");
  await expect(display).toHaveAccessibleName(/Compact view/);
  await expect(filter).toHaveAccessibleName(new RegExp(eventQuery));
  await expect(declaredLinks).toHaveCount(32);
  expect(await declaredLinks.evaluateAll(links => links.map(link => link.getAttribute("href")).sort())).toEqual(expectedHrefs);
  await expect(page.locator("[data-event-filter-scope]")).toHaveText("Frederick City");
  await expect(page.locator("[data-event-filter-time]")).toHaveText("Later this week");
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(before);
  const settled = await page.evaluate(async () => {
    await new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
    return window.scrollY;
  });
  expect(settled).toBe(before);
  expect(await page.evaluate(() => sessionStorage.getItem("fr:primary-tabs:v1"))).not.toContain(eventQuery);
  expect(blocked).not.toContain("Exceeded declared two-read event fixture boundary");
  await info.attach("events-tab-mobile-continuity", { contentType: "application/json", body: JSON.stringify({
    width: 390, eventsHref, query: "Declared fictional event search", view: "compact", before, settled, blocked,
    scope: "Actual mobile touch tab navigation with 32 declared loopback browse DTOs and a two-read maximum; no event detail or provider traffic." }) });
});
registerWebkitLoopbackDocumentSeam();
