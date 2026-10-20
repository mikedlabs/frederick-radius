import { expect, test, type Locator, type Page, type TestInfo } from "@playwright/test";
import { writeFile } from "node:fs/promises";

const placeName = "Curious Iguana";
const placeSlug = "the-curious-iguana-frederick";

test.use({ viewport: { width: 390, height: 844 }, serviceWorkers: "block" });
test.beforeEach(async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.addInitScript(() => {
    document.cookie = "fr_onboarded=1; path=/";
    localStorage.setItem("fr:appearance:v1", "light");
  });
  // Use the actual catalog and route state. No paid imagery, analytics writes,
  // provider refreshes, invented hours, or replacement place records are needed.
  await page.route("**/*", (route) => {
    const request = route.request();
    const url = new URL(request.url());
    if (url.pathname === "/api/track" || url.pathname.startsWith("/_vercel/insights") || url.hostname === "plausible.io") {
      return route.fulfill({ status: 204 });
    }
    if (!["GET", "HEAD"].includes(request.method()) || url.pathname === "/api/place-photo" || /(^|\.)(googleapis\.com|googleusercontent\.com)$/.test(url.hostname)) {
      return route.abort("blockedbyclient");
    }
    return route.continue();
  });
});

async function expectSelectedBooks(page: Page, scope: "county" | "frederick") {
  await expect(page.locator('[data-nearby-interaction-ready="true"]')).toBeVisible();
  await expect(page.getByRole("heading", {
    level: 1, name: scope === "county" ? "Books across Frederick County" : "Books in Frederick City", exact: true,
  })).toBeVisible();
  await expect(page.getByRole("main").locator("header p").filter({ hasText: /first, then top rated|top rated first/ })).toBeVisible();
  await expect(page.getByRole("main").getByRole("button", { name: /^Filters & sort/ })).toBeVisible();
  await expect.poll(() => {
    const url = new URL(page.url());
    return { path: url.pathname, craving: url.searchParams.get("c"), facet: url.searchParams.get("facet"), sort: url.searchParams.get("sort"), scope: url.searchParams.get("in") };
  }).toEqual({ path: "/nearby", craving: "shops", facet: "book-store", sort: "rated", scope });
}

async function openFilters(page: Page) {
  const trigger = page.getByRole("main").getByRole("button", { name: /^Filters & sort/ });
  await trigger.click();
  const dialog = page.getByRole("dialog", { name: "Filters & sort", exact: true });
  await expect(page.getByRole("dialog")).toHaveCount(1);
  await expect(dialog).toBeVisible();
  return { trigger, dialog };
}

