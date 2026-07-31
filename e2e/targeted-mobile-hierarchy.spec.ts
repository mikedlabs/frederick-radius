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

test("Events keeps one discovery doorway visible and nests filter and display choices", async ({ page }) => {
  await page.goto("/events");

  await expect(page.getByRole("group", { name: "When" })).toBeVisible();
  const filters = page.getByRole("button", { name: /^Filters:/ });
  await expect(filters).toBeVisible();
  await expect(page.getByRole("dialog", { name: "Event filters" })).toBeHidden();
  const dockBox = await page.locator(".eb-dock").boundingBox();
  expect(dockBox, "expected the compact event controls to have a layout box").not.toBeNull();
  expect(dockBox!.height).toBeLessThan(195);

  await filters.click();
  const dialog = page.getByRole("dialog", { name: "Event filters" });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole("tab", { name: "What" })).toBeVisible();
  await expect(dialog.getByRole("tab", { name: "When" })).toBeVisible();
  await expect(dialog.getByRole("tab", { name: "Where" })).toBeVisible();
  await dialog.getByRole("button", { name: "Done" }).click();

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

test("Events interest choices replace legacy exact-category filters", async ({ page }) => {
  await page.goto("/events?cats=music");

  await expect(page.getByRole("tab", { name: /Music/ })).toHaveAttribute(
    "aria-selected",
    "true",
  );
  await page.getByRole("tab", { name: /Arts & culture/ }).click();

  await expect(page).toHaveURL(/intent=arts/);
  await expect(page).not.toHaveURL(/cats=music/);
  await expect(page.getByRole("tab", { name: /Arts & culture/ })).toHaveAttribute(
    "aria-selected",
    "true",
  );
});

test("Events calendar overflow link navigates instead of opening a detail sheet", async ({ page }) => {
  await page.setViewportSize({ width: 1024, height: 800 });
  await page.goto("/events");

  // Immediate groups can contain fewer than the 40-row inline cap. Exercise
  // the long-tail group whose overflow owns the calendar route.
  const comingUp = page.locator("section").filter({
    has: page.getByRole("heading", { name: /Coming up/ }),
  }).first();
  await comingUp.getByRole("button", { name: "Show more" }).click();
  const calendarLink = comingUp.getByRole("link", {
    name: /more on the calendar/i,
  });
  await expect(calendarLink).toBeVisible({ timeout: 20_000 });
  await calendarLink.click();

  await expect(page).toHaveURL(/\/events\/calendar/);
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

test("Saved keeps organizer controls behind one disclosure", async ({ page }) => {
  await page.addInitScript(() => {
    window.localStorage.setItem(
      "fr:saved:v1",
      JSON.stringify([
        {
          type: "place",
          id: "cafe-nola",
          saved_at: "2026-07-28T12:00:00.000Z",
        },
      ]),
    );
  });
  await page.goto("/my-radius", { waitUntil: "domcontentloaded" });

  await expect(page.getByRole("heading", { name: "Saved places" })).toBeVisible();
  const organizer = page.locator("#saved-organizer");
  await expect(organizer.locator("summary")).toContainText("Organize and revisit");
  await expect(page.getByRole("tab", { name: "List" })).toBeHidden();
  await organizer.locator("summary").click();
  await expect(page.getByRole("tab", { name: "List" })).toBeVisible();
  await expect(page.getByRole("tab", { name: "Map" })).toBeVisible();
});

test.describe("compact page entrances", () => {
  test.use({ viewport: { width: 320, height: 568 }, isMobile: true, hasTouch: true });

  test("the narrow header keeps search, scope, and active alerts usable", async ({ page }) => {
    await page.route("**/api/pulse/status", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ active: true, count: 2, tone: "alert", ok: true }),
      });
    });
    await page.goto("/today", { waitUntil: "domcontentloaded" });

    const search = page.getByRole("button", { name: "Ask or find across Frederick County" });
    const scope = page.getByRole("button", { name: /Change town or location scope/ });
    const alerts = page.getByRole("link", { name: /Pulse: 2 active alerts/ });
    await expect(search).toBeVisible();
    await expect(scope).toBeVisible();
    await expect(alerts).toBeVisible();
    expect((await scope.boundingBox())?.width ?? 0).toBeLessThanOrEqual(50);
    expect((await alerts.boundingBox())?.width ?? 0).toBeGreaterThanOrEqual(40);
  });

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

    const filters = page.getByRole("button", { name: /Filters:.*This weekend/ });
    await expect(filters).toBeVisible();
    expect(
      await filters.evaluate((node) =>
        node.scrollWidth <= node.clientWidth + 1 &&
        node.scrollHeight <= node.clientHeight + 1
      ),
    ).toBe(true);
  });
});
