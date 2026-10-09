import { expect, test, type Page } from "@playwright/test";
import catalog from "../src/data/places-client.json";

const returnTo = "/search?q=coffee&in=brunswick&kind=place";
const mapUrl = `/map?q=coffee&in=brunswick&returnTo=${encodeURIComponent(returnTo)}`;
const coffeePlaces = catalog.filter((place) =>
  (place.category === "coffee" && place.municipality === "brunswick") || place.slug === "market-street-boba-beans",
).sort((a, b) => Number(b.municipality === "brunswick") - Number(a.municipality === "brunswick"));
const localPins = coffeePlaces.map((place) => ({
  slug: place.slug, name: place.name, category: place.category,
  geom: place.geom, municipality: place.municipality,
  source: place.source, is_verified: place.is_verified,
  field_notes: place.field_notes, short_blurb: place.short_blurb,
  primary_type: place.primary_type,
  // This layout fixture makes no claim about live opening hours.
  open_status: { state: "unknown" },
}));

async function installRecoveryBoundary(page: Page, photosAvailable = false) {
  await page.addInitScript(() => {
    localStorage.setItem("fr_map_location_intro_v1", "dismissed");
    const original = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (this: HTMLCanvasElement, type: string, ...args: unknown[]) {
      if (/webgl/.test(type)) return null;
      return original.call(this, type as "2d", ...args);
    } as typeof original;
  });
  await page.route("**/*", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    if (!["localhost", "127.0.0.1"].includes(url.hostname)) {
      await route.abort("blockedbyclient");
    } else if (url.pathname === "/api/map/places") {
      await route.fulfill({ json: { generatedAt: new Date().toISOString(), places: localPins } });
    } else if (photosAvailable && url.pathname === "/api/places/by-slugs") {
      const requested = new Set((url.searchParams.get("slugs") ?? "").split(","));
      await route.fulfill({ json: { places: coffeePlaces
        .filter((place) => requested.has(place.slug))
        .map((place) => ({ slug: place.slug, google_photo_url: place.google_photo_url })) } });
    } else if (photosAvailable && url.pathname === "/api/place-photo") {
      // Real catalog photo metadata exercises the ready-media layout. These
      // clearly labelled fixture bytes never fetch or depict a provider photo.
      await route.fulfill({ contentType: "image/svg+xml", body:
        '<svg xmlns="http://www.w3.org/2000/svg" width="96" height="96"><rect width="96" height="96" fill="#ddd"/><text x="48" y="44" text-anchor="middle" font-size="12">LAYOUT</text><text x="48" y="62" text-anchor="middle" font-size="12">FIXTURE</text></svg>' });
    } else if (url.pathname === "/api/search") {
      // Use real catalog identities at the existing public JSON boundary.
      // Include a neighboring-town result to exercise the recovery scope filter.
      await route.fulfill({ json: { results: coffeePlaces.map((place) => ({
        type: "place", id: `place:${place.slug}`, title: place.name,
        subtitle: place.municipality, href: `/places/${place.slug}`,
        lng: place.geom.lng, lat: place.geom.lat,
      })) } });
    } else if (url.pathname.startsWith("/api/")) {
      // Optional layers, identity, and media cannot call providers in this check.
      await route.fulfill({ status: 503, json: { error: "Unavailable in the read-only layout fixture" } });
    } else if (request.method() === "GET") {
      await route.continue();
    } else {
      await route.abort("blockedbyclient");
    }
  });
}

async function recoveryGeometry(page: Page) {
  return page.locator(".dock-host").evaluate((host) => {
    const dock = host.querySelector<HTMLElement>("[data-map-dock]")!;
    const heading = host.querySelector<HTMLElement>("#map-error-title")!;
    const list = host.querySelector<HTMLElement>(".map-error-fallback .map-list")!;
    const last = list.querySelectorAll<HTMLElement>(".map-list-row");
    const bounds = (element: Element) => {
      const box = element.getBoundingClientRect();
      return { x: box.x, y: box.y, width: box.width, height: box.height, bottom: box.bottom, right: box.right };
    };
    const headingBox = heading.getBoundingClientRect();
    const headingPoints = [
      [headingBox.left + 1, headingBox.top + 1],
      [headingBox.right - 1, headingBox.top + 1],
      [headingBox.left + 1, headingBox.bottom - 1],
      [headingBox.right - 1, headingBox.bottom - 1],
      [headingBox.left + headingBox.width / 2, headingBox.top + headingBox.height / 2],
    ];
    return {
      host: bounds(host), dock: bounds(dock), heading: bounds(heading), list: bounds(list),
      lastResult: last.length ? bounds(last[last.length - 1]) : null,
      headingUnobscured: headingPoints.every(([x, y]) => heading.contains(document.elementFromPoint(x, y))),
      measuredDockHeight: parseFloat((host as HTMLElement).style.getPropertyValue("--map-dock-height")),
      bottomPadding: parseFloat(getComputedStyle(list).paddingBottom),
      scrollTop: list.scrollTop, scrollHeight: list.scrollHeight, clientHeight: list.clientHeight,
      horizontalOverflow: document.documentElement.scrollWidth > window.innerWidth || list.scrollWidth > list.clientWidth,
    };
  });
}

