import { expect, test, type Route } from "@playwright/test";
import { dismissReturnBridge, emptyReturnBridgeState, RETURN_BRIDGE_STORAGE_KEY } from "../src/lib/return-bridge";

test.beforeEach(async ({ page }) => {
  await page.addInitScript(({ key, state }) => window.localStorage.setItem(key, JSON.stringify(state)), {
    key: RETURN_BRIDGE_STORAGE_KEY, state: dismissReturnBridge(emptyReturnBridgeState()),
  });
  await page.route("**/*", (route) => {
    const host = new URL(route.request().url()).hostname;
    return ["localhost", "127.0.0.1", "[::1]"].includes(host) ? route.continue() : route.abort();
  });
});

for (const width of [390, 1366]) {
  test(`a stalled event has an immediate full-page escape and one Back step at ${width}px`, async ({ page }) => {
    test.setTimeout(90_000);
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/events?in=county");
    await expect(page.locator("[data-events-interaction-ready]")).toHaveAttribute("data-events-interaction-ready", "true");
    const link = page.locator('main [data-decision-entity="event"] a[data-decision-action="open"]').filter({ visible: true }).first();
    await expect(link).toBeVisible();
    const href = await link.getAttribute("href");
    expect(href).toMatch(/^\/events\/[^/?#]+(?:\?.*)?$/);
    const origin = new URL(page.url());
    const blocked: Route[] = [];
    await page.route("**/api/events/*/summary?*", (route) => { blocked.push(route); });
    await link.click();
    const dialog = page.getByRole("dialog");
    await expect(dialog).toHaveCount(1);
    const escape = dialog.getByRole("button", { name: "Open full page", exact: true });
    await expect(escape).toBeVisible();
    expect((await escape.boundingBox())?.height).toBeGreaterThanOrEqual(44);
    await page.screenshot({ path: `output/playwright/event-sheet-pending-${width}.png` });
    await escape.click();
    await expect(page).toHaveURL((url) => url.pathname === new URL(href!, origin).pathname);
    expect(new URL(page.url()).searchParams.get("returnTo")).toBe(`${origin.pathname}${origin.search}`);
    await expect(page.getByRole("dialog")).toHaveCount(0);
    expect(blocked).toHaveLength(1);
    await page.goBack();
    await expect(page).toHaveURL(origin.href);
    await expect(page.getByRole("dialog")).toHaveCount(0);
  });
}

test("a stalled event automatically recovers to the canonical page with its browse context", async ({ page }) => {
  test.setTimeout(90_000);
  await page.goto("/events?in=county");
  await expect(page.locator("[data-events-interaction-ready]")).toHaveAttribute("data-events-interaction-ready", "true");
  const link = page.locator('main [data-decision-entity="event"] a[data-decision-action="open"]').filter({ visible: true }).first();
  await expect(link).toBeVisible();
  const href = await link.getAttribute("href");
  expect(href).toMatch(/^\/events\/[^/?#]+(?:\?.*)?$/);
  const origin = new URL(page.url());
  await page.route("**/api/events/*/summary?*", () => {});
  await link.click();
  await expect(page.getByRole("dialog")).toHaveCount(1);
  await expect(page).toHaveURL((url) => url.pathname === new URL(href!, origin).pathname, { timeout: 25_000 });
  expect(new URL(page.url()).searchParams.get("returnTo")).toBe(`${origin.pathname}${origin.search}`);
  await expect(page.getByRole("dialog")).toHaveCount(0);
});
