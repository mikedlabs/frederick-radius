import { expect, test, type Locator } from "@playwright/test";
import { writeFile } from "node:fs/promises";

const creek = "carroll-creek-linear-park-frederick";

test.use({ serviceWorkers: "block" });
test.beforeEach(async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.addInitScript(() => {
    localStorage.setItem("fr:appearance:v1", "light");
    document.cookie = "fr_scope=town:frederick; path=/";
    document.cookie = "fr_onboarded=1; path=/";
  });
  // This journey verifies the actual owned source. Other rows may hydrate
  // canonical metadata, but no paid image bytes are needed for the check.
  await page.route("**/api/place-photo?**", (route) => route.abort());
});

async function expectReachableTarget(target: Locator) {
  await target.evaluate((node) => node.scrollIntoView({ block: "center" }));
  await expect(target).toBeVisible();
  // The shared icon button has a 36px visual face and a real 44px ::after
  // hit extender. Probe the effective target, rather than its visual box.
  await expect.poll(() => target.evaluate((node) => {
    const box = node.getBoundingClientRect();
    const x = box.left + box.width / 2;
    const y = box.top + box.height / 2;
    const points = [[x, y], [x - 21.5, y], [x + 21.5, y], [x, y - 21.5], [x, y + 21.5]];
    return points.every(([px, py]) => {
      const hit = document.elementFromPoint(px, py);
      return hit === node || Boolean(hit && node.contains(hit));
    });
  })).toBe(true);
}

