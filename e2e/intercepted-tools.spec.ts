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
    await expect(drawer.getByRole("link", { name: "Find a place, service, event, or answer", exact: true })).toHaveAttribute("href", "/search");
    await expect(drawer.getByRole("searchbox")).toHaveCount(0);
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
  await expect(drawer.locator("[data-compass-ready]")).toHaveAttribute("data-compass-ready", "true");
  await drawer.getByRole("button", { name: "Browse the full tool index", exact: true }).click();
  await expect(page.getByRole("dialog")).toHaveCount(1);
  const index = drawer.getByRole("region", { name: "All tools", exact: true });
  await index.getByRole("searchbox", { name: "Search tools in this section" }).fill("weather");
  const county = index.getByRole("link", { name: /^County status/ });
  await expect(county).toHaveAttribute("href", "/pulse");
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

test("Tools drawer uses the native Find destination and retains its origin on Back", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/today?in=county");
  const origin = page.url();
  const trigger = page.locator("header").first().getByRole("link", { name: "Open tools", exact: true });
  await trigger.click();
  let drawer = page.getByRole("dialog");
  await expect(drawer).toHaveCount(1);
  await drawer.getByRole("link", { name: "Find a place, service, event, or answer", exact: true }).click();
  await expect(page).toHaveURL(/\/search$/);
  await expect(page.getByRole("dialog")).toHaveCount(0);
  const search = page.getByRole("searchbox", { name: "Search Frederick County", exact: true });
  await search.fill("coffee"); await expect(search).toHaveValue("coffee");
  await page.goBack(); await expect(page).toHaveURL(/\/compass$/);
  drawer = page.getByRole("dialog"); await expect(drawer).toHaveCount(1);
  await expect(drawer.getByRole("link", { name: "Find a place, service, event, or answer", exact: true })).toBeVisible();
  await page.keyboard.press("Escape"); await expect(drawer).toHaveCount(0); await expect(page).toHaveURL(origin);
});

for (const width of [320, 390, 1366]) {
  test(`Tools drawer reuses one panel for More, full index and Edit at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/today?in=county"); const origin = page.url();
    const trigger = page.locator("header").first().getByRole("link", { name: "Open tools", exact: true });
    await trigger.click();
    const drawer = page.getByRole("dialog"); await expect(drawer).toHaveCount(1);
    await expect(drawer.locator("[data-compass-ready]")).toHaveAttribute("data-compass-ready", "true");
    const chapter = drawer.locator('[data-compass-intent="go-out"]');
    await chapter.getByRole("button", { name: /^Eat, drink & go out/ }).click();
    const more = chapter.getByRole("button", { name: "More food, drinks & events", exact: true });
    await more.click();
    let panel = drawer.getByRole("region", { name: "Eat, drink & go out", exact: true });
    await expect(panel).toBeVisible(); await expect(page.getByRole("dialog")).toHaveCount(1);
    await expect(drawer.locator('[data-compass-intent="go-out"]')).toBeHidden();
    await panel.getByRole("button", { name: "All tools", exact: true }).click();
    panel = drawer.getByRole("region", { name: "All tools", exact: true });
    await expect(panel.getByRole("searchbox", { name: "Search tools in this section" })).toBeVisible();
    await expect(page.getByRole("dialog")).toHaveCount(1);
    await page.keyboard.press("Escape");
    await expect(drawer.locator("[data-tool-deck-inline]")).toHaveCount(0); await expect(drawer).toHaveCount(1);
    await expect(more).toBeFocused(); await expect(page).toHaveURL(/chapter=go-out$/);
    const index = drawer.getByRole("button", { name: "Browse the full tool index", exact: true });
    await index.click(); await expect(drawer.getByRole("region", { name: "All tools", exact: true })).toBeVisible();
    await page.goBack(); await expect(drawer.locator("[data-tool-deck-inline]")).toHaveCount(0);
    await expect(index).toBeFocused(); await expect(drawer).toHaveCount(1);
    await index.click();
    await expect(drawer.getByRole("region", { name: "All tools", exact: true })).toBeVisible();
    await drawer.getByRole("button", { name: "Close All tools", exact: true }).click();
    await expect(drawer.locator("[data-tool-deck-inline]")).toHaveCount(0);
    await expect(drawer).toHaveCount(1); await expect(index).toBeFocused();
    const edit = drawer.getByRole("button", { name: "Edit", exact: true }); await edit.click();
    panel = drawer.getByRole("region", { name: "Edit shortcuts", exact: true });
    await panel.getByRole("searchbox", { name: "Search tools in this section" }).fill("brunch");
    await expect(panel.getByRole("button", { name: "Pin Brunch guide", exact: true })).toBeVisible();
    await expect(page.getByRole("dialog")).toHaveCount(1);
    await panel.getByRole("button", { name: "Back to Tools", exact: true }).click();
    await expect(drawer.locator("[data-tool-deck-inline]")).toHaveCount(0); await expect(edit).toBeFocused();
    expect(await drawer.evaluate((node) => node.scrollWidth - node.clientWidth)).toBeLessThanOrEqual(1);
    await page.keyboard.press("Escape"); await expect(drawer).toHaveCount(0); await expect(page).toHaveURL(origin);
    await expect(trigger).toBeFocused();
  });
}

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
