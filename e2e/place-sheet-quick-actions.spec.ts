import { expect, test, type Locator, type Page, type TestInfo } from "@playwright/test";
import { writeFile } from "node:fs/promises";
import catalog from "../src/data/places-client.json";
import merchantHoursRaw from "../src/data/places-merchant-hours.json";
import type { Hours } from "../src/data/places";
import type { MerchantHoursArtifact } from "../src/lib/merchant-hours";
import { getOpenStatus } from "../src/lib/hours";
import { registerWebkitLoopbackDocumentSeam } from "./webkit-loopback-document";

const slug = "hootch-and-banter-frederick";
const committed = catalog.find(place => place.slug === slug)!;
const merchantHours = merchantHoursRaw as unknown as MerchantHoursArtifact;
const acceptedSchedule = (() => {
  const row = merchantHours.places.find(place => place.slug === slug);
  if (!row || row.source_name !== committed.name || row.qualification?.usage !== "display_only") {
    throw new Error("Place action geometry requires Hootch & Banter's accepted qualified dinner schedule.");
  }
  return row;
})();
// This controlled loopback response retains the accepted historical source
// record independently of the current client freshness projection. The fixed
// browser clock does not change any source observation, expiry or public hold.
const historicalHours: Hours = { ...acceptedSchedule.hours, _official: {
  slug, kind: "merchant", schedule_kind: acceptedSchedule.kind,
  source_name: acceptedSchedule.source_name, source_url: acceptedSchedule.source_url,
  observed_at: acceptedSchedule.observed_at, expires_at: acceptedSchedule.expires_at,
  coverage_from: acceptedSchedule.coverage_from, coverage_through: acceptedSchedule.coverage_through,
  exceptions: acceptedSchedule.exceptions ?? [], qualification: acceptedSchedule.qualification,
} };
const browserAt = new Date(Date.parse(acceptedSchedule.observed_at) + 1_000);
const fixturePlace = { ...committed, hours: historicalHours, hours_verified: true,
  hours_source: "first_party" as const, hours_updated_at: acceptedSchedule.observed_at,
  open_status: { state: "unknown" as const } };
const menuUrl = "https://hootchandbanter.com/dinner-menu/";
const directionsUrl = `https://maps.apple.com/?q=${encodeURIComponent(committed.name.trim())}&ll=${committed.geom.lat},${committed.geom.lng}`;
const mapPath = "/map?q=hootch&in=frederick&c=-77.4114,39.4130,14.0&show=none";

// Identity, actions and coordinates are committed facts; the qualified dinner
// schedule is an explicit historical fixture, never a live venue-opening claim.
// Merchant appearance and WebGL remain unverified. Provider calls stay blocked.
test.use({ isMobile: true, hasTouch: true, serviceWorkers: "block" });

