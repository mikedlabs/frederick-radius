import { test, expect } from "@playwright/test";
import { readFile } from "node:fs/promises";
import {
  dismissReturnBridge,
  emptyReturnBridgeState,
  RETURN_BRIDGE_STORAGE_KEY,
} from "../src/lib/return-bridge";

const origin = `http://localhost:${Number(process.env.PW_PORT) || 3010}`;
const route = "/today/tonight?intent=dinner&in=county";

test.beforeEach(async ({ page }) => {
  // Exercise Tonight as someone who already declined the install invitation.
  // The timed iPhone offer is covered separately by pwa-install.spec.ts.
  await page.addInitScript(({ key, state }) => {
    window.localStorage.setItem(key, JSON.stringify(state));
  }, {
    key: RETURN_BRIDGE_STORAGE_KEY,
    state: dismissReturnBridge(emptyReturnBridgeState()),
  });
  // Keep browser assets local. Server-side sources still use the app's existing
  // source policy; these assertions work with available and unavailable feeds.
  await page.route("**/*", (request) => {
    const host = new URL(request.request().url()).hostname;
    return ["localhost", "127.0.0.1", "[::1]"].includes(host)
      ? request.continue() : request.abort();
  });
  await page.setViewportSize({ width: 390, height: 844 });
});

