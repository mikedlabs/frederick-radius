import { expect, test, type Locator, type Page } from "@playwright/test";

async function expectTouchTarget(link: Locator) {
  const size = await link.boundingBox();
  expect(size?.width).toBeGreaterThanOrEqual(44);
  expect(size?.height).toBeGreaterThanOrEqual(44);
}

async function expectReflow(page: Page) {
  await expect.poll(() => page.evaluate(() =>
    document.documentElement.scrollWidth - document.documentElement.clientWidth,
  )).toBeLessThanOrEqual(1);
}

test("opens either Today guide and returns to the same town and section", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const today = "/today?in=mount-airy";
  await page.goto(today);

  const outings = page.getByRole("navigation", { name: "Local outings" });
  for (const [title, path] of [
    [/This Weekend/i, "weekend"],
    [/Two Hours Downtown/i, "two-hours-downtown"],
  ] as const) {
    const door = outings.getByRole("link", { name: title });
    await expect(door).toBeVisible();
    await expectTouchTarget(door);
    await door.click();
    await expect(page).toHaveURL(new RegExp(`/today/${path}\\?`));
    await expect(page.getByRole("heading", { name: title, level: 1 })).toBeVisible();
    const back = page.getByRole("link", { name: "Back to Today", exact: true });
    await expect(back).toHaveAttribute("href", `${today}#local-outings`);
    await expectTouchTarget(back);
    await back.click();
    await expect(page).toHaveURL(new RegExp(`${today.replace("?", "\\?")}#local-outings$`));
  }
});

for (const { width, height, enlarged } of [
  { width: 320, height: 568, enlarged: true },
  { width: 375, height: 667, enlarged: false },
  { width: 430, height: 932, enlarged: false },
  { width: 844, height: 390, enlarged: false },
  { width: 1366, height: 900, enlarged: false },
]) {
  test(`downtown guide reflows with its real photo and actions at ${width} × ${height}`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width, height });
    if (enlarged) await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto("/today/two-hours-downtown");
    if (enlarged) await page.addStyleTag({ content: "html { font-size: 200% !important; }" });
    const main = page.getByRole("main");
    await expect(main.getByRole("heading", { name: "Two Hours Downtown", level: 1 })).toBeVisible();
    const photo = main.getByRole("img", { name: /Carroll Creek/i }).first();
    await expect.poll(() => photo.evaluate((element: HTMLImageElement) => element.naturalWidth)).toBeGreaterThan(0);
    const primary = main.getByRole("link", { name: /Directions|Get directions/i }).first();
    await expectTouchTarget(primary);
    await expectReflow(page);
    if (enlarged) {
      const source = main.getByRole("link", { name: /City parking information/ });
      const disclosure = main.locator("summary").filter({ hasText: "Details and source" }).first();
      await expect(source).toBeHidden();
      await disclosure.focus();
      await disclosure.press("Enter");
      await expect(source).toBeVisible();
      await expectTouchTarget(source);
      await expectReflow(page);
    }
    if (width === 375) {
      await testInfo.attach("downtown-mobile", { body: await page.screenshot(), contentType: "image/png" });
    }
  });
}
