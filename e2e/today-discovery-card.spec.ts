import { expect, test, type Locator } from "@playwright/test";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { registerWebkitLoopbackDocumentSeam } from "./webkit-loopback-document";

// Controlled transport fixtures exercise the real Today page and its consumer
// styles. They do not assert that this venue's hours or photo are current.
const slug = "beans-in-the-belfry-brunswick";
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

for (const width of [320, 375, 390, 430, 1366]) {
  test(`Today preserves readable town context and physical photo credits at ${width}px`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width, height: width === 1366 ? 900 : 844 });
    await page.emulateMedia({ reducedMotion: "reduce" });
    let metadataRequests = 0;
    const photoRequests: string[] = [];
    const localImage = await readFile(path.join(process.cwd(), "public/images/seasons/summer/SUMMER CARROL CREEK.jpg"));
    await page.route("**/api/want?**", (route) => route.fulfill({ json: {
      hero: { slug, name: "Beans in the Belfry", photo, where: "Brunswick", distance: "6 min walk", fact: "Hours not confirmed", confidence: "unconfirmed" },
      also: [], soon: null, later: [], notable: [], contextSource: "town", contextLabel: "Brunswick", browseHref: "/places?in=brunswick",
    } }));
    await page.route("**/api/places/map-card/**", (route) => {
      metadataRequests += 1;
      return route.fulfill({ json: { place: { slug, google_photo_url: photo, google_photo_attribution: {
        photo_name: resource, google_maps_uri: source,
        authors: [{ display_name: author, uri: "https://www.google.com/maps/contrib/123" }],
      } } } });
    });
    await page.route("**/api/place-photo?**", (route) => {
      photoRequests.push(route.request().url());
      return route.fulfill({ status: 200, contentType: "image/jpeg", body: localImage });
    });
    await page.goto("/today?in=brunswick", { waitUntil: "domcontentloaded" });
    const place = page.locator(`[data-today-place-lead][data-decision-id="${slug}"]`);
    const article = page.locator("article[data-today-place-preview]").filter({ has: place });
    await expect(article).toHaveCount(1);
    await expectPreviewActions(article, place, slug, "Beans in the Belfry", "brunswick");
    await article.scrollIntoViewIfNeeded();
    await expect(article.locator("img")).toBeVisible();
    await expect.poll(() => article.locator("img").evaluate((image: HTMLImageElement) => image.complete && image.naturalWidth > 1 && image.naturalHeight > 1)).toBe(true);
    await expect(article.locator("[data-today-pick-fact]")).toHaveText("Hours not confirmed");
    await expect(article.locator("[data-today-pick-location]")).toHaveText("Brunswick · 6 min walk");
    await page.evaluate(() => document.fonts.ready);
    const places = page.locator('[aria-label="Places for your area"]');
    const articleBox = (await article.boundingBox())!;
    const placesBox = (await places.boundingBox())!;
    expect(articleBox.width).toBeGreaterThanOrEqual(placesBox.width - 2);
    for (const selector of ["[data-today-pick-fact]", "[data-today-pick-location]"]) {
      expect(await article.locator(selector).evaluate((element) => parseFloat(getComputedStyle(element).fontSize))).toBeGreaterThanOrEqual(14);
    }
    expect(await article.locator("[data-today-pick-name]").evaluate((element) => parseFloat(getComputedStyle(element).fontSize))).toBeGreaterThanOrEqual(17);
    expect(await article.evaluate((element) => element.scrollWidth - element.clientWidth)).toBeLessThanOrEqual(1);
    expect(metadataRequests).toBe(1);
    expect(photoRequests.some((url) => new URL(url).searchParams.get("name") === resource)).toBe(true);
    expect(photoRequests.filter((url) => new URL(url).searchParams.get("name") === resource).every((url) => Number(new URL(url).searchParams.get("w")) <= 720)).toBe(true);
    await expect(article.getByRole("link", { name: "Google Maps", exact: true })).toHaveAttribute("href", source);
    await expect(place.locator("a")).toHaveCount(0);
    const probes = [];
    for (const link of [article.getByRole("link", { name: author, exact: true }), article.getByRole("link", { name: "Google Maps", exact: true })]) {
      await link.evaluate((element) => element.scrollIntoView({ block: "center" }));
      const probe = await link.evaluate((element) => {
        const rect = element.getBoundingClientRect();
        const card = element.closest("article")!.getBoundingClientRect();
        const x = rect.x + rect.width / 2;
        return { width: rect.width, height: rect.height, insideCard: rect.bottom <= card.bottom,
          center: element.contains(document.elementFromPoint(x, rect.y + rect.height / 2)),
          bottomEdge: element.contains(document.elementFromPoint(x, rect.bottom - 1)),
          topEdge: element.contains(document.elementFromPoint(x, rect.top + 1)) };
      });
      expect(probe.width).toBeGreaterThanOrEqual(44);
      expect(probe.height).toBeGreaterThanOrEqual(44);
      expect(probe.insideCard && probe.center && probe.bottomEdge && probe.topEdge).toBe(true);
      probes.push(probe);
    }
    await expect(page.getByRole("link", { name: "Find a place, service, event, or answer", exact: true })).toContainText("Find what you need");
    const order = await page.locator("[data-today-weather]").evaluate((weather) => Boolean(weather.compareDocumentPosition(document.querySelector('[data-surface-row="find"]')!) & Node.DOCUMENT_POSITION_FOLLOWING));
    expect(order).toBe(true);
    expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1);
    await testInfo.attach("local-fixture-proof", { contentType: "application/json", body: JSON.stringify({ width, metadataRequests, photoRequests, probes, fixture: "Owned image bytes stand in for a successful exact Google photo response; no live photo/availability claim." }) });
    await article.scrollIntoViewIfNeeded();
    await page.screenshot({ path: testInfo.outputPath(`today-card-local-fixture-${width}.png`), fullPage: true });
    await article.screenshot({ path: testInfo.outputPath(`today-card-local-fixture-detail-${width}.png`) });
  });
}