for (const width of [320, 375, 390, 430]) {
  test(`Nearby uses the actual Creek photo and keeps discovery actions usable at ${width}px`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width, height: width === 320 ? 568 : 844 });
    const metadataSlugs: string[] = [];
    const mediaDiagnostics = {
      requests: [] as Array<{ url: string; resourceType: string }>,
      responses: [] as Array<{ url: string; status: number; contentType?: string }>,
      failed: [] as Array<{ url: string; error: string | null }>,
      consoleErrors: [] as string[],
      pageErrors: [] as string[],
    };
    const isOwnedImage = (raw: string) => {
      const url = new URL(raw);
      return url.pathname === "/images/seasons/summer/SUMMER%20CARROL%20CREEK.jpg"
        || decodeURIComponent(url.pathname) === "/images/seasons/summer/SUMMER CARROL CREEK.jpg"
        || (url.pathname === "/_next/image" && (url.searchParams.get("url") ?? "").includes("/images/seasons/summer/SUMMER CARROL CREEK.jpg"));
    };
    page.on("request", (request) => {
      if (isOwnedImage(request.url())) mediaDiagnostics.requests.push({ url: request.url(), resourceType: request.resourceType() });
    });
    page.on("response", (response) => {
      if (isOwnedImage(response.url())) mediaDiagnostics.responses.push({ url: response.url(), status: response.status(), contentType: response.headers()["content-type"] });
    });
    page.on("requestfailed", (request) => {
      if (isOwnedImage(request.url())) mediaDiagnostics.failed.push({ url: request.url(), error: request.failure()?.errorText ?? null });
    });
    page.on("console", (message) => {
      if (message.type() === "error" && mediaDiagnostics.consoleErrors.length < 30) mediaDiagnostics.consoleErrors.push(message.text().slice(0, 1000));
    });
    page.on("pageerror", (error) => { if (mediaDiagnostics.pageErrors.length < 20) mediaDiagnostics.pageErrors.push(error.message.slice(0, 1000)); });
    page.on("request", (request) => {
      const url = new URL(request.url());
      if (url.pathname === "/api/places/by-slugs") metadataSlugs.push(...(url.searchParams.get("slugs") ?? "").split(","));
    });
    const response = await page.goto("/nearby?c=outside&in=frederick", { waitUntil: "domcontentloaded" });
    expect(response?.status()).toBe(200);
    const heading = page.getByRole("heading", { name: "Carroll Creek Linear Park", exact: true });
    const card = page.locator("article").filter({ has: heading });
    await heading.scrollIntoViewIfNeeded();
    const image = card.locator('[data-place-card-photo-source="owned"] img');
    const beforeImageScroll = await image.evaluate((node) => {
      const img = node as HTMLImageElement; const box = img.getBoundingClientRect();
      return { currentSrc: img.currentSrc, complete: img.complete, naturalWidth: img.naturalWidth, rect: { x: box.x, y: box.y, width: box.width, height: box.height }, viewport: { width: innerWidth, height: innerHeight, scrollY } };
    });
    try {
      await expect(image).toBeVisible();
      await image.scrollIntoViewIfNeeded();
      await expect.poll(() => image.evaluate((node) => (node as HTMLImageElement).naturalWidth)).toBeGreaterThan(1);
    } catch (error) {
      const imageState = await image.evaluate((node) => {
        const img = node as HTMLImageElement;
        const rect = img.getBoundingClientRect();
        return {
          attributes: Object.fromEntries(Array.from(img.attributes).map((attribute) => [attribute.name, attribute.value])),
          currentSrc: img.currentSrc, complete: img.complete, naturalWidth: img.naturalWidth, naturalHeight: img.naturalHeight,
          rect: { x: rect.x, y: rect.y, width: rect.width, height: rect.height, bottom: rect.bottom },
          viewport: { width: innerWidth, height: innerHeight, scrollY, devicePixelRatio, visibility: document.visibilityState },
          ancestors: Array.from((function* () { let parent = img.parentElement; while (parent) { yield parent; parent = parent.parentElement; } })()).slice(0, 7).map((parent) => {
            const box = parent.getBoundingClientRect(); const style = getComputedStyle(parent);
            return { tag: parent.tagName, className: parent.className, rect: { x: box.x, y: box.y, width: box.width, height: box.height }, display: style.display, visibility: style.visibility, overflow: style.overflow, contentVisibility: style.contentVisibility };
          }),
        };
      }).catch((diagnosticError) => ({ unavailable: String(diagnosticError) }));
      const diagnosticPath = testInfo.outputPath("owned-image-load-diagnostics.json");
      await writeFile(diagnosticPath, JSON.stringify({ width, beforeImageScroll, imageState, ...mediaDiagnostics }, null, 2));
      await testInfo.attach("owned-image-load-diagnostics", { contentType: "application/json", path: diagnosticPath });
      throw error;
    }
    const loadedImageState = await image.evaluate((node) => {
      const img = node as HTMLImageElement; const box = img.getBoundingClientRect();
      return { currentSrc: img.currentSrc, complete: img.complete, naturalWidth: img.naturalWidth, rect: { x: box.x, y: box.y, width: box.width, height: box.height }, viewport: { width: innerWidth, height: innerHeight, scrollY } };
    });
    const diagnosticPath = testInfo.outputPath("owned-image-load-diagnostics.json");
    await writeFile(diagnosticPath, JSON.stringify({ width, beforeImageScroll, loadedImageState, ...mediaDiagnostics }, null, 2));
    await testInfo.attach("owned-image-load-diagnostics", { contentType: "application/json", path: diagnosticPath });
    const actualSource = await image.evaluate((node) => {
      const url = new URL((node as HTMLImageElement).currentSrc);
      return decodeURIComponent(url.searchParams.get("url") ?? url.pathname);
    });
    expect(actualSource).toBe("/images/seasons/summer/SUMMER CARROL CREEK.jpg");
    await expect(card.locator(".place-card-photo-credit")).toHaveCount(0);
    await expect(card).toHaveAttribute("data-place-card-variant", "discovery");
    const dimensions = await image.evaluate((node) => {
      const box = node.getBoundingClientRect();
      const card = node.closest("article")!.getBoundingClientRect();
      return { width: box.width, height: box.height, cardWidth: card.width };
    });
    expect(dimensions.width).toBeGreaterThan(dimensions.cardWidth * 0.95);
    expect(dimensions.width / dimensions.height).toBeCloseTo(16 / 9, 1);
    const directions = card.getByRole("link", { name: /^Directions to Carroll Creek Linear Park / });
    await expectReachableTarget(directions);
    await expect(directions).toHaveAttribute("href", /^https:\/\/(?:www\.google\.com|maps\.apple\.com)\//);
    await expect(directions).toHaveAttribute("href", /[?&](?:destination|daddr)=39\.412[^&]*,-77\.408/);
    const browsingMetadataForOwnedPlace = metadataSlugs.includes(creek);
    expect(browsingMetadataForOwnedPlace).toBe(false);
    expect(await card.evaluate((node) => node.scrollWidth <= node.clientWidth)).toBe(true);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    const save = card.locator(`[data-save-ref="place:${creek}"]`);
    await expectReachableTarget(save);
    await save.click();
    await expect(save).toHaveAttribute("aria-pressed", "true");
    const open = card.getByRole("button", { name: /^View Carroll Creek Linear Park .*details$/ });
    await expectReachableTarget(open);
    await page.screenshot({ path: testInfo.outputPath(`nearby-owned-discovery-${width}.png`) });
    await open.click();
    await expect(page.getByRole("dialog")).toHaveCount(1);
    await expect(page.getByRole("dialog").getByRole("heading", { name: "Carroll Creek Linear Park", exact: true })).toBeVisible();
    await testInfo.attach("owned-discovery-evidence", { contentType: "application/json", body: JSON.stringify({
      width, actualSource, dimensions, browsingMetadataForOwnedPlace, sourceCaption: false,
      paidImageTransport: "blocked", saved: true, oneDetailOverlay: true,
    }) });
  });
}

