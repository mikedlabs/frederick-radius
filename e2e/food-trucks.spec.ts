import { expect, test } from "@playwright/test";

test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });

test("food-truck board leads with plans and opens useful vendor details", async ({ page }) => {
  await page.goto("/food-trucks");

  await expect(page.getByRole("heading", { level: 1, name: "Find where they pull in." })).toBeVisible();
  await expect(page.getByRole("heading", { level: 2, name: "This week’s stops" })).toBeVisible();
  await expect(page.getByRole("heading", { level: 2, name: "Browse the local roster" })).toBeVisible();
  await expect(page.getByText("Coming soon", { exact: true })).toBeVisible();
  await expect(page.getByText("The example is a preview, not a real location.")).toBeVisible();
  await expect(page.getByAltText("Downtown Frederick after dark")).toHaveCount(0);

  const firstDetail = page.getByRole("button", { name: /^See details for / }).first();
  await firstDetail.click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await expect(page.getByText("Schedules can change.")).toBeVisible();
  await page.getByRole("button", { name: /^Close / }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
});

test("Today gives food trucks an honest live-or-preview entry", async ({ page }) => {
  await page.goto("/today");
  const card = page.getByRole("link", { name: /Food trucks|food truck.*live/i });
  await expect(card).toBeVisible();
  await expect(card).toHaveAttribute("href", "/food-trucks");
});
