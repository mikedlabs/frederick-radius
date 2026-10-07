import { expect, test, type Page } from "@playwright/test";

// PageBloom used to loop two blurred color blobs behind every tool page.
// docs/DESIGN_TELLS.md rules decorative glows out of the public product, so
// the paper is now static: a soft top light and the grain, nothing moving.
async function open(page: Page) {
  await page.route("**/*", (route) => ["127.0.0.1", "localhost"].includes(new URL(route.request().url()).hostname)
    ? route.continue() : route.abort());
  await page.goto("/compass");
  const bloom = page.locator("[data-page-bloom]").first();
  await expect(bloom).toHaveAttribute("aria-hidden", "true");
  await expect(bloom.locator("[data-page-paper]")).toHaveCount(1);
  await expect(bloom.locator(".aurora-grain")).toHaveCount(1);
  return bloom;
}

for (const width of [390, 1366]) {
  test.describe(`Page paper at ${width}px`, () => {
    test.use({ viewport: { width, height: 900 } });
    test("draws no decorative glow and does not move with full motion allowed", async ({ page }) => {
      await page.emulateMedia({ reducedMotion: "no-preference" });
      const bloom = await open(page);
      await expect(bloom.locator("[data-ambient-layer]")).toHaveCount(0);
      const filters = await bloom.locator("*").evaluateAll((elements) =>
        elements.map((element) => getComputedStyle(element).filter).filter((filter) => filter !== "none"));
      expect(filters).toEqual([]);
      const animations = await bloom.evaluate((element) =>
        element.getAnimations({ subtree: true }).length);
      expect(animations).toBe(0);
    });
  });
}
