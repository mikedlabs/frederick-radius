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

    await expect(page.locator(".dock-search-results")).toHaveCount(0);
    await expect(
      page.locator('[data-map-place-slug="market-street-boba-beans"]'),
    ).toBeVisible();
    await expect(
      page.locator(
        '[data-map-place-slug="calvary-united-methodist-church-of-frederick-maryland"]',
      ),
    ).toHaveCount(0);
  });

  test("restores a shared query without covering the map until search is active", async ({ page }) => {
    await page.goto("/map?q=Market%20Street%20Boba%20Beans", {
      waitUntil: "domcontentloaded",
    });

    const search = page.getByRole("searchbox", { name: "Search this map" });
    await expect(search).toHaveValue("Market Street Boba Beans");
    await expect(page.locator(".dock-search-results")).toHaveCount(0);

    await search.focus();
    await expect(
      page.locator('[data-map-search-result="place:market-street-boba-beans"]'),
    ).toBeVisible({ timeout: 10_000 });

    await search.press("Escape");
    await expect(page.locator(".dock-search-results")).toHaveCount(0);
    await expect(search).not.toBeFocused();
  });

  test("the header search action focuses the map field instead of global Find", async ({ page }) => {
    await page.goto("/map", { waitUntil: "domcontentloaded" });

    await page.getByRole("button", { name: "Search this map" }).click();

    await expect(
      page.getByRole("searchbox", { name: "Search this map" }),
    ).toBeFocused();
    await expect(page.locator("#radius-find-dialog")).toHaveCount(0);
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

  test("a resident utility query turns on the requested map layer", async ({ page }) => {
    await page.goto("/map", { waitUntil: "domcontentloaded" });

    const search = page.getByRole("searchbox", { name: "Search this map" });
    await search.fill("trash can");

    const command = page.locator(
      '[data-map-search-result="action:map-trash"]',
    );
    await expect(command).toBeVisible();
    await command.click();

    await expect(page).toHaveURL(/amenity=trash/);
    await expect(page.locator(".dock-search-results")).toHaveCount(0);
    await expect(page.locator("[data-map-amenity-marks]")).not.toHaveAttribute(
      "data-map-amenity-marks",
      "off",
    );
  });

  test("parking is a parking command, not a parks result", async ({ page }) => {
    await page.goto("/map", { waitUntil: "domcontentloaded" });

    const search = page.getByRole("searchbox", { name: "Search this map" });
    await search.fill("where can I park downtown");

    const firstResult = page.locator(".dock-search-result-item").first();
    await expect(firstResult).toContainText("Show parking on the map");
    await firstResult.getByRole("button").click();

    await expect(page).toHaveURL(/show=parking/);
    await expect(page.locator(".dock-search-results")).toHaveCount(0);
  });
});
