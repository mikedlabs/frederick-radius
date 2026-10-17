import { expect, test, type Locator } from "@playwright/test";
import { readFile } from "node:fs/promises";
import path from "node:path";

// Controlled transport fixtures exercise the real Today page and its consumer
// styles. They do not assert that this venue's hours or photo are current.
const resource = "places/today-fixture/photos/exact-photo";
const photo = `/api/place-photo?name=${encodeURIComponent(resource)}&w=800`;
const author = "Fixture photographer with a longer credit name";
const source = "https://www.google.com/maps/contrib/123/photo/456";
const pixel = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAC0lEQVR4nGNgAAIAAAUAAXpeqz8AAAAASUVORK5CYII=", "base64");

test.use({ serviceWorkers: "block" });

async function expectPreviewActions(article: Locator, place: Locator, placeSlug: string, name: string, scope: string) {
  const origin = `/today?${new URLSearchParams({ in: scope })}`;
  await expect(place).toHaveAccessibleName(`View place: ${name}`);
  await expect(place).toHaveAttribute("href", `/places/${placeSlug}?${new URLSearchParams({ returnTo: origin })}`);
  const map = article.getByRole("link", { name: `Map: ${name}`, exact: true });
  await expect(map).toHaveAttribute("href", `/map?${new URLSearchParams({ place: placeSlug, in: scope, returnTo: origin })}`);
  await expect(place.locator("a")).toHaveCount(0);
  await expect(article.locator("a a")).toHaveCount(0);
}

function leadCard(page: import("@playwright/test").Page) {
  return page.locator("[data-today-place-preview], [data-today-opening-soon]").first();
}

