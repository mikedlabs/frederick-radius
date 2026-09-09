import { test, expect } from "@playwright/test";
import fs from "node:fs/promises";

const evidence = "output/playwright/after";

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem("fr:scope:v1", "county");
    document.cookie = "fr_scope=county; path=/";
  });
});

for (const width of [390, 1440]) {
  test(`county search keeps area, query, result type and details at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: width === 390 ? 844 : 1000 });
    await page.goto("/search?q=coffee%20in%20Brunswick");
    const results = page.getByRole("region", { name: "2 results for coffee in Brunswick", exact: true });
    await expect(results).toBeVisible();
    await expect(results.getByRole("link", { name: /Beans in the Belfry/ })).toBeVisible();
    await expect(results.getByRole("link", { name: /Whistle Punk/ })).toHaveCount(0);
    await expect(results.getByText(/Frederick/)).toHaveCount(0);
    await expect(page.getByRole("combobox", { name: "Search area" })).toHaveValue("brunswick");
    await fs.mkdir(evidence, { recursive: true });
    await page.evaluate(() => document.fonts.ready);
    await expect.poll(() => page.locator("main img").evaluateAll((images) => images.every((image) => (image as HTMLImageElement).complete))).toBe(true);
    await page.screenshot({ path: `${evidence}/search-${width === 390 ? "mobile" : "desktop"}.png` });
    await page.getByRole("link", { name: "Places", exact: true }).click();
    await expect(page).toHaveURL(/kind=place/);
    await page.getByRole("link", { name: /Beans in the Belfry Coffee/ }).click();
    await expect(page.getByRole("heading", { name: "Beans in the Belfry", exact: true })).toBeVisible();
    await page.getByRole("link", { name: "Back to search results", exact: true }).click();
    await expect(page).toHaveURL(/q=coffee.*Brunswick.*kind=place/);
    await expect(page.getByRole("searchbox")).toHaveValue("coffee in Brunswick");
    await page.getByRole("combobox", { name: "Search area" }).selectOption("thurmont");
    await expect(page).toHaveURL(/q=coffee&in=thurmont&kind=place|q=coffee&kind=place&in=thurmont/);
    await expect(page.getByRole("searchbox")).toHaveValue("coffee");
    await expect(page.getByRole("link", { name: /Sara Kep.s Kitchen Coffee/ })).toBeVisible();
    await page.reload();
    await expect(page.getByRole("combobox", { name: "Search area" })).toHaveValue("thurmont");
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  });

  test(`Today makes manual scope and useful tasks available at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: width === 390 ? 844 : 1000 });
    await page.goto("/today");
    const find = page.getByRole("link", { name: "Find a place, service, event, or answer", exact: true });
    await expect(find).toBeVisible();
    await expect(page.getByRole("combobox", { name: "Choose your area" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Local services", exact: true })).toBeVisible();
    const box = await find.boundingBox();
    expect(box!.y + box!.height).toBeLessThan(width === 390 ? 500 : 550);
    await fs.mkdir(evidence, { recursive: true });
    await page.evaluate(() => document.fonts.ready);
    await expect.poll(() => page.locator("main img").evaluateAll((images) => images.every((image) => (image as HTMLImageElement).complete))).toBe(true);
    await page.screenshot({ path: `${evidence}/today-${width === 390 ? "mobile" : "desktop"}.png` });
    await page.getByRole("combobox", { name: "Choose your area" }).selectOption("town:brunswick");
    await expect(page.getByTestId("today-scope-status")).toContainText("Brunswick place picks");
    await expect(page.getByRole("link", { name: "Plan a few hours", exact: true })).toHaveAttribute("href", /in=brunswick/);
    await expect(page.getByRole("button", { name: "Ask or find across Frederick County" })).toHaveCount(0);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  });
}

test("a denied location still offers every town without another permission request", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "geolocation", { value: {
      getCurrentPosition: (_: unknown, fail: PositionErrorCallback) => fail({ code: 1, message: "Denied", PERMISSION_DENIED: 1 } as GeolocationPositionError),
    }, configurable: true });
  });
  await page.goto("/today");
  await page.getByRole("button", { name: "Use my location", exact: true }).click();
  await expect(page.getByTestId("today-location-blocked")).toContainText("Choose a town");
  await page.getByRole("combobox", { name: "Choose your area" }).selectOption("town:brunswick");
  await expect(page.getByTestId("today-scope-status")).toContainText("Brunswick");
});

test("official resource search leads with the supported public action", async ({ page }) => {
  await page.goto("/search?q=report%20a%20pothole");
  const official = page.getByRole("region", { name: "Official county and city answers" });
  await expect(official).toBeVisible();
  await expect(official.getByRole("link").first()).toHaveAttribute("href", /^https:\/\//);
  await expect(page.getByRole("link", { name: /Need a recommendation or a plan/ })).toHaveCount(0);
});


test("a shared two-hour plan keeps Brunswick through loading, recovery and reload", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const sentScopes: string[] = [];
  page.on("request", (request) => {
    if (request.url().includes("/api/ask") && request.method() === "POST") {
      const body = request.postDataJSON();
      sentScopes.push(body.scope);
    }
  });
  await page.goto("/ask?q=Plan%20the%20next%20two%20hours&in=brunswick");
  const limitation = page.getByText(/I can't confirm a 2-hour plan in Brunswick/).or(page.getByText("Current air quality could not be verified.").first());
  await expect(limitation).toBeVisible({ timeout: 25000 });
  await expect(page.getByRole("button", { name: "Search area: Brunswick. Change area." })).toBeVisible();
  await expect(page.getByRole("region", { name: "A solo afternoon", exact: true })).toHaveCount(0);
  expect(sentScopes).toContain("town:brunswick");
  await fs.mkdir(evidence, { recursive: true });
  await page.screenshot({ path: `${evidence}/ask-mobile.png` });
  await page.reload();
  await expect(limitation).toBeVisible({ timeout: 25000 });
  expect(sentScopes.every((scope) => scope === "town:brunswick")).toBe(true);
});
