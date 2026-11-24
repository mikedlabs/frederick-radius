import { expect, test } from "@playwright/test";

const detail = "/places/beans-in-the-belfry-brunswick";

for (const device of [
  { name: "mobile", viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true },
  { name: "desktop", viewport: { width: 1440, height: 900 }, isMobile: false, hasTouch: false },
]) {
  test.describe(device.name, () => {
    test.use({ viewport: device.viewport, isMobile: device.isMobile, hasTouch: device.hasTouch });

    test("Back from a place restores Find, its query and the selected result", async ({ page }) => {
      test.setTimeout(120_000);
      const query = "Beans in the Belfry";
      let lookups = 0;
      await page.route("**/api/search?**", async route => {
        if (new URL(route.request().url()).searchParams.get("q") !== query) return route.continue();
        lookups++;
        await route.fulfill({ json: { results: [{
          type: "place", id: "place:beans-in-the-belfry-brunswick", title: query,
          subtitle: `Search response ${lookups}`, href: detail,
        }] } });
      });
      await page.goto(device.isMobile ? "/today" : "/events", { waitUntil: "domcontentloaded" });
      const launcher = device.isMobile
        ? page.getByRole("link", { name: "Find a place, service, event, or answer", exact: true }).filter({ visible: true }).first()
        : page.locator("header").getByRole("button", { name: "Ask or find across Frederick County", exact: true }).filter({ visible: true });
      await expect(launcher).toHaveAttribute("data-find-interaction-ready", "true", { timeout: 45_000 });
      await launcher.click();
      const find = page.getByRole("dialog", { name: "What do you need?", exact: true });
      const field = find.getByRole("searchbox");
      await field.fill(query);
      const link = find.locator(`#search-results a[href="${detail}"]`).first();
      await expect(link).toBeVisible();
      const layer = await page.evaluate(() => window.history.state.__frederickRadiusLayer);
      await link.click();
      await expect(page).toHaveURL(new RegExp(detail + "$"), { timeout: 45_000 });
      await page.goBack({ waitUntil: "domcontentloaded" });
      await expect(find).toBeVisible({ timeout: 45_000 });
      await expect(field).toHaveValue(query);
      await expect(link).toBeFocused();
      await expect(find).toContainText("Search response 2");
      expect(await page.evaluate(() => window.history.state.__frederickRadiusLayer)).toBe(layer);
      expect(await page.evaluate(() => location.search)).toBe("");
      await find.getByRole("button", { name: "Close Find", exact: true }).click();
      await expect(find).toBeHidden();
      await expect.poll(() => page.evaluate(() => window.history.state?.__frederickRadiusLayer)).toBeFalsy();
      await expect(launcher).toBeFocused();
      expect(lookups).toBe(2);
    });
  });
}