async function boundary(page: Page, baseURL: string | undefined, info: TestInfo) {
  if (!baseURL || new URL(baseURL).protocol !== "http:" || !["localhost", "127.0.0.1"].includes(new URL(baseURL).hostname)) {
    throw new Error("Place-sheet action fixtures require an explicit HTTP loopback app.");
  }
  expect(committed.commerce_links?.find(link => link.type === "menu")?.url).toBe(menuUrl);
  expect(getOpenStatus(historicalHours, { verified: true }, browserAt)).toEqual({ state: "unknown" });
  // Brewer's missing disclosure was a truthful consequence of its source
  // hold. Preserve that suppression when held instead of reviving its hours
  // merely to make this unrelated sticky-action geometry fixture scroll.
  const brewerHeld = merchantHours.review.some(place => place.slug === "brewers-alley-frederick");
  if (brewerHeld) {
    const brewer = catalog.find(place => place.slug === "brewers-alley-frederick") as
      { hours?: Hours; hours_verified?: boolean } | undefined;
    expect(brewer).toBeDefined();
    expect(brewer?.hours ?? null).toBeNull();
    expect(brewer?.hours_verified).toBe(false);
  }
  await page.clock.setFixedTime(browserAt);
  const origin = new URL(baseURL).origin;
  const requests: string[] = [], blocked: string[] = [], writes: string[] = [], errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.context().addCookies([{ name: "fr_onboarded", value: "1", url: origin }]);
  await page.addInitScript(() => {
    localStorage.setItem("fr:saved:v1", "[]");
    localStorage.setItem("fr_map_location_intro_v1", "dismissed");
    localStorage.setItem("fr:appearance:v1", "light");
    localStorage.setItem("fr:return-bridge:v1", JSON.stringify({ sessions: 0, lastSessionAt: 0, valueKind: null, valueAt: 0, dismissals: 1, snoozedUntil: 0, autoDisabled: true, completed: false, lastOfferAt: 0 }));
    const original = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (this: HTMLCanvasElement, type: string, ...args: unknown[]) {
      if (/webgl/.test(type)) return null;
      return original.call(this, type as "2d", ...args);
    } as typeof original;
  });
  await page.route("**/*", async route => {
    const request = route.request(), url = new URL(request.url());
    const description = `${request.method()} ${url.pathname}`;
    requests.push(description);
    if (url.origin !== origin) { blocked.push(`EXTERNAL ${request.method()} ${url.hostname}${url.pathname}`); return route.abort("blockedbyclient"); }
    if (!["GET", "HEAD"].includes(request.method())) { writes.push(description); return route.abort("blockedbyclient"); }
    if (url.pathname === "/api/auth/me") return route.fulfill({ json: { user: null } });
    if (url.pathname === "/api/map/places") return route.fulfill({ json: { generatedAt: committed.updated_at, places: [{
      slug: committed.slug, name: committed.name, category: committed.category, geom: committed.geom,
      municipality: committed.municipality, source: committed.source, is_verified: committed.is_verified,
      short_blurb: committed.short_blurb, primary_type: committed.primary_type, field_notes: committed.field_notes,
      open_status: { state: "unknown" },
    }] } });
    if (url.pathname === "/api/search") return route.fulfill({ json: { results: [{
      type: "place", id: `place:${slug}`, title: committed.name, subtitle: committed.municipality,
      href: `/places/${slug}`, lng: committed.geom.lng, lat: committed.geom.lat,
    }] } });
    if (url.pathname === "/api/places/by-slugs") {
      expect(url.searchParams.get("slugs")).toBe(slug);
      return route.fulfill({ json: { places: [fixturePlace] } });
    }
    if (url.pathname === `/api/places/map-card/${slug}`) return route.fulfill({ json: { place: fixturePlace } });
    // Venue events are unavailable in this controlled journey, rather than an
    // invented event attached to the merchant to make the sheet look richer.
    if (url.pathname === `/api/place/${slug}/events`) return route.fulfill({ status: 503, json: { error: "Venue events not read in the local geometry fixture" } });
    if (request.resourceType() === "image" || url.pathname === "/_next/image") {
      const source = new URL(url.pathname === "/_next/image" ? url.searchParams.get("url") ?? "" : url.pathname, origin);
      if (source.origin !== origin || !["/images/", "/place-photos/", "/history-photos/", "/brand/", "/icons/"].some(prefix => source.pathname.startsWith(prefix))) {
        blocked.push(`IMAGE ${source.pathname}`); return route.abort("blockedbyclient");
      }
      return route.fallback();
    }
    if (url.pathname.startsWith("/api/")) return route.fulfill({ status: 503, json: { error: "Optional API not admitted in the local action fixture" } });
    // A separately registered WebKit loopback seam can deliver the original
    // document with only its HTTPS-upgrade directive removed. Static bytes and
    // all non-document requests otherwise retain the normal local transport.
    return route.fallback();
  });
  return { requests, writes, errors, async attach(extra: Record<string, unknown>) {
    const receiptPath = info.outputPath("place-sheet-action-boundary.json");
    await writeFile(receiptPath, JSON.stringify({
      scope: "Real local app with committed merchant/actions/coordinates and an accepted historical qualified dinner-hours fixture at its observation clock; no live-hours or current-appearance claim. WebGL and providers unavailable. Guest Save writes only local device storage. No external action invoked.",
      slug, menuUrl, directionsUrl,
      historicalHoursFixture: { observedAt: acceptedSchedule.observed_at, expiresAt: acceptedSchedule.expires_at,
        browserClockOnly: browserAt.toISOString(), qualification: acceptedSchedule.qualification,
        sourceUrl: acceptedSchedule.source_url, sourceHash: acceptedSchedule.source_sha256,
        genericOpenStatus: "unknown", brewerHoldSuppressionChecked: brewerHeld },
      counts: { requests: requests.length, blocked: blocked.length, writes: writes.length, errors: errors.length },
      detailLimit: 400, detailTruncated: [requests, blocked, writes, errors].some(values => values.length > 400),
      requests: requests.slice(0, 400), blocked: blocked.slice(0, 400), writes: writes.slice(0, 400), errors: errors.slice(0, 400), ...extra,
    }, null, 2));
    await info.attach("place-sheet-action-boundary", { contentType: "application/json", path: receiptPath });
  } };
}

