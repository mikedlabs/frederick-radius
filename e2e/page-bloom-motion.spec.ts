import { expect, test, type Locator, type Page } from "@playwright/test";

async function frame(layers: Locator) {
  return layers.evaluateAll((elements) => elements.map((element) => getComputedStyle(element).transform));
}
async function moving(layers: Locator) {
  const before = await frame(layers);
  await expect.poll(() => frame(layers)).not.toEqual(before);
}
async function still(layers: Locator) {
  await expect.poll(() => frame(layers)).toEqual(["none", "none"]);
  const before = await frame(layers);
  // Observe real Framer frames, without replacing the animation clock.
  await new Promise((resolve) => setTimeout(resolve, 350));
  expect(await frame(layers)).toEqual(before);
}
async function open(page: Page) {
  await page.route("**/*", (route) => ["127.0.0.1", "localhost"].includes(new URL(route.request().url()).hostname)
    ? route.continue() : route.abort());
  await page.goto("/compass");
  const bloom = page.locator("[data-page-bloom]").first();
  const layers = bloom.locator("[data-ambient-layer]");
  await expect(layers).toHaveCount(2);
  await expect(bloom.locator(".aurora-grain")).toHaveCount(1);
  await expect(bloom).toHaveAttribute("aria-hidden", "true");
  return { bloom, layers };
}

for (const width of [390, 1366]) {
  test.describe(`Decorative motion at ${width}px`, () => {
    test.use({ viewport: { width, height: 900 } });
    test("keeps the wash static for reduced motion and responds to preference changes", async ({ page }) => {
      await page.emulateMedia({ reducedMotion: "reduce" });
      const { bloom, layers } = await open(page);
      await expect(bloom).toHaveAttribute("data-ambient-motion", "static");
      await still(layers);
      await page.emulateMedia({ reducedMotion: "no-preference" });
      await expect(bloom).toHaveAttribute("data-ambient-motion", "active");
      await moving(layers);
      await page.emulateMedia({ reducedMotion: "reduce" });
      await expect(bloom).toHaveAttribute("data-ambient-motion", "static");
      await still(layers);
    });
    test("stops actual decorative frames while hidden and resumes on visible return", async ({ page }) => {
      await page.emulateMedia({ reducedMotion: "no-preference" });
      const { bloom, layers } = await open(page);
      await expect(bloom).toHaveAttribute("data-ambient-motion", "active");
      await moving(layers);
      // Headless Chromium does not reliably hide a background tab. Control only
      // this browser input; actual subscription, React and Framer remain real.
      await page.evaluate(() => {
        Object.defineProperty(document, "visibilityState", { configurable: true, get: () => "hidden" });
        document.dispatchEvent(new Event("visibilitychange"));
      });
      await expect(bloom).toHaveAttribute("data-ambient-motion", "static");
      await still(layers);
      await page.evaluate(() => {
        Reflect.deleteProperty(document, "visibilityState");
        document.dispatchEvent(new Event("visibilitychange"));
      });
      await expect(bloom).toHaveAttribute("data-ambient-motion", "active");
      await moving(layers);
    });
  });
}