async function chooseBooks(page: Page, scope: "county" | "frederick") {
  const response = await page.goto(`/nearby?c=shops&in=${scope}`, { waitUntil: "domcontentloaded" });
  expect(response?.status()).toBe(200);
  await expect(page.locator('[data-nearby-interaction-ready="true"]')).toBeVisible();
  const { dialog } = await openFilters(page);
  await dialog.getByRole("button", { name: "Books", exact: true }).click();
  await dialog.getByRole("button", { name: "Top rated", exact: true }).click();
  await expect(dialog.getByRole("button", { name: "Books", exact: true })).toHaveAttribute("aria-pressed", "true");
  await expect(dialog.getByRole("button", { name: "Top rated", exact: true })).toHaveAttribute("aria-pressed", "true");
  await expect(dialog.getByRole("button", { name: "Open now", exact: true })).toHaveAttribute("aria-pressed", "false");
  await dialog.getByRole("button", { name: "Done", exact: true }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expectSelectedBooks(page, scope);
  const heading = page.getByRole("heading", { name: placeName, exact: true });
  const card = page.locator("main article").filter({ has: heading });
  await expect(card).toHaveCount(1);
  const open = card.getByRole("button", { name: /^View Curious Iguana .*details$/ });
  return { card, open };
}

async function openFullSheet(page: Page, open: Locator) {
  await open.click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toHaveCount(1);
  // The lazy handoff is not the completed sheet whose Back behavior we test.
  await expect(dialog.getByRole("heading", { name: placeName, exact: true })).toBeVisible();
  const fullPage = dialog.getByRole("link", { name: "See full page", exact: true });
  await expect(fullPage).toBeVisible();
  return { dialog, fullPage };
}

async function expectNoOverflow(page: Page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
}

async function expectReachableTarget(target: Locator, diagnostics?: { page: Page; info: TestInfo; label: string }) {
  const inspect = () => target.evaluate((node) => {
    const box = node.getBoundingClientRect();
    const x = box.left + box.width / 2, y = box.top + box.height / 2;
    const describe = (element: Element) => ({ tag: element.tagName, class: element.getAttribute("class"), label: element.getAttribute("aria-label"), text: element.textContent?.trim().slice(0, 140) });
    const ancestors = [];
    for (let element: Element | null = node; element; element = element.parentElement) {
      const style = getComputedStyle(element), rect = element.getBoundingClientRect();
      ancestors.push({ ...describe(element), box: { x: rect.x, y: rect.y, width: rect.width, height: rect.height }, position: style.position, zIndex: style.zIndex, opacity: style.opacity, transform: style.transform, pointerEvents: style.pointerEvents, overflow: style.overflow, scrollPaddingTop: style.scrollPaddingTop });
    }
    const points = [[x, y], [x - 21.5, y], [x + 21.5, y], [x, y - 21.5], [x, y + 21.5]].map(([px, py]) => {
      const hit = document.elementFromPoint(px, py);
      return { x: px, y: py, owned: hit === node || Boolean(hit && node.contains(hit)), hit: hit ? describe(hit) : null, stack: document.elementsFromPoint(px, py).slice(0, 6).map(describe) };
    });
    return { at: performance.now(), scrollY, scrollHeight: document.documentElement.scrollHeight, viewport: { width: innerWidth, height: innerHeight, offsetTop: visualViewport?.offsetTop }, box: { x: box.x, y: box.y, width: box.width, height: box.height }, activeElement: document.activeElement ? describe(document.activeElement) : null, points, ancestors, animations: document.getAnimations().filter(animation => animation.playState === "running").map(animation => ({ name: (animation as CSSAnimation).animationName ?? null, target: animation.effect instanceof KeyframeEffect && animation.effect.target instanceof Element ? describe(animation.effect.target) : null })) };
  });
  const samples: Array<{ stage: string; state: Awaited<ReturnType<typeof inspect>> }> = [];
  await target.evaluate((node) => node.scrollIntoView({ block: "center" }));
  await expect(target).toBeVisible();
  // Small controls have real 44px pseudo-element hit extenders. Probe the
  // effective target rather than incorrectly requiring a 44px visual face.
  try {
    await expect.poll(() => diagnostics ? inspect().then(state => {
      samples.push({ stage: "physical-probe", state });
      return state.points.every(point => point.owned);
    }) : target.evaluate((node) => {
      const box = node.getBoundingClientRect();
      const x = box.left + box.width / 2, y = box.top + box.height / 2;
      return [[x, y], [x - 21.5, y], [x + 21.5, y], [x, y - 21.5], [x, y + 21.5]].every(([px, py]) => {
        const hit = document.elementFromPoint(px, py);
        return hit === node || Boolean(hit && node.contains(hit));
      });
    })).toBe(true);
  } catch (error) {
    if (diagnostics) {
      const geometryPath = diagnostics.info.outputPath(`${diagnostics.label}-hit-geometry.json`);
      await writeFile(geometryPath, JSON.stringify(samples, null, 2));
      await diagnostics.info.attach(`${diagnostics.label}-hit-geometry`, { contentType: "application/json", path: geometryPath });
      const path = diagnostics.info.outputPath(`${diagnostics.label}-failure.png`);
      await diagnostics.page.screenshot({ path });
      await diagnostics.info.attach(`${diagnostics.label}-failure`, { contentType: "image/png", path });
    }
    throw error;
  }
}

for (const dismissal of ["Back", "Close", "Escape"] as const) {
  test(`Nearby preserves Books, Top rated, focus and list position after sheet ${dismissal}`, async ({ page }, info) => {
    const { card, open } = await chooseBooks(page, "frederick");
    await expectReachableTarget(open);
    const before = { url: page.url(), scrollY: await page.evaluate(() => scrollY) };
    const { dialog } = await openFullSheet(page, open);
    if (dismissal === "Back") await page.goBack();
    else if (dismissal === "Close") await dialog.getByRole("button", { name: "Close place details", exact: true }).click();
    else await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await expectSelectedBooks(page, "frederick");
    await expect(page).toHaveURL(before.url);
    await expect(card.getByRole("heading", { name: placeName, exact: true })).toBeVisible();
    await expect(open).toBeFocused();
    await expect.poll(async () => Math.abs(await page.evaluate(() => scrollY) - before.scrollY)).toBeLessThan(80);
    await expectNoOverflow(page);
    await info.attach("nearby-sheet-return", { contentType: "application/json", body: JSON.stringify({ dismissal, before, after: { url: page.url(), scrollY: await page.evaluate(() => scrollY) }, restoredPlace: placeSlug }) });
  });
}

test("Nearby controls remain reachable and one sheet closes back to the same result at 320px", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 568 });
  const { card, open } = await chooseBooks(page, "frederick");
  const filters = await openFilters(page);
  await expectReachableTarget(filters.dialog.getByRole("button", { name: "Books", exact: true }));
  await expectReachableTarget(filters.dialog.getByRole("button", { name: "Top rated", exact: true }));
  await expectReachableTarget(filters.dialog.getByRole("button", { name: "Done", exact: true }));
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(filters.trigger).toBeFocused();
  await expectReachableTarget(card.locator(`[data-save-ref="place:${placeSlug}"]`));
  await expectReachableTarget(open);
  const before = { url: page.url(), scrollY: await page.evaluate(() => scrollY) };
  await expectNoOverflow(page);
  const { dialog } = await openFullSheet(page, open);
  const close = dialog.getByRole("button", { name: "Close place details", exact: true });
  await expectReachableTarget(close);
  await expectNoOverflow(page);
  await close.click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expectSelectedBooks(page, "frederick");
  await expect(page).toHaveURL(before.url);
  await expect(open).toBeFocused();
  await expect.poll(async () => Math.abs(await page.evaluate(() => scrollY) - before.scrollY)).toBeLessThan(80);
  await expectNoOverflow(page);
});

