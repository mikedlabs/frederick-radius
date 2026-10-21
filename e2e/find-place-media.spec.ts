import { readFileSync } from "node:fs";
import { expect, test, type Locator, type Page } from "@playwright/test";
import { registerWebkitLoopbackDocumentSeam } from "./webkit-loopback-document";

// Only image transport is controlled. Search results and their exact source
// metadata come from the built app and real reviewed registry. Successful
// bundled imagery uses the real local optimizer and bytes. Owned image bytes
// stand in only for remote Commons transport, not remote availability or
// visual correctness. Failure cases target the exact bundled Cunningham file.
// No paid photo/media provider is called.
const ownedImage = readFileSync("public/images/seasons/summer/SUMMER CARROL CREEK.jpg");
const pixel = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAC0lEQVR4nGNgAAIAAAUAAXpeqz8AAAAASUVORK5CYII=", "base64");
const creek = "carroll-creek-linear-park-frederick";
const falls = "cunningham-falls-state-park-thurmont";
const fallsPhoto = "/place-photos/cunningham-falls.jpg";
const imageFailures = new WeakMap<Page, Array<{ url: string; status?: number; error?: string }>>();

test.use({ serviceWorkers: "block" });
test.beforeEach(async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.addInitScript(() => {
    localStorage.setItem("fr:scope:v1", "county");
    localStorage.setItem("fr:appearance:v1", "light");
    document.cookie = "fr_scope=county; path=/";
    document.cookie = "fr_onboarded=1; path=/";
  });
});

async function imageTransport(page: Page, failure?: "error" | "transparent") {
  const failures: Array<{ url: string; status?: number; error?: string }> = [];
  imageFailures.set(page, failures);
  const exactPhoto = (raw: string) => {
    const url = new URL(raw);
    return url.pathname === fallsPhoto || (url.pathname === "/_next/image" && url.searchParams.get("url") === fallsPhoto);
  };
  page.on("requestfailed", (request) => {
    if (failures.length < 16 && exactPhoto(request.url())) failures.push({ url: request.url(), error: request.failure()?.errorText });
  });
  page.on("response", (response) => {
    if (failures.length < 16 && response.status() >= 400 && exactPhoto(response.url())) failures.push({ url: response.url(), status: response.status() });
  });
  const injectedFailures: string[] = [];
  let releaseFailure!: () => void;
  const failureReady = new Promise<void>((resolve) => { releaseFailure = resolve; });
  await page.route("**/api/place-photo?**", (route) => route.abort());
  await page.route("**/_next/image?**", async (route) => {
    const source = new URL(route.request().url()).searchParams.get("url") ?? "";
    if (source === fallsPhoto) {
      // Do not fulfill the successful local request: a missing optimizer
      // allowlist entry must fail the success gate rather than be hidden.
      if (!failure) return route.continue();
      // The test releases the fault after the submitted Search client is
      // ready, so an SSR image event cannot precede hydration listeners.
      await failureReady;
      injectedFailures.push(source);
      return failure === "error" ? route.abort() : route.fulfill({ status: 200, contentType: "image/png", body: pixel });
    }
    if (!source.startsWith("https://commons.wikimedia.org/wiki/Special:FilePath/")) return route.continue();
    if (failure === "error") return route.abort();
    return route.fulfill({ status: 200, contentType: failure ? "image/png" : "image/jpeg", body: failure ? pixel : ownedImage });
  });
  return { injectedFailures, releaseFailure };
}

async function expectDecodedBundledFalls(scope: Locator) {
  const image = scope.locator('[data-search-place-visual="curated"] img');
  try {
  await expect(image).toHaveCount(1);
  // Native lazy images must enter the viewport before usable decode is an
  // acceptance precondition, just as the real source links do below.
  await image.scrollIntoViewIfNeeded();
  await expect.poll(() => image.evaluateAll(async (nodes) => {
    if (nodes.length !== 1) return null;
    const node = nodes[0];
    if (!(node instanceof HTMLImageElement) || !node.isConnected || !node.complete || !node.currentSrc) return null;
    try { await node.decode(); } catch { return null; }
    if (!node.isConnected || !node.complete || !node.currentSrc || node.naturalWidth <= 1 || node.naturalHeight <= 1) return null;
    try {
      const url = new URL(node.currentSrc);
      return { sameOrigin: url.origin === location.origin, optimizerPath: url.pathname, source: url.searchParams.get("url") };
    } catch { return null; }
  })).toEqual({ sameOrigin: true, optimizerPath: "/_next/image", source: fallsPhoto });
  } catch (error) {
    const state = await image.evaluateAll((nodes) => nodes.slice(0, 4).map((node) => {
      const image = node as HTMLImageElement, box = image.getBoundingClientRect();
      return { currentSrc: image.currentSrc, src: image.getAttribute("src"), complete: image.complete,
        naturalWidth: image.naturalWidth, naturalHeight: image.naturalHeight, isConnected: image.isConnected,
        box: { x: box.x, y: box.y, width: box.width, height: box.height }, viewport: { width: innerWidth, height: innerHeight },
        hasPhoto: image.closest("[data-search-place-lead]")?.getAttribute("data-has-photo") };
    })).catch((readError) => ({ readError: String(readError) }));
    await test.info().attach("bundled-falls-decode-failure", { contentType: "application/json",
      body: JSON.stringify({ state, networkFailures: imageFailures.get(scope.page()) ?? [] }) });
    throw error;
  }
}

