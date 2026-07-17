import { expect, test } from "@playwright/test";

test.describe("Ask Radius", () => {
  test("explains a grounded place result instead of returning a bare directory", async ({ page }) => {
    await page.goto("/today");
    const input = page.getByLabel("Ask Frederick Radius");
    await input.fill("Where can I get a breakfast sandwich?");
    await page.getByRole("button", { name: "Ask Radius" }).click();

    await expect(page.getByText("Beans & Bagels", { exact: true })).toBeVisible();
    await expect(page.getByText(/Best verified fit for a breakfast sandwich/)).toBeVisible();
    await expect(page.getByRole("button", { name: "Make it a plan" })).toBeVisible();
  });

  test("builds an editable itinerary inline", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/today");
    await page.getByLabel("Ask Frederick Radius").fill("Plan a walkable 3 hour date night");
    await page.getByRole("button", { name: "Ask Radius" }).click();

    await expect(page.getByText("Your route")).toBeVisible();
    await expect(page.getByRole("link", { name: /Open and edit route/ })).toBeVisible();
    await expect(page.getByText(/keeping the stops walkable/i)).toBeVisible();
    const stopCount = await page.getByTestId("ask-plan-stops").locator(":scope > li").count();
    expect(stopCount).toBeGreaterThanOrEqual(2);
  });

  test("renders public utilities as map-ready answers", async ({ page }) => {
    await page.goto("/today");
    await page.getByLabel("Ask Frederick Radius").fill("Where can I find a public trash can or drinking water downtown?");
    await page.getByRole("button", { name: "Ask Radius" }).click();

    await expect(page.getByText(/mapped trash cans/)).toBeVisible();
    await expect(page.getByText(/mapped drinking-water points/)).toBeVisible();
    await expect(page.getByRole("link", { name: "Open trash cans map" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Open drinking-water points map" })).toBeVisible();
  });

  test("pairs a destination with the closest garage", async ({ page }) => {
    await page.goto("/today");
    await page.getByLabel("Ask Frederick Radius").fill("Where should I park for the Weinberg Center?");
    await page.getByRole("button", { name: "Ask Radius" }).click();

    await expect(page.getByText("Court Street Garage", { exact: true }).first()).toBeVisible();
    await expect(page.getByText(/walking distance, not live space availability/)).toBeVisible();
    await expect(page.getByRole("link", { name: "Open the parking guide" })).toBeVisible();
  });
});