for (const width of [320, 375, 390, 430, 1366]) {
  test(`Today preserves readable town context and physical photo credits at ${width}px`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width, height: width === 1366 ? 900 : 844 });
    await page.emulateMedia({ reducedMotion: "reduce" });
    let metadataRequests = 0;
    const photoRequests: string[] = [];
    const localImage = await readFile(path.join(process.cwd(), "public/images/seasons/summer/SUMMER CARROL CREEK.jpg"));
    await page.route("**/api/want?**", (route) => route.fulfill({ json: {
      hero: { slug: "replacement-cafe-frederick", name: "Replacement Cafe", photo, where: "Brunswick", distance: "6 min walk", fact: "Hours not confirmed", confidence: "unconfirmed" },
      also: [], soon: null, later: [], notable: [], contextSource: "town", contextLabel: "Brunswick", browseHref: "/places?in=brunswick",
    } }));
    await page.route("**/api/places/map-card/**", (route) => {
      metadataRequests += 1;
      const requestedSlug = decodeURIComponent(new URL(route.request().url()).pathname.split("/").pop() ?? "");
      return route.fulfill({ json: { place: { slug: requestedSlug, google_photo_url: photo, google_photo_attribution: {
        photo_name: resource, google_maps_uri: source,
        authors: [{ display_name: author, uri: "https://www.google.com/maps/contrib/123" }],
      } } } });
    });
    await page.route("**/api/place-photo?**", (route) => {
      photoRequests.push(route.request().url());
      return route.fulfill({ status: 200, contentType: "image/jpeg", body: localImage });
    });
    await page.goto("/today?in=brunswick", { waitUntil: "domcontentloaded" });
    const card = leadCard(page);
    await expect(card).toBeVisible();
    const firstName = (await card.locator("[data-today-pick-name]").innerText()).trim();
    expect(firstName.length).toBeGreaterThan(0);
    expect(firstName).not.toBe("Replacement Cafe");
    const article = page.locator("article[data-today-place-preview]").first();
    const hasPreview = await article.count();
    if (hasPreview) {
      const place = article.locator("[data-today-place-lead]");
      const placeSlug = (await place.getAttribute("data-decision-id"))!;
      await expectPreviewActions(article, place, placeSlug, firstName, "brunswick");
      await article.scrollIntoViewIfNeeded();
      await expect(article.locator("[data-today-pick-name]")).toHaveText(firstName);
      await expect(article.locator("[data-today-pick-fact]")).toHaveCount(1);
      await page.evaluate(() => document.fonts.ready);
      const places = page.locator('[aria-label="Places for your area"]');
      const articleBox = (await article.boundingBox())!;
      const placesBox = (await places.boundingBox())!;
      expect(articleBox.width).toBeGreaterThanOrEqual(placesBox.width - 2);
      expect(await article.locator("[data-today-pick-fact]").evaluate((element) => parseFloat(getComputedStyle(element).fontSize))).toBeGreaterThanOrEqual(14);
      if (await article.locator("[data-today-pick-location]").count()) {
        expect(await article.locator("[data-today-pick-location]").evaluate((element) => parseFloat(getComputedStyle(element).fontSize))).toBeGreaterThanOrEqual(14);
      }
      expect(await article.locator("[data-today-pick-name]").evaluate((element) => parseFloat(getComputedStyle(element).fontSize))).toBeGreaterThanOrEqual(17);
      expect(await article.evaluate((element) => element.scrollWidth - element.clientWidth)).toBeLessThanOrEqual(1);
      await expect(article.locator("[data-today-pick-fact]")).not.toContainText(/likely|check hours/i);
      if (await article.locator("img").count()) {
        await expect.poll(() => article.locator("img").evaluate((image: HTMLImageElement) => image.complete && image.naturalWidth > 1 && image.naturalHeight > 1)).toBe(true);
        const fixtureCredit = article.getByRole("link", { name: author, exact: true });
        if (await fixtureCredit.count()) {
          await expect(article.getByRole("link", { name: "Google Maps", exact: true })).toHaveAttribute("href", source);
          const probes = [];
          for (const link of [fixtureCredit, article.getByRole("link", { name: "Google Maps", exact: true })]) {
            await link.evaluate((element) => element.scrollIntoView({ block: "center" }));
            const probe = await link.evaluate((element) => {
              const rect = element.getBoundingClientRect();
              const cardBox = element.closest("article")!.getBoundingClientRect();
              const x = rect.x + rect.width / 2;
              return { width: rect.width, height: rect.height, insideCard: rect.bottom <= cardBox.bottom,
                center: element.contains(document.elementFromPoint(x, rect.y + rect.height / 2)),
                bottomEdge: element.contains(document.elementFromPoint(x, rect.bottom - 1)),
                topEdge: element.contains(document.elementFromPoint(x, rect.top + 1)) };
            });
            expect(probe.width).toBeGreaterThanOrEqual(44);
            expect(probe.height).toBeGreaterThanOrEqual(44);
            expect(probe.insideCard && probe.center && probe.bottomEdge && probe.topEdge).toBe(true);
            probes.push(probe);
          }
          await testInfo.attach("local-fixture-proof", { contentType: "application/json", body: JSON.stringify({ width, metadataRequests, photoRequests, probes, fixture: "Owned image bytes stand in for a successful exact Google photo response; no live photo/availability claim." }) });
        }
      }
    }
    await expect(card.locator("[data-today-pick-name]")).toHaveText(firstName);
    await expect(page.getByRole("link", { name: "Find a place, service, event, or answer", exact: true })).toContainText("Find what you need");
    const order = await page.locator("[data-today-weather]").evaluate((weather) => Boolean(weather.compareDocumentPosition(document.querySelector('[data-surface-row="find"]')!) & Node.DOCUMENT_POSITION_FOLLOWING));
    expect(order).toBe(true);
    expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1);
    await card.scrollIntoViewIfNeeded();
    await page.screenshot({ path: testInfo.outputPath(`today-card-local-fixture-${width}.png`), fullPage: true });
    await card.screenshot({ path: testInfo.outputPath(`today-card-local-fixture-detail-${width}.png`) });
  });
}

for (const failure of ["pixel", "error"] as const) {
  test(`Today retains useful place context after a photo ${failure}`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.route("**/api/want?**", (route) => route.fulfill({ json: {
      hero: { slug: "replacement-cafe-frederick", name: "Replacement Cafe", photo, where: "Brunswick", distance: "6 min walk", fact: "Hours not confirmed", confidence: "unconfirmed" },
      also: [], soon: null, later: [], notable: [], contextSource: "town", contextLabel: "Brunswick",
    } }));
    await page.route("**/api/places/map-card/**", (route) => {
      const requestedSlug = decodeURIComponent(new URL(route.request().url()).pathname.split("/").pop() ?? "");
      return route.fulfill({ json: { place: { slug: requestedSlug, google_photo_url: photo, google_photo_attribution: {
        photo_name: resource, google_maps_uri: source, authors: [{ display_name: author }],
      } } } });
    });
    await page.route("**/api/place-photo?**", (route) => {
      return failure === "pixel" ? route.fulfill({ status: 200, contentType: "image/png", body: pixel }) : route.abort("failed");
    });
    await page.goto("/today?in=brunswick", { waitUntil: "domcontentloaded" });
    const card = leadCard(page);
    await expect(card).toBeVisible();
    const firstName = (await card.locator("[data-today-pick-name]").innerText()).trim();
    expect(firstName).not.toBe("Replacement Cafe");
    const article = page.locator("article[data-today-place-preview]").first();
    if (await article.count()) {
      const place = article.locator("[data-today-place-lead]");
      const placeSlug = (await place.getAttribute("data-decision-id"))!;
      await expectPreviewActions(article, place, placeSlug, firstName, "brunswick");
      await article.scrollIntoViewIfNeeded();
      await page.waitForTimeout(1_500);
      await expect(article.locator("img")).toHaveCount(0);
      await expect(article).toContainText(firstName);
      await expect(article).toHaveAttribute("data-has-photo", "false");
      await expect(article.locator("[data-today-place-thumb]")).toHaveCount(1);
      await expect(article.getByRole("link", { name: "Google Maps", exact: true })).toHaveCount(0);
      await expect(article.locator(".place-card-photo-credit")).toHaveCount(0);
    }
    await expect(card.locator("[data-today-pick-name]")).toHaveText(firstName);
    await page.screenshot({ path: testInfo.outputPath(`today-card-${failure}-fallback.png`) });
  });
}