for (const failure of ["pixel", "error"] as const) {
  test(`Today retains useful place context after a photo ${failure}`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.route("**/api/want?**", (route) => route.fulfill({ json: {
      hero: { slug, name: "Beans in the Belfry", photo, where: "Brunswick", distance: "6 min walk", fact: "Hours not confirmed", confidence: "unconfirmed" },
      also: [], soon: null, later: [], notable: [], contextSource: "town", contextLabel: "Brunswick",
    } }));
    await page.route("**/api/places/map-card/**", (route) => route.fulfill({ json: { place: { slug, google_photo_url: photo, google_photo_attribution: {
      photo_name: resource, google_maps_uri: source, authors: [{ display_name: author }],
    } } } }));
    let loads = 0;
    await page.route("**/api/place-photo?**", (route) => {
      loads += 1;
      return failure === "pixel" ? route.fulfill({ status: 200, contentType: "image/png", body: pixel }) : route.abort("failed");
    });
    await page.goto("/today?in=brunswick", { waitUntil: "domcontentloaded" });
    const place = page.locator(`[data-today-place-lead][data-decision-id="${slug}"]`);
    const article = page.locator("article[data-today-place-preview]").filter({ has: place });
    await expect(article).toHaveCount(1);
    await expectPreviewActions(article, place, slug, "Beans in the Belfry", "brunswick");
    await article.scrollIntoViewIfNeeded();
    await expect.poll(() => loads).toBeGreaterThan(0);
    await expect(article.locator("img")).toHaveCount(0);
    await expect(article).toContainText("Beans in the Belfry");
    await expect(article).toContainText("Hours not confirmed");
    await expect(article).toContainText("Brunswick · 6 min walk");
    await expect(article).toHaveAttribute("data-has-photo", "false");
    await expect(article.getByRole("link", { name: "Google Maps", exact: true })).toHaveCount(0);
    await expect(article.locator(".place-card-photo-credit")).toHaveCount(0);
    await place.scrollIntoViewIfNeeded();
    await page.screenshot({ path: testInfo.outputPath(`today-card-${failure}-fallback.png`) });
  });
}


