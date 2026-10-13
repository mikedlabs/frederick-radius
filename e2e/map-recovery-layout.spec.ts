import { expect, test, type Locator, type Page } from "@playwright/test";
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
    } else if (photosAvailable && url.pathname.startsWith("/api/places/map-card/")) {
      const slug = decodeURIComponent(url.pathname.split("/").at(-1)!);
      const place = coffeePlaces.find((place) => place.slug === slug);
      await route.fulfill({ json: { place: place
        ? { slug: place.slug, google_photo_url: place.google_photo_url }
        : null } });
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

/** Border-box size alone misses a neighboring layer intercepting a target's
 * edge. Sample the same full 44px footprint before and after compact resize. */
async function assert44HitTarget(control: Locator) {
  await expect(control).toBeVisible();
  const measure = () => control.evaluate((element) => {
    const rect = element.getBoundingClientRect();
    const x = rect.x + rect.width / 2;
    const y = rect.y + rect.height / 2;
    const hits = [[x, y], [x - 21.5, y], [x + 21.5, y], [x, y - 21.5], [x, y + 21.5]]
      .map(([px, py]) => {
        const hit = document.elementFromPoint(px, py);
        return px >= 0 && py >= 0 && px < innerWidth && py < innerHeight && hit !== null && element.contains(hit);
      });
    return { x: rect.x, y: rect.y, width: rect.width, height: rect.height, hits };
  });
  await expect.configure({ soft: true }).poll(async () => (await measure()).hits).toEqual([true, true, true, true, true]);
  const target = await measure();
  expect.soft(target.width).toBeGreaterThanOrEqual(44);
  expect.soft(target.height).toBeGreaterThanOrEqual(44);
  return target;
}

async function recoveryGeometry(page: Page) {
  return page.locator(".dock-host").evaluate((host) => {
    const dock = host.querySelector<HTMLElement>("[data-map-dock]")!;
    const heading = host.querySelector<HTMLElement>("#map-error-title")!;
    const list = host.querySelector<HTMLElement>(".map-error-fallback .map-list")!;
    const last = list.querySelectorAll<HTMLElement>("[data-map-list-place]");
    const bounds = (element: Element) => {
      const box = element.getBoundingClientRect();
      return { x: box.x, y: box.y, width: box.width, height: box.height, bottom: box.bottom, right: box.right };
    };
    const unobscured = (element: HTMLElement) => {
      const box = element.getBoundingClientRect();
      const points = [
        [box.left + 1, box.top + 1],
        [box.right - 1, box.top + 1],
        [box.left + 1, box.bottom - 1],
        [box.right - 1, box.bottom - 1],
        [box.left + box.width / 2, box.top + box.height / 2],
      ];
      return points.every(([x, y]) => element.contains(document.elementFromPoint(x, y)));
    };
    return {
      host: bounds(host), dock: bounds(dock), heading: bounds(heading), list: bounds(list),
      lastResult: last.length ? bounds(last[last.length - 1]) : null,
      headingUnobscured: unobscured(heading),
      measuredDockHeight: parseFloat((host as HTMLElement).style.getPropertyValue("--map-dock-height")),
      bottomPadding: parseFloat(getComputedStyle(list).paddingBottom),
      scrollTop: list.scrollTop, scrollHeight: list.scrollHeight, clientHeight: list.clientHeight,
      horizontalOverflow: document.documentElement.scrollWidth > window.innerWidth || list.scrollWidth > list.clientWidth,
    };
  });
}

for (const viewport of [{ width: 390, height: 844 }, { width: 1280, height: 720 }]) {
 for (const photosAvailable of [false, true]) {
  test.describe(`Map recovery layout at ${viewport.width}px${photosAvailable ? " with ready selected photos" : ""}`, () => {
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
      const scopedPlaces = coffeePlaces.filter((place) => place.municipality === "brunswick");
      await expect(list.locator("[data-map-list-place]")).toHaveCount(scopedPlaces.length);
      await expect(list).not.toContainText("Market Street Boba Beans");
      // Ranked rows use category marks. Eligible photos belong to the selected
      // rich card, so verify the same scoped catalog photo count there rather
      // than requiring the initial list to bulk-load provider imagery.
      await expect(list.locator("img")).toHaveCount(0);
      const scopedPhotoPlaces = scopedPlaces.filter((place) => place.google_photo_url);
      const origin = page.url();
      let readyPhotos = 0;
      for (const place of scopedPhotoPlaces) {
        await list.locator(`[data-map-list-place="${place.slug}"]`).click();
        const card = page.locator(`.map-peek-body[data-map-place-slug="${place.slug}"]`);
        await expect(card).toBeVisible();
        await expect(card.locator('[data-loading="true"]')).toHaveCount(0);
        if (photosAvailable) {
          const image = card.getByRole("img", { name: `Photo of ${place.name}`, exact: true });
          await expect(image).toHaveAttribute("data-map-peek-photo-state", "ready");
          expect(await image.evaluate((element) => {
            const image = element as HTMLImageElement;
            return image.complete && image.naturalWidth > 1 && image.naturalHeight > 1;
          })).toBe(true);
          readyPhotos += 1;
        } else {
          await expect(card.locator("img")).toHaveCount(0);
          await expect(page.locator(".map-peek-source-credit")).toHaveCount(0);
        }
        await page.goBack();
        await expect(page).toHaveURL(origin);
        await expect(list.locator("[data-map-list-place]")).toHaveCount(scopedPlaces.length);
        await expect(list).not.toContainText("Market Street Boba Beans");
        await expect(search).toHaveValue("coffee");
        await expect(back).toHaveAttribute("href", returnTo);
      }
      expect(readyPhotos).toBe(photosAvailable ? scopedPhotoPlaces.length : 0);
      await page.evaluate(() => document.fonts.ready);
      await page.evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));

      const initial = await recoveryGeometry(page);
      await testInfo.attach("initial-recovery-geometry", { body: JSON.stringify(initial, null, 2), contentType: "application/json" });
      await testInfo.attach("initial-recovery-layout", { body: await page.screenshot({ fullPage: false }), contentType: "image/png" });
      expect.soft(initial.headingUnobscured).toBe(true);
      expect.soft(initial.horizontalOverflow).toBe(false);
      const initialTargets = { back: await assert44HitTarget(back), search: await assert44HitTarget(search) };
      await testInfo.attach("initial-recovery-hit-targets", { body: JSON.stringify(initialTargets, null, 2), contentType: "application/json" });
      // At 390x844 the return link remains its full-width, noncompact row.
      expect.soft(initialTargets.back.width).toBeGreaterThan(44);
      if (viewport.width >= 1024) {
        expect.soft(initial.heading.y).toBeGreaterThanOrEqual(initial.dock.bottom);
      } else {
        expect.soft(initial.bottomPadding).toBeGreaterThan(initial.dock.height);
      }

      // A shorter phone makes the real fallback list scroll; the host observer
      // must preserve the final result above the measured closed dock after resize.
      if (viewport.width < 1024) {
        await page.setViewportSize({ width: viewport.width, height: 420 });
        // WebKit can acknowledge resize before its visual viewport and host
        // reflow. Wait for the compact control before measuring list clearance.
        await expect.poll(() => page.evaluate(() => innerHeight)).toBe(420);
        await expect.poll(() => back.evaluate((element) => element.getBoundingClientRect().width)).toBe(44);
      }
      await expect.poll(async () => {
        const geometry = await recoveryGeometry(page);
        return Math.abs(geometry.measuredDockHeight - geometry.dock.height);
      }).toBeLessThan(1);
      // Ranked rows have an inner scrolling viewport. First reveal the final
      // row through its actual ancestors, then clear the still-useful dock in
      // the outer region. Maximizing both scroll areas would overshoot it.
      const lastResult = list.locator("[data-map-list-place]").last();
      await lastResult.evaluate((element) => {
        element.scrollIntoView({ block: "center", inline: "nearest", behavior: "instant" });
      });
      await list.evaluate((region) => {
        const rows = region.querySelectorAll<HTMLElement>("[data-map-list-place]");
        const row = rows[rows.length - 1];
        const dock = region.closest(".dock-host")!.querySelector<HTMLElement>("[data-map-dock]")!;
        const regionBox = region.getBoundingClientRect();
        const dockBox = dock.getBoundingClientRect();
        if (dockBox.top > regionBox.top && dockBox.top < regionBox.bottom) {
          region.scrollTop += Math.max(0, row.getBoundingClientRect().bottom - dockBox.top);
        }
      });
      const final = await recoveryGeometry(page);
      await testInfo.attach("final-recovery-geometry", { body: JSON.stringify(final, null, 2), contentType: "application/json" });
      await testInfo.attach("final-recovery-layout", { body: await page.screenshot({ fullPage: false }), contentType: "image/png" });
      expect(final.lastResult).not.toBeNull();
      expect(final.horizontalOverflow).toBe(false);
      await expect(search).toHaveValue("coffee");
      await expect(back).toHaveAttribute("href", returnTo);
      const finalTargets = {
        back: await assert44HitTarget(back),
        search: await assert44HitTarget(search),
        lastResult: await assert44HitTarget(lastResult),
      };
      await testInfo.attach("final-recovery-hit-targets", { body: JSON.stringify(finalTargets, null, 2), contentType: "application/json" });
      if (viewport.width < 1024) {
        expect(finalTargets.back.width).toBe(44);
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


test.describe("Native shortlist directions in the map fallback", () => {
  test.use({ viewport: { width: 320, height: 568 } });
  test("directions opens the exact destination without selecting a place or losing the scoped query", async ({ page, context }, testInfo) => {
    test.setTimeout(60_000);
    await page.emulateMedia({ reducedMotion: "reduce" });
    await installRecoveryBoundary(page);
    const metadataRequests: string[] = [];
    page.on("request", (request) => {
      const path = new URL(request.url()).pathname;
      if (path.startsWith("/api/places/map-card/") || path === "/api/place-photo") metadataRequests.push(path);
    });
    // Native navigation is real. Only the external destination document is a
    // transport fixture, so this proof makes no third-party map/provider call.
    await context.route(/^https:\/\/(?:www\.google\.com\/maps\/dir\/|maps\.apple\.com\/)/, async (route) => {
      expect(route.request().method()).toBe("GET");
      await route.fulfill({ contentType: "text/html", body: "<!doctype html><title>Native directions transport fixture</title><main>External handoff observed. No external map is loaded.</main>" });
    });
    await page.goto(mapUrl, { waitUntil: "domcontentloaded" });
    await expect(page.locator(".dock-host")).toHaveAttribute("data-map-error", "true", { timeout: 30_000 });
    const list = page.getByRole("region", { name: "Available results without the map" });
    const scopedPlaces = coffeePlaces.filter((place) => place.municipality === "brunswick");
    await expect(list.locator("[data-map-list-place]")).toHaveCount(scopedPlaces.length);
    const before = await list.locator("[data-map-list-place]").evaluateAll((rows) => rows.map((row) => row.getAttribute("data-map-list-place")));
    const slug = before[0];
    const place = scopedPlaces.find((candidate) => candidate.slug === slug)!;
    expect(place).toBeDefined();
    const row = list.locator(`[data-map-list-place-row="${slug}"]`);
    const details = row.locator(`[data-map-list-place="${slug}"]`);
    const directions = row.getByRole("link", { name: `Directions to ${place.name}`, exact: true });
    await expect(details).toContainText(place.name);
    await expect(details).toContainText("Hours not confirmed");
    await expect(directions).toHaveText("Directions");
    await expect(directions).toHaveAttribute("target", "_blank");
    await expect(row.locator("button a, a button")).toHaveCount(0);
    const href = (await directions.getAttribute("href"))!;
    const destination = new URL(href);
    expect(destination.searchParams.get("destination") ?? destination.searchParams.get("daddr"))
      .toBe(`${place.geom.lat},${place.geom.lng}`);
    expect(destination.searchParams.has("origin")).toBe(false);
    await page.evaluate(() => document.fonts.ready);
    const targets = { details: await assert44HitTarget(details), directions: await assert44HitTarget(directions) };
    expect(targets.details.x + targets.details.width).toBeLessThanOrEqual(targets.directions.x);
    expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false);
    await expect(page.locator("[data-map-place-slug]")).toHaveCount(0);
    expect(metadataRequests).toEqual([]);
    const origin = page.url();
    const popupPromise = page.waitForEvent("popup");
    if (testInfo.project.use.hasTouch) await directions.tap();
    else await directions.click();
    const popup = await popupPromise;
    await popup.waitForLoadState("domcontentloaded");
    expect(popup.url()).toBe(href);
    await expect(popup.getByRole("main")).toHaveText("External handoff observed. No external map is loaded.");
    await popup.close();
    await expect(page).toHaveURL(origin);
    await expect(page.locator("[data-map-place-slug]")).toHaveCount(0);
    expect(metadataRequests).toEqual([]);
    expect(await list.locator("[data-map-list-place]").evaluateAll((rows) => rows.map((element) => element.getAttribute("data-map-list-place"))))
      .toEqual(before);
    await expect(page.locator("[data-map-dock]").getByRole("combobox", { name: "Search Frederick Radius", exact: true })).toHaveValue("coffee");
    await expect(page.locator("[data-map-dock]").getByRole("link", { name: "Back to search results", exact: true })).toHaveAttribute("href", returnTo);
    await expect(details).toContainText("Hours not confirmed");
    await testInfo.attach("shortlist-native-directions", { body: JSON.stringify({ before, href, metadataRequests, targets, retainedUrl: page.url(), fixture: "Map renderer unavailable; external directions document is controlled transport." }, null, 2), contentType: "application/json" });
    await testInfo.attach("shortlist-directions-320", { body: await page.screenshot({ fullPage: false }), contentType: "image/png" });
  });
});
