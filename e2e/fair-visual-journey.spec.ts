import { expect, test } from "@playwright/test";
import { mkdir } from "node:fs/promises";

const fair = "/moments/great-frederick-fair-2026";

for (const width of [320, 390, 430, 1440]) {
  test(`photo-led program and saved plan at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: width === 1440 ? 1000 : 844 });
    await page.goto(`${fair}#program`);
    const feature = page.locator("[data-fair-grandstand-spotlight]");
    await expect(feature).toBeVisible();
    await expect(feature).toContainText("Mike D, 2024");
    await expect.poll(() => feature.locator("img").evaluate((img) => (img as HTMLImageElement).naturalWidth)).toBeGreaterThan(0);
    await page.evaluate(() => document.fonts.ready);
    await mkdir("output/playwright/visual-journey", { recursive: true });
    await page.screenshot({ path: `output/playwright/visual-journey/program-${width}.png` });
    await expect(page.locator("[data-fair-program-trail]").first()).toBeVisible();
    const add = page.getByRole("button", { name: "Add Daughtry to My Day", exact: true });
    await add.scrollIntoViewIfNeeded();
    await add.click();
    await page.getByRole("navigation", { name: "Fair Day", exact: true }).getByRole("button", { name: /My Day/ }).click();
    await expect(page.getByRole("heading", { name: "My Fair Day", exact: true })).toBeVisible();
    await expect(page.locator("[data-fair-journey]")).not.toHaveAttribute("open");
    await expect(page.getByRole("button", { name: "Open details for Daughtry", exact: true })).toBeVisible();
    await expect(page.getByText("Fairgrounds atmosphere · Mike D, 2024", { exact: true })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: `output/playwright/visual-journey/my-day-${width}.png` });
    await page.reload();
    await expect(page.getByRole("button", { name: "Show Daughtry on the Fair map", exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Show Daughtry on the Fair map", exact: true }).click();
    await expect(page).toHaveURL(/#fair-map$/);
    await expect(page.locator("[data-fair-map-selection]").filter({ visible: true })).toContainText("Grandstand", { timeout: 30000 });
  });
}

test("Today uses the owned collection without moving search behind the Fair campaign", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/today");
  const photo = page.getByAltText("Carroll Creek in Frederick, photographed by Mike D.");
  await expect(photo).toBeVisible();
  await expect.poll(() => photo.evaluate((img) => (img as HTMLImageElement).naturalWidth)).toBeGreaterThan(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await mkdir("output/playwright/visual-journey", { recursive: true });
  await page.screenshot({ path: "output/playwright/visual-journey/today-390.png" });
});

test("large-text live bus status stays clear of Fair navigation and can be dismissed", async ({ page }) => {
  await page.route("**/api/transit/vehicles", (route) => route.fulfill({ status: 503, json: { available: false, vehicles: [] } }));
  await page.setViewportSize({ width: 320, height: 568 });
  await page.goto(`${fair}#fair-map`);
  const toggle = page.getByRole("button", { name: "Live county buses", exact: true });
  await expect(toggle).toBeVisible({ timeout: 30000 });
  await page.addStyleTag({ content: "html { font-size: 200% !important; }" });
  await expect(page.locator("[data-fair-map-high-text-controls]")).toBeVisible();
  const toggleBox = await toggle.boundingBox();
  expect(toggleBox?.width).toBeGreaterThanOrEqual(44);
  expect(toggleBox?.height).toBeGreaterThanOrEqual(44);
  await toggle.click();
  const status = page.locator("[data-fair-transit-status]");
  await expect(status).toContainText("Live positions are unavailable.");
  const panelBox = await status.boundingBox();
  const navBox = await page.locator("[data-mobile-action-bar]").boundingBox();
  expect((panelBox?.y ?? 0) + (panelBox?.height ?? 0)).toBeLessThanOrEqual(navBox?.y ?? 0);
  await toggle.click();
  await expect(status).toHaveCount(0);
});
