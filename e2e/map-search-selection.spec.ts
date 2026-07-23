import { expect, test } from "@playwright/test";

test.describe("map search selection", () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test("opens the same place slug the user selected", async ({ page }) => {
    await page.goto("/map", { waitUntil: "domcontentloaded" });

    const search = page.getByRole("searchbox", { name: "Search this map" });
    await expect(search).toBeVisible({ timeout: 20_000 });
    await search.fill("Market Street Boba Beans");

    const selectedResult = page.locator(
      '[data-map-search-result="place:market-street-boba-beans"]',
    );
    await expect(selectedResult).toBeVisible({ timeout: 10_000 });
    await selectedResult.click();

    await expect(
      page.locator('[data-map-place-slug="market-street-boba-beans"]'),
    ).toBeVisible();
    await expect(
      page.locator(
        '[data-map-place-slug="calvary-united-methodist-church-of-frederick-maryland"]',
      ),
    ).toHaveCount(0);
  });

  test("a map gesture dismisses search results before another card opens", async ({ page }) => {
    await page.goto("/map", { waitUntil: "domcontentloaded" });

    const search = page.getByRole("searchbox", { name: "Search this map" });
    await search.fill("Market Street Boba Beans");
    await expect(
      page.locator('[data-map-search-result="place:market-street-boba-beans"]'),
    ).toBeVisible();

    await page.locator("canvas.mapboxgl-canvas").click({ position: { x: 195, y: 520 } });
    await expect(search).toHaveValue("");
    await expect(
      page.locator('[data-map-search-result="place:market-street-boba-beans"]'),
    ).toHaveCount(0);
  });

  test("the small-screen place card keeps Close and Save from colliding", async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 568 });
    await page.goto("/map", { waitUntil: "domcontentloaded" });

    const search = page.getByRole("searchbox", { name: "Search this map" });
    await search.fill("Market Street Boba Beans");
    await page
      .locator('[data-map-search-result="place:market-street-boba-beans"]')
      .click();

    const peek = page.locator('[data-map-place-slug="market-street-boba-beans"]');
    await expect(peek).toBeVisible();
    await expect(page.locator("[data-map-dock]")).toHaveCSS("opacity", "0");

    const overlaps = await peek.evaluate((element) => {
      const close = element.querySelector<HTMLElement>(".map-peek-close")?.getBoundingClientRect();
      const save = [...element.querySelectorAll<HTMLElement>(".map-peek-act")]
        .find((item) => item.textContent?.trim() === "Save")
        ?.getBoundingClientRect();
      if (!close || !save) return true;
      return !(
        close.right <= save.left ||
        close.left >= save.right ||
        close.bottom <= save.top ||
        close.top >= save.bottom
      );
    });
    expect(overlaps).toBe(false);
  });
});
