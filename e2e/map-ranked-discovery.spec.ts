import { readFile } from "node:fs/promises";
import { expect, test, type Locator, type Page, type TestInfo } from "@playwright/test";
import { MAPBOX_FIELD_GUIDE_CONFIG } from "../src/components/map/mapboxFieldGuideStyle";
import type { SearchResult } from "../src/lib/search/index";

/** Only provider transport is controlled. Catalog, search, source qualifiers,
 * selection, history and planner actions use the shipped application. The
 * quiet background has no invented geography and is never public-map proof. */
async function controlledBasemap(page: Page, baseURL: string | undefined) {
  if (!baseURL || !["localhost", "127.0.0.1"].includes(new URL(baseURL).hostname)) {
    throw new Error("Controlled local basemap journeys require a loopback server.");
  }
  let styleRequests = 0;
  const schema = Object.fromEntries(Object.entries(MAPBOX_FIELD_GUIDE_CONFIG.basemap).map(([key, value]) => [key, { default: value, type: typeof value === "boolean" ? "boolean" : "string" }]));
  await page.route(/https:\/\/(?:api|events)\.mapbox\.com\//, async (route) => {
    const url = new URL(route.request().url());
    if (url.hostname === "events.mapbox.com") return route.fulfill({ status: 204 });
    if (url.pathname === "/map-sessions/v1") return route.fulfill({ json: {} });
    if (url.pathname.startsWith("/styles/v1/")) {
      styleRequests += 1;
      return route.fulfill({ json: {
        version: 8, name: "Controlled local Radius UI transport", sources: {},
        glyphs: `${baseURL}/basemap/fonts/Noto%20Sans%20Regular/{range}.pbf`,
        imports: [{ id: "basemap", url: "", data: { version: 8, schema, sources: {}, layers: [
          { id: "local-background", type: "background", paint: { "background-color": "#F4EEE2" } },
          { id: "bottom", type: "slot" }, { id: "middle", type: "slot" }, { id: "top", type: "slot" },
        ] } }], layers: [], transition: { duration: 0 },
      } });
    }
    if (url.pathname.includes("mapbox.mapbox-terrain-dem-v1")) {
      return route.fulfill({ json: { tilejson: "2.2.0", tiles: [`${baseURL}/controlled-local-terrain/{z}/{x}/{y}.png`], bounds: [0, 0, .01, .01], minzoom: 0, maxzoom: 14 } });
    }
    const range = url.pathname.match(/(\d+-\d+)\.pbf$/)?.[1];
    if (range) return route.fulfill({ contentType: "application/x-protobuf", body: await readFile(`public/basemap/fonts/Noto Sans Regular/${range}.pbf`) });
    throw new Error(`Unexpected provider transport in bounded map proof: ${url.pathname}`);
  });
  return () => styleRequests;
}

async function forceRendererFallback(page: Page) {
  await page.addInitScript(() => {
    const original = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (this: HTMLCanvasElement, type: string, ...args: unknown[]) {
      if (/webgl/.test(type)) return null;
      return original.call(this, type as "2d", ...args);
    } as typeof original;
  });
}

async function noLocationPrompt(page: Page, dismissed = true) {
  await page.addInitScript(({ dismissed }) => {
    if (dismissed) localStorage.setItem("fr_map_location_intro_v1", "dismissed");
    (window as typeof window & { __rankedGeoCalls: number }).__rankedGeoCalls = 0;
    for (const key of ["getCurrentPosition", "watchPosition"] as const) {
      Object.defineProperty(navigator.geolocation, key, { configurable: true, value: () => {
        (window as typeof window & { __rankedGeoCalls: number }).__rankedGeoCalls += 1;
        return 0;
      } });
    }
  }, { dismissed });
}

function captureApplicationErrors(page: Page) {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error" && !/Failed to load resource|WebGL.*not supported|Failed to initialize WebGL/i.test(message.text())) errors.push(message.text());
  });
  return errors;
}

async function expectHealthyMap(page: Page) {
  await expect(page.locator(".dock-host")).toHaveAttribute("data-map-loaded", "true", { timeout: 30_000 });
  await expect(page.locator(".dock-host")).not.toHaveAttribute("data-map-error", "true");
  await expect(page.locator("canvas.mapboxgl-canvas")).toBeVisible();
}