async function targetProbe(target: Locator) {
  return target.evaluate(node => {
    const box = node.getBoundingClientRect(), x = box.x + box.width / 2, y = box.y + box.height / 2;
    const points = [[x, y], [x - 21, y], [x + 21, y], [x, y - 21], [x, y + 21]];
    return { width: box.width, height: box.height, left: box.left, right: box.right, top: box.top, bottom: box.bottom,
      owned: points.every(([px, py]) => px >= 0 && py >= 0 && px < innerWidth && py < innerHeight && node.contains(document.elementFromPoint(px, py))) };
  });
}

async function reachable(target: Locator) {
  await expect(target).toBeVisible();
  await expect.poll(async () => {
    const result = await targetProbe(target);
    return result.width >= 44 && result.height >= 44 && result.owned;
  }, { message: "The actual mobile action owns its full 44px touch target" }).toBe(true);
}

async function screenshot(page: Page, info: TestInfo, name: string) {
  const path = info.outputPath(`${name}.png`);
  await page.screenshot({ path });
  await info.attach(name, { path, contentType: "image/png" });
}

// Keep the actual sheet/viewport layout in the local fixture receipt. A DOM
// visibility assertion alone cannot establish that a short-phone control is
// on screen or that a mobile engine has settled an overlay transfer.
async function sheetLayoutDiagnostic(page: Page) {
  return page.evaluate(() => {
    const describe = (node: Element | null) => {
      if (!node) return null;
      const rect = node.getBoundingClientRect(), css = getComputedStyle(node);
      return { tag: node.tagName, class: node.className, role: node.getAttribute("role"),
        text: node.textContent?.trim().slice(0, 100),
        rect: { x: rect.x, y: rect.y, width: rect.width, height: rect.height, bottom: rect.bottom },
        css: { display: css.display, visibility: css.visibility, position: css.position,
          transform: css.transform, height: css.height, maxHeight: css.maxHeight, minHeight: css.minHeight,
          overflowY: css.overflowY, fontSize: css.fontSize, lineHeight: css.lineHeight,
          gridTemplateColumns: css.gridTemplateColumns },
        scrollTop: node instanceof HTMLElement ? node.scrollTop : null,
        scrollHeight: node instanceof HTMLElement ? node.scrollHeight : null };
    };
    const bar = document.querySelector("[data-place-sheet-quick-actions]");
    const ancestors = [];
    for (let node = bar; node && ancestors.length < 5; node = node.parentElement) ancestors.push(describe(node));
    const scroller = document.querySelector("[data-place-sheet-scroll]");
    return { viewport: { width: innerWidth, height: innerHeight, devicePixelRatio,
        visual: visualViewport ? { width: visualViewport.width, height: visualViewport.height,
          scale: visualViewport.scale, offsetTop: visualViewport.offsetTop, offsetLeft: visualViewport.offsetLeft } : null },
      activeElement: describe(document.activeElement), ancestors,
      dialog: describe(bar?.closest('[role="dialog"]') ?? null),
      panel: describe(document.querySelector("[data-bottom-sheet-panel]")),
      photo: describe(document.querySelector("[data-place-sheet-photo]")),
      scrollChildren: scroller ? [...scroller.children].map(describe) : [],
      identity: describe(document.querySelector("[data-place-sheet-identity]")),
      peek: describe(document.querySelector(".map-peek[data-map-result-surface]")) };
  });
}

