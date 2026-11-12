import { expect, test, type Locator, type Page, type TestInfo } from "@playwright/test";
import { writeFile } from "node:fs/promises";
import { registerWebkitLoopbackDocumentSeam } from "./webkit-loopback-document";

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
    await expect.poll(async () => {
      // A just-dismissed history layer can finish restoring its scroll across
      // two frames. Retry the real scroll as well as the unchanged hit probes.
      await target.evaluate((node) => node.scrollIntoView({ block: "center" }));
      return diagnostics ? inspect().then(state => {
        samples.push({ stage: "physical-probe", state });
        return state.points.every(point => point.owned);
      }) : target.evaluate((node) => {
        const box = node.getBoundingClientRect();
        const x = box.left + box.width / 2, y = box.top + box.height / 2;
        return [[x, y], [x - 21.5, y], [x + 21.5, y], [x, y - 21.5], [x, y + 21.5]].every(([px, py]) => {
          const hit = document.elementFromPoint(px, py);
          return hit === node || Boolean(hit && node.contains(hit));
        });
      });
    }).toBe(true);
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
    const before = { url: page.url() };
    await startReopenDiagnostics(open);
    try {
      const { dialog } = await openFullSheet(page, open);
      await recordReopenDiagnostics(page, "full-dialog-open");
      if (dismissal === "Back") await page.goBack();
      else if (dismissal === "Close") await dialog.getByRole("button", { name: "Close place details", exact: true }).click();
      else await page.keyboard.press("Escape");
      await expect(page.getByRole("dialog")).toHaveCount(0);
      await expectSelectedBooks(page, "frederick");
      await expect(page).toHaveURL(before.url);
      await expect(card.getByRole("heading", { name: placeName, exact: true })).toBeVisible();
      await expect(open).toBeFocused();
      await recordReopenDiagnostics(page, "after-close-and-focus");
      await expectRestoredOpeningPosition(page, open);
      await expectNoOverflow(page);
      await info.attach("nearby-sheet-return", { contentType: "application/json", body: JSON.stringify({ dismissal, before: { ...before, openingPosition: await trustedReopenBaseline(page) }, after: { url: page.url(), scrollY: await page.evaluate(() => scrollY) }, restoredPlace: placeSlug }) });
    } finally {
      await recordReopenDiagnostics(page, "final-or-failed-scroll-assertion");
      await attachReopenDiagnostics(page, info);
    }
  });
}

test("Nearby controls remain reachable and one sheet closes back to the same result at 320px", async ({ page }, info) => {
  await page.setViewportSize({ width: 320, height: 568 });
  const { card, open } = await chooseBooks(page, "frederick");
  const filters = await openFilters(page);
  await expectReachableTarget(filters.dialog.getByRole("button", { name: "Books", exact: true }));
  await expectReachableTarget(filters.dialog.getByRole("button", { name: "Top rated", exact: true }));
  await expectReachableTarget(filters.dialog.getByRole("button", { name: "Done", exact: true }));
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(filters.trigger).toBeFocused();
  await expectReachableTarget(card.locator(`[data-save-ref="place:${placeSlug}"]`), { page, info, label: "nearby-save-320" });
  await expectReachableTarget(open);
  const before = { url: page.url() };
  await expectNoOverflow(page);
  await startReopenDiagnostics(open);
  try {
    const { dialog } = await openFullSheet(page, open);
    await recordReopenDiagnostics(page, "full-dialog-open");
    const close = dialog.getByRole("button", { name: "Close place details", exact: true });
    await expectReachableTarget(close);
    await expectNoOverflow(page);
    await close.click();
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await expectSelectedBooks(page, "frederick");
    await expect(page).toHaveURL(before.url);
    await expect(open).toBeFocused();
    await recordReopenDiagnostics(page, "after-close-and-focus");
    await expectRestoredOpeningPosition(page, open);
    await expectNoOverflow(page);
  } finally {
    await recordReopenDiagnostics(page, "final-or-failed-scroll-assertion");
    await attachReopenDiagnostics(page, info);
  }
});