async function submit(page: Page, query: string) {
  const search = page.getByRole("combobox", { name: /^(Search this map|Search Frederick Radius)$/ });
  const response = page.waitForResponse((response) => {
    const url = new URL(response.url());
    return url.pathname === "/api/search" && url.searchParams.get("q") === query;
  });
  await search.fill(query);
  await search.press("Enter");
  return response;
}

async function rowIds(page: Page) {
  return page.locator("[data-map-list-peek]:visible [data-map-list-place], [data-map-list-peek]:visible [data-map-list-event], [data-map-list-peek]:visible [data-map-list-event-link]").evaluateAll((rows) => rows.map((row) => row.hasAttribute("data-map-list-place") ? `place:${row.getAttribute("data-map-list-place")}` : `event:${row.getAttribute("data-map-list-event") ?? row.getAttribute("data-map-list-event-link")}`));
}

async function clearTarget(locator: Locator) {
  await expect(locator).toBeVisible();
  const measured = await locator.evaluate((element) => {
    const box = element.getBoundingClientRect();
    return { height: box.height, width: box.width, centerHits: element.contains(document.elementFromPoint(box.x + box.width / 2, box.y + box.height / 2)) };
  });
  expect(Math.round(measured.height)).toBeGreaterThanOrEqual(44);
  expect(Math.round(measured.width)).toBeGreaterThanOrEqual(44);
  expect(measured.centerHits).toBe(true);
}

async function capture(page: Page, info: TestInfo, name: string) {
  await page.evaluate(() => document.fonts.ready);
  await expect(page.locator(".map-peek-visual[data-loading=\"true\"]")).toHaveCount(0);
  await expect(page.locator("[data-map-peek-photo-state=loading]")).toHaveCount(0);
  await expect.poll(() => page.locator(".map-peek-body img").evaluateAll(images => images.every(image => (image as HTMLImageElement).complete))).toBe(true);
  const media = await page.locator(".map-peek-body img").evaluateAll(images => images.map(image => ({ alt: (image as HTMLImageElement).alt, naturalWidth: (image as HTMLImageElement).naturalWidth, complete: (image as HTMLImageElement).complete })));
  await info.attach(`${name}-settled-media`, { body: JSON.stringify(media), contentType: "application/json" });
  const path = info.outputPath(`${name}.png`);
  await page.screenshot({ path, fullPage: false });
  await info.attach(name, { path, contentType: "image/png" });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
}

for (const width of [320, 390, 1440]) {
  test(`Controlled local basemap ranks real Coffee choices and restores selection at ${width}px`, async ({ page, baseURL }, info) => {
    test.setTimeout(60_000);
    await page.setViewportSize({ width, height: width >= 1024 ? 960 : width === 320 ? 568 : 844 });
    await page.emulateMedia({ reducedMotion: "reduce" });
    const styleRequests = await controlledBasemap(page, baseURL);
    const errors = captureApplicationErrors(page);
    await noLocationPrompt(page);
    await page.goto("/map?in=county&layers=parks", { waitUntil: "domcontentloaded" });
    await expectHealthyMap(page);
    const search = page.getByRole("combobox", { name: "Search this map", exact: true });
    await search.fill("coffee");
    await search.press("Enter");
    const list = page.locator("[data-map-list-peek]:visible");
    await expect(list).toBeVisible();
    await expect(page.locator("[data-map-list-place]:visible")).toHaveCount(5);
    await expect(list).toContainText("Hours not confirmed");
    await expect(list).toContainText("Coffee shops and bakeries");
    const first = list.locator("[data-map-list-place]").first();
    await expect(first).toHaveAttribute("data-leading", "true");
    await clearTarget(first);
    expect(await first.evaluate(element => getComputedStyle(element).transitionDuration.split(",").every(duration => Number.parseFloat(duration) <= .001))).toBe(true);
    expect(new URL(page.url()).searchParams.get("place")).toBeNull();
    expect(await page.locator("[data-location-chip]").count()).toBe(1);
    await capture(page, info, `controlled-local-ranked-first-${width}`);
    const slug = await first.getAttribute("data-map-list-place");
    await first.focus();
    await page.keyboard.press("Enter");
    await expect(page.locator(`.map-peek-body[data-map-place-slug="${slug}"]`)).toBeVisible();
    await expect.poll(() => new URL(page.url()).searchParams.get("place")).toBe(slug);
    await capture(page, info, `controlled-local-selected-${width}`);
    await page.goBack();
    await expect(list).toBeVisible();
    await expect(first).toBeFocused();
    expect(new URL(page.url()).searchParams.get("intent")).toBe("coffee");
    expect(new URL(page.url()).searchParams.get("in")).toBe("county");
    expect(new URL(page.url()).searchParams.get("layers")).toBe("parks");
    await page.goForward();
    await expect(page.locator(`.map-peek-body[data-map-place-slug="${slug}"]`)).toBeVisible();
    expect(styleRequests()).toBeGreaterThan(0);
    expect(errors).toEqual([]);
  });
}

