import { expect, test, type Locator, type Page, type Route, type TestInfo } from "@playwright/test";
import catalog from "../src/data/places-client.json";

const creekSlug = "carroll-creek-linear-park-frederick";
const bakerSlug = "baker-park-frederick";
const places = [creekSlug, bakerSlug].map(slug => catalog.find(place => place.slug === slug)!);
const returnTo = "/search?q=park&in=frederick&kind=place";
const mapUrl = `/map?q=park&in=frederick&c=-77.4100,39.4150,14.0&returnTo=${encodeURIComponent(returnTo)}`;

type DeferredLookup = {
  slug: string;
  finish: (result: "full" | "unavailable") => void;
  done: Promise<void>;
};

/** Loopback acceptance of the real map recovery, sheet, focus and history.
 * The map/search/by-slugs boundaries use committed catalog records and an
 * explicitly unknown hours verdict. WebGL is unavailable in this fixture.
 * Only existing bundled photographs can load; all provider traffic and writes
 * are blocked. This is not a live map-renderer or business-data audit. */
async function installBoundary(page: Page, baseURL: string | undefined, info: TestInfo) {
  if (!baseURL || !["localhost", "127.0.0.1"].includes(new URL(baseURL).hostname)) {
    throw new Error("Seeded-sheet continuity requires an explicit loopback server.");
  }
  const origin = new URL(baseURL).origin;
  const localWebKit = page.context().browser()?.browserType().name() === "webkit" && new URL(baseURL).protocol === "http:";
  const localCspAdjustments: Array<{ before: string; after: string }> = [];
  const lookups: DeferredLookup[] = [];
  const requests: string[] = [];
  const blocked: string[] = [];
  const pageErrors: string[] = [];
  page.on("pageerror", error => pageErrors.push(error.message));
  info.annotations.push({ type: "scope", description: "Real application recovery list, selected card, owned local photo, sheet and native Back. Controlled loopback catalog transport; WebGL unavailable; no external/provider requests or writes." });
  await page.context().addCookies([{ name: "fr_onboarded", value: "1", domain: new URL(baseURL).hostname, path: "/" }]);
  await page.addInitScript(() => {
    localStorage.setItem("fr_map_location_intro_v1", "dismissed");
    localStorage.setItem("fr:return-bridge:v1", JSON.stringify({ sessions: 0, lastSessionAt: 0, valueKind: null, valueAt: 0, dismissals: 1, snoozedUntil: 0, autoDisabled: true, completed: false, lastOfferAt: 0 }));
    const original = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (this: HTMLCanvasElement, type: string, ...args: unknown[]) {
      if (/webgl/.test(type)) return null;
      return original.call(this, type as "2d", ...args);
    } as typeof original;
  });
  await page.route("**/*", async (route: Route) => {
    const request = route.request(), url = new URL(request.url());
    requests.push(`${request.method()} ${url.pathname}`);
    if (url.origin !== origin || !["GET", "HEAD"].includes(request.method())) {
      blocked.push(`${request.method()} ${url.hostname}${url.pathname}`);
      return route.abort("blockedbyclient");
    }
    if (localWebKit && request.isNavigationRequest() && request.resourceType() === "document") {
      // Production's HTTPS upgrade is correct publicly, but HTTP loopback
      // WebKit can apply it despite bypassCSP. Keep actual document bytes,
      // every other header, and every other CSP directive unchanged.
      const response = await route.fetch();
      const headers = response.headers();
      if (headers["content-security-policy"]) {
        const before = headers["content-security-policy"];
        const after = before.split(";").filter(part => part.trim().toLowerCase() !== "upgrade-insecure-requests").join(";");
        if (before !== after) { headers["content-security-policy"] = after;localCspAdjustments.push({ before, after }); }
      }
      return route.fulfill({ response, headers });
    }
    if (url.pathname === "/api/auth/me") return route.fulfill({ json: { user: null } });
    if (url.pathname === "/api/map/places") {
      return route.fulfill({ json: { generatedAt: new Date().toISOString(), places: places.map(place => ({
        slug: place.slug, name: place.name, category: place.category, geom: place.geom,
        municipality: place.municipality, source: place.source, is_verified: place.is_verified,
        field_notes: place.field_notes, short_blurb: place.short_blurb, primary_type: place.primary_type,
        open_status: { state: "unknown" },
      })) } });
    }
    if (url.pathname === "/api/search") {
      return route.fulfill({ json: { results: places.map(place => ({
        type: "place", id: `place:${place.slug}`, title: place.name, subtitle: place.municipality,
        href: `/places/${place.slug}`, lng: place.geom.lng, lat: place.geom.lat,
      })) } });
    }
    if (url.pathname === "/api/places/by-slugs") {
      const slug = url.searchParams.get("slugs") ?? "";
      expect(places.some(place => place.slug === slug)).toBe(true);
      let finish!: DeferredLookup["finish"], finishDone!: () => void;
      const result = new Promise<"full" | "unavailable">(resolve => { finish = resolve; });
      const done = new Promise<void>(resolve => { finishDone = resolve; });
      lookups.push({ slug, finish, done });
      try {
        const outcome = await result;
        if (outcome === "unavailable") await route.fulfill({ status: 503, json: { error: "Metadata unavailable in the offline continuity fixture" } });
        else await route.fulfill({ json: { places: [{ ...places.find(place => place.slug === slug), open_status: { state: "unknown" } }] } });
      } catch (error) {
        // A real Back dismissal aborts the lookup. Releasing the held response
        // afterward must neither reopen a sheet nor leave an unhandled route.
        if (!/closed|cancel|abort|invalid interception|already handled/i.test(String(error))) throw error;
      } finally { finishDone(); }
      return;
    }
    if (request.resourceType() === "image" || url.pathname === "/_next/image") {
      const raw = url.pathname === "/_next/image" ? url.searchParams.get("url") ?? "" : url.pathname;
      const source = new URL(raw, origin);
      if (source.origin !== origin || !["/images/", "/place-photos/", "/history-photos/", "/brand/", "/icons/"].some(prefix => source.pathname.startsWith(prefix))) {
        blocked.push(`IMAGE ${source.hostname}${source.pathname}`);
        return route.abort("blockedbyclient");
      }
      return route.continue();
    }
    if (url.pathname.startsWith("/api/")) return route.fulfill({ status: 503, json: { error: "Optional metadata unavailable in the loopback continuity fixture" } });
    return route.continue();
  });
  return {
    lookups, requests, blocked, pageErrors,
    async release(index: number, result: "full" | "unavailable") {
      await expect.poll(() => lookups.length).toBeGreaterThan(index);
      lookups[index].finish(result);
      await lookups[index].done;
    },
    releaseAll() { for (const lookup of lookups) lookup.finish("unavailable"); },
    async attach() {
      await info.attach("loopback-continuity-boundary", { body: JSON.stringify({
        scope: "Controlled loopback catalog records; unavailable optional metadata and WebGL; real application/history/owned local image. No live-provider availability claim.",
        lookups: lookups.map(lookup => lookup.slug), requests, blocked, pageErrors, localHttpWebKitCspOnly: localCspAdjustments,
      }, null, 2), contentType: "application/json" });
    },
  };
}