async function openFind(page: Page) {
  const controls = page.locator("header").getByRole("button", { name: "Ask or find across Frederick County", exact: true });
  await expect(controls.and(page.locator('[data-find-interaction-ready="true"]')).filter({ visible: true })).toHaveCount(1);
  const control = controls.filter({ visible: true });
  await expect(control).toHaveCount(1);
  await expect(control).toHaveAttribute("data-find-interaction-ready", "true");
  await expect(control).toBeVisible();
  await expect(control).toBeEnabled();
  await control.click();
  const dialog = page.getByRole("dialog", { name: "What do you need?", exact: true });
  await expect(dialog).toBeVisible();
  return dialog;
}

for (const width of [320, 375, 390, 430]) {
  test(`exact free photos and credits preserve Find, Search and Back at ${width}px`, async ({ page }, testInfo) => {
    test.setTimeout(90_000);
    await page.setViewportSize({ width, height: 844 });
    await imageTransport(page);
    let observeFind = false;
    const paidFindRequests: string[] = [];
    page.on("request", (request) => {
      if (observeFind && new URL(request.url()).pathname === "/api/place-photo") paidFindRequests.push(request.url());
    });
    await page.goto("/contacts", { waitUntil: "domcontentloaded" });
    let dialog = await openFind(page);
    observeFind = true;
    await dialog.getByRole("searchbox").fill("Carroll Creek");
    const owned = dialog.locator('[data-search-place-visual="owned"] img');
    await expect(owned).toHaveCount(1);
    await expect.poll(() => owned.evaluate((image) => (image as HTMLImageElement).naturalWidth)).toBeGreaterThan(1);
    const ownedResult = dialog.locator("li").filter({ has: owned });
    await expect(ownedResult.locator(".place-card-photo-credit")).toHaveCount(0);
    await expect(dialog.getByRole("link", { name: "View place", exact: true })).toHaveAttribute("href", new RegExp(`/places/${creek}`));
    await dialog.getByRole("searchbox").fill("Cunningham Falls");
    await expectDecodedBundledFalls(dialog);
    const source = dialog.locator('.place-card-photo-credit a[href^="https://commons.wikimedia.org/wiki/File:"]');
    await expect(source).toHaveCount(1);
    await expect(source).toBeVisible();
    await expect(dialog.getByText("Photo by Alyson Hurt.", { exact: true })).toBeVisible();
    await expect(dialog.getByText("Historical photograph from February 2005. Display may resize or crop.", { exact: true })).toBeVisible();
    await expect(source).toHaveAttribute("href", "https://commons.wikimedia.org/wiki/File:Cunningham_Falls.jpg");
    await expect(dialog.getByRole("link", { name: "CC BY 2.0", exact: true })).toHaveAttribute("href", "https://creativecommons.org/licenses/by/2.0/");
    await expect(dialog.locator("a a")).toHaveCount(0);
    for (const link of [source, dialog.getByRole("link", { name: "CC BY 2.0", exact: true })]) {
      await link.scrollIntoViewIfNeeded();
      const bounds = (await link.boundingBox())!;
      expect(bounds.width).toBeGreaterThanOrEqual(44);
      expect(bounds.height).toBeGreaterThanOrEqual(44);
    }
    expect(paidFindRequests).toEqual([]);
    expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1);
    await page.screenshot({ path: testInfo.outputPath(`find-exact-source-${width}.png`) });
    observeFind = false;
    await dialog.getByRole("link", { name: "View place", exact: true }).click();
    await expect(page).toHaveURL(new RegExp(`/places/${falls}`));
    await page.goBack();
    await expect(page).toHaveURL(/\/contacts/);
    dialog = await openFind(page);
    await expect(dialog.getByRole("searchbox")).toHaveValue("Cunningham Falls");
    await dialog.getByRole("button", { name: "Close Find", exact: true }).click();
    await page.goto("/search?q=Cunningham%20Falls&in=county&kind=place", { waitUntil: "domcontentloaded" });
    await expectDecodedBundledFalls(page.locator("main"));
    await expect(page.locator("main").getByText("Photo by Alyson Hurt.", { exact: true })).toBeVisible();
    await expect(page.locator("main").getByText("Historical photograph from February 2005. Display may resize or crop.", { exact: true })).toBeVisible();
    await expect(page.locator('main .place-card-photo-credit a[href="https://commons.wikimedia.org/wiki/File:Cunningham_Falls.jpg"]')).toBeVisible();
    await expect(page.locator("main").getByRole("link", { name: "CC BY 2.0", exact: true })).toHaveAttribute("href", "https://creativecommons.org/licenses/by/2.0/");
    await expect(page.locator("main a a")).toHaveCount(0);
    await expect(page.getByRole("searchbox", { name: "Search Frederick County" })).toHaveValue("Cunningham Falls");
    expect(new URL(page.url()).searchParams.get("in")).toBe("county");
    expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1);
    await testInfo.attach("source-fixture-scope", { contentType: "application/json", body: JSON.stringify({
      width, paidFindRequests, query: "Cunningham Falls", scope: "county",
      fixture: "Actual source selection/credit metadata and real bundled Cunningham bytes through the optimizer; local owned image bytes substitute for remote Commons transport only.",
    }) });
  });
}

