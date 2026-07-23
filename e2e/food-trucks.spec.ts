import { expect, test } from "@playwright/test";

test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });

test("food-truck board leads with plans and opens useful vendor details", async ({ page }) => {
  await page.goto("/food-trucks");

  await expect(page.getByRole("heading", { level: 1, name: "Find where they pull in." })).toBeVisible();
  await expect(page.getByRole("heading", { level: 2, name: "This week’s stops" })).toBeVisible();
  await expect(page.getByRole("heading", { level: 2, name: "Browse the local roster" })).toBeVisible();
  await expect(page.getByText("Owner pilot", { exact: true })).toBeVisible();
  await expect(page.getByText("The example shows the format and is not a real location.")).toBeVisible();
  await expect(page.getByRole("button", { name: "Scheduled this week" })).toBeVisible();
  await expect(page.getByAltText("Downtown Frederick after dark")).toHaveCount(0);

  const firstDetail = page.getByRole("button", { name: /^See details for / }).first();
  await firstDetail.click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await expect(page.getByText("Schedules can change.")).toBeVisible();
  await expect(page.getByRole("link", { name: "Claim this truck" })).toHaveAttribute(
    "href",
    /^\/food-trucks\/claim\?truck=/,
  );
  await expect(page.getByRole("link", { name: "Suggest an update or add a photo" })).toHaveAttribute(
    "href",
    "/submit/place?category=food-truck",
  );
  await page.getByRole("button", { name: /^Close / }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
});

test("a vendor claim opens with the selected truck already filled in", async ({ page }) => {
  await page.goto("/food-trucks");
  await page.getByRole("button", { name: /^See details for / }).first().click();

  const claim = page.getByRole("link", { name: "Claim this truck" });
  const href = await claim.getAttribute("href");
  expect(href).toMatch(/^\/food-trucks\/claim\?truck=.+/);
  const selectedSlug = new URL(href!, "http://localhost").searchParams.get("truck");

  await claim.click();
  await expect(page).toHaveURL(/\/food-trucks\/claim\?truck=/);
  await expect(page.locator("select")).toHaveValue(selectedSlug!);
});

test("Today gives food trucks an honest live-or-preview entry", async ({ page }) => {
  await page.goto("/today");
  const card = page.getByRole("link", { name: /Food trucks|food truck.*live/i });
  await expect(card).toBeVisible();
  await expect(card).toHaveAttribute("href", "/food-trucks");
});