test("Today keeps the owned place visual separate from a real answer without an attributable photo", async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  let metadataRequests = 0;
  let uncreditedPhotoRequests = 0;
  await page.route("**/api/want?**", (route) => route.fulfill({ json: {
    hero: { slug: "replacement-cafe-frederick", name: "Replacement Cafe", photo, where: "Frederick", fact: "Hours not confirmed", confidence: "unconfirmed" },
    also: [], soon: null, later: [], notable: [], contextSource: "county", contextLabel: "Frederick County",
  } }));
  await page.route("**/api/places/map-card/**", (route) => {
    metadataRequests += 1;
    return route.fulfill({ status: 503, json: { place: null } });
  });
  await page.route("**/api/place-photo?**", (route) => {
    uncreditedPhotoRequests += 1;
    return route.abort("blockedbyclient");
  });
  await page.goto("/today?in=county", { waitUntil: "domcontentloaded" });
  const card = leadCard(page);
  await expect(card).toBeVisible();
  const firstName = (await card.locator("[data-today-pick-name]").innerText()).trim();
  expect(firstName).not.toBe("Replacement Cafe");
  const article = page.locator("article[data-today-place-preview]").first();
  if (await article.count()) {
    const place = article.locator("[data-today-place-lead]");
    const placeSlug = (await place.getAttribute("data-decision-id"))!;
    await expectPreviewActions(article, place, placeSlug, firstName, "county");
    await expect(article.locator("[data-today-pick-name]")).toHaveText(firstName);
    await expect(article.locator("img")).toHaveCount(0);
    await expect(article).not.toContainText("Carroll Creek");
    await expect(article).toHaveAttribute("data-has-photo", "false");
    await expect(article.locator(".place-card-photo-credit")).toHaveCount(0);
  }
  const creek = page.getByRole("link", { name: "View Carroll Creek Linear Park in Frederick", exact: true });
  await expect(creek).toHaveAttribute("href", "/places/carroll-creek-linear-park-frederick");
  await expect(creek).toHaveAttribute("data-photo-state", "loaded");
  await expect.poll(() => creek.locator("img").evaluate((image: HTMLImageElement) => image.complete && image.naturalWidth > 1 && image.naturalHeight > 1)).toBe(true);
  await expect(creek).toContainText("Carroll Creek");
  await expect(creek).not.toContainText(firstName.split(" ")[0] ?? "Lead");
  await expect(page.getByRole("combobox", { name: "Choose your area", exact: true })).toHaveValue("county");
  const quickNeeds = page.getByRole("group", { name: "Quick needs", exact: true });
  expect(await card.evaluate((element) => Boolean(element.compareDocumentPosition(document.querySelector('[aria-label="Quick needs"]')!) & Node.DOCUMENT_POSITION_FOLLOWING))).toBe(true);
  await expect(quickNeeds.getByRole("link")).toHaveCount(4);
  await testInfo.attach("separate-owned-place-and-uncredited-answer", { contentType: "application/json", body: JSON.stringify({ metadataRequests, uncreditedPhotoRequests, firstName, proof: "Real Today composition and owned image; a declared answer/failed credit transport tests honest fallback, not live venue hours or current image availability." }) });
  await page.screenshot({ path: testInfo.outputPath("today-county-no-attributable-photo.png"), fullPage: true });
});