for (const setting of [
  { width: 320, height: 844, enlarged: false },
  { width: 390, height: 844, enlarged: false },
  { width: 320, height: 667, enlarged: false },
  { width: 320, height: 844, enlarged: true },
]) {
  test(`place actions stay reachable at ${setting.width}x${setting.height}${setting.enlarged ? " with 200% text and reduced motion" : ""}`, async ({ page, baseURL }, info) => {
    test.setTimeout(60_000);
    await page.setViewportSize({ width: setting.width, height: setting.height });
    await page.emulateMedia({ reducedMotion: "reduce" });
    const transport = await boundary(page, baseURL, info);
    let selectedUrl: string | null = null;
    let initialBarGeometry: unknown = null;
    let saveAcknowledgementWaitMs: number | null = null;
    let initialLayoutDiagnostic: unknown = null;
    try {
      await page.goto(mapPath, { waitUntil: "domcontentloaded" });
      if (setting.enlarged) await page.addStyleTag({ content: "html { font-size: 200% !important; }" });
      await expect(page.locator(".dock-host")).toHaveAttribute("data-map-error", "true", { timeout: 30_000 });
      const results = page.getByRole("region", { name: "Available results without the map", exact: true });
      const result = results.locator(`[data-map-list-place="${slug}"]`);
      await result.scrollIntoViewIfNeeded(); await result.tap();
      const peek = page.locator(".map-peek[data-map-result-surface]");
      await expect(peek.locator(".map-peek-body")).toHaveAttribute("data-map-place-slug", slug);
      const details = peek.getByRole("button", { name: "Details", exact: true });
      await details.scrollIntoViewIfNeeded(); await reachable(details);
      selectedUrl = page.url();
      await details.tap();
      const dialog = page.getByRole("dialog", { name: committed.name, exact: true });
      await expect(dialog.getByRole("heading", { name: committed.name, exact: true })).toBeVisible();
      await expect(dialog.getByText("Loading place details…", { exact: true })).toHaveCount(0);
      const bar = dialog.locator("[data-place-sheet-quick-actions]");
      const directions = bar.getByRole("link", { name: "Directions", exact: true });
      const menu = bar.getByRole("link", { name: "Dinner menu", exact: true });
      const save = bar.locator(`button[data-save-ref="place:${slug}"]`);
      const close = dialog.getByRole("button", { name: "Close place details", exact: true });
      await expect(directions).toHaveAttribute("href", directionsUrl);
      await expect(menu).toHaveAttribute("href", menuUrl);
      await expect(save).toHaveAccessibleName(`Save ${committed.name}`);
      await expect(dialog.locator(`[data-save-ref="place:${slug}"]`)).toHaveCount(1);
      await expect(bar).toBeVisible();
      // Heading attachment is earlier than the real sheet's first opening
      // frame in WebKit. Wait for its panel to reach the viewport, without
      // scrolling any content or treating off-screen DOM as initial readiness.
      await expect.poll(() => dialog.locator("[data-bottom-sheet-panel]").evaluate(node => {
        const box = node.getBoundingClientRect();
        return box.width > 0 && box.top >= 0 && box.bottom <= innerHeight + 1;
      }), { message: "The actual sheet opening has reached its unscrolled viewport position" }).toBe(true);
      await reachable(close);
      initialBarGeometry = await bar.evaluate(node => {
        const box = node.getBoundingClientRect();
        return { top: box.top, bottom: box.bottom, height: box.height, viewportHeight: innerHeight,
          fullyInViewport: box.top >= 0 && box.bottom <= innerHeight, sheetScrollTop: node.closest(".overflow-y-auto")?.scrollTop ?? null };
      });
      initialLayoutDiagnostic = await sheetLayoutDiagnostic(page);
      await screenshot(page, info, `place-actions-unscrolled-${setting.width}x${setting.height}${setting.enlarged ? "-200pct" : ""}`);
      if (setting.enlarged) {
        // Enlarged text may require a deliberate inner scroll. Preserve its
        // unscrolled evidence above; this is reachability, not a claim that all
        // initial content fits. Ordinary-size cases NEVER scroll to rescue an
        // initially hidden action row, including the short 320x667 phone.
        await bar.evaluate(node => node.scrollIntoView({ block: "center" }));
      }
      for (const action of [directions, menu, save, close]) await reachable(action);
      expect(await bar.evaluate(node => {
        const identity = document.querySelector("[data-place-sheet-identity]")!;
        const afterIdentity = Boolean(identity.compareDocumentPosition(node) & Node.DOCUMENT_POSITION_FOLLOWING);
        const laterMedia = [...node.parentElement!.querySelectorAll(".shelf-rail,h3")].filter(candidate => candidate.matches(".shelf-rail") || candidate.textContent === "From above" || candidate.textContent === "Upcoming here");
        return { afterIdentity, beforeOptional: laterMedia.every(candidate => Boolean(node.compareDocumentPosition(candidate) & Node.DOCUMENT_POSITION_FOLLOWING)) };
      })).toEqual({ afterIdentity: true, beforeOptional: true });
      // This real merchant is near the real bundled aerial archive. Its label
      // remains "near", not an invented photograph of the business or food.
      await expect(dialog.getByRole("heading", { name: "From above", exact: true })).toHaveCount(1);
      await screenshot(page, info, `place-actions-initial-${setting.width}${setting.enlarged ? "-200pct" : ""}`);
      await save.tap();
      await expect(save).toHaveAttribute("aria-pressed", "true");
      expect(await page.evaluate(id => {
        const values = JSON.parse(localStorage.getItem("fr:saved:v1") ?? "[]") as Array<{ type: string; id: string }>;
        return values.filter(value => value.type === "place" && value.id === id).length;
      }, slug)).toBe(1);
      // The actual first-save acknowledgement can overlap a centered control
      // near the sheet's lower edge. Observe its normal dismissal before the
      // next independent interaction; do not bypass its hit layer or weaken
      // the Hours control's full 44px ownership requirement.
      const acknowledgement = page.locator("[data-sonner-toast]").filter({ hasText: "Your saved list starts here" });
      await expect(acknowledgement).toBeVisible();
      const acknowledgementStarted = Date.now();
      await expect(acknowledgement).toHaveCount(0, { timeout: 8000 });
      saveAcknowledgementWaitMs = Date.now() - acknowledgementStarted;

      // Open the accepted historical dinner-hours fixture through the real
      // native disclosure, preserving its conditions and useful scroll content.
      const hours = dialog.locator("[data-place-sheet-official-hours] summary").first();
      await hours.evaluate(node => node.scrollIntoView({ block: "center" }));
      await reachable(hours); await hours.tap();
      await expect(dialog.locator("[data-place-sheet-official-hours] details").first()).toHaveAttribute("open", "");
      const scroller = dialog.locator("div.min-h-0.flex-1.overflow-y-auto").first();
      const scrollMetrics = await scroller.evaluate(node => {
        const before = node.scrollTop;
        node.scrollTo({ top: node.scrollHeight, behavior: "instant" as ScrollBehavior });
        return { before, scrollHeight: node.scrollHeight, clientHeight: node.clientHeight };
      });
      expect(scrollMetrics.scrollHeight).toBeGreaterThan(scrollMetrics.clientHeight + 60);
      await expect.poll(async () => {
        const row = await bar.boundingBox(), root = await scroller.boundingBox(), closeBox = await close.boundingBox();
        return Boolean(row && root && closeBox && row.y >= root.y - 1 && row.y <= root.y + 2
          && row.y + row.height <= root.y + root.height + 1 && row.y >= closeBox.y + closeBox.height - 1);
      }, { message: "The sticky action row stays inside the sheet below its separate Close control" }).toBe(true);
      for (const action of [directions, menu, save, close]) await reachable(action);
      expect(await dialog.evaluate(node => node.scrollWidth <= node.clientWidth + 1)).toBe(true);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
      await screenshot(page, info, `place-actions-scrolled-${setting.width}${setting.enlarged ? "-200pct" : ""}`);
      await page.goBack();
      await expect(dialog).toHaveCount(0);
      await expect(page).toHaveURL(selectedUrl);
      await expect(details).toBeFocused();
      expect(transport.writes.filter(request => request.includes("/api/follows"))).toEqual([]);
      expect(transport.errors).toEqual([]);
    } finally {
      try { await screenshot(page, info, `place-actions-final-${setting.width}${setting.enlarged ? "-200pct" : ""}`); }
      catch (error) { await info.attach("place-actions-screenshot-boundary", { contentType: "text/plain", body: String(error) }); }
      await transport.attach({ width: setting.width, height: setting.height, enlargedText: setting.enlarged, initialBarGeometry, initialLayoutDiagnostic,
        finalLayoutDiagnostic: await sheetLayoutDiagnostic(page).catch(error => ({ unavailable: String(error) })),
        initialBarRescueScrollAllowed: setting.enlarged, saveAcknowledgementWaitMs, selectedUrl, menuInvoked: false, directionsInvoked: false });
    }
  });
}

registerWebkitLoopbackDocumentSeam();