for (const width of [390, 320]) {
  test(`the full place page returns to explicit county Books and Top rated after saved scope changes at ${width}px`, async ({ page, context }, info) => {
    await page.setViewportSize({ width, height: width === 320 ? 568 : 844 });
    const { open } = await chooseBooks(page, "county");
    const browseUrl = page.url();
    const { fullPage } = await openFullSheet(page, open);
    const fullHref = new URL((await fullPage.getAttribute("href"))!, browseUrl);
    expect(fullHref.pathname).toBe(`/places/${placeSlug}`);
    expect(fullHref.searchParams.get("returnTo")).toBe(new URL(browseUrl).pathname + new URL(browseUrl).search);
    await fullPage.click();
    await expect(page).toHaveURL(fullHref.href);
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await expect(page.getByRole("heading", { level: 1, name: placeName, exact: true })).toBeVisible();
    const back = page.getByRole("link", { name: "Back to Nearby", exact: true });
    await expect(back).toHaveAttribute("href", new URL(browseUrl).pathname + new URL(browseUrl).search);
    // A different saved town must not override this explicit county return URL.
    await page.evaluate(() => {
      document.cookie = "fr_scope=town:brunswick; path=/";
      localStorage.setItem("fr:scope:v1", "town:brunswick");
    });
    expect((await context.cookies()).find((cookie) => cookie.name === "fr_scope")?.value).toBe("town:brunswick");
    await back.click();
    await expect(page).toHaveURL(browseUrl);
    await expectSelectedBooks(page, "county");
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await expect(page.getByRole("heading", { name: placeName, exact: true })).toBeVisible();
    await expectNoOverflow(page);
    await page.reload({ waitUntil: "domcontentloaded" });
    await expect(page).toHaveURL(browseUrl);
    await expectSelectedBooks(page, "county");
    await expect(page.getByRole("dialog")).toHaveCount(0);
    const restoredCard = page.locator("main article").filter({ has: page.getByRole("heading", { name: placeName, exact: true }) });
    const restoredOpen = restoredCard.getByRole("button", { name: /^View Curious Iguana .*details$/ });
    await expectReachableTarget(restoredOpen, { page, info, label: "nearby-restored-open" });
    const scrollBeforeReopen = await page.evaluate(() => scrollY);
    await openFullSheet(page, restoredOpen);
    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await expect(restoredOpen).toBeFocused();
    await expect.poll(async () => Math.abs(await page.evaluate(() => scrollY) - scrollBeforeReopen)).toBeLessThan(80);
    await expectSelectedBooks(page, "county");
    await expectNoOverflow(page);
    await info.attach("nearby-canonical-return", { contentType: "application/json", body: JSON.stringify({ width, browseUrl, fullPage: fullHref.href, conflictingSavedScope: "town:brunswick", reloadedUrl: page.url(), selectedFacet: "Books", selectedSort: "Top rated", selectedScope: "county", oneOverlay: true, restoredPlace: placeSlug }) });
  });
}


