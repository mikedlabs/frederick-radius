import { expect, test } from "@playwright/test";

test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });

test("All tools starts with decisions and reveals the directory only on request", async ({
  page,
}) => {
  await page.goto("/compass", { waitUntil: "domcontentloaded" });

  await expect(
    page.getByRole("heading", { level: 1, name: "All tools" }),
  ).toBeAttached();
  await expect(page.getByRole("link", { name: /Ask Radius/ })).toBeVisible();
  await expect(page.getByRole("link", { name: "Near me" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Live conditions" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Nearby essentials" })).toBeVisible();
  const outcomes = page.getByRole("group", { name: "Choose what you need" });
  await expect(outcomes.getByRole("button")).toHaveCount(5);
  const localHelp = outcomes.getByRole("button", { name: /Find local help/ });
  await expect(localHelp).toHaveAttribute("aria-expanded", "false");
  await expect(page.getByRole("heading", { name: "Public essentials" })).toHaveCount(0);
  await localHelp.click();
  await expect(localHelp).toHaveAttribute("aria-expanded", "true");
  await expect(page.getByRole("heading", { name: "Public essentials" })).toBeVisible();
  await expect(page.getByRole("link", { name: /Find nearest/ })).toBeVisible();
  const layers = page.locator("summary").filter({
    hasText: "Choose a specific map layer",
  });
  await expect(layers).toBeVisible();
  await expect(page.locator("#compass-amenity-list")).toBeHidden();

  await layers.click();
  await expect(page.locator("#compass-amenity-list")).toBeVisible();
});

test("the global command sends an urgent need straight to its resolver", async ({
  page,
}) => {
  await page.goto("/today", { waitUntil: "domcontentloaded" });

  await page
    .getByRole("button", { name: "Ask or find across Frederick County" })
    .click();
  const command = page.getByRole("searchbox", {
    name: "Ask or find across Frederick County",
  });
  await command.fill("trash can");
  await command.press("Enter");

  await expect(page).toHaveURL(/\/amenities\?need=trash$/);
  await expect(
    page.getByRole("heading", { level: 1, name: "What do you need?" }),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: "Trash", exact: true })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
});
