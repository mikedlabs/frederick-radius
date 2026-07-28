import { expect, test, type Locator } from "@playwright/test";

test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });

async function expectTopBefore(
  locator: Locator,
  top: number,
) {
  await expect(locator).toBeVisible();
  const box = await locator.boundingBox();
  expect(box, "expected the first useful action to have a layout box").not.toBeNull();
  expect(box!.y).toBeLessThan(top);
}

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

test("Place field notes lead with visit decisions and disclose the rest", async ({ page }) => {
  await page.goto("/places/cafe-nola", { waitUntil: "domcontentloaded" });

  const notes = page.getByRole("region", { name: "Field notes" });
  const primaryRows = notes.locator(":scope > ul").first().locator(":scope > li");
  await expect(primaryRows).toHaveCount(2);
  await expect(primaryRows.nth(0)).toContainText("Happy hour");
  await expect(primaryRows.nth(1)).toContainText("Park");
  await expect(notes.getByText(/Open mic night every Monday/)).toBeHidden();
  await expect(notes.getByText(/at the source/)).toBeVisible();

  await notes.locator("summary").click();
  await expect(notes.getByText(/Open mic night every Monday/)).toBeVisible();
  await expect(notes.getByText(/at the source/)).toBeVisible();
});

test.describe("compact page entrances", () => {
  test.use({ viewport: { width: 320, height: 568 }, isMobile: true, hasTouch: true });

  test("Dear Frederick puts the submission path before the lower quarter", async ({ page }) => {
    await page.goto("/dear-frederick", { waitUntil: "domcontentloaded" });
    await expectTopBefore(page.getByRole("link", { name: "Submit a letter" }), 425);
  });

  test("About keeps the primary way into Radius near its promise", async ({ page }) => {
    await page.goto("/about", { waitUntil: "domcontentloaded" });
    await expectTopBefore(page.getByRole("link", { name: "See what's useful right now" }), 425);
  });

  test("Food trucks exposes its three journeys before the fixed navigation", async ({ page }) => {
    await page.goto("/food-trucks", { waitUntil: "domcontentloaded" });
    await expectTopBefore(page.getByRole("tab", { name: "Near me" }), 390);
  });

  test("Rivers keeps the official forecast path with the live summary", async ({ page }) => {
    await page.goto("/rivers", { waitUntil: "domcontentloaded" });
    await expectTopBefore(page.getByRole("link", { name: "NWS’s" }), 380);
  });

  test("Markers reaches its first contextual path before the search controls", async ({ page }) => {
    await page.goto("/markers", { waitUntil: "domcontentloaded" });
    await expectTopBefore(page.getByRole("link", { name: "Frederick history" }), 330);
  });

  test("Weekend keeps its selected time and county filters readable", async ({ page }) => {
    await page.goto("/weekend", { waitUntil: "domcontentloaded" });

    const whenRibbon = page.getByRole("group", { name: "When" });
    const selectedTime = whenRibbon.getByRole("button", { pressed: true });
    await expect(selectedTime).toHaveText("This weekend");
    expect(
      await selectedTime.evaluate((node) => {
        const rail = node.parentElement;
        if (!rail) return false;
        const item = node.getBoundingClientRect();
        const viewport = rail.getBoundingClientRect();
        return item.left >= viewport.left - 1 && item.right <= viewport.right + 1;
      }),
    ).toBe(true);

    const values = page.locator(".eb-capbar .eb-seg-v");
    await expect(values.nth(1)).toHaveText("This weekend");
    await expect(values.nth(2)).toHaveText("Whole county");
    for (const value of [values.nth(1), values.nth(2)]) {
      expect(
        await value.evaluate((node) =>
          node.scrollWidth <= node.clientWidth + 1 &&
          node.scrollHeight <= node.clientHeight + 1
        ),
      ).toBe(true);
    }
  });
});