test("Controlled local basemap keeps typed operational and town requests qualified without location consent", async ({ page, baseURL }) => {
  await controlledBasemap(page, baseURL);
  await noLocationPrompt(page);
  const fallbackRequests: string[] = [];
  page.on("request", request => { if (new URL(request.url()).pathname === "/api/map/search-fallback") fallbackRequests.push(request.url()); });
  await page.goto("/map", { waitUntil: "domcontentloaded" });
  await expectHealthyMap(page);
  for (const query of ["open now near me", "open late", "coffee open now", "coffee in Brunswick"]) {
    const response = await submit(page, query);
    expect(response.status()).toBe(200);
    await expect.poll(() => new URL(page.url()).searchParams.get("q")).toBe(query);
    expect(new URL(page.url()).searchParams.get("task")).toBeNull();
    expect(new URL(page.url()).searchParams.get("intent")).toBeNull();
    const list = page.locator("[data-map-list-peek]:visible");
    await expect(list).toBeVisible();
    if (query === "open now near me") {
      await expect(list).toContainText("Your location is needed for this search.");
      expect(new URL(response.url()).searchParams.has("lat")).toBe(false);
      expect(new URL(response.url()).searchParams.has("lng")).toBe(false);
      await expect(list.locator("[data-map-list-place]")).toHaveCount(0);
    }
    await expect(list).not.toContainText("from you");
  }
  expect(await page.evaluate(() => (window as typeof window & { __rankedGeoCalls: number }).__rankedGeoCalls)).toBe(0);
  expect(fallbackRequests).toEqual([]);
});