async function enterRecovery(page: Page) {
  await page.goto(mapUrl, { waitUntil: "domcontentloaded" });
  await expect(page.locator(".dock-host")).toHaveAttribute("data-map-error", "true", { timeout: 30_000 });
  const list = page.getByRole("region", { name: "Available results without the map", exact: true });
  await expect(list.locator("[data-map-list-place]")).toHaveCount(2);
  return list;
}

async function selectPlace(page: Page, slug: string) {
  const list = page.getByRole("region", { name: "Available results without the map", exact: true });
  await list.locator(`[data-map-list-place="${slug}"]`).click();
  const card = page.locator(".map-peek[data-map-result-surface]");
  await expect(card.locator(".map-peek-body")).toHaveAttribute("data-map-place-slug", slug);
  await expect.poll(() => new URL(page.url()).searchParams.get("place")).toBe(slug);
  return { card, details: card.getByRole("button", { name: "Details", exact: true }) };
}

async function expectSameMap(page: Page, selectedUrl: string) {
  await expect(page).toHaveURL(selectedUrl);
  await expect(page.getByRole("dialog")).toHaveCount(0);
}

async function expectPaintedSurface(surface: Locator) {
  await expect(surface).toBeVisible();
  await expect.poll(() => surface.evaluate(async element => {
    const before = element.getBoundingClientRect();
    await new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
    const after = element.getBoundingClientRect();
    const style = getComputedStyle(element);
    const ancestors: Element[] = [];
    for (let parent = element.parentElement; parent; parent = parent.parentElement) ancestors.push(parent);
    const animations = [...element.getAnimations({ subtree: true }), ...ancestors.flatMap(parent => parent.getAnimations())];
    return {
      painted: Number(style.opacity) >= .99 && style.visibility === "visible" && style.display !== "none",
      insideViewport: after.top >= -1 && after.left >= -1 && after.right <= innerWidth + 1 && after.bottom <= innerHeight + 1,
      stable: Math.abs(after.top - before.top) <= .25 && Math.abs(after.height - before.height) <= .25,
      finiteMotionFinished: animations.every(animation => animation.effect?.getComputedTiming().iterations === Infinity || ["finished", "idle"].includes(animation.playState)),
    };
  }), { message: "The actual surface is painted inside the viewport after normal entrance motion settles" })
    .toEqual({ painted: true, insideViewport: true, stable: true, finiteMotionFinished: true });
}

