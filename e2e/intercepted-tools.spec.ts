import { expect, test } from "@playwright/test";
import {
  dismissReturnBridge,
  emptyReturnBridgeState,
  RETURN_BRIDGE_STORAGE_KEY,
} from "../src/lib/return-bridge";

test.beforeEach(async ({ page }) => {
  await page.addInitScript(({ key, state }) => {
    window.localStorage.setItem(key, JSON.stringify(state));
  }, {
    key: RETURN_BRIDGE_STORAGE_KEY,
    state: dismissReturnBridge(emptyReturnBridgeState()),
  });
  await page.route("**/*", (request) => {
    const host = new URL(request.request().url()).hostname;
    return ["localhost", "127.0.0.1", "[::1]"].includes(host)
      ? request.continue() : request.abort();
  });
});

for (const width of [390, 1366]) {
  test(`Tools opens one visible drawer and restores Today on Escape and Back at ${width}px`, async ({ page }) => {
    test.setTimeout(90_000);
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/today?in=county");
    const origin = page.url();
    const trigger = page.locator("header").first().getByRole("link", { name: "Open tools", exact: true });
    await trigger.click();
    await expect(page).toHaveURL(/\/compass$/);
    const drawer = page.getByRole("dialog");
    await expect(drawer).toHaveCount(1);
    await expect(drawer.getByRole("heading", { name: "What do you need?", exact: true })).toBeVisible();
    await expect(drawer.getByRole("searchbox", { name: "Search Radius tools and local guides", exact: true })).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(drawer).toHaveCount(0);
    await expect(page).toHaveURL(origin);
    await expect(trigger).toBeFocused();
    await trigger.click();
    await expect(drawer).toHaveCount(1);
    await page.goBack();
    await expect(drawer).toHaveCount(0);
    await expect(page).toHaveURL(origin);
    await expect(trigger).toBeFocused();
  });
}

test("Tools clears its route drawer before County status opens a weather detail", async ({ page }) => {
  test.setTimeout(120_000);
  await page.goto("/today?in=county");
  await page.locator("header").first().getByRole("link", { name: "Open tools", exact: true }).click();
  const drawer = page.getByRole("dialog");
  await expect(drawer).toHaveCount(1);
  await drawer.getByRole("searchbox", { name: "Search Radius tools and local guides", exact: true }).fill("weather");
  const county = drawer.locator('a[href="/pulse"]');
  await expect(county).toHaveCount(1);
  await county.click();
  await expect(page).toHaveURL(/\/pulse$/);
  await expect(drawer).toHaveCount(0);
  const weather = page.locator("main").getByRole("button", { name: /^Weather:/ });
  if (!(await weather.isVisible())) {
    await page.locator("main summary").filter({ hasText: "Source status" }).click();
  }
  await expect(weather).toBeVisible();
  await weather.click();
  await expect(drawer).toHaveCount(1);
  await expect(drawer).toHaveAccessibleName("Weather");
  await page.keyboard.press("Escape");
  await expect(drawer).toHaveCount(0);
  await expect(page.locator("main").getByRole("heading", { level: 1 })).toBeVisible();
});

test("County status opens its full workspace with one weather drawer", async ({ page }) => {
  test.setTimeout(120_000);
  await page.setViewportSize({ width: 1366, height: 900 });
  await page.goto("/today?in=county");
  await page.locator("header").first().getByRole("link", { name: /^County status:/ }).click();
  await expect(page).toHaveURL(/\/pulse$/);
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page.locator("main").getByRole("heading", { level: 1 })).toBeVisible();
  const weather = page.locator("main").getByRole("button", { name: /^Weather:/ });
  if (!(await weather.isVisible())) {
    await page.locator("main summary").filter({ hasText: "Source status" }).click();
  }
  await expect(weather).toBeVisible();
  await weather.click();
  await expect(page.getByRole("dialog")).toHaveCount(1);
  await expect(page.getByRole("dialog")).toHaveAccessibleName("Weather");
});
