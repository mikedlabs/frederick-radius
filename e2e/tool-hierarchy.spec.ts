import { expect, test, type Locator } from "@playwright/test";

test.use({ isMobile: true, hasTouch: true });
const COMPASS_PINS_KEY = "fr.compass.pins.v1";
const DEFAULT_PINNED_TOOLS = ["Ask Radius", "Near me", "County status", "Nearby essentials"];
const activate = (locator: Locator) => locator.tap();

for (const width of [320, 375, 390, 430]) {
  test(`Tools exposes one readable intent action set at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 844 });
    await page.goto("/compass?in=thurmont", { waitUntil: "domcontentloaded" });
    const compass = page.locator("[data-compass-ready]");
    await expect(compass).toHaveAttribute("data-compass-ready", "true");
    const find = compass.getByRole("link", { name: "Find a place, service, event, or answer" });
    await expect(find).toBeVisible(); await expect(find).toHaveAttribute("href", "/search");
    await expect(compass.getByRole("searchbox")).toHaveCount(0);
    const chapters = compass.locator("[data-compass-intent]");
    await expect(chapters).toHaveCount(4);
    const food = compass.locator('[data-compass-intent="go-out"]');
    const foodButton = food.getByRole("button", { name: /^Eat, drink & go out/ });
    await expect(foodButton).toHaveAttribute("aria-expanded", "false");
    await expect(compass.locator("[data-compass-intent] a:visible")).toHaveCount(0);
    await activate(foodButton); await expect(foodButton).toHaveAttribute("aria-expanded", "true");
    await expect(food.getByRole("link")).toHaveCount(3);
    const table = food.getByRole("link", { name: "Book a table", exact: true });
    await expect(table).toHaveAttribute("href", "/reserve");
    for (const control of [foodButton, ...await food.locator("a:visible, button:visible").all()]) {
      const geometry = await control.evaluate((node) => {
        const box = node.getBoundingClientRect();
        return { width: box.width, height: box.height, hit: node.contains(document.elementFromPoint(box.x + box.width / 2, box.y + box.height / 2)) };
      });
      expect(geometry.width).toBeGreaterThanOrEqual(44); expect(geometry.height).toBeGreaterThanOrEqual(44);
      expect(geometry.hit).toBe(true);
    }
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await expect(page).toHaveURL(/in=thurmont.*chapter=go-out/);
    const around = compass.locator('[data-compass-intent="get-around"]');
    const aroundButton = around.getByRole("button", { name: /^Get around/ });
    await activate(aroundButton);
    await expect(foodButton).toHaveAttribute("aria-expanded", "false");
    await expect(aroundButton).toHaveAttribute("aria-expanded", "true");
    await expect(food.getByRole("link", { name: "Book a table" })).toBeHidden();
    const parking = around.getByRole("link", { name: "Find parking", exact: true });
    await activate(parking); await expect(page).toHaveURL(/\/parking(?:[?#]|$)/);
    await page.goBack();
    await expect(page).toHaveURL(/\/compass\?in=thurmont.*chapter=get-around/);
    await expect(page.locator('[data-compass-intent="get-around"] button[aria-controls]')).toHaveAttribute("aria-expanded", "true");
    expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(1);
  });
}

test("Tools keeps the full index secondary, filters tools and returns to the selected chapter", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/compass", { waitUntil: "domcontentloaded" });
  await expect(page.locator("[data-compass-ready]")).toHaveAttribute("data-compass-ready", "true");
  const food = page.locator('[data-compass-intent="go-out"]');
  await activate(food.getByRole("button", { name: /^Eat, drink & go out/ }));
  const more = food.getByRole("button", { name: "More food, drinks & events", exact: true });
  await activate(more);
  let dialog = page.getByRole("dialog", { name: "Eat, drink & go out", exact: true });
  await expect(dialog).toBeVisible(); await expect(page.getByRole("dialog")).toHaveCount(1);
  const dialogBox = await dialog.boundingBox();
  expect(dialogBox).not.toBeNull();
  expect(Math.abs((dialogBox?.y ?? 0) + (dialogBox?.height ?? 0) - 844))
    .toBeLessThanOrEqual(2);
  expect(dialogBox?.width ?? 0).toBeGreaterThanOrEqual(388);
  await expect(page).toHaveURL(/chapter=go-out.*deck=go-out/);
  await expect(dialog.getByRole("button", { name: /^Pin / })).toHaveCount(0);
  await activate(dialog.getByRole("button", { name: "All tools", exact: true }));
  dialog = page.getByRole("dialog", { name: "All tools", exact: true });
  const filter = dialog.getByRole("searchbox", { name: "Search tools in this section" });
  await expect(filter).toBeVisible(); await filter.fill("GasBuddy");
  const outside = dialog.getByRole("link", { name: /Gas prices/ });
  await expect(outside).toHaveAttribute("target", "_blank"); await expect(outside).toHaveAttribute("rel", "noopener noreferrer");
  await expect(outside).toContainText("GasBuddy");
  await filter.fill("coffee");
  await expect(dialog.getByRole("link", { name: /^Search everything/ })).toHaveAttribute("href", "/search?q=coffee");
  await filter.fill("weather");
  await expect(dialog.getByRole("link", { name: /^County status/ })).toHaveAttribute("href", "/pulse");
  await filter.fill("");
  expect(await dialog.evaluate((node) => node.scrollWidth - node.clientWidth)).toBeLessThanOrEqual(1);
  await page.goBack(); await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page).toHaveURL(/chapter=go-out$/); await expect(more).toBeFocused();
});

for (const deck of ["food", "go-out", "all"]) {
  test(`Tools preserves the legacy ${deck} deep link and a single overlay`, async ({ page }) => {
    await page.goto(`/compass?deck=${deck}`, { waitUntil: "domcontentloaded" });
    await expect(page.getByRole("dialog")).toHaveCount(1);
    await page.keyboard.press("/"); await expect(page.getByRole("dialog")).toHaveCount(1);
    await page.keyboard.press("Escape"); await expect(page.getByRole("dialog")).toHaveCount(0);
    await expect(page).toHaveURL(/\/compass$/);
  });
}

test("Tools persists pinned tools through the deliberate editor", async ({ page }) => {
  const resetPins = await page.addInitScript((key) => window.localStorage.removeItem(key), COMPASS_PINS_KEY);
  await page.goto("/compass", { waitUntil: "domcontentloaded" });
  await expect(page.locator("[data-compass-ready]")).toHaveAttribute("data-compass-ready", "true");
  await resetPins.dispose();
  const pinned = page.locator('section[aria-labelledby="compass-pinned-heading"]');
  await expect(pinned.locator("li")).toHaveCount(4);
  for (const label of DEFAULT_PINNED_TOOLS) await expect(pinned.getByRole("link", { name: new RegExp(`^${label}\\b`) })).toBeVisible();
  await expect(page.getByRole("button", { name: /^Unpin / })).toHaveCount(0);
  const edit = pinned.getByRole("button", { name: "Edit", exact: true });
  await activate(edit);
  const dialog = page.getByRole("dialog", { name: "Edit shortcuts", exact: true });
  await dialog.getByRole("searchbox", { name: "Search tools in this section" }).fill("brunch");
  await activate(dialog.getByRole("button", { name: "Pin Brunch guide", exact: true }));
  await expect(dialog.getByRole("button", { name: "Unpin Brunch guide", exact: true })).toHaveAttribute("aria-pressed", "true");
  await expect.poll(() => page.evaluate((key) => window.localStorage.getItem(key), COMPASS_PINS_KEY)).toBe(JSON.stringify(["ask-radius", "nearby", "county-pulse", "public-essentials", "brunch"]));
  await activate(dialog.getByRole("button", { name: "Close Edit shortcuts", exact: true }));
  await expect(page.getByRole("dialog")).toHaveCount(0); await expect(edit).toBeFocused();
  await page.reload({ waitUntil: "domcontentloaded" });
  await expect(page.locator("[data-compass-ready]")).toHaveAttribute("data-compass-ready", "true");
  await expect(pinned.locator("li")).toHaveCount(5); await expect(pinned.getByRole("link", { name: /^Brunch guide/ })).toBeVisible();
});

test("Tools sends a typed need through shared Find without making people choose Search or AI", async ({ page }) => {
  await page.goto("/compass", { waitUntil: "domcontentloaded" });
  await activate(page.getByRole("link", { name: "Find a place, service, event, or answer", exact: true }));
  const find = page.getByRole("dialog", { name: "What do you need?" });
  await expect(find).toBeVisible(); await expect(page.getByRole("dialog")).toHaveCount(1);
  const query = find.getByRole("searchbox", { name: "Ask or find across Frederick County" });
  await query.fill("trash can");
  await activate(find.getByRole("button", { name: "Close Find", exact: true }));
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await activate(page.getByRole("link", { name: "Find a place, service, event, or answer", exact: true }));
  await expect(query).toHaveValue("trash can"); await query.press("Enter");
  await expect(page).toHaveURL(/\/amenities\?need=trash$/);
  await expect(page.getByRole("button", { name: "Trash", exact: true })).toHaveAttribute("aria-pressed", "true");
});
