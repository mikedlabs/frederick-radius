import { readFileSync } from "node:fs";
import { expect, test, type Page } from "@playwright/test";

// Only image transport is controlled. Search results and their exact source
// metadata come from the built app and real reviewed registry. Owned image
// bytes stand in for a successful Commons response, not proof of remote
// availability or visual correctness. No paid photo/media provider is called.
const ownedImage = readFileSync("public/images/seasons/summer/SUMMER CARROL CREEK.jpg");
const pixel = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAC0lEQVR4nGNgAAIAAAUAAXpeqz8AAAAASUVORK5CYII=", "base64");
const creek = "carroll-creek-linear-park-frederick";
const falls = "cunningham-falls-state-park-thurmont";

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
  await page.route("**/api/place-photo?**", (route) => route.abort());
  await page.route("**/_next/image?**", (route) => {
    const source = new URL(route.request().url()).searchParams.get("url") ?? "";
    if (!source.startsWith("https://commons.wikimedia.org/wiki/Special:FilePath/")) return route.continue();
    if (failure === "error") return route.abort();
    return route.fulfill({ status: 200, contentType: failure ? "image/png" : "image/jpeg", body: failure ? pixel : ownedImage });
  });
}

async function openFind(page: Page) {
  await page.locator("header").first().getByRole("button", { name: "Ask or find across Frederick County", exact: true }).click();
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
    const source = dialog.locator('.place-card-photo-credit a[href^="https://commons.wikimedia.org/wiki/File:"]');
    await expect(source).toHaveCount(1);
    await expect(dialog).toContainText("Photo by Alyson Hurt.");
    await expect(source).toHaveAttribute("href", "https://commons.wikimedia.org/wiki/File:Cunningham_Falls.jpg");
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
    await expect(page.locator("main").getByText("Photo by Alyson Hurt.", { exact: true })).toBeVisible();
    await expect(page.locator("main a a")).toHaveCount(0);
    await expect(page.getByRole("searchbox", { name: "Search Frederick County" })).toHaveValue("Cunningham Falls");
    expect(new URL(page.url()).searchParams.get("in")).toBe("county");
    expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1);
    await testInfo.attach("source-fixture-scope", { contentType: "application/json", body: JSON.stringify({
      width, paidFindRequests, query: "Cunningham Falls", scope: "county",
      fixture: "Actual source selection/credit metadata; local owned image bytes substitute for remote Commons transport only.",
    }) });
  });
}

for (const failure of ["error", "transparent"] as const) {
  test(`submitted Search keeps the real result and removes failed photo credit after ${failure}`, async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await imageTransport(page, failure);
    await page.goto("/search?q=Cunningham%20Falls&in=county&kind=place", { waitUntil: "domcontentloaded" });
    const result = page.locator("main li").filter({ has: page.locator(`a[href^="/places/${falls}"]`) }).first();
    await expect(result).toBeVisible();
    await expect(result.locator("img")).toHaveCount(0);
    await expect(result.locator(".place-card-photo-credit")).toHaveCount(0);
    await expect(result.getByRole("heading", { name: "Cunningham Falls State Park", exact: true })).toBeVisible();
    await expect(result.getByRole("link", { name: "View place: Cunningham Falls State Park", exact: true })).toHaveAttribute("href", new RegExp(`/places/${falls}`));
  });
}
