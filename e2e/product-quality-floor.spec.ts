import { expect, test } from "@playwright/test";

test.use({ actionTimeout: 15_000 });

const coreRoutes = ["/today", "/map", "/events", "/my-radius", "/ask", "/search?q=coffee"];
const destinations = [
  ["Today", "/today"],
  ["Map", "/map"],
  ["Events", "/events"],
  ["Saved", "/my-radius"],
] as const;

test.beforeEach(async ({ page }) => {
  // A declined location must still leave a usable county-wide product. Do
  // not request coordinates or make these checks depend on a saved town.
  await page.addInitScript(() => {
    localStorage.setItem("fr:scope:v1", "county");
    document.cookie = "fr_scope=county; path=/";
  });
});

for (const width of [320, 1366]) {
  for (const route of coreRoutes) {
    test(`${route} preserves the core navigation and fits at ${width}px`, async ({ page }) => {
      test.setTimeout(120_000);
      await page.setViewportSize({ width, height: width === 320 ? 812 : 900 });
      const response = await page.goto(route, { waitUntil: "domcontentloaded" });
      expect(response?.status()).toBe(200);
      await expect(page.locator("main h1")).toHaveCount(1);
      const navigation = page.getByRole("navigation", { name: "Primary", exact: true });
      for (const [name, href] of destinations) {
        const destination = navigation.getByRole("link", { name, exact: true });
        await expect(destination).toBeVisible();
        await expect(destination).toHaveAttribute("href", href);
        const bounds = await destination.boundingBox();
        expect(bounds, `${name} needs a measurable target`).not.toBeNull();
        expect(bounds!.width).toBeGreaterThanOrEqual(44);
        expect(bounds!.height).toBeGreaterThanOrEqual(44);
      }
      await page.evaluate(() => document.fonts.ready);
      await expect.poll(() => page.evaluate(() => (
        document.documentElement.scrollWidth - window.innerWidth
      )), { message: `${route} must not require horizontal page scrolling` }).toBeLessThanOrEqual(1);
    });
  }
}

for (const width of [320, 375, 390, 430, 1366]) {
  test(`Today leads with conditions and keeps Find below events at ${width}px`, async ({ page }) => {
    test.setTimeout(120_000);
    await page.setViewportSize({ width, height: width === 1366 ? 900 : 844 });
    await page.goto("/today", { waitUntil: "domcontentloaded" });
    await expect(page.getByRole("combobox", { name: "Choose your area" })).toBeEnabled();
    await page.evaluate(() => document.fonts.ready);
    const conditions = page.locator("[data-today-conditions]");
    const find = page.getByRole("link", { name: "Find a place, service, event, or answer", exact: true });
    await expect(conditions).toBeVisible();
    await expect(find).toBeVisible();
    const weather = page.locator('[data-today-weather] a[href*="/pulse"][href*="open=weather"]');
    await expect(weather).toHaveCount(1);
    await expect(page.locator("[data-today-weather] [data-weather-state]"))
      .toHaveAttribute("data-weather-state", /^(available|safety-only|unavailable)$/);
    const firstEvent = page.locator("[data-today-event-pick]").first();
    if (await firstEvent.count()) {
      const eventBox = (await firstEvent.boundingBox())!;
      const findBox = (await find.boundingBox())!;
      expect(findBox.y).toBeGreaterThan(eventBox.y);
    }
    await page.getByRole("combobox", { name: "Choose your area" }).selectOption("town:brunswick");
    await expect(page.getByTestId("today-scope-status")).toContainText("Brunswick place picks");
    await expect(page.getByRole("link", { name: "Plan a few hours", exact: true })).toHaveAttribute("href", /in=brunswick/);
  });
}

test("an empty Agenda can remove its search filter without leaving the chosen view", async ({ page }) => {
  test.setTimeout(120_000);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/events", { waitUntil: "domcontentloaded" });
  await page.getByRole("button", { name: /^Filters / }).click();
  await page.getByRole("textbox", { name: "Filter the events shown", exact: true }).fill("radiusnomatchqualitycheck");
  await page.getByRole("button", { name: "Done", exact: true }).click();
  await page.locator('summary[aria-label^="Change event display."]').click();
  await page.getByRole("button", { name: "Agenda view", exact: true }).click();
  const remove = page.getByRole("button", { name: "Remove Search: radiusnomatchqualitycheck filter", exact: true });
  await expect(remove).toBeVisible();
  await remove.click();
  await expect(remove).toHaveCount(0);
  await expect(page.locator('summary[aria-label^="Change event display. Agenda view"]')).toBeVisible();
  await expect(page.getByRole("button", { name: /^Filters / })).not.toContainText("radiusnomatchqualitycheck");
});