test("keeps the owned area photo and real recommendation useful at phone and desktop sizes", async ({ page }, testInfo) => {
  await page.goto(origin + route);
  await expect(page.getByRole("heading", { name: "Dinner tonight", exact: true })).toBeVisible();
  const lead = page.locator("[data-tonight-lead]");
  await expect(lead.getByRole("heading")).toBeVisible();
  await expect(lead.getByRole("link", { name: /^View .+ details$/ })).toBeVisible();
  for (const [width, height] of [[320, 740], [375, 812], [390, 844], [430, 932], [1440, 1000]]) {
    await page.setViewportSize({ width, height });
    const photo = page.locator("[data-tonight-area-photo]");
    await expect(photo.locator("img")).toHaveAttribute("alt", "Carroll Creek in Frederick.");
    await expect(photo.locator("figcaption")).toHaveCount(0);
    await expect.poll(() => photo.locator("img").evaluate((image) =>
      image instanceof HTMLImageElement && image.complete && image.naturalWidth > 0 && image.naturalHeight > 0,
    )).toBe(true);
    const box = (await photo.boundingBox())!;
    expect(box.y + box.height).toBeLessThan(height - 80);
    await expect.poll(() => page.evaluate(() =>
      document.documentElement.scrollWidth - document.documentElement.clientWidth,
    )).toBeLessThanOrEqual(1);
    await page.screenshot({ path: testInfo.outputPath(`tonight-${width}.png`), fullPage: true });
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await page.addScriptTag({ content: await readFile("node_modules/axe-core/axe.min.js", "utf8") });
  const violations = await page.evaluate(async () => {
    const result = await (window as unknown as { axe: { run: (root: Element, options: object) => Promise<{ violations: unknown[] }> } })
      .axe.run(document.querySelector("main")!, { runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21aa"] } });
    return result.violations;
  });
  expect(violations).toEqual([]);
});

test("opens the current place sheet, preserves origin, and restores focus on Escape", async ({ page }) => {
  test.setTimeout(60_000);
  await page.goto(origin + route);
  const lead = page.locator("[data-tonight-lead]");
  const name = await lead.getByRole("heading").innerText();
  const trigger = lead.getByRole("link", { name: `View ${name} details`, exact: true });
  await trigger.click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toHaveCount(1);
  await expect(dialog.getByRole("heading", { name, exact: true })).toBeVisible({ timeout: 30_000 });
  await expect(dialog.getByRole("link", { name: "Directions", exact: true })).toHaveAttribute("href", /^https:\/\/maps.apple.com/);
  await expect(dialog.getByRole("link", { name: /See full page/ })).toHaveAttribute("href", /returnTo=%2Ftoday%2Ftonight/);
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
  await expect(page).toHaveURL(origin + route);
  await expect(trigger).toBeFocused();
  await trigger.click();
  await expect(dialog).toHaveCount(1);
  await page.goBack();
  await expect(dialog).toHaveCount(0);
  await expect(page).toHaveURL(origin + route);
  await expect(trigger).toBeFocused();
});

test("legacy Tonight entries preserve the requested intent and area", async ({ page }) => {
  await page.goto(origin + "/tonight?intent=pizza&in=brunswick");
  await expect(page).toHaveURL(/\/today\/tonight\?intent=pizza&in=brunswick/);
  await expect(page.getByRole("heading", { name: "Pizza tonight", exact: true })).toBeVisible();
  await page.goto(origin + "/today?t=tonight&in=county");
  await expect.poll(() => new URL(page.url()).pathname).toBe("/today/tonight");
  expect(new URL(page.url()).searchParams.get("in")).toBe("county");
  await expect(page.getByRole("heading", { name: "Dinner tonight", exact: true })).toBeVisible();
});

test("changes intent, keeps explicit county over a saved town, and keeps Near me honest", async ({ page, context }) => {
  await context.addCookies([{ name: "fr_scope", value: "town:brunswick", url: origin }]);
  await page.goto(origin + route);
  await expect(page.locator("[data-tonight-lead]")).toBeVisible();
  await page.getByRole("link", { name: "Get a drink", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Drinks tonight", exact: true })).toBeVisible();
  await expect(page).toHaveURL(/intent=drinks&in=county/);
  await page.getByRole("link", { name: "Find pizza", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Pizza tonight", exact: true })).toBeVisible();
  await page.goto(origin + "/today/tonight?intent=dinner&in=nearme");
  await expect(page.getByText(/these places aren’t ranked by your location/)).toBeVisible();
  await expect(page.getByRole("link", { name: "Get a drink", exact: true })).toHaveAttribute("href", /in=nearme/);
});

test("Today carries explicit county into Tonight despite saved Brunswick", async ({ page, context }) => {
  test.setTimeout(90_000);
  await context.addCookies([{ name: "fr_scope", value: "town:brunswick", url: origin }]);
  await page.addInitScript(() => localStorage.setItem("fr:scope:v1", "town:brunswick"));
  await page.goto(origin + "/today?in=county");
  const entry = page.getByRole("link", { name: "Plan tonight", exact: true });
  await expect(entry).toHaveAttribute("href", "/today/tonight?intent=dinner&in=county");
  const area = page.getByRole("combobox", { name: "Choose your area" });
  await expect(area).toHaveValue("county");
  await area.selectOption("town:brunswick");
  await expect(entry).toHaveAttribute("href", "/today/tonight?intent=dinner&in=brunswick");
  await area.selectOption("county");
  await expect(entry).toHaveAttribute("href", "/today/tonight?intent=dinner&in=county");
  await entry.click();
  await expect(page).toHaveURL(origin + route, { timeout: 30_000 });
  await expect(page.locator("[data-tonight-lead]")).toBeVisible();
});

test("opens weather in one drawer and returns to the exact Tonight intent", async ({ page }) => {
  test.setTimeout(90_000);
  await page.goto(origin + route);
  await page.locator("[data-tonight-weather]").getByRole("link").click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toHaveCount(1, { timeout: 60_000 });
  await expect(dialog).toHaveAccessibleName("Weather");
  const back = dialog.getByRole("link", { name: /Back to Tonight/i });
  await expect(back).toHaveAttribute("href", route);
  await back.click();
  await expect(page).toHaveURL(origin + route);
  await expect(dialog).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "Dinner tonight", exact: true })).toBeVisible();
});

test("shared town navigation retains the intent and shows an honest empty area", async ({ page }) => {
  test.setTimeout(60_000);
  await page.goto(origin + route);
  const area = page.locator("[data-location-chip]");
  await area.click();
  await page.getByRole("button", { name: "Show town choices", exact: true }).click();
  await page.getByRole("button", { name: "Rosemont", exact: true }).click();
  await expect.poll(() => new URL(page.url()).searchParams.get("in")).toBe("rosemont");
  expect(new URL(page.url()).searchParams.get("intent")).toBe("dinner");
  await expect(page.getByText("No matching places are listed for this area.", { exact: true })).toBeVisible();
  await expect(page.locator("[data-tonight-area-photo]")).toHaveCount(0);
  await expect(page.getByRole("link", { name: "Get a drink", exact: true })).toHaveAttribute("href", /in=rosemont/);
  await area.click();
  await page.getByRole("button", { name: "Whole county", exact: true }).click();
  await expect(page.locator("[data-tonight-lead]")).toBeVisible();
});
