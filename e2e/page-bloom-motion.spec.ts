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

for (const preference of ["no-preference", "reduce"] as const) {
  test(`confirmed Save keeps feedback with native ${preference} motion`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.emulateMedia({ reducedMotion: preference });
    await page.route("**/*", (route) => ["127.0.0.1", "localhost"].includes(new URL(route.request().url()).hostname)
      ? route.continue() : route.abort());
    const response = await page.goto("/category/outdoors?in=county");
    expect(response?.status()).toBe(200);
    const save = page.locator('main [data-save-ref^="place:"]').filter({ visible: true }).first();
    await expect(save).toBeEnabled();
    await expect(save).toHaveAttribute("aria-pressed", "false");
    // Arm a read-only observer before the real click. It samples the actual
    // confirmed DOM commit, without racing the 520ms celebration teardown.
    const [feedback] = await Promise.all([
      save.evaluate((control) => new Promise<{
        reduced: boolean;
        pop: { name: string; duration: string; animations: number };
        ring: { name: string; duration: string; animations: number };
      }>((resolve, reject) => {
        const read = (element: Element) => ({
          name: getComputedStyle(element).animationName,
          duration: getComputedStyle(element).animationDuration,
          animations: element.getAnimations().length,
        });
        const capture = () => {
          const pop = control.querySelector(".save-pop");
          const ring = control.querySelector(".save-ring");
          if (control.getAttribute("aria-pressed") !== "true" || !pop || !ring) return;
          observer.disconnect();
          window.clearTimeout(timeout);
          resolve({ reduced: matchMedia("(prefers-reduced-motion: reduce)").matches, pop: read(pop), ring: read(ring) });
        };
        const observer = new MutationObserver(capture);
        const timeout = window.setTimeout(() => {
          observer.disconnect();
          reject(new Error("Confirmed Save feedback did not appear."));
        }, 5000);
        observer.observe(control, { attributes: true, childList: true, subtree: true });
        capture();
      })),
      save.click(),
    ]);
    await expect(save).toHaveAttribute("aria-pressed", "true");
    await expect(save).toBeEnabled();
    await testInfo.attach("confirmed-save-native-motion", { body: JSON.stringify(feedback, null, 2), contentType: "application/json" });
    expect(feedback.reduced).toBe(preference === "reduce");
    if (preference === "reduce") {
      expect([feedback.pop.name, feedback.ring.name]).toEqual(["none", "none"]);
      expect([feedback.pop.animations, feedback.ring.animations]).toEqual([0, 0]);
      // The global important duration clamp may still compute to 1e-6s;
      // no animation name or actual animation is the reduced-motion contract.
    } else {
      expect(feedback.pop.name).toBe("save-pop-kf");
      expect(feedback.ring.name).toBe("save-ring-kf");
      expect(feedback.pop.animations).toBeGreaterThan(0);
      expect(feedback.ring.animations).toBeGreaterThan(0);
    }
    await expect(page.getByText("Your saved list starts here", { exact: true })).toBeVisible();
  });
}