test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });

test("seeded Details hydrates within one sheet and native Back restores its exact map opener", async ({ page, baseURL }, info) => {
  test.setTimeout(60_000);
  const boundary = await installBoundary(page, baseURL, info);
  try {
    const list = await enterRecovery(page);
    const baseMapUrl = page.url();
    const { card, details } = await selectPlace(page, creekSlug);
    const selectedUrl = page.url();
    const image = card.locator('img[data-map-peek-photo-source="owned"]');
    await expect(image).toHaveAttribute("data-map-peek-photo-state", "ready");
    await expect.poll(() => image.evaluate(node => (node as HTMLImageElement).complete && (node as HTMLImageElement).naturalWidth > 1)).toBe(true);
    await expectPaintedSurface(card);
    const selectedScreenshot = info.outputPath("loopback-selected-creek.png");
    await page.screenshot({ path: selectedScreenshot });
    await info.attach("real-map-recovery-selected-creek", { path: selectedScreenshot, contentType: "image/png" });

    await details.click();
    const sheet = page.getByRole("dialog", { name: places[0].name, exact: true });
    await expect(sheet).toBeVisible();
    await expect(sheet.getByRole("heading", { name: places[0].name, exact: true })).toBeVisible();
    await expect(sheet.getByRole("status")).toHaveText("Loading place details…");
    await expect(page.getByRole("dialog")).toHaveCount(1);
    await expect.poll(() => boundary.lookups.length).toBe(1);
    expect(boundary.requests.some(path => path.includes("/enrich"))).toBe(false);
    await expect.poll(() => page.evaluate(() => String(history.state?.__frederickRadiusLayer ?? ""))).toMatch(/^place-sheet:/);
    await page.goBack();
    await expectSameMap(page, selectedUrl);
    await expect(details).toBeFocused();

    // Reopening the same slug creates a new session before the first request
    // is released. A slug-only guard cannot distinguish these sessions.
    await details.click();
    await expect(sheet).toBeVisible();
    await expect.poll(() => boundary.lookups.length).toBe(2);
    const layer = await page.evaluate(() => history.state.__frederickRadiusLayer);
    const historyLength = await page.evaluate(() => history.length);
    await boundary.release(0, "full");
    await expect(sheet.getByRole("status")).toHaveText("Loading place details…");
    await boundary.release(1, "full");
    await expect(sheet.getByText("Loading place details…", { exact: true })).toHaveCount(0);
    await expect(sheet.getByRole("heading", { name: places[0].name, exact: true })).toBeVisible();
    await expect(page.getByRole("dialog")).toHaveCount(1);
    expect(await page.evaluate(() => history.state.__frederickRadiusLayer)).toBe(layer);
    expect(await page.evaluate(() => history.length)).toBe(historyLength);
    await expect(page).toHaveURL(selectedUrl);
    const sheetImage = sheet.locator('[data-place-sheet-photo-source="owned"] img');
    await expect.poll(() => sheetImage.evaluate(node => (node as HTMLImageElement).complete && (node as HTMLImageElement).naturalWidth > 1)).toBe(true);
    await expectPaintedSurface(sheet.locator("[data-bottom-sheet-panel]"));
    const sheetScreenshot = info.outputPath("loopback-actual-creek-sheet.png");
    await page.screenshot({ path: sheetScreenshot });
    await info.attach("real-application-creek-sheet", { path: sheetScreenshot, contentType: "image/png" });
    await page.goBack();
    await expectSameMap(page, selectedUrl);
    await expect(details).toBeFocused();
    await page.goBack();
    await expect(page).toHaveURL(baseMapUrl);
    await expect(card).toHaveCount(0);
    await expect(list.locator(`[data-map-list-place="${creekSlug}"]`)).toBeFocused();
    expect(boundary.pageErrors).toEqual([]);
  } finally { boundary.releaseAll();await boundary.attach(); }
});

