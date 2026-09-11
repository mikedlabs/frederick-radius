import { expect, test } from "@playwright/test";

test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });

test("a renderer failure keeps the searched town's matches instead of a county directory", async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem("fr_map_location_intro_v1", "dismissed");
    const original = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (this: HTMLCanvasElement, type: string, ...args: unknown[]) {
      if (/webgl/.test(type)) return null;
      return original.call(this, type as "2d", ...args);
    } as typeof original;
  });
  await page.goto("/map?q=coffee&in=brunswick&returnTo=%2Fsearch%3Fq%3Dcoffee%26in%3Dbrunswick", { waitUntil: "domcontentloaded" });
  const fallback = page.getByRole("region", { name: "Available results without the map" });
  await expect(fallback).toContainText("Beans in the Belfry", { timeout: 20_000 });
  await expect(fallback).not.toContainText("The Home Depot");
  await expect(fallback).not.toContainText("1,570 places");
  await page.getByRole("link", { name: "Back to search results", exact: true }).click();
  await expect(page.getByRole("searchbox", { name: "Search Frederick County" })).toHaveValue("coffee");
});

test("a long result comparison restores its expanded rows and scroll after a detail", async ({ page }) => {
  await page.goto("/search?q=coffee", { waitUntil: "domcontentloaded" });
  const more = page.locator("details[data-search-more]");
  await more.locator("summary").click();
  const place = more.locator('a[href^="/places/"]').last();
  await place.scrollIntoViewIfNeeded();
  const scrollBefore = await page.evaluate(() => window.scrollY);
  await place.click();
  const back = page.getByRole("link", { name: "Back to search results", exact: true });
  await expect(back).toBeVisible({ timeout: 20_000 });
  await back.click();
  await expect(more).toHaveAttribute("open", "", { timeout: 20_000 });
  await expect.poll(async () => Math.abs((await page.evaluate(() => window.scrollY)) - scrollBefore)).toBeLessThan(100);
  await expect.poll(() => new URL(page.url()).searchParams.get("in")).toBe("county");
});

test("a scoped search keeps its query, filters, and comparison position through a map selection", async ({ page }) => {
  test.setTimeout(60_000);
  await page.addInitScript(() => {
    localStorage.setItem("fr_map_location_intro_v1", "dismissed");
  });
  const searchPath = "/search?q=coffee&in=brunswick&kind=place";
  await page.goto(searchPath, { waitUntil: "domcontentloaded" });
  const mapLink = page.getByRole("link", { name: "View on map", exact: true });
  await expect(mapLink).toBeVisible({ timeout: 20_000 });
  await mapLink.scrollIntoViewIfNeeded();
  const scrollBefore = await page.evaluate(() => window.scrollY);
  await mapLink.click();
  await expect.poll(() => new URL(page.url()).searchParams.get("in")).toBe("brunswick");
  await expect.poll(() => new URL(page.url()).searchParams.get("returnTo")).toBe(searchPath);
  const search = page.getByRole("combobox", { name: "Search this map" });
  await expect(search).toHaveValue("coffee");
  await search.focus();
  const place = page.locator('[data-map-search-result="place:beans-in-the-belfry-brunswick"]');
  await expect(place).toBeVisible({ timeout: 20_000 });
  await place.click();
  await expect.poll(() => new URL(page.url()).searchParams.get("place")).toBe("beans-in-the-belfry-brunswick");
  await expect(page.locator('[data-map-place-slug="beans-in-the-belfry-brunswick"]')).toBeVisible();
  await page.goBack();
  await expect.poll(() => new URL(page.url()).searchParams.has("place")).toBe(false);
  await expect(search).toHaveValue("coffee");
  await page.keyboard.press("Escape");
  const back = page.getByRole("link", { name: "Back to search results", exact: true });
  await expect(back).toHaveAttribute("href", searchPath);
  await back.click();
  await expect(page.getByRole("searchbox", { name: "Search Frederick County" })).toHaveValue("coffee");
  await expect(page.getByRole("link", { name: "Places", exact: true })).toHaveAttribute("aria-current", "page");
  await expect.poll(() => new URL(page.url()).searchParams.get("in")).toBe("brunswick");
  await expect.poll(async () => Math.abs((await page.evaluate(() => window.scrollY)) - scrollBefore)).toBeLessThan(80);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});
