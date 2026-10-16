import { expect, test } from "@playwright/test";
import { readFile } from "node:fs/promises";
import path from "node:path";

// Controlled transport fixtures exercise the real Today page and its consumer
// styles. They do not assert that this venue's hours or photo are current.
const slug = "beans-in-the-belfry-brunswick";
const resource = "places/today-fixture/photos/exact-photo";
const photo = `/api/place-photo?name=${encodeURIComponent(resource)}&w=800`;
const author = "Fixture photographer with a longer credit name";
const source = "https://www.google.com/maps/contrib/123/photo/456";
const pixel = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAC0lEQVR4nGNgAAIAAAUAAXpeqz8AAAAASUVORK5CYII=", "base64");

test.use({ serviceWorkers: "block" });

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
    await expect(place.locator("img")).toBeVisible();
    await expect(place.locator("[data-today-pick-fact]")).toHaveText("Hours not confirmed");
    await expect(place.locator("[data-today-pick-location]")).toHaveText("Brunswick · 6 min walk");
    await page.evaluate(() => document.fonts.ready);
    const article = place.locator("..");
    const places = page.locator('[aria-label="Places for your area"]');
    const articleBox = (await article.boundingBox())!;
    const placesBox = (await places.boundingBox())!;
    expect(articleBox.width).toBeGreaterThanOrEqual(placesBox.width - 2);
    for (const selector of ["[data-today-pick-fact]", "[data-today-pick-location]"]) {
      expect(await place.locator(selector).evaluate((element) => parseFloat(getComputedStyle(element).fontSize))).toBeGreaterThanOrEqual(14);
    }
    expect(await place.locator("[data-today-pick-name]").evaluate((element) => parseFloat(getComputedStyle(element).fontSize))).toBeGreaterThanOrEqual(17);
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
    await expect(page.getByRole("link", { name: "Find a place, service, event, or answer", exact: true })).toContainText("Search places and events");
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
    await expect.poll(() => loads).toBeGreaterThan(0);
    await expect(place.locator("img")).toHaveCount(0);
    await expect(place).toContainText("Beans in the Belfry");
    await expect(place).toContainText("Hours not confirmed");
    await expect(place).toContainText("Brunswick · 6 min walk");
    await expect(place).toHaveAttribute("href", `/places/${slug}`);
    await expect(place.locator("..").getByRole("link", { name: "Google Maps", exact: true })).toHaveCount(0);
    await place.scrollIntoViewIfNeeded();
    await page.screenshot({ path: testInfo.outputPath(`today-card-${failure}-fallback.png`) });
  });
}