test("Controlled local basemap retains canonical event-only and mixed query rows in server order", async ({ page, baseURL }) => {
  await controlledBasemap(page, baseURL);
  await noLocationPrompt(page);
  await page.goto("/map?in=county", { waitUntil: "domcontentloaded" });
  await expectHealthyMap(page);
  for (const query of ["music", "events"]) {
    const response = await submit(page, query);
    const body = await response.json() as { results: SearchResult[] };
    const canonical = body.results.filter(result => result.type === "place" || result.type === "event");
    expect(canonical.some(result => result.type === "event")).toBe(true);
    const list = page.locator("[data-map-list-peek]:visible");
    await expect.poll(() => rowIds(page)).toEqual(canonical.slice(0, 5).map(result => result.id));
    await expect(list).not.toContainText("Nothing on this map matches");
    expect(new URL(page.url()).searchParams.get("event")).toBeNull();
    expect(new URL(page.url()).searchParams.get("place")).toBeNull();
    const direct = list.locator("[data-map-list-event-link]").first();
    if (await direct.count()) {
      const href = new URL((await direct.getAttribute("href"))!, "https://example.test");
      expect(href.pathname).toMatch(/^\/events\//);
      expect(new URL(href.searchParams.get("returnTo")!, "https://example.test").searchParams.get("q")).toBe(query);
      await expect(direct).toContainText("Confirm with the organizer");
    }
  }
});

test("Controlled local basemap offers an honest tonight window without weakening typed late requests", async ({ page, baseURL }) => {
  await controlledBasemap(page, baseURL);
  await noLocationPrompt(page);
  await page.goto("/map", { waitUntil: "domcontentloaded" });
  await expectHealthyMap(page);
  const search = page.getByRole("combobox", { name: "Search this map" });
  await search.fill("events tonight");
  await search.press("Enter");
  await expect.poll(() => new URL(page.url()).searchParams.get("t")).toBe("tonight");
  expect(new URL(page.url()).searchParams.get("q")).toBeNull();
  const list = page.locator("[data-map-list-peek]:visible");
  await expect(list).toBeVisible();
  await expect(list).toContainText("Tonight");
  await expect(list).not.toContainText("Hours not confirmed");
  await expect(list.getByText("Searching Radius…", { exact: true })).toHaveCount(0, { timeout: 15_000 });
  if (await list.getByRole("button", { name: "Try again", exact: true }).count()) {
    await expect(list).toContainText("Unable to verify event listings");
    await expect(list).not.toContainText("0 events");
  }
});

test("Controlled local basemap leaves first-use consent with the one header location control", async ({ page, baseURL }) => {
  await controlledBasemap(page, baseURL);
  await noLocationPrompt(page, false);
  await page.goto("/map", { waitUntil: "domcontentloaded" });
  await expectHealthyMap(page);
  const choice = page.getByRole("group", { name: "Choose how to begin on the map" });
  await expect(choice).toBeVisible();
  await expect(page.getByText("Use your location for honest distances, or keep browsing the county.", { exact: true })).toBeVisible();
  expect(await page.evaluate(() => (window as typeof window & { __rankedGeoCalls: number }).__rankedGeoCalls)).toBe(0);
  await choice.getByRole("button", { name: "Browse county", exact: true }).click();
  await expect(choice).toHaveCount(0);
  expect(await page.locator("[data-location-chip]").count()).toBe(1);
  await page.getByRole("button", { name: "Choose what to see on this map" }).click();
  const chooser = page.getByRole("region", { name: "Choose what to see" });
  await expect(chooser.getByRole("button", { name: "Nearby", exact: true })).toHaveCount(0);
  await expect(chooser.getByRole("button", { name: /^Categories/ })).toBeVisible();
});

/** A provider can leave a style request pending without an error callback.
 * Hold only its transport on loopback, then exercise the actual app watchdog
 * and catalog search. The public provider is never substituted by this case. */
test("Controlled local pending style falls back to ranked search within the usable-surface budget", async ({ page, baseURL }, info) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await controlledBasemap(page, baseURL);
  await noLocationPrompt(page);
  let releaseStyle!: () => void;
  const styleReleased = new Promise<void>(resolve => { releaseStyle = resolve; });
  let heldStyles = 0;
  const styleRoute = /https:\/\/api\.mapbox\.com\/styles\/v1\//;
  await page.route(styleRoute, async route => {
    heldStyles += 1;
    await styleReleased;
    await route.abort("timedout");
  });
  const query = "coffee in Brunswick";
  const canonicalResponse = page.waitForResponse(response => {
    const url = new URL(response.url());
    return url.pathname === "/api/search" && url.searchParams.get("q") === query;
  });
  const started = Date.now();
  try {
    await page.goto(`/map?in=brunswick&q=${encodeURIComponent(query)}`, { waitUntil: "domcontentloaded" });
    await expect.poll(() => heldStyles).toBeGreaterThan(0);
    await expect(page.locator(".dock-host")).toHaveAttribute("data-map-error", "true", {
      timeout: Math.max(1, 15_000 - (Date.now() - started)),
    });
    expect(Date.now() - started).toBeLessThanOrEqual(15_000);
    const response = await canonicalResponse;
    expect(response.status()).toBe(200);
    const canonical = (await response.json() as { results: SearchResult[] }).results.filter(result => result.type === "place");
    expect(canonical.length).toBeGreaterThan(0);
    const list = page.getByRole("region", { name: "Available results without the map", exact: true });
    await expect(list).toBeVisible();
    await expect.poll(() => rowIds(page)).toEqual(canonical.slice(0, 5).map(result => result.id));
    await expect(list).toContainText("Brunswick");
    await expect(list).toContainText("Hours not confirmed");
    await capture(page, info, "controlled-local-pending-style-fallback");
    const first = list.locator("[data-map-list-place]").first();
    const slug = await first.getAttribute("data-map-list-place");
    await clearTarget(first);
    await first.focus();
    await page.keyboard.press("Enter");
    await expect(page.locator(`.map-peek-body[data-map-place-slug="${slug}"]`)).toBeVisible();
    await page.goBack();
    await expect(first).toBeFocused();
    expect(new URL(page.url()).searchParams.get("q")).toBe(query);
    expect(new URL(page.url()).searchParams.get("in")).toBe("brunswick");
    await expect(page.getByRole("button", { name: "Reload map", exact: true })).toBeVisible();
  } finally {
    releaseStyle();
    await page.unroute(styleRoute);
  }
});

