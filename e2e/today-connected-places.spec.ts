import { expect, test, type Locator } from "@playwright/test";
import { writeFile } from "node:fs/promises";
import { dismissReturnBridge, emptyReturnBridgeState, RETURN_BRIDGE_STORAGE_KEY } from "../src/lib/return-bridge";
import { registerWebkitLoopbackDocumentSeam } from "./webkit-loopback-document";

// Declared HTTP facts exercise real Today/Save/detail components. These are
// deliberately unknown-hour fixtures, not evidence about current businesses.
const scenic = "joseph-dill-baker-memorial-carillon-bell-tower";
const merchant = "ibiza-cafe";
const older = ["cafe-nola", "beans-in-the-belfry-brunswick", "brewers-alley", "sabor-de-cuba"];
const originPath = "/today?in=frederick&view=morning#today-discovery";
const place = (slug: string) => ({
  slug, name: slug === scenic ? "Baker Park Carillon" : slug === merchant ? "Ibiza Cafe" : `Older saved fixture ${slug}`,
  category: slug === scenic ? "outdoors" : "coffee", municipality: "frederick", city: "Frederick", tags: [],
  open_status: { state: "unknown" }, short_blurb: "Declared unknown-hours fixture.", state: "MD", postal_code: "21701",
  is_verified: false, feature_score: 0, source: "manual", updated_at: "2026-10-28", source_id: "offline-today-journey",
  source_url: null, license: "Fictional acceptance facts only", confidence: "curated",
  first_seen_at: "2026-10-28T12:00:00Z", last_verified_at: "2026-10-28T12:00:00Z", address: "Frederick, MD",
  geom: { lng: -77.41, lat: 39.41 },
});

test.use({ isMobile: true, hasTouch: true, serviceWorkers: "block" });

async function touch(control: Locator) {
  // Nearest-edge alignment may put a control under the fixed header. Center
  // it through ordinary document scrolling, then test actual hit ownership.
  await control.evaluate(node => node.scrollIntoView({ block: "center" }));
  let last: unknown;
  try { await expect.poll(async () => {
    const probe = await control.evaluate(node => {
    const r = node.getBoundingClientRect(), x = r.x + r.width / 2, y = r.y + r.height / 2;
    const hits = [[x,y],[x-21,y],[x+21,y],[x,y-21],[x,y+21]].map(([px,py]) => {
      const owner = document.elementFromPoint(px,py);
      return { owned: px >= 0 && py >= 0 && px < innerWidth && py < innerHeight && node.contains(owner), tag: owner?.tagName, label: owner?.getAttribute("aria-label") };
    });
    return { width: r.width, height: r.height, x: r.x, y: r.y, hits, label: node.getAttribute("aria-label") };
    }); last = probe;
    return probe.width >= 44 && probe.height >= 44 && probe.hits.every(hit => hit.owned);
  }, { message: "The actual 44px touch target must clear the sticky header and tabs" }).toBe(true); }
  finally { await test.info().attach("touch-target", { contentType: "application/json", body: JSON.stringify(last) }); }
  await control.tap();
}

