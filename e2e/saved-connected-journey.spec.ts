import { expect, test } from "@playwright/test";

test.describe("Saved connected return journey", () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      if (!localStorage.getItem("fr:saved:v1")) {
        localStorage.setItem("fr:saved:v1", JSON.stringify([
          { type: "place", id: "cafe-nola", saved_at: "2026-09-06T12:00:00Z" },
          { type: "place", id: "beans-in-the-belfry-brunswick", saved_at: "2026-09-06T11:00:00Z" },
        ]));
        localStorage.setItem("fr:lists:v1", JSON.stringify({ "cafe-nola": ["coffee plans"] }));
      }
      localStorage.setItem("fr_map_location_intro_v1", "dismissed");
    });
  });

  test("reopens the same collection and card after a place page and reload", async ({ page }) => {
    await page.goto("/my-radius", { waitUntil: "domcontentloaded" });
    await expect(page.getByRole("heading", { name: "Saved places", exact: true })).toBeVisible({ timeout: 30_000 });
    const organizer = page.locator("#saved-organizer");
    await organizer.locator("summary").click();
    await organizer.getByRole("button", { name: /coffee plans/ }).click();
    const card = page.locator("#sw-slot-cafe-nola");
    await card.getByRole("button", { name: /Show details for/ }).click();
    const open = card.getByRole("link", { name: "Open page" });
    await open.scrollIntoViewIfNeeded();
    const scrollBefore = await page.evaluate(() => window.scrollY);
    await open.click();
    await expect(page).toHaveURL(/\/places\/cafe-nola\?returnTo=%2Fmy-radius/);
    await page.getByRole("link", { name: "Back to saved", exact: true }).click();
    await expect(organizer).toHaveAttribute("open", "", { timeout: 30_000 });
    await expect(organizer.getByRole("button", { name: /coffee plans/ })).toHaveAttribute("aria-pressed", "true");
    await expect(card.getByRole("button", { name: /Hide details for/ })).toHaveAttribute("aria-expanded", "true");
    await expect.poll(async () => Math.abs((await page.evaluate(() => window.scrollY)) - scrollBefore)).toBeLessThan(80);
    await page.reload({ waitUntil: "domcontentloaded" });
    await expect(card.getByRole("button", { name: /Hide details for/ })).toHaveAttribute("aria-expanded", "true", { timeout: 30_000 });
    await expect(organizer).toHaveAttribute("open", "");
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  });

  test("keeps saved membership during an unavailable catalog and retries in place", async ({ page }) => {
    let requests = 0;
    await page.route("**/api/places/by-slugs?*", async (route) => {
      requests += 1;
      if (requests === 1) return route.fulfill({ status: 503, contentType: "application/json", body: "{}" });
      return route.continue();
    });
    await page.goto("/my-radius", { waitUntil: "domcontentloaded" });
    await expect(page.getByText("We could not refresh 2 saved places.", { exact: false })).toBeVisible({ timeout: 30_000 });
    expect(await page.evaluate(() => JSON.parse(localStorage.getItem("fr:saved:v1") ?? "[]").length)).toBe(2);
    await page.getByRole("button", { name: "Try again", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Saved places", exact: true })).toBeVisible({ timeout: 30_000 });
    await expect(page.locator("#sw-slot-cafe-nola")).toBeVisible();
    await expect(page.getByText("We could not refresh 2 saved places.", { exact: false })).toHaveCount(0);
    expect(requests).toBeGreaterThanOrEqual(2);
  });
});
