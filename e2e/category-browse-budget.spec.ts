import { expect, test } from "@playwright/test";

test("collapsed category browse mounts one bounded page only after opening", async ({
  page,
  context,
  baseURL,
}) => {
  const app = new URL(baseURL ?? "http://localhost:3010");
  await context.addCookies([{
    name: "fr_onboarded",
    value: "1",
    domain: app.hostname,
    path: "/",
  }]);

  const response = await page.goto("/category/restaurant", {
    waitUntil: "domcontentloaded",
  });
  expect(response?.status()).toBe(200);

  const section = page.locator('section[aria-label="All restaurants"]');
  const trigger = section.getByRole("button", { name: "All restaurants" });
  await expect(trigger).toHaveAttribute("aria-expanded", "false");
  await expect(section.locator("article")).toHaveCount(0);

  await trigger.click();
  await expect(trigger).toHaveAttribute("aria-expanded", "true");
  await expect(section.locator("article")).toHaveCount(24);
  await expect(section.getByRole("button", { name: "Show 24 more" })).toBeVisible();

  await section.getByRole("button", { name: "Show 24 more" }).click();
  await expect(section.locator("article")).toHaveCount(48);
});