test("exact named venue leads with its owned photo and native Enter survives Back at 390px", async ({ page }, info) => {
  test.setTimeout(90_000);
  await page.setViewportSize({ width: 390, height: 844 });
  await imageTransport(page);
  await page.goto("/contacts", { waitUntil: "domcontentloaded" });
  let dialog = await openFind(page);
  const paidFindRequests: string[] = [];
  let observeFind = true;
  page.on("request", request => {
    if (observeFind && new URL(request.url()).pathname === "/api/place-photo") paidFindRequests.push(request.url());
  });
  const query = "Baker Park Bandshell";
  const slug = "baker-park-bandshell";
  const responsePending = page.waitForResponse(response => {
    const url = new URL(response.url());
    return url.pathname === "/api/search" && url.searchParams.get("q") === query;
  });
  const input = dialog.getByRole("searchbox");
  await input.fill(query);
  const response = await responsePending;
  expect(response.status()).toBe(200);
  expect((await response.json()).results[0]).toMatchObject({
    id: `place:${slug}`, title: query, href: `/places/${slug}`,
    thumbnailSource: { kind: "owned", src: "/images/seasons/fall/018.jpg" },
  });
  const first = dialog.locator("#search-opt-0");
  await expect(first.getByRole("heading", { name: query, exact: true })).toBeVisible();
  await expect(first.getByRole("link", { name: "View place", exact: true })).toHaveAttribute("href", `/places/${slug}`);
  const photo = first.locator('[data-search-place-visual="owned"] img');
  await photo.scrollIntoViewIfNeeded();
  await expect.poll(() => photo.evaluate(async node => {
    const image = node as HTMLImageElement;
    try { await image.decode(); } catch { return false; }
    const url = new URL(image.currentSrc);
    return image.complete && image.naturalWidth > 1 && image.naturalHeight > 1
      && url.origin === location.origin && url.pathname === "/_next/image"
      && url.searchParams.get("url") === "/images/seasons/fall/018.jpg";
  })).toBe(true);
  await expect(first.locator(".place-card-photo-credit")).toHaveCount(0);
  expect(paidFindRequests).toEqual([]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1);
  await page.screenshot({ path: info.outputPath("find-exact-bandshell-owned-390.png") });
  observeFind = false;
  await input.press("Enter");
  await expect(page).toHaveURL(new RegExp(`/places/${slug}$`));
  await expect(page.getByRole("heading", { level: 1, name: query, exact: true })).toBeVisible();
  await expect(dialog).toHaveCount(0);
  await page.goBack();
  await expect(page).toHaveURL(/\/contacts$/);
  dialog = await openFind(page);
  await expect(dialog.getByRole("searchbox")).toHaveValue(query);
  await expect(dialog.locator("#search-opt-0").getByRole("heading", { name: query, exact: true })).toBeVisible();
  await dialog.getByRole("button", { name: "Close Find", exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await expect(page.locator("header").getByRole("button", { name: "Ask or find across Frederick County", exact: true }).filter({ visible: true })).toBeFocused();
});

for (const failure of ["error", "transparent"] as const) {
  test(`submitted Search keeps the real result and removes failed photo credit after ${failure}`, async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    const transport = await imageTransport(page, failure);
    await page.goto("/search?q=Cunningham%20Falls&in=county&kind=place", { waitUntil: "domcontentloaded" });
    const result = page.locator("main li").filter({ has: page.locator(`a[href^="/places/${falls}"]`) }).first();
    await expect(result).toBeVisible();
    try {
      await expect(page.getByRole("combobox", { name: "Search area", exact: true })).toBeEnabled();
    } finally {
      transport.releaseFailure();
    }
    await expect.poll(() => transport.injectedFailures.length).toBeGreaterThan(0);
    expect([...new Set(transport.injectedFailures)]).toEqual([fallsPhoto]);
    await expect(result.locator("img")).toHaveCount(0);
    await expect(result.locator(".place-card-photo-credit")).toHaveCount(0);
    await expect(result.getByRole("heading", { name: "Cunningham Falls State Park", exact: true })).toBeVisible();
    await expect(result.getByRole("link", { name: "View place: Cunningham Falls State Park", exact: true })).toHaveAttribute("href", new RegExp(`/places/${falls}`));
  });
}

registerWebkitLoopbackDocumentSeam();
