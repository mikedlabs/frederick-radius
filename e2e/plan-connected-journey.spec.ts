import { expect, test } from "@playwright/test";

test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });

test("a found place becomes a scoped outing and returns to the same search after editing", async ({ page }) => {
  test.setTimeout(90_000);
  await page.addInitScript(() => {
    localStorage.setItem("fr:saved:v1", JSON.stringify([
      { type: "place", id: "brunswick-heritage-museum", saved_at: "2026-09-20T12:00:00Z" },
      { type: "place", id: "cafe-nola", saved_at: "2026-09-20T12:00:00Z" },
    ]));
    localStorage.setItem("fr_map_location_intro_v1", "dismissed");
    Object.defineProperty(navigator, "share", { configurable: true, value: async (data: ShareData) => {
      sessionStorage.setItem("test:shared-plan", JSON.stringify(data));
    } });
  });
  const origin = "/search?q=coffee&in=brunswick&kind=place";
  await page.goto(origin, { waitUntil: "domcontentloaded" });
  const result = page.locator('a[href^="/places/beans-in-the-belfry-brunswick"]').first();
  await expect(result).toBeVisible({ timeout: 30_000 });
  await result.click();
  const planLink = page.getByRole("link", { name: "Plan an outing from Beans in the Belfry" });
  await expect(planLink).toBeVisible({ timeout: 20_000 });
  const href = new URL((await planLink.getAttribute("href"))!, "https://example.test");
  const returnTo = href.searchParams.get("returnTo");
  expect(returnTo).toContain("in=brunswick");
  expect(href.searchParams.get("in")).toBe("brunswick");
  await planLink.click();
  await expect(page.getByRole("list", { name: "Plan stops, in order" }).getByRole("heading", { name: "Beans in the Belfry", exact: true })).toBeVisible({ timeout: 20_000 });
  await expect(page.getByRole("link", { name: "Back to search results" })).toHaveAttribute("href", returnTo!);
  await page.getByRole("button", { name: "Adjust", exact: true }).click();
  await page.getByRole("combobox", { name: "Planning area", exact: true }).selectOption("frederick");
  await page.getByRole("button", { name: "Close Adjust the plan", exact: true }).click();
  // A dismissed draft must not offer places that the current plan will reject.
  await page.getByRole("button", { name: "Add a saved place", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Add a saved place" });
  await expect(dialog.getByRole("button", { name: /Brunswick Heritage Museum/ })).toBeVisible();
  await expect(dialog.getByRole("button", { name: /Caf[eé] Nola/i })).toHaveCount(0);
  await dialog.getByRole("button", { name: /Brunswick Heritage Museum/ }).click();
  await expect(page.getByRole("list", { name: "Plan stops, in order" }).getByRole("heading", { name: "Brunswick Heritage Museum", exact: true })).toBeVisible();
  await expect.poll(() => new URL(page.url()).searchParams.get("p")).toBeTruthy();
  expect(new URL(page.url()).searchParams.get("returnTo")).toBe(returnTo);
  await page.getByRole("button", { name: "Share this plan" }).click();
  const shared = await page.evaluate(() => JSON.parse(sessionStorage.getItem("test:shared-plan")!));
  const sharedUrl = new URL(shared.url);
  expect([...sharedUrl.searchParams.keys()]).toEqual(["p"]);
  expect(shared.url).not.toContain("returnTo");
  const editedPlan = `${new URL(page.url()).pathname}${new URL(page.url()).search}`;
  await page.getByRole("list", { name: "Plan stops, in order" }).getByRole("link", { name: "Details", exact: true }).first().click();
  await expect(page.getByRole("link", { name: "Back to your plan", exact: true })).toHaveAttribute("href", editedPlan);
  await page.getByRole("link", { name: "Back to your plan", exact: true }).click();
  await expect(page.getByRole("list", { name: "Plan stops, in order" }).getByRole("heading", { name: "Brunswick Heritage Museum", exact: true })).toBeVisible({ timeout: 20_000 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.screenshot({ path: "output/playwright/connected-outing-mobile.png", fullPage: true });
  await page.setViewportSize({ width: 320, height: 700 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  const routeTarget = await page.getByRole("link", { name: "Open full route" }).boundingBox();
  expect(routeTarget?.height).toBeGreaterThanOrEqual(44);
  await page.screenshot({ path: "output/playwright/connected-outing-320.png", fullPage: true });
  await page.getByRole("link", { name: "Back to search results" }).click();
  await expect.poll(() => new URL(page.url()).searchParams.get("q")).toBe("coffee");
  expect(new URL(page.url()).searchParams.get("in")).toBe("brunswick");
});
