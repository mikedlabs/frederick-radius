import { expect, test } from "@playwright/test";

test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });

test("Events keeps discovery controls visible and nests display choices", async ({ page }) => {
  await page.goto("/events");

  await expect(page.getByRole("group", { name: "When" })).toBeVisible();
  const filters = page.getByRole("group", { name: "Filter events" });
  await expect(filters.getByText("What", { exact: true })).toBeVisible();
  await expect(filters.getByText("When", { exact: true })).toBeVisible();
  await expect(filters.getByText("Where", { exact: true })).toBeVisible();

  await expect(page.getByRole("button", { name: "List view" })).toBeHidden();
  await page.locator("summary").filter({ hasText: "Display" }).click();
  await expect(page.getByRole("button", { name: "List view" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Map view" })).toBeVisible();
  await expect(page.getByRole("button", { name: /^Order:/ })).toBeVisible();
});

test("Events keeps display choices inline on wider screens", async ({ page }) => {
  await page.setViewportSize({ width: 1024, height: 800 });
  await page.goto("/events");

  await expect(page.getByRole("button", { name: "List view" })).toBeVisible();
  await expect(page.getByRole("button", { name: /^Order:/ })).toBeVisible();
  await expect(page.locator("summary").filter({ hasText: "Display" })).toBeHidden();
});