test("Today keeps the category illustration separate from a real answer without an attributable photo", async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  const pickSlug = "ibiza-cafe";
  const unavailableResource = "places/today-credit-failure/photos/declared-photo";
  const unavailablePhoto = `/api/place-photo?name=${encodeURIComponent(unavailableResource)}&w=800`;
  let metadataRequests = 0;
  let uncreditedPhotoRequests = 0;
  await page.route("**/api/want?**", (route) => route.fulfill({ json: {
    hero: { slug: pickSlug, name: "Ibiza Cafe", photo: unavailablePhoto, where: "Frederick", fact: "Hours not confirmed", confidence: "unconfirmed" },
    also: [], soon: null, later: [], notable: [], contextSource: "county", contextLabel: "Frederick County",
  } }));
  await page.route("**/api/places/map-card/**", (route) => {
    if (new URL(route.request().url()).pathname.endsWith(`/${pickSlug}`)) metadataRequests += 1;
    return route.fulfill({ status: 503, json: { place: null } });
  });
  await page.route("**/api/place-photo?**", (route) => {
    if (new URL(route.request().url()).searchParams.get("name") === unavailableResource) uncreditedPhotoRequests += 1;
    return route.abort("blockedbyclient");
  });
  await page.goto("/today?in=county", { waitUntil: "domcontentloaded" });
  const place = page.locator(`[data-today-place-lead][data-decision-id="${pickSlug}"]`);
  const article = page.locator("article[data-today-place-preview]").filter({ has: place });
  await expect(article).toHaveCount(1);
  await expectPreviewActions(article, place, pickSlug, "Ibiza Cafe", "county");
  await expect(article.locator("[data-today-pick-name]")).toHaveText("Ibiza Cafe");
  await expect(article.locator("[data-today-pick-fact]")).toHaveText("Hours not confirmed");
  await expect.poll(() => metadataRequests).toBe(1);
  await expect(article.locator("img")).toHaveCount(0);
  await expect(article).not.toContainText("Carroll Creek");
  await expect(article).toHaveAttribute("data-has-photo", "false");
  await expect(article.locator(".place-card-photo-credit")).toHaveCount(0);
  const category = page.getByRole("link", { name: "Find pizza", exact: true });
  const categoryHref = new URL((await category.getAttribute("href"))!, "https://radius.test");
  expect(categoryHref.pathname).toBe("/nearby"); expect(categoryHref.searchParams.get("facet")).toBe("pizza"); expect(categoryHref.searchParams.get("in")).toBe("county");
  await expect(category).toHaveAttribute("data-photo-state", "loaded");
  await expect.poll(() => category.locator("img").evaluate((image: HTMLImageElement) => image.complete && image.naturalWidth > 1 && image.naturalHeight > 1)).toBe(true);
  await expect(category).toContainText("Find pizza");
  await expect(category).not.toContainText("Ibiza");
  await expect(page.getByRole("combobox", { name: "Choose your area", exact: true })).toHaveValue("county");
  const quickNeeds = page.getByRole("group", { name: "Quick needs", exact: true });
  const hierarchy = await article.evaluate((element) => {
    const quick = document.querySelector('[aria-label="Quick needs"]')!;
    const events = document.querySelector('[role="group"][aria-label="Follow the day"]')!;
    const scene = document.querySelector("[data-today-geographic-doorway]")!;
    const answerRegion = document.querySelector('[aria-label="Places for your area"]')!;
    const news = document.querySelector('section[aria-label="Local news"]')!;
    const explore = document.querySelector('section[aria-labelledby="today-explore-heading"]')!;
    const sceneBox = scene.getBoundingClientRect(), quickBox = quick.getBoundingClientRect();
    const eventsBox = events.getBoundingClientRect(), answerBox = element.getBoundingClientRect();
    const newsBox = news.getBoundingClientRect();
    return {
      ownedSceneBeforeQuickNeeds: Boolean(scene.compareDocumentPosition(quick) & Node.DOCUMENT_POSITION_FOLLOWING),
      ownedSceneBeforeEvents: Boolean(scene.compareDocumentPosition(events) & Node.DOCUMENT_POSITION_FOLLOWING),
      eventsBeforeAreaAnswer: Boolean(events.compareDocumentPosition(element) & Node.DOCUMENT_POSITION_FOLLOWING),
      areaAnswerBeforeNews: Boolean(element.compareDocumentPosition(news) & Node.DOCUMENT_POSITION_FOLLOWING),
      newsBeforeQuickNeeds: Boolean(news.compareDocumentPosition(quick) & Node.DOCUMENT_POSITION_FOLLOWING),
      quickNeedsInExplore: explore.contains(quick),
      ownedSceneOutsideAreaAnswer: !answerRegion.contains(scene),
      verticalOrder: sceneBox.bottom <= eventsBox.top && eventsBox.bottom <= answerBox.top
        && answerBox.bottom <= newsBox.top && newsBox.bottom <= quickBox.top,
    };
  });
  expect(hierarchy).toEqual({ ownedSceneBeforeQuickNeeds: true, ownedSceneBeforeEvents: true,
    eventsBeforeAreaAnswer: true, areaAnswerBeforeNews: true, newsBeforeQuickNeeds: true,
    quickNeedsInExplore: true, ownedSceneOutsideAreaAnswer: true, verticalOrder: true });
  await expect(quickNeeds).toHaveCount(1);
  await expect(quickNeeds.getByRole("link")).toHaveCount(4);
  expect(uncreditedPhotoRequests).toBe(0);
  await testInfo.attach("separate-owned-place-and-uncredited-answer", { contentType: "application/json", body: JSON.stringify({ metadataRequests, uncreditedPhotoRequests, hierarchy, proof: "Real Today composition and owner-approved category illustration; a declared answer/failed credit transport tests honest fallback, not live venue hours or current image availability." }) });
  await page.screenshot({ path: testInfo.outputPath("today-county-no-attributable-photo.png"), fullPage: true });
});

registerWebkitLoopbackDocumentSeam();