// Opaque 128x128 PNG stays above the failure signal after density correction.
const DECODED_IMAGE = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAIAAAACACAIAAABMXPacAAAA+klEQVR4nO3RQQ0AIAzAwFlCAy7wLwQZe/SSCmhyc97VYrN+EA8AgHYAALQDAKAdAADtAABoBwBAOwAA2gEA0A4AgHYAALQDAKAdAADtAABoBwBAOwAA2gEA0A4AgHYAALQDAKAdAADtAABoBwBAOwAA2gEA0A4AgHYAALQDAKAdAADtAABoBwBAOwAA2gEA0A4AgHYAALQDAKAdAADtAABoBwBAOwAA2gEA0A4AgHYAALQDAKAdAADtAABoBwBAOwAA2gEA0A4AgHYAALQDAKAdAADtAABoBwBAOwAA2gEA0A4AgHYAALQDAKAdAADtAABoBwBAOwAA2gEA0A4AgHYAALQDAKAdAADtAABoBwBAOwAA2n3CYoL+9wOv8gAAAABJRU5ErkJggg==", "base64");

test("Nearby food hydrates a policy-passing Google photo with its required credit", async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const cafe = "cafe-nola";
  const bySlugs: Array<{ slug: string; photo_name?: string; google_maps_uri?: string; authors?: unknown }> = [];
  await page.route("**/api/place-photo?**", (route) =>
    route.fulfill({
      status: 200,
      contentType: "image/png",
      body: DECODED_IMAGE,
      headers: { "Cache-Control": "public, max-age=300" },
    }),
  );
  page.on("response", async (response) => {
    const url = new URL(response.url());
    if (url.pathname !== "/api/places/by-slugs" || !response.ok()) return;
    const body = await response.json().catch(() => null) as {
      places?: Array<{
        slug?: string;
        google_photo_attribution?: { photo_name?: string; google_maps_uri?: string; authors?: unknown };
      }>;
    } | null;
    for (const place of body?.places ?? []) {
      if (typeof place.slug === "string") {
        bySlugs.push({
          slug: place.slug,
          photo_name: place.google_photo_attribution?.photo_name,
          google_maps_uri: place.google_photo_attribution?.google_maps_uri,
          authors: place.google_photo_attribution?.authors,
        });
      }
    }
  });
  const response = await page.goto("/nearby?c=food&in=frederick", { waitUntil: "domcontentloaded" });
  expect(response?.status()).toBe(200);
  const heading = page.getByRole("heading", { name: "Cafe Nola", exact: true });
  const card = page.locator("article").filter({ has: heading });
  await heading.scrollIntoViewIfNeeded();
  await expect(card).toHaveAttribute("data-place-card-has-photo", "true");
  const image = card.locator('[data-place-card-photo-source="google"] img');
  await expect(image).toBeVisible();
  await expect.poll(() => image.evaluate((node) => (node as HTMLImageElement).naturalWidth)).toBeGreaterThan(1);
  const credit = card.locator(".place-card-photo-credit");
  await expect(credit).toBeVisible();
  await expect(credit).toContainText("Google Maps");
  const cafeCredit = bySlugs.find((place) => place.slug === cafe);
  expect(cafeCredit?.photo_name).toBeUndefined();
  expect(cafeCredit?.google_maps_uri).toMatch(/^https:\/\/(?:www\.)?google\.com\/maps\//);
  expect(Array.isArray(cafeCredit?.authors)).toBe(true);
  await page.screenshot({ path: testInfo.outputPath("nearby-food-photo-credit-390.png") });
});