for (const dismissal of ["Back", "Close", "Escape"] as const) {
  test(`Nearby filter ${dismissal} discards the draft and restores the same list`, async ({ page }) => {
    await chooseBooks(page, "frederick");
    const before = page.url();
    const { trigger, dialog } = await openFilters(page);
    await dialog.getByRole("button", { name: "All", exact: true }).click();
    await dialog.getByRole("button", { name: "Smart", exact: true }).click();
    await expect(dialog.getByRole("button", { name: "All", exact: true })).toHaveAttribute("aria-pressed", "true");
    await expect(page).toHaveURL(before);
    if (dismissal === "Back") await page.goBack();
    else if (dismissal === "Close") await dialog.getByRole("button", { name: "Close filters & sort", exact: true }).click();
    else await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await expect(trigger).toBeFocused();
    await expectSelectedBooks(page, "frederick");
    const reopened = await openFilters(page);
    await expect(reopened.dialog.getByRole("button", { name: "Books", exact: true })).toHaveAttribute("aria-pressed", "true");
    await expect(reopened.dialog.getByRole("button", { name: "Top rated", exact: true })).toHaveAttribute("aria-pressed", "true");
    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await expectNoOverflow(page);
  });
}


test.describe("Nearby scope and category Back", () => {

// Rosemont has no bookstore in the real catalog. Search all towns exercises
// native scope updates without a reload concealing an obsolete town origin.
test.use({ viewport: { width: 390, height: 844 }, serviceWorkers: "block" });
test.setTimeout(90_000);

const EXTERNAL_REFERRER = "https://example.org/frederick-nearby-acceptance";
const PICKER = "Find something nearby";
const COUNTY_BOOKS = "Books across Frederick County";
const requests = new WeakMap<Page, { paidAttempts: string[]; writes: string[] }>();

async function ready(page: Page) {
  await expect(page.locator('[data-nearby-interaction-ready="true"]')).toBeVisible();
}

async function scopeIs(page: Page, value: string) {
  await expect.poll(() => new URL(page.url()).searchParams.get("in")).toBe(value);
}

async function openFilters(page: Page) {
  const open = page.getByRole("main").getByRole("button", { name: /^Filters\b/ });
  await expect(open).toBeVisible();
  await open.click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toHaveCount(1);
  await expect(dialog).toBeVisible();
  return dialog;
}

async function closeFilters(page: Page) {
  await page.getByRole("dialog").getByRole("button", { name: "Done", exact: true }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
}

async function expectNoPreciseOrigin(page: Page) {
  // Assert the actual sort chooser, not merely a hidden/unmounted mobile row.
  const dialog = await openFilters(page);
  await expect(dialog.getByRole("button", { name: "Nearest", exact: true })).toHaveCount(0);
  await closeFilters(page);
  const root = page.locator('[data-nearby-interaction-ready="true"]');
  await expect(root.getByRole("heading", { level: 1 })).toHaveText(COUNTY_BOOKS);
  await expect(root).not.toContainText(/first, then nearest|nearest first|nearest to you|approximately near Rosemont/i);
  // A distance must not be inferred from a town/IP centroid after refusal.
  await expect(root.locator("article").first()).toBeVisible();
  await expect.poll(async () => (await root.locator("article").allTextContents()).some((text) => /\b\d+(?:\.\d+)?\s*(?:min walk|mi)\b/i.test(text))).toBe(false);
}

test.beforeEach(async ({ page, context, baseURL }) => {
  if (!baseURL) throw new Error("Set baseURL to the reviewed local candidate; this spec starts no server.");
  const origin = new URL(baseURL).origin;
  const ledger = { paidAttempts: [] as string[], writes: [] as string[] };
  requests.set(page, ledger);
  await page.emulateMedia({ reducedMotion: "reduce" });
  // Chromium's permission override grants none and denies geolocation. This
  // uses the browser permission implementation, with no invented device fix.
  await context.grantPermissions([], { origin });
  await context.addCookies([{ name: "fr_onboarded", value: "1", url: origin }]);
  // No edge/IP origin exists in this local acceptance case. Empty values must
  // resolve as missing; no precise or approximate location is fabricated.
  await page.setExtraHTTPHeaders({
    "x-vercel-ip-latitude": "", "x-vercel-ip-longitude": "", "x-vercel-ip-city": "",
  });
  await page.addInitScript(() => {
    localStorage.setItem("fr:appearance:v1", "light");
    localStorage.removeItem("fr:scope:v1");
    sessionStorage.removeItem("fr_geo_v1");
  });
  await page.route("**/*", (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const telemetry = url.pathname === "/api/track" || url.pathname.startsWith("/_vercel/insights") || /(^|\.)(plausible\.io|google-analytics\.com)$/.test(url.hostname);
    if (telemetry) return route.fulfill({ status: 204 });
    if (!["GET", "HEAD"].includes(request.method())) {
      ledger.writes.push(`${request.method()} ${url.pathname}`);
      return route.abort("blockedbyclient");
    }
    const imageSource = url.pathname === "/_next/image" ? url.searchParams.get("url") ?? "" : "";
    const paid = url.pathname === "/api/place-photo" || /\/api\/place-photo|googleapis\.com|googleusercontent\.com/.test(imageSource) || /(^|\.)(googleapis\.com|googleusercontent\.com|mapbox\.com|mapbox\.cn)$/.test(url.hostname);
    if (paid) {
      ledger.paidAttempts.push(url.pathname);
      return route.abort("blockedbyclient");
    }
    // No external referral page is loaded: goto's Referer header alone tests
    // the real document.referrer branch. All other external transport is off.
    if (url.origin !== origin) return route.abort("blockedbyclient");
    return route.continue();
  });
});

test.afterEach(async ({ page }, info) => {
  await info.attach("nearby-edge-transport", {
    contentType: "application/json", body: JSON.stringify(requests.get(page)),
  });
});

for (const entry of ["direct", "external"] as const) {
  test(`a ${entry} Nearby picker entry returns to its real picker with visible Back`, async ({ page }) => {
    const response = await page.goto("/nearby?in=county", {
      waitUntil: "domcontentloaded", ...(entry === "external" ? { referer: EXTERNAL_REFERRER } : {}),
    });
    expect(response?.status()).toBe(200);
    await ready(page);
    await expect(page.getByRole("heading", { level: 1, name: PICKER, exact: true })).toBeVisible();
    const referrer = await page.evaluate(() => document.referrer);
    if (entry === "direct") expect(referrer).toBe("");
    else expect(new URL(referrer).origin).toBe("https://example.org");
    const pickerUrl = page.url();
    await page.getByRole("main").getByRole("button", { name: "Shops", exact: true }).click();
    await expect.poll(() => new URL(page.url()).searchParams.get("c")).toBe("shops");
    await expect(page.getByRole("heading", { level: 1, name: "Shops across Frederick County", exact: true })).toBeVisible();
    await page.getByRole("main").getByRole("button", { name: "Back", exact: true }).click();
    await expect(page).toHaveURL(pickerUrl);
    await expect(page.getByRole("heading", { level: 1, name: PICKER, exact: true })).toBeVisible();
    await expect(page.getByRole("main").getByRole("button", { name: "Shops", exact: true })).toBeVisible();
    await expect(page.getByRole("dialog")).toHaveCount(0);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  });
}

test("empty-town recovery and denied Near me never reuse a former town as precise origin", async ({ page }) => {
  const response = await page.goto("/nearby?c=shops&facet=book-store&in=rosemont", { waitUntil: "domcontentloaded" });
  expect(response?.status()).toBe(200);
  await ready(page);
  await expect(page.getByRole("heading", { level: 1, name: "Books in Rosemont", exact: true })).toBeVisible();
  // First establish that the chosen town legitimately permits nearest sorting.
  const dialog = await openFilters(page);
  await expect(dialog.getByRole("button", { name: "Nearest", exact: true })).toBeVisible();
  await dialog.getByRole("button", { name: "Nearest", exact: true }).click();
  await closeFilters(page);
  await expect.poll(() => new URL(page.url()).searchParams.get("sort")).toBe("nearest");
  await expect(page.getByRole("main").getByRole("button", { name: "Search all towns", exact: true })).toBeVisible();
  await page.getByRole("main").getByRole("button", { name: "Search all towns", exact: true }).click();
  await scopeIs(page, "county");
  await expectNoPreciseOrigin(page);
  await expect(page.getByRole("heading", { name: "Curious Iguana", exact: true })).toBeVisible();
  expect(await page.evaluate(async () => (await navigator.permissions.query({ name: "geolocation" })).state)).toBe("denied");
  // Exercise Nearby's actual native scope update rather than the shared header
  // router navigation, which would refresh away the obsolete server context.
  await page.getByRole("main").getByRole("button", { name: /^Use my location\b/ }).click();
  await scopeIs(page, "nearme");
  await expect(page.getByRole("main").getByRole("status").filter({ hasText: "Location is off." })).toBeVisible();
  await expectNoPreciseOrigin(page);
  const url = new URL(page.url());
  expect(url.searchParams.get("facet")).toBe("book-store");
  expect(url.searchParams.get("sort")).toBe("nearest");
  expect([...url.searchParams.keys()].some((key) => /^(lat|lng|latitude|longitude)$/.test(key))).toBe(false);
  await expect(page.getByRole("dialog")).toHaveCount(0);
});

});

for (const dismissal of ["Escape", "Close"] as const) {
  test(`Done followed immediately by ${dismissal} applies once without skipping Nearby`, async ({ page }) => {
    await page.goto("/nearby?in=frederick", { waitUntil: "domcontentloaded" });
    await expect(page.locator('[data-nearby-interaction-ready="true"]')).toBeVisible();
    const pickerUrl = page.url();
    await page.getByRole("main").getByRole("button", { name: "Shops", exact: true }).click();
    await expect(page.getByRole("heading", { level: 1, name: "Shops in Frederick City", exact: true })).toBeVisible();
    const { dialog } = await openFilters(page);
    await dialog.getByRole("button", { name: "Books", exact: true }).click();
    await dialog.getByRole("button", { name: "Top rated", exact: true }).click();
    // Deliberately issue both real UI handlers in one task before popstate can
    // arrive. Sequential awaited clicks cannot reproduce this traversal race.
    await dialog.evaluate((node, dismissal) => {
      const buttons = Array.from(node.querySelectorAll("button"));
      buttons.find((button) => button.textContent?.trim() === "Done")!.click();
      if (dismissal === "Escape") window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
      else buttons.find((button) => button.getAttribute("aria-label") === "Close filters & sort")!.click();
    }, dismissal);
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await expectSelectedBooks(page, "frederick");
    await expect(page.getByRole("main").getByRole("button", { name: /^Filters & sort/ })).toBeFocused();
    await page.getByRole("main").getByRole("button", { name: "Back", exact: true }).click();
    await expect(page).toHaveURL(pickerUrl);
    await expect(page.getByRole("heading", { level: 1, name: "Find something nearby", exact: true })).toBeVisible();
  });
}
