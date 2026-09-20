import { expect, test } from "@playwright/test";

test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });

test("the countdown's schedule button stays still even just before opening", async ({ page }) => {
  await page.clock.install({ time: new Date("2026-09-18T19:50:00Z") });
  await page.goto("/fair", { waitUntil: "domcontentloaded" });
  const card = page.locator("[data-fair-up-next]");
  await expect(card).toContainText(/In \d+m/);
  const action = card.getByRole("button", { name: "View the full schedule" });
  await action.scrollIntoViewIfNeeded();
  await page.waitForTimeout(500);
  const before = await action.boundingBox();
  await page.waitForTimeout(650);
  const after = await action.boundingBox();
  expect(before).not.toBeNull();
  expect(after).not.toBeNull();
  for (const dimension of ["x", "y", "width", "height"] as const) {
    expect(Math.abs(before![dimension] - after![dimension])).toBeLessThan(0.1);
  }
  await action.click();
  await expect(page).toHaveURL(/#program$/);
});

test("passing opening day never becomes a perpetual open-now claim", async ({ page }) => {
  await page.clock.install({ time: new Date("2026-09-20T07:00:00Z") });
  await page.goto("/fair", { waitUntil: "domcontentloaded" });
  const card = page.locator("[data-fair-up-next]");
  await expect(card).toContainText("2026 Fair dates");
  await expect(card).toContainText("Sep 18–26");
  await expect(card).not.toContainText("Open Now");
});
