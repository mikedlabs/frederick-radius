import { expect, test } from "@playwright/test";

test.describe("beer workspace deep links", () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test("anchors select their panel and browser history restores the prior mode", async ({ page }) => {
    test.setTimeout(180_000);
    await page.goto("/beer#on-tap-now", {
      waitUntil: "domcontentloaded",
      timeout: 120_000,
    });

    const taprooms = page.getByRole("tab", { name: "Taprooms" });
    const index = page.getByRole("tab", { name: "Beer index" });
    const week = page.getByRole("tab", { name: "This week" });

    await expect(week).toHaveAttribute("aria-selected", "true");
    await expect(page).toHaveURL(/#on-tap-now$/);

    await page.goto("/beer", {
      waitUntil: "domcontentloaded",
      timeout: 120_000,
    });
    await expect(taprooms).toHaveAttribute("aria-selected", "true");

    // A real click proves hydration has attached the URL listeners before we
    // exercise a hash change that would otherwise be easy to race in a test.
    await index.click();
    await expect(index).toHaveAttribute("aria-selected", "true");
    await page.goBack();
    await expect(taprooms).toHaveAttribute("aria-selected", "true");

    await page.evaluate(() => {
      window.location.hash = "on-tap-now";
    });
    await expect(week).toHaveAttribute("aria-selected", "true");

    await index.click();
    await expect(index).toHaveAttribute("aria-selected", "true");
    await expect(page).toHaveURL(/#beer-index$/);
    await expect(page.locator("#beer-index")).toBeVisible();

    await page.goBack();
    await expect(week).toHaveAttribute("aria-selected", "true");
    await expect(page).toHaveURL(/#on-tap-now$/);

    await page.goBack();
    await expect(taprooms).toHaveAttribute("aria-selected", "true");
    await expect(page).toHaveURL(/\/beer$/);

    await page.evaluate(() => {
      window.location.hash = "beer-week";
    });
    await expect(week).toHaveAttribute("aria-selected", "true");
    await expect(page).toHaveURL(/#beer-week$/);
  });
});