async function startReopenDiagnostics(open: Locator, nativeEvents = false) {
  await open.evaluate((node, nativeEvents) => {
    (window as unknown as { __nearbyReopenDiagnostics?: { cleanup?: () => void } }).__nearbyReopenDiagnostics?.cleanup?.();
    const snapshots: unknown[] = [];
    const cleanups: Array<() => void> = [];
    const describe = (element: Element | null) => {
      if (!element) return null;
      const rect = element.getBoundingClientRect(), style = getComputedStyle(element);
      return { tag: element.tagName, label: element.getAttribute("aria-label"), text: element.textContent?.trim().slice(0, 100), rect: { x: rect.x, y: rect.y, width: rect.width, height: rect.height }, clientHeight: element.clientHeight, scrollHeight: element.scrollHeight, position: style.position, overflow: style.overflow, transform: style.transform };
    };
    const capture = (stage: string, trustedClick?: boolean, event?: Record<string, unknown>) => {
      if (snapshots.length >= 96) return;
      const card = node.closest("article");
      snapshots.push({ stage, at: performance.now(), trustedClick, event, scrollY, scrollHeight: document.documentElement.scrollHeight, viewport: { width: innerWidth, height: innerHeight, offsetTop: visualViewport?.offsetTop }, bodyOverflow: document.body.style.overflow, history: { layer: history.state?.__frederickRadiusLayer, scrollY: history.state?.__frederickRadiusLayerScrollY }, url: location.pathname + location.search, openerConnected: node.isConnected, nearbyReady: node.closest("[data-nearby-interaction-ready]")?.getAttribute("data-nearby-interaction-ready"), active: describe(document.activeElement), open: describe(node), card: describe(card), hasPhoto: card?.getAttribute("data-place-card-has-photo"), dialogs: Array.from(document.querySelectorAll('[role="dialog"]')).slice(0, 3).map(describe), photos: Array.from(card?.querySelectorAll("[data-place-card-photo], img") ?? []).slice(0, 4).map(element => ({ ...describe(element), source: element.getAttribute("data-place-card-photo-source"), bytes: element.getAttribute("data-place-card-photo-bytes"), src: element instanceof HTMLImageElement ? element.currentSrc || element.getAttribute("src") : null, complete: element instanceof HTMLImageElement ? element.complete : undefined, naturalWidth: element instanceof HTMLImageElement ? element.naturalWidth : undefined })), precedingCards: Array.from(document.querySelectorAll('main article[data-place-card-variant="discovery"]')).slice(0, 16).map(element => ({ ...describe(element), hasPhoto: element.getAttribute("data-place-card-has-photo") })) });
    };
    const openerClick = (event: Event) => capture("trusted-click-before-product-handler", event.isTrusted);
    node.addEventListener("click", openerClick, { capture: true, once: true, passive: true });
    cleanups.push(() => node.removeEventListener("click", openerClick, true));
    if (nativeEvents) {
      const nativeInput = (event: Event) => {
        const target = event.target instanceof Element ? event.target : null;
        const point = event instanceof MouseEvent ? { x: event.clientX, y: event.clientY, button: event.button } : null;
        const hit = point ? document.elementFromPoint(point.x, point.y) : null;
        capture(`document-${event.type}`, event.isTrusted, {
          type: event.type, trusted: event.isTrusted, point, target: describe(target),
          targetOwnedByOpener: Boolean(target && (target === node || node.contains(target))),
          hit: describe(hit), hitOwnedByOpener: Boolean(hit && (hit === node || node.contains(hit))),
          path: event.composedPath().filter((element): element is Element => element instanceof Element).slice(0, 6).map(describe),
        });
      };
      for (const type of ["pointerdown", "pointerup", "mousedown", "mouseup", "click", "focusin"]) {
        document.addEventListener(type, nativeInput, { capture: true, passive: true });
        cleanups.push(() => document.removeEventListener(type, nativeInput, true));
      }
      const onPop = (event: PopStateEvent) => capture("window-popstate", event.isTrusted, {
        type: event.type, trusted: event.isTrusted, layer: event.state?.__frederickRadiusLayer,
      });
      window.addEventListener("popstate", onPop, { passive: true });
      cleanups.push(() => window.removeEventListener("popstate", onPop));
      const observer = new MutationObserver(records => {
        const changes: Array<{ kind: string; dialog: ReturnType<typeof describe> }> = [];
        for (const record of records) {
          for (const [kind, nodes] of [["added", record.addedNodes], ["removed", record.removedNodes]] as const) {
            for (const changed of nodes) {
              if (!(changed instanceof Element)) continue;
              const dialogs = changed.matches('[role="dialog"]') ? [changed] : Array.from(changed.querySelectorAll('[role="dialog"]')).slice(0, 3);
              for (const dialog of dialogs) if (changes.length < 8) changes.push({ kind, dialog: describe(dialog) });
            }
          }
        }
        if (changes.length) capture("dialog-mutation", undefined, { changes });
      });
      observer.observe(document.body, { childList: true, subtree: true });
      cleanups.push(() => observer.disconnect());
    }
    const cleanup = () => { for (const stop of cleanups) stop(); };
    (window as unknown as { __nearbyReopenDiagnostics: { snapshots: unknown[]; capture: typeof capture; cleanup: () => void } }).__nearbyReopenDiagnostics = { snapshots, capture, cleanup };
    capture("before-reopen");
  }, nativeEvents);
}

