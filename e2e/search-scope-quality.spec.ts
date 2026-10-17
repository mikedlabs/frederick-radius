import { expect, test } from "@playwright/test";

test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });

test("changing the search area refreshes matches and Back restores the previous county search", async ({ page }) => {
  await page.goto("/search?q=coffee&in=county&kind=place", { waitUntil: "domcontentloaded" });
  const area = page.getByRole("combobox", { name: "Search area", exact: true });
  await expect(area).toHaveValue("county");
  await expect(area).toBeEnabled();
  await area.selectOption("brunswick");
  await expect(area).toHaveValue("brunswick", { timeout: 20_000 });
  await expect(page.locator('a[href^="/places/beans-in-the-belfry-brunswick"]')).toBeVisible();
  await expect(page.getByRole("link", { name: "View on map", exact: true })).toHaveAttribute("href", /in=brunswick/);
  expect(new URL(page.url()).searchParams.get("kind")).toBe("place");
  await page.goBack();
  await expect(area).toHaveValue("county", { timeout: 20_000 });
  await expect(page.getByRole("searchbox", { name: "Search Frederick County" })).toHaveValue("coffee");
  expect(new URL(page.url()).searchParams.get("in")).toBe("county");
  expect(new URL(page.url()).searchParams.get("kind")).toBe("place");
});

test("a new area replaces the town embedded in the request without losing the place filter", async ({ page }) => {
  await page.goto("/search?q=coffee%20in%20Thurmont&in=thurmont&kind=place", { waitUntil: "domcontentloaded" });
  const area = page.getByRole("combobox", { name: "Search area", exact: true });
  await expect(area).toBeEnabled();
  await area.selectOption("brunswick");
  await expect(area).toHaveValue("brunswick", { timeout: 20_000 });
  await expect(page.getByRole("searchbox", { name: "Search Frederick County" })).toHaveValue("coffee");
  await expect(page.locator('a[href^="/places/beans-in-the-belfry-brunswick"]')).toBeVisible();
  expect(new URL(page.url()).searchParams.get("in")).toBe("brunswick");
  expect(new URL(page.url()).searchParams.get("kind")).toBe("place");
  await area.selectOption("county");
  await expect(area).toHaveValue("county");
  expect(new URL(page.url()).searchParams.get("in")).toBe("county");
});


for (const width of [320, 390]) {
  test(`native search area and photographic lead reflow at ${width}px with enlarged text`, async ({ page }) => {
    await page.setViewportSize({ width, height: 844 });
    await page.route("**/api/place-photo?**", (route) => route.abort());
    await page.goto("/search?q=Schifferstadt&in=county&kind=place", { waitUntil: "domcontentloaded" });
    await page.evaluate(() => { document.documentElement.style.fontSize = "200%"; });
    const area = page.getByRole("combobox", { name: "Search area", exact: true });
    await expect(area).toBeEnabled();
    await expect(area).toHaveValue("county");
    const bounds = (await area.boundingBox())!;
    expect(bounds.height).toBeGreaterThanOrEqual(44);
    expect(bounds.width).toBeGreaterThanOrEqual(width - 64);
    expect(bounds.x).toBeGreaterThanOrEqual(0);
    expect(bounds.x + bounds.width).toBeLessThanOrEqual(width);
    const lead = page.locator("[data-search-place-lead]").first();
    await expect(lead.getByRole("heading", { name: "Schifferstadt Architectural Museum", exact: true })).toBeVisible();
    for (const action of [lead.getByRole("link", { name: "View place: Schifferstadt Architectural Museum", exact: true }), lead.getByRole("link", { name: "Map: Schifferstadt Architectural Museum", exact: true })]) {
      await action.scrollIntoViewIfNeeded();
      const box = (await action.boundingBox())!;
      expect(box.width).toBeGreaterThanOrEqual(44);
      expect(box.height).toBeGreaterThanOrEqual(44);
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1);
  });
}
