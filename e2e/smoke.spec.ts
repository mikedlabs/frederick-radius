import { test, expect } from "@playwright/test";

/**
 * Playwright smoke test. Confirms the dev server boots and the home page
 * renders. Critical-path coverage (event times, radius polygon, search,
 * dedup) is added per ticket.
 */
test("home page loads", async ({ page }) => {
  await page.goto("/");
  await expect(page).toHaveTitle(/Frederick Radius/i);
});