async function recordReopenDiagnostics(page: Page, stage: string) {
  await page.evaluate(stage => {
    (window as unknown as { __nearbyReopenDiagnostics?: { capture: (stage: string) => void } }).__nearbyReopenDiagnostics?.capture(stage);
  }, stage);
}

async function attachReopenDiagnostics(page: Page, info: TestInfo, label = "nearby-reopen-scroll-geometry") {
  const snapshots = await page.evaluate(() => {
    const diagnostics = (window as unknown as { __nearbyReopenDiagnostics?: { snapshots: unknown[]; cleanup?: () => void } }).__nearbyReopenDiagnostics;
    diagnostics?.cleanup?.();
    return diagnostics?.snapshots ?? [];
  });
  const path = info.outputPath(`${label}.json`);
  await writeFile(path, JSON.stringify(snapshots, null, 2));
  await info.attach(label, { contentType: "application/json", path });
}

async function trustedReopenBaseline(page: Page) {
  return page.evaluate(() => {
    const state = (window as unknown as { __nearbyReopenDiagnostics?: { snapshots: Array<{ stage?: string; trustedClick?: boolean; scrollY?: number; open?: { rect?: { y?: number } } }> } }).__nearbyReopenDiagnostics;
    const click = state?.snapshots.find(snapshot => snapshot.stage === "trusted-click-before-product-handler" && snapshot.trustedClick === true);
    const scrollY = click?.scrollY, openerY = click?.open?.rect?.y;
    return typeof scrollY === "number" && Number.isFinite(scrollY) && typeof openerY === "number" && Number.isFinite(openerY)
      ? { scrollY, openerY }
      : null;
  });
}

async function expectRestoredOpeningPosition(page: Page, open: Locator) {
  // Lazy photos may settle above the result before a real click. Compare with
  // that captured action, preserving both scroll and the visible place.
  const openingPosition = await trustedReopenBaseline(page);
  expect(openingPosition, "the real opener click must record finite scroll and visual coordinates").not.toBeNull();
  if (!openingPosition) throw new Error("Missing trusted opener click geometry");
  await expect.poll(async () => Math.abs(await page.evaluate(() => scrollY) - openingPosition.scrollY)).toBeLessThan(80);
  await expect.poll(async () => Math.abs(await open.evaluate(node => node.getBoundingClientRect().y) - openingPosition.openerY)).toBeLessThan(80);
}