test("failed seeded metadata stays usable in the same layer without automatic enrichment or navigation", async ({ page, baseURL }, info) => {
  test.setTimeout(60_000);
  const boundary = await installBoundary(page, baseURL, info);
  try {
    await enterRecovery(page);
    const { details } = await selectPlace(page, creekSlug);
    const selectedUrl = page.url();
    await details.click();
    const sheet = page.getByRole("dialog", { name: places[0].name, exact: true });
    await expect(sheet).toBeVisible();
    await expect.poll(() => page.evaluate(() => String(history.state?.__frederickRadiusLayer ?? ""))).toMatch(/^place-sheet:/);
    const layer = await page.evaluate(() => history.state.__frederickRadiusLayer);
    await boundary.release(0, "unavailable");
    await expect(sheet.getByRole("status")).toHaveText("More details are unavailable. You can keep browsing or open the full page.");
    await expect(sheet.getByRole("heading", { name: places[0].name, exact: true })).toBeVisible();
    await expect(sheet.getByRole("link", { name: "Directions", exact: true })).toBeVisible();
    const fullPage = sheet.getByRole("link", { name: "See full page", exact: true });
    await expect(fullPage).toHaveAttribute("href", `/places/${creekSlug}?returnTo=${encodeURIComponent(new URL(selectedUrl).pathname + new URL(selectedUrl).search)}`);
    expect(boundary.requests.some(path => /\/enrich|\/events$|\/api\/place\/.*\/context/.test(path))).toBe(false);
    expect(await page.evaluate(() => history.state.__frederickRadiusLayer)).toBe(layer);
    await expect(page).toHaveURL(selectedUrl);
    await expect(page.getByRole("dialog")).toHaveCount(1);
    await page.goBack();
    await expectSameMap(page, selectedUrl);
    await expect(details).toBeFocused();
    expect(boundary.pageErrors).toEqual([]);
  } finally { boundary.releaseAll();await boundary.attach(); }
});
