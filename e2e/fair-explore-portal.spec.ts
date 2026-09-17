import { readFileSync } from "node:fs";
import type { AxeResults } from "axe-core";
import { expect, test } from "@playwright/test";

const FAIR_PATH = "/moments/great-frederick-fair-2026#program";

test.describe("Fair direct program discovery", () => {
  test.use({ locale: "en-US", timezoneId: "America/New_York", serviceWorkers: "block" });

  for (const width of [320, 375, 390, 430, 1280]) {
    test(`shows events immediately with accessible categories at ${width}px`, async ({ page }) => {
      await page.setViewportSize({ width, height: 844 });
      await page.goto(FAIR_PATH);
      await expect(page.locator("article[data-fair-app]")).toHaveAttribute("data-fair-interaction-ready", "true");
      await page.getByRole("combobox", { name: "Fair day to explore" }).selectOption("2026-09-18");
      const categories = page.getByRole("group", { name: "Filter the Fair program" });
      await expect(categories.getByRole("button")).toHaveCount(8);
      const grandstandLines = await categories.getByRole("button", { name: "Grandstand", exact: true }).locator("span").evaluate((label) => {
        const range = document.createRange();
        range.selectNodeContents(label);
        return range.getClientRects().length;
      });
      expect(grandstandLines).toBe(1);
      await expect(page.getByRole("button", { name: "Browse full program", exact: true })).toHaveCount(0);
      await expect(page.locator("[data-fair-program-trail]").first()).toBeVisible();
      await page.evaluate(() => document.fonts.ready);
      const firstEvent = await page.locator("[data-fair-program-trail] li").first().boundingBox();
      expect(firstEvent?.y).toBeLessThan(760);
      for (const category of await categories.getByRole("button").all()) {
        const box = await category.boundingBox();
        expect(box?.width).toBeGreaterThanOrEqual(44);
        expect(box?.height).toBeGreaterThanOrEqual(44);
      }
      await page.addScriptTag({ content: readFileSync("node_modules/axe-core/axe.min.js", "utf8") });
      const issues = await page.evaluate(async () => {
        const axe = (window as unknown as { axe: { run: (context: string, options: object) => Promise<AxeResults> } }).axe;
        return axe.run("#fair-find-panel", { runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21aa"] } });
      });
      expect(issues.violations).toEqual([]);
      await categories.getByRole("button", { name: "Animals", exact: true }).focus();
      await page.keyboard.press("Enter");
      await expect(categories.getByRole("button", { name: "Animals", exact: true })).toHaveAttribute("aria-pressed", "true");
      await expect(page.getByRole("list", { name: "Fair program results", exact: true })).toContainText("Horse Barrel Racing");
      await categories.getByRole("button", { name: "Food & drink", exact: true }).click();
      await expect(page.getByText("These are scheduled food and drink activities, not food stands.")).toBeVisible();
      await expect(page.getByRole("link", { name: "Search official vendor booths" })).toHaveAttribute("target", "_blank");
      await page.addStyleTag({ content: "[data-fair-program-filter] { font-size: 24px !important; }" });
      const layout = await page.evaluate(() => ({
        overflow: document.documentElement.scrollWidth > innerWidth,
        clipped: Array.from(document.querySelectorAll<HTMLElement>("[data-fair-program-filter]")).some(el => el.scrollWidth > el.clientWidth + 1 || el.scrollHeight > el.clientHeight + 1),
      }));
      expect(layout).toEqual({ overflow: false, clipped: false });
    });
  }

  test("keeps category and day through details and the map", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(FAIR_PATH);
    await page.getByRole("combobox", { name: "Fair day to explore" }).selectOption("2026-09-18");
    await page.getByRole("group", { name: "Filter the Fair program" }).getByRole("button", { name: "Music", exact: true }).click();
    await page.getByRole("button", { name: "Open details for Daughtry", exact: true }).click();
    const detail = page.getByRole("dialog", { name: "Daughtry", exact: true });
    await detail.getByRole("button", { name: "Show on map", exact: true }).click();
    await expect(page).toHaveURL(/#fair-map$/);
    await expect(page.locator("[data-fair-map-selection]:visible")).toContainText("Grandstand", { timeout: 30000 });
    await page.getByRole("navigation", { name: "Fair Day", exact: true }).getByRole("button", { name: "Program", exact: true }).click();
    await expect(page.locator('[data-fair-program-filter="music"]')).toHaveAttribute("aria-pressed", "true");
    await expect(page.getByRole("combobox", { name: "Fair day to explore" })).toHaveValue("2026-09-18");
    await page.getByRole("button", { name: "Clear filters", exact: true }).click();
    await expect(page.locator('[data-fair-program-filter="all"]')).toHaveAttribute("aria-pressed", "true");
  });
});