for (const width of [390, 320]) {
  test(`the full place page returns to explicit county Books and Top rated after saved scope changes at ${width}px`, async ({ page, context }, info) => {
    await page.setViewportSize({ width, height: width === 320 ? 568 : 844 });
    const { open } = await chooseBooks(page, "county");
    const browseUrl = page.url();
    await startReopenDiagnostics(open, true);
    const { fullPage } = await openFullSheet(page, open).finally(async () => {
      await recordReopenDiagnostics(page, "initial-open-complete-or-failed");
      await attachReopenDiagnostics(page, info, "nearby-initial-open-geometry");
    });
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
    await startReopenDiagnostics(restoredOpen);
    try {
      await openFullSheet(page, restoredOpen);
      await recordReopenDiagnostics(page, "full-dialog-open");
      await page.keyboard.press("Escape");
      await expect(page.getByRole("dialog")).toHaveCount(0);
      await expect(restoredOpen).toBeFocused();
      await recordReopenDiagnostics(page, "after-close-and-focus");
      await expectRestoredOpeningPosition(page, restoredOpen);
    } finally {
      await recordReopenDiagnostics(page, "final-or-failed-scroll-assertion");
      await attachReopenDiagnostics(page, info);
    }
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
    if (request.method() === "GET" && request.isNavigationRequest() && request.resourceType() === "document") return route.fallback();
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

test("empty-town recovery and denied Near me never reuse a former town as precise origin", async ({ page, browserName }, info) => {
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
  const permissionBefore = await page.evaluate(async () => (await navigator.permissions.query({ name: "geolocation" })).state);
  try {
    if (browserName === "chromium") expect(permissionBefore).toBe("denied");
    // WebKit can report prompt after grantPermissions([]). Observe the real
    // native callback; never replace its outcome or record any coordinates.
    await page.evaluate(() => {
      const native = navigator.geolocation.getCurrentPosition;
      const observations = { successCount: 0, errorCodes: [] as number[] };
      (window as unknown as { __nearbyNativeLocation: typeof observations }).__nearbyNativeLocation = observations;
      navigator.geolocation.getCurrentPosition = function (success, error, options) {
        return native.call(this, position => {
          observations.successCount++;
          success(position);
        }, failure => {
          observations.errorCodes.push(failure.code);
          error?.(failure);
        }, options);
      };
    });
    // Exercise Nearby's actual native scope update rather than the shared header
    // router navigation, which would refresh away the obsolete server context.
    await page.getByRole("main").getByRole("button", { name: /^Use my location\b/ }).click();
    await scopeIs(page, "nearme");
    await expect.poll(() => page.evaluate(() => (window as unknown as { __nearbyNativeLocation: { errorCodes: number[] } }).__nearbyNativeLocation.errorCodes)).toContain(1);
    expect(await page.evaluate(() => (window as unknown as { __nearbyNativeLocation: { successCount: number } }).__nearbyNativeLocation.successCount)).toBe(0);
    await expect(page.getByRole("main").getByRole("status").filter({ hasText: "Location is off." })).toBeVisible();
    await expectNoPreciseOrigin(page);
    const url = new URL(page.url());
    expect(url.searchParams.get("facet")).toBe("book-store");
    expect(url.searchParams.get("sort")).toBe("nearest");
    expect([...url.searchParams.keys()].some((key) => /^(lat|lng|latitude|longitude)$/.test(key))).toBe(false);
    await expect(page.getByRole("dialog")).toHaveCount(0);
  } finally {
    const nativeCallbacks = await page.evaluate(() => (window as unknown as { __nearbyNativeLocation?: { successCount: number; errorCodes: number[] } }).__nearbyNativeLocation ?? null);
    await info.attach("nearby-native-permission", { contentType: "application/json", body: JSON.stringify({ browserName, permissionBefore, nativeCallbacks }) });
  }
});

});

for (const dismissal of ["Escape", "Close"] as const) {
  test(`Done followed immediately by ${dismissal} applies once without skipping Nearby`, async ({ page }, info) => {
    try {
      await page.goto("/nearby?in=frederick", { waitUntil: "domcontentloaded" });
      await expect(page.locator('[data-nearby-interaction-ready="true"]')).toBeVisible();
      const pickerUrl = page.url();
      await page.getByRole("main").getByRole("button", { name: "Shops", exact: true }).click();
      await expect(page.getByRole("heading", { level: 1, name: "Shops in Frederick City", exact: true })).toBeVisible();
      const { dialog } = await openFilters(page);
      await dialog.getByRole("button", { name: "Books", exact: true }).click();
      await dialog.getByRole("button", { name: "Top rated", exact: true }).click();
      await page.evaluate(() => {
        const records: unknown[] = [];
        const describe = (element: Element | null) => element ? {
          tag: element.tagName, label: element.getAttribute("aria-label"),
          text: element.textContent?.trim().slice(0, 72), connected: element.isConnected,
        } : null;
        const capture = (stage: string, target: Element | null = null) => {
          if (records.length >= 80) return;
          records.push({ stage, at: performance.now(), url: location.pathname + location.search + location.hash,
            layer: history.state?.__frederickRadiusLayer ?? null,
            active: describe(document.activeElement), target: describe(target),
            dialogs: [...document.querySelectorAll('[role="dialog"]')].map(describe).slice(0, 2) });
        };
        const nativeFocus = HTMLElement.prototype.focus;
        const observedFocus: typeof nativeFocus = function (this: HTMLElement, ...args: Parameters<typeof nativeFocus>) {
          capture("focus-call-before", this);
          const result = nativeFocus.apply(this, args);
          capture("focus-call-after", this);
          return result;
        };
        HTMLElement.prototype.focus = observedFocus;
        const focusIn = (event: FocusEvent) => capture("focusin", event.target instanceof Element ? event.target : null);
        const popstate = () => capture("popstate");
        document.addEventListener("focusin", focusIn, true);
        window.addEventListener("popstate", popstate, true);
        let paint = 0;
        const frameIds: number[] = [];
        const paints = () => {
          if (paint >= 3) return;
          frameIds.push(requestAnimationFrame(() => { capture(`paint-${++paint}`); paints(); }));
        };
        const cleanup = () => {
          if (HTMLElement.prototype.focus === observedFocus) HTMLElement.prototype.focus = nativeFocus;
          document.removeEventListener("focusin", focusIn, true);
          window.removeEventListener("popstate", popstate, true);
          frameIds.forEach(cancelAnimationFrame);
        };
        (window as unknown as { __nearbyFilterFocusDiagnostic: { records: unknown[]; capture: typeof capture; paints: typeof paints; cleanup: typeof cleanup } })
          .__nearbyFilterFocusDiagnostic = { records, capture, paints, cleanup };
        capture("before-done-and-dismissal");
      });
      // Deliberately issue both real UI handlers in one task before popstate can
      // arrive. Sequential awaited clicks cannot reproduce this traversal race.
      await dialog.evaluate((node, dismissal) => {
        const buttons = Array.from(node.querySelectorAll("button"));
        buttons.find((button) => button.textContent?.trim() === "Done")!.click();
        if (dismissal === "Escape") window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
        else buttons.find((button) => button.getAttribute("aria-label") === "Close filters & sort")!.click();
        const diagnostic = (window as unknown as { __nearbyFilterFocusDiagnostic?: { capture: (stage: string) => void; paints: () => void } }).__nearbyFilterFocusDiagnostic;
        diagnostic?.capture("after-done-and-dismissal");
        diagnostic?.paints();
      }, dismissal);
      await expect(page.getByRole("dialog")).toHaveCount(0);
      await expectSelectedBooks(page, "frederick");
      await expect(page.getByRole("main").getByRole("button", { name: /^Filters & sort/ })).toBeFocused();
      const appliedUrl = new URL(page.url());
      const appliedHref = appliedUrl.pathname + appliedUrl.search + appliedUrl.hash;
      const restorationCalls = await page.evaluate(() => {
        const diagnostic = (window as unknown as { __nearbyFilterFocusDiagnostic?: { records: Array<{ stage: string; url: string; target: { label?: string | null } | null }> } }).__nearbyFilterFocusDiagnostic;
        return diagnostic?.records.filter(record => record.stage === "focus-call-before" && record.target?.label === "Filters & sort") ?? [];
      });
      expect(restorationCalls.length, "The app must restore focus to the actual filter opener").toBeGreaterThan(0);
      expect(restorationCalls.map(record => record.url), "Focus may return only after the exact applied Books and rated URL is committed")
        .toEqual(restorationCalls.map(() => appliedHref));
      await page.getByRole("main").getByRole("button", { name: "Back", exact: true }).click();
      await expect(page).toHaveURL(pickerUrl);
      await expect(page.getByRole("heading", { level: 1, name: "Find something nearby", exact: true })).toBeVisible();
    } finally {
      const records = await page.evaluate(() => {
        const diagnostic = (window as unknown as { __nearbyFilterFocusDiagnostic?: { records: unknown[]; capture: (stage: string) => void; cleanup: () => void } }).__nearbyFilterFocusDiagnostic;
        diagnostic?.capture("final-or-failed-assertion");
        diagnostic?.cleanup();
        return diagnostic?.records ?? null;
      }).catch(() => null);
      const label = `nearby-done-${dismissal.toLowerCase()}-focus-url`;
      const path = info.outputPath(`${label}.json`);
      await writeFile(path, JSON.stringify({ title: info.title, retry: info.retry, records }, null, 2));
      await info.attach(label, { contentType: "application/json", path });
    }
  });
}

registerWebkitLoopbackDocumentSeam();


test("Parks keeps an old explicit hours filter understandable and clears only its hours flags", async ({ page }) => {
  const path = "/nearby?c=outside&facet=park&open=1&closing=1&sort=rated&in=frederick&returnTo=%2Ftoday%3Fin%3Dfrederick#results";
  await page.goto(path, { waitUntil: "domcontentloaded" });
  const notice = page.locator("[data-nearby-legacy-hours-filter]");
  await expect(notice).toContainText("This link filters for confirmed hours");
  expect(new URL(page.url()).searchParams.get("open")).toBe("1");
  const clear = notice.getByRole("button", { name: "Show all matching parks", exact: true });
  await expectReachableTarget(clear);
  await clear.click();
  await expect(notice).toHaveCount(0);
  const url = new URL(page.url());
  expect(url.searchParams.get("open")).toBeNull(); expect(url.searchParams.get("closing")).toBeNull();
  expect(url.searchParams.get("facet")).toBe("park"); expect(url.searchParams.get("sort")).toBe("rated");
  expect(url.searchParams.get("in")).toBe("frederick");
  expect(url.searchParams.get("returnTo")).toBe("/today?in=frederick"); expect(url.hash).toBe("#results");
  const filters = await openFilters(page);
  await expect(filters.dialog.getByRole("button", { name: "Open now", exact: true })).toHaveCount(0);
  await expect(filters.dialog.getByRole("button", { name: "Closing soon", exact: true })).toHaveCount(0);
  await page.keyboard.press("Escape");
  await expect(filters.trigger).toBeFocused();
});

test("Parks photo discovery retains result order, scope, native Back and every action", async ({ page }, info) => {
  await page.goto("/nearby?c=outside&facet=park&sort=rated&in=frederick", { waitUntil: "domcontentloaded" });
  const grid = page.locator("[data-nearby-parks-grid]"); await expect(grid).toBeVisible();
  const slug = "carroll-creek-linear-park-frederick";
  const card = grid.locator(`[data-place-card-slug="${slug}"]`);
  const open = card.getByRole("button", { name: /^View Carroll Creek Linear Park .*details$/ });
  await expectReachableTarget(open);
  const before = { url: page.url(), order: await grid.locator("article").evaluateAll(cards => cards.map(card => card.getAttribute("data-place-card-slug"))) };
  await expectReachableTarget(card.locator(`[data-save-ref="place:${slug}"]`));
  const directions = card.getByRole("link", { name: /^Directions to Carroll Creek Linear Park / });
  await expectReachableTarget(directions);
  await expect(directions).toHaveAttribute("href", /[?&](?:destination|daddr)=39\.412[^&]*,-77\.408/);
  await expectReachableTarget(open);
  await startReopenDiagnostics(open);
  try {
    await open.click();
    const dialog = page.getByRole("dialog");
    await expect(dialog.getByRole("heading", { name: "Carroll Creek Linear Park", exact: true })).toBeVisible();
    await page.goBack(); await expect(dialog).toHaveCount(0);
    await expect(page).toHaveURL(before.url); await expect(open).toBeFocused();
    expect(await grid.locator("article").evaluateAll(cards => cards.map(card => card.getAttribute("data-place-card-slug")))).toEqual(before.order);
    await expectRestoredOpeningPosition(page, open);
    await expectReachableTarget(open);
    await expectNoOverflow(page);
    await info.attach("parks-result-return", { contentType: "application/json", body: JSON.stringify(before) });
  } finally { await attachReopenDiagnostics(page, info); }
});


test("an unrefined Outdoors hours link keeps the broad collection when cleared", async ({ page }) => {
  await page.goto("/nearby?c=outside&open=1&sort=rated&in=frederick#results", { waitUntil: "domcontentloaded" });
  const notice = page.locator("[data-nearby-legacy-hours-filter]");
  await expect(notice).toContainText("Visiting hours are not listed for every outdoor place.");
  const clear = notice.getByRole("button", { name: "Show all matching outdoor places", exact: true });
  await expectReachableTarget(clear); await clear.click();
  await expect(notice).toHaveCount(0);
  const url = new URL(page.url());
  expect(url.searchParams.get("c")).toBe("outside"); expect(url.searchParams.has("facet")).toBe(false);
  expect(url.searchParams.has("open")).toBe(false); expect(url.searchParams.get("sort")).toBe("rated");
  expect(url.searchParams.get("in")).toBe("frederick"); expect(url.hash).toBe("#results");
});