for (const viewport of [{ width: 390, height: 844 }, { width: 1280, height: 720 }]) {
 for (const photosAvailable of [false, true]) {
  test.describe(`Map recovery layout at ${viewport.width}px${photosAvailable ? " with ready photos" : ""}`, () => {
    test.use({ viewport });
    test("a closed return/search dock leaves the scoped recovery heading and final result clear", async ({ page }, testInfo) => {
      test.setTimeout(60_000);
      await page.emulateMedia({ reducedMotion: "reduce" });
      await installRecoveryBoundary(page, photosAvailable);
      await page.goto(mapUrl, { waitUntil: "domcontentloaded" });
      await expect(page.locator(".dock-host")).toHaveAttribute("data-map-error", "true", { timeout: 30_000 });
      const dock = page.locator("[data-map-dock]");
      await expect(dock).toHaveAttribute("data-map-available", "false");
      const search = dock.getByRole("combobox", { name: "Search Frederick Radius", exact: true });
      await expect(search).toHaveValue("coffee");
      const back = dock.getByRole("link", { name: "Back to search results", exact: true });
      await expect(back).toHaveAttribute("href", returnTo);
      await expect(back).toBeVisible();
      const list = page.getByRole("region", { name: "Available results without the map" });
      await expect(list.getByRole("button", { name: /Beans in the Belfry/ })).toBeVisible();
      await expect(list.locator(".map-list-row")).toHaveCount(coffeePlaces.filter((place) => place.municipality === "brunswick").length);
      await expect(list).not.toContainText("Market Street Boba Beans");
      if (photosAvailable) {
        await expect(list.locator('[data-photo-state="ready"]')).toHaveCount(
          coffeePlaces.filter((place) => place.municipality === "brunswick" && place.google_photo_url).length,
        );
      }
      await page.evaluate(() => document.fonts.ready);
      await page.evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));

      const initial = await recoveryGeometry(page);
      await testInfo.attach("initial-recovery-geometry", { body: JSON.stringify(initial, null, 2), contentType: "application/json" });
      await testInfo.attach("initial-recovery-layout", { body: await page.screenshot({ fullPage: false }), contentType: "image/png" });
      expect.soft(initial.headingUnobscured).toBe(true);
      expect.soft(initial.horizontalOverflow).toBe(false);
      expect.soft(await back.evaluate((element) => element.getBoundingClientRect().height)).toBeGreaterThanOrEqual(44);
      expect.soft(await search.evaluate((element) => element.getBoundingClientRect().height)).toBeGreaterThanOrEqual(44);
      if (viewport.width >= 1024) {
        expect.soft(initial.heading.y).toBeGreaterThanOrEqual(initial.dock.bottom);
      } else {
        expect.soft(initial.bottomPadding).toBeGreaterThan(initial.dock.height);
      }

      // A shorter phone makes the real fallback list scroll; the host observer
      // must preserve the final result above the measured closed dock after resize.
      if (viewport.width < 1024) await page.setViewportSize({ width: viewport.width, height: 420 });
      await list.evaluate((element) => { element.scrollTop = element.scrollHeight; });
      await expect.poll(async () => {
        const geometry = await recoveryGeometry(page);
        return Math.abs(geometry.measuredDockHeight - geometry.dock.height);
      }).toBeLessThan(1);
      const final = await recoveryGeometry(page);
      await testInfo.attach("final-recovery-geometry", { body: JSON.stringify(final, null, 2), contentType: "application/json" });
      await testInfo.attach("final-recovery-layout", { body: await page.screenshot({ fullPage: false }), contentType: "image/png" });
      expect(final.lastResult).not.toBeNull();
      expect(final.horizontalOverflow).toBe(false);
      await expect(search).toHaveValue("coffee");
      await expect(back).toHaveAttribute("href", returnTo);
      expect(await back.evaluate((element) => element.getBoundingClientRect().height)).toBeGreaterThanOrEqual(44);
      expect(await search.evaluate((element) => element.getBoundingClientRect().height)).toBeGreaterThanOrEqual(44);
      if (viewport.width < 1024) {
        expect(final.scrollHeight).toBeGreaterThan(final.clientHeight);
        expect(final.scrollTop).toBeGreaterThan(0);
        expect(final.bottomPadding).toBeGreaterThan(final.dock.height);
        expect(final.lastResult!.bottom).toBeLessThanOrEqual(final.dock.y);
        expect(final.lastResult!.y).toBeGreaterThanOrEqual(final.list.y);
      } else {
        expect(final.heading.y).toBeGreaterThanOrEqual(final.dock.bottom);
        expect(final.lastResult!.bottom).toBeLessThanOrEqual(final.host.bottom);
      }
      await expect.poll(() => new URL(page.url()).searchParams.get("in")).toBe("brunswick");
      // This focused layout proof does not navigate or mutate any account data.
    });
  });
 }
}