test("Controlled local renderer outage keeps query and rank through an actual search failure and retry", async ({ page, baseURL }, info) => {
  await controlledBasemap(page, baseURL);
  await noLocationPrompt(page);
  await forceRendererFallback(page);
  let rejectNextSearch = true;
  let injectedFailures = 0;
  await page.route("**/api/search?**", async route => {
    if (new URL(route.request().url()).searchParams.get("q") === "coffee in Brunswick" && rejectNextSearch) {
      rejectNextSearch = false;
      injectedFailures += 1;
      return route.fulfill({ status: 503, json: { error: "Controlled search outage" } });
    }
    return route.continue();
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/map?in=brunswick", { waitUntil: "domcontentloaded" });
  await expect(page.locator(".dock-host")).toHaveAttribute("data-map-error", "true");
  const response = await submit(page, "coffee in Brunswick");
  expect(response.status()).toBe(503);
  const list = page.getByRole("region", { name: "Available results without the map", exact: true });
  await expect(list).toContainText("Unable to verify the full search");
  await expect(list).not.toContainText("0 places");
  const retried = page.waitForResponse(response => new URL(response.url()).pathname === "/api/search" && new URL(response.url()).searchParams.get("q") === "coffee in Brunswick" && response.status() === 200);
  await list.getByRole("button", { name: "Try again", exact: true }).click();
  const canonical = (await (await retried).json() as { results: SearchResult[] }).results.filter(result => result.type === "place");
  expect(canonical.length).toBeGreaterThan(0);
  await expect.poll(() => rowIds(page)).toEqual(canonical.slice(0, 5).map(result => result.id));
  await expect(list).toContainText("Brunswick");
  await expect(list).not.toContainText("Market Street Boba Beans");
  await expect(list).toContainText("Hours not confirmed");
  expect(new URL(page.url()).searchParams.get("q")).toBe("coffee in Brunswick");
  expect(new URL(page.url()).searchParams.get("in")).toBe("brunswick");
  expect(injectedFailures).toBe(1);
  await capture(page, info, "controlled-local-forced-fallback");
});

test("Controlled local empty map answer preserves exact origin through full search and Back", async ({ page, baseURL }) => {
  await controlledBasemap(page, baseURL);
  await noLocationPrompt(page);
  await forceRendererFallback(page);
  const query = "unlisted-qa-927451";
  const completed = page.waitForResponse(response => new URL(response.url()).pathname === "/api/search" && new URL(response.url()).searchParams.get("q") === query);
  await page.goto(`/map?q=${query}&in=brunswick&area=brunswick,-77.64,39.30,-77.61,39.33&c=-77.63,39.31,14&layers=parks`, { waitUntil: "domcontentloaded" });
  const body = await (await completed).json() as { results: SearchResult[]; meta?: { liveEventsUnavailable?: boolean } };
  expect(body.results.filter(result => result.type === "place" || result.type === "event")).toEqual([]);
  const list = page.getByRole("region", { name: "Available results without the map", exact: true });
  const sourceMessage = body.meta?.liveEventsUnavailable ? "Unable to verify the full search" : "Nothing matches in this part of the map.";
  await expect(list).toContainText(sourceMessage);
  if (body.meta?.liveEventsUnavailable) await expect(list).not.toContainText("0 places");
  const all = list.getByRole("link", { name: "Search all of Radius", exact: true });
  await expect(all).toBeVisible();
  const origin = new URL((await all.getAttribute("href"))!, "https://example.test").searchParams.get("returnTo")!;
  const originUrl = new URL(origin, "https://example.test");
  expect(originUrl.searchParams.get("q")).toBe(query);
  expect(originUrl.searchParams.get("in")).toBe("brunswick");
  expect(originUrl.searchParams.get("area")).toBe("brunswick,-77.64,39.30,-77.61,39.33");
  expect(originUrl.searchParams.get("layers")).toBe("parks");
  expect(originUrl.searchParams.get("c")).toBeTruthy();
  await all.click();
  const back = page.getByRole("link", { name: "Back to the map", exact: true });
  await expect(back).toHaveAttribute("href", origin);
  await back.click();
  await expect.poll(() => { const url = new URL(page.url()); return `${url.pathname}${url.search}${url.hash}`; }).toBe(origin);
  await expect(page.getByRole("combobox", { name: "Search Frederick Radius", exact: true })).toHaveValue(query);
  await expect(list).toContainText(sourceMessage);
});

test("Controlled local basemap leaves the planner compact stops map free of browse search and geolocation", async ({ page, baseURL }) => {
  await controlledBasemap(page, baseURL);
  await noLocationPrompt(page);
  await page.goto("/plan?place=beans-in-the-belfry-brunswick&in=brunswick", { waitUntil: "domcontentloaded" });
  await expect(page.getByRole("list", { name: "Plan stops, in order" }).getByRole("heading", { name: "Beans in the Belfry", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Show stops on map", exact: true }).click();
  const region = page.getByRole("region", { name: "Stops on the map", exact: true });
  await expect(region.getByText("Loading your stops map…", { exact: true })).toHaveCount(0, { timeout: 30_000 });
  await expect(region.locator("canvas")).toBeVisible();
  await expect(region.locator("[data-map-dock], [data-map-list-peek]")).toHaveCount(0);
  await expect(region.getByRole("combobox")).toHaveCount(0);
  expect(await page.evaluate(() => (window as typeof window & { __rankedGeoCalls: number }).__rankedGeoCalls)).toBe(0);
});


test("Controlled local basemap restores a real committed area's rows through selection Back and clears its cutoff on reset", async ({ page, request, baseURL }) => {
  await controlledBasemap(page, baseURL);
  const errors = captureApplicationErrors(page);
  await noLocationPrompt(page);
  const catalog = await (await request.get("/api/map/places")).json() as { places: Array<{ slug: string; category: string; geom: { lng: number; lat: number }; municipality?: string }> };
  const target = catalog.places.find(p => p.category === "coffee" && p.municipality === "brunswick")!;
  expect(target).toBeTruthy();
  const bounds = { west: target.geom.lng - .0005, east: target.geom.lng + .0005, south: target.geom.lat - .0005, north: target.geom.lat + .0005 };
  const area = `county,${bounds.west},${bounds.south},${bounds.east},${bounds.north}`;
  const expected = catalog.places.filter(p => ["coffee", "bakery"].includes(p.category) && p.geom.lng >= bounds.west && p.geom.lng <= bounds.east && p.geom.lat >= bounds.south && p.geom.lat <= bounds.north).map(p => `place:${p.slug}`).sort();
  expect(expected.length).toBeGreaterThan(0);
  expect(expected.length).toBeLessThanOrEqual(5);
  await page.goto(`/map?in=county&intent=coffee&area=${area}&c=${target.geom.lng},${target.geom.lat},16&layers=parks`, { waitUntil: "domcontentloaded" });
  await expectHealthyMap(page);
  const list = page.locator("[data-map-list-peek]:visible");
  await expect(list).toContainText("This area");
  await expect.poll(async () => (await rowIds(page)).sort()).toEqual(expected);
  const first = list.locator("[data-map-list-place]").first();
  const slug = await first.getAttribute("data-map-list-place");
  await first.click();
  await expect(page.locator(`.map-peek-body[data-map-place-slug="${slug}"]`)).toBeVisible();
  await page.goBack();
  await expect(first).toBeFocused();
  expect(new URL(page.url()).searchParams.get("area")).toBe(area);
  await expect.poll(async () => (await rowIds(page)).sort()).toEqual(expected);
  await page.getByRole("button", { name: "Choose what to see on this map" }).click();
  await page.getByRole("region", { name: "Choose what to see", exact: true }).getByRole("button", { name: "Reset", exact: true }).click();
  await expect.poll(() => new URL(page.url()).searchParams.get("area")).toBeNull();
  expect(new URL(page.url()).searchParams.get("intent")).toBeNull();
  await page.getByRole("combobox", { name: "Search this map", exact: true }).fill("coffee");
  await page.getByRole("combobox", { name: "Search this map", exact: true }).press("Enter");
  await expect(page.locator("[data-map-list-place]:visible")).toHaveCount(5);
  await expect(list).toContainText("Whole county");
  expect(await page.evaluate(() => (window as typeof window & { __rankedGeoCalls: number }).__rankedGeoCalls)).toBe(0);
  expect(errors).toEqual([]);
});


/** Provider bytes are deliberately controlled; the selected catalog record,
 * reviewed source metadata, map card, actions and renderer are real. These
 * captures verify media readiness only, never the identity of a live photo. */
for (const outcome of ["success", "failure"] as const) {
  test(`Controlled local photo transport ${outcome} keeps map imagery and credits together`, async ({ page, baseURL, request }, info) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await controlledBasemap(page, baseURL);
    await noLocationPrompt(page);
    const slug = "gravel-and-grind-frederick";
    const metadataResponse = await request.get(`/api/places/map-card/${slug}`);
    expect(metadataResponse.status()).toBe(200);
    const { place } = await metadataResponse.json() as { place: {
      slug: string;
      google_photo_url?: string;
      google_photo_attribution?: { photo_name: string; authors: Array<{ display_name: string; uri?: string }> };
    } };
    expect(place.slug).toBe(slug);
    expect(place.google_photo_url).toBeTruthy();
    const actualSource = new URL(place.google_photo_url!, baseURL);
    expect(place.google_photo_attribution?.photo_name).toBe(actualSource.searchParams.get("name"));
    expect(place.google_photo_attribution?.authors.length).toBeGreaterThan(0);
    let releaseBytes!: () => void;
    let observedRequest!: () => void;
    const bytesReleased = new Promise<void>(resolve => { releaseBytes = resolve; });
    const requestObserved = new Promise<void>(resolve => { observedRequest = resolve; });
    let exactRequests = 0;
    await page.route("**/api/place-photo?**", async route => {
      const url = new URL(route.request().url());
      if (url.searchParams.get("name") !== actualSource.searchParams.get("name")) return route.continue();
      exactRequests += 1;
      expect(url.searchParams.get("fallback")).toBe("signal");
      observedRequest();
      await bytesReleased;
      if (outcome === "failure") {
        return route.fulfill({ contentType: "image/gif", headers: { "X-Photo-Fallback": "controlled-local-qa" }, body: Buffer.from("R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7", "base64") });
      }
      return route.fulfill({ contentType: "image/webp", body: await readFile("public/from-above/photos/pg-046-3317@800.webp") });
    });
    await page.goto(`/map?in=county&intent=coffee&place=${slug}`, { waitUntil: "domcontentloaded" });
    await expectHealthyMap(page);
    await requestObserved;
    const card = page.locator(`.map-peek-body[data-map-place-slug="${slug}"]`);
    await expect(card).toBeVisible();
    await expect(card.locator("[data-map-peek-photo-state=loading]")).toBeVisible();
    await expect(page.locator(".map-peek-source-credit")).toHaveCount(0);
    await expect(card.getByRole("img", { name: "Photo of Gravel & Grind" })).toHaveCount(0);
    releaseBytes();
    if (outcome === "failure") {
      await expect(card.locator("[data-map-peek-photo-state=failed]")).toBeVisible();
      await expect(card.locator("img")).toHaveCount(0);
      await expect(page.locator(".map-peek-source-credit")).toHaveCount(0);
    } else {
      const image = card.getByRole("img", { name: "Photo of Gravel & Grind" });
      await expect(image).toHaveAttribute("data-map-peek-photo-state", "ready");
      expect(await image.evaluate(element => {
        const image = element as HTMLImageElement;
        return image.naturalWidth > 1 && image.naturalHeight > 1;
      })).toBe(true);
      await expect(page.locator(".map-peek button a")).toHaveCount(0);
      const credits = page.locator(".map-peek-source-credit");
      for (const author of place.google_photo_attribution!.authors) {
        await expect(credits).toContainText(author.display_name);
        if (author.uri) {
          const link = credits.getByRole("link", { name: author.display_name, exact: true });
          await expect(link).toHaveAttribute("href", author.uri);
          await clearTarget(link);
          await link.focus();
          await expect(link).toBeFocused();
        }
      }
      await clearTarget(credits.getByRole("link", { name: "Google Maps", exact: true }));
    }
    expect(exactRequests).toBe(1);
    await clearTarget(card.getByRole("button", { name: "Open details for Gravel & Grind", exact: true }));
    await expect(card.getByRole("button", { name: "Details", exact: true })).toBeVisible();
    await capture(page, info, `controlled-local-photo-${outcome}-fixture-bytes`);
  });
}
