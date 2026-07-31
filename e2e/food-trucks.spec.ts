import { expect, test } from "@playwright/test";

test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });

test("food-truck board leads with plans and opens useful vendor details", async ({ page }) => {
  await page.goto("/food-trucks");

  await expect(page.getByRole("heading", { level: 1, name: "Find where they pull in." })).toBeVisible();
  await expect(
    page.locator('.food-truck-hero-lineup [data-photo-state="official-mark"]'),
  ).toHaveCount(5);
  await expect(page.getByRole("tab", { name: "Near me" })).toBeVisible();
  await expect(page.getByRole("tab", { name: "This week" })).toHaveAttribute("aria-selected", "true");
  await expect(page.getByRole("tab", { name: "Trucks" })).toBeVisible();
  await expect(page.getByRole("heading", { level: 2, name: "This week’s stops" })).toBeVisible();
  await expect(page.getByRole("heading", { level: 2, name: "Browse the local roster" })).toBeHidden();
  await expect(page.getByText("Owner pilot", { exact: true })).toHaveCount(0);
  await expect(page.getByText("For truck owners", { exact: true })).toHaveCount(1);
  await expect(page.getByRole("link", { name: "This week", exact: true })).toHaveCount(0);
  await expect(page.getByText(/feeds checked/i)).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Report a missing truck or wrong stop" })).toBeVisible();
  await expect(page.locator("#food-truck-panel-week #this-week")).toBeVisible();
  await expect(page.locator("#food-truck-panel-trucks #vendors")).toHaveCount(0);
  await expect(page.locator(".food-truck-journeys + .food-truck-owner-door")).toBeVisible();
  await expect(page.getByAltText("Downtown Frederick after dark")).toHaveCount(0);

  await page.getByRole("tab", { name: "Trucks" }).click();
  await expect(page.getByRole("heading", { level: 2, name: "Browse the local roster" })).toBeVisible();
  await expect(
    page.locator('#vendors .food-truck-vendor-card [data-photo-state="official-mark"]').first(),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: "Scheduled this week" })).toBeVisible();
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

test("public visitors can open feedback and the food-truck add form", async ({ page }) => {
  await page.goto("/food-trucks");

  await expect(page.getByRole("button", { name: "Send feedback" })).toBeVisible();
  await page.getByRole("button", { name: "Report a missing truck or wrong stop" }).click();
  const feedbackDialog = page.getByRole("dialog", { name: "Send feedback" });
  await expect(feedbackDialog).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(feedbackDialog).toHaveCount(0);

  const addTruck = page.getByRole("link", { name: /Add my truck/ });
  await expect(addTruck).toHaveAttribute("href", "/submit/place?category=food-truck");
  await addTruck.click();
  await expect(page).toHaveURL(/\/submit\/place\?category=food-truck/);
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
});

test("a vendor claim opens with the selected truck already filled in", async ({ page }) => {
  await page.goto("/food-trucks");
  await page.getByRole("tab", { name: "Trucks" }).click();
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
  await page
    .getByRole("button", { name: "More for today", exact: true })
    .click();
  const card = page.getByRole("link", { name: /Food trucks|food truck.*live/i });
  await expect(card).toBeVisible();
  await expect(card).toHaveAttribute(
    "href",
    /^\/food-trucks(?:#(?:near-me|this-week))?$/,
  );
});