for (const width of [320, 375, 390, 430]) {
  test(`photo and recommendation Save join Today and retain Back at ${width}px`, async ({ page, baseURL }, info) => {
    const target = new URL(baseURL!);
    if (target.protocol !== "http:" || !["localhost", "127.0.0.1"].includes(target.hostname)) {
      throw new Error("Declared Today fixtures may only run against the local application.");
    }
    await page.setViewportSize({ width, height: 844 });
    await page.emulateMedia({ reducedMotion: "reduce" });
    const origin = new URL(baseURL!).origin;
    const writes: string[] = [], lookups: string[][] = [], errors: string[] = [];
    page.on("pageerror", error => errors.push(error.message));
    await page.addInitScript(({ key, bridge, olderSlugs }) => {
      if (localStorage.getItem("fr:saved:v1") === null) localStorage.setItem("fr:saved:v1", JSON.stringify(
        olderSlugs.map(id => ({ type: "place", id, saved_at: "2026-10-20T12:00:00Z" }))));
      localStorage.setItem("fr_map_location_intro_v1", "dismissed");
      localStorage.setItem(key, JSON.stringify(bridge));
    }, { key: RETURN_BRIDGE_STORAGE_KEY, bridge: dismissReturnBridge(emptyReturnBridgeState()), olderSlugs: older });
    await page.route("**/*", async route => {
      const request = route.request(), url = new URL(request.url());
      if (url.origin !== origin) return route.abort();
      if (!["GET", "HEAD"].includes(request.method())) {
        writes.push(`${request.method()} ${url.pathname}`);
        return route.fulfill({ status: 503, json: { error: "Writes blocked in the local Today acceptance fixture" } });
      }
      if (url.pathname === "/api/auth/me") return route.fulfill({ json: { user: null } });
      if (url.pathname === "/api/want") return route.fulfill({ json: {
        hero: { slug: merchant, name: "Ibiza Cafe", photo: null, where: "Frederick", distance: null, fact: "Hours not confirmed", confidence: "unconfirmed" },
        also: [], soon: null, later: [], notable: [], contextSource: "town", contextLabel: "Frederick City", browseHref: "/nearby?c=coffee&in=frederick",
      } });
      if (url.pathname === "/api/places/by-slugs") {
        const slugs = (url.searchParams.get("slugs") ?? "").split(","); lookups.push(slugs);
        return route.fulfill({ json: { places: slugs.map(place) } });
      }
      if (url.pathname.startsWith("/api/")) {
        return route.fulfill({ status: 503, json: { error: "Declared unavailable acceptance transport" } });
      }
      if (request.resourceType() === "image") {
        const src = url.pathname === "/_next/image" ? url.searchParams.get("url") ?? "" : url.pathname;
        if (!["/images/", "/place-photos/", "/history-photos/", "/brand/", "/icons/"].some(prefix => src.startsWith(prefix))) return route.abort();
      }
      return route.continue();
    });
    await page.goto(originPath, { waitUntil: "domcontentloaded" });
    const photoCard = page.locator("article[data-today-discovery-role=lead]");
    const photoSave = photoCard.locator(`button[data-save-ref="place:${scenic}"]`);
    await expect(photoSave).toBeEnabled({ timeout: 30_000 });
    await expect(page.locator("[data-today-saved-place]")).toHaveCount(2);
    await expect(photoCard.locator("[data-photo-state]")).toHaveAttribute("data-photo-state", "loaded");
    await touch(photoSave);
    await expect(photoSave).toHaveAttribute("aria-pressed", "true");
    await expect(photoCard).toHaveCount(1); // Saving never removes the tapped photo.
    const savedPhoto = page.locator(`[data-today-saved-place="${scenic}"]`);
    await expect(savedPhoto).toHaveCount(1);
    await expect(savedPhoto).toContainText("Hours not confirmed");
    await expect(savedPhoto.locator("img")).toHaveCount(1);
    await savedPhoto.scrollIntoViewIfNeeded();
    await expect.poll(() => savedPhoto.locator("img").evaluate(async (node: HTMLImageElement) => {
      await node.decode().catch(() => undefined);
      const url = new URL(node.currentSrc || node.src, document.baseURI);
      return node.complete && node.naturalWidth > 1 && node.naturalHeight > 1
        && decodeURIComponent(url.searchParams.get("url") ?? url.pathname) === "/images/places/carillon-sunset.jpg";
    })).toBe(true);
    const recommendation = page.locator("article[data-today-place-preview]");
    await expect(recommendation.locator("[data-today-pick-name]")).toHaveText("Ibiza Cafe");
    await expect(recommendation.locator("[data-place-category-art]")).toHaveCount(1);
    await touch(recommendation.locator(`button[data-save-ref="place:${merchant}"]`));
    const savedMerchant = page.locator(`[data-today-saved-place="${merchant}"]`);
    await expect(savedMerchant).toHaveCount(1);
    await expect(savedMerchant).toContainText("Hours not confirmed");
    await expect(savedMerchant.locator("img")).toHaveCount(0);
    const view = savedMerchant.getByRole("link", { name: "View saved place: Ibiza Cafe", exact: true });
    expect(new URL((await view.getAttribute("href"))!, page.url()).searchParams.get("returnTo")).toBe(originPath);
    await view.evaluate(node => {
      const trace: unknown[] = [];
      const target = node as HTMLElement;
      const record = (phase: string) => {
        if (trace.length >= 40) return;
        trace.push({ phase, time: performance.now(), active: document.activeElement?.getAttribute("aria-label") ?? document.activeElement?.tagName,
          connected: target.isConnected, inert: Boolean(target.closest("[inert]")), dialogs: document.querySelectorAll('[role="dialog"]').length });
      };
      const original = target.focus.bind(target);
      target.focus = options => { record("opener-focus-before"); original(options); record("opener-focus-after"); };
      document.addEventListener("focusin", () => record("focusin"));
      window.addEventListener("popstate", () => { record("popstate"); requestAnimationFrame(() => { record("popstate-frame1"); requestAnimationFrame(() => record("popstate-frame2")); }); });
      (window as unknown as { todayFocusTrace: unknown[] }).todayFocusTrace = trace;
    });
    await touch(view);
    const details = page.getByRole("dialog");
    await expect(details.getByRole("heading", { name: "Ibiza Cafe", exact: true })).toBeVisible({ timeout: 30_000 });
    const fullPage = details.getByRole("link", { name: "See full page", exact: true });
    expect(new URL((await fullPage.getAttribute("href"))!, page.url()).searchParams.get("returnTo")).toBe(originPath);
    await page.goBack();
    await expect(details).toHaveCount(0);
    await expect(page).toHaveURL(new URL(originPath, origin).href);
    try { await expect(view).toBeFocused(); }
    finally {
      const path = info.outputPath("native-back-focus-timeline.json");
      await writeFile(path, JSON.stringify(await page.evaluate(() => (window as unknown as { todayFocusTrace: unknown[] }).todayFocusTrace), null, 2));
      await info.attach("native-back-focus-timeline", { contentType: "application/json", path });
    }
    await page.reload({ waitUntil: "domcontentloaded" });
    await expect(page.locator(`[data-today-saved-place="${merchant}"]`)).toHaveCount(1);
    await expect(page.locator(`button[data-save-ref="place:${scenic}"]`).first()).toHaveAttribute("aria-pressed", "true");
    const membership = await page.evaluate(() => JSON.parse(localStorage.getItem("fr:saved:v1") ?? "[]") as Array<{ id: string }>);
    expect(membership.map(row => row.id)).toEqual(expect.arrayContaining([...older, scenic, merchant]));
    expect(new Set(membership.map(row => row.id)).size).toBe(6);
    expect(membership).toHaveLength(6);
    expect(lookups.every(slugs => slugs.length <= 4)).toBe(true);
    expect(lookups.length, "Arrival, two confirmed saves, one sheet and a reload remain bounded").toBeLessThanOrEqual(6);
    expect(writes.filter(write => /\/api\/follows/.test(write))).toEqual([]);
    expect(errors).toEqual([]);
    expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1);
    await info.attach("connected-today-fixture-receipt", { contentType: "application/json", body: JSON.stringify({ width, lookups, writes, errors, initialSaved: older.length, finalSaved: membership.length, facts: "Declared fixtures; real components and bundled scenic bytes, no provider or account mutation" }) });
    await page.locator('[aria-label="Places for your area"]').scrollIntoViewIfNeeded();
    await page.screenshot({ path: info.outputPath(`today-connected-${width}.png`), fullPage: true });
  });
}

registerWebkitLoopbackDocumentSeam();
