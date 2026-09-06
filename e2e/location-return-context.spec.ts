import { expect, test } from "@playwright/test";

test.use({ viewport: { width: 390, height: 844 } });

test("the shared area control shows the explicit town and changes it without keeping an old query town", async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem("fr:scope:v1", "county"));
  await page.goto("/map?q=coffee+in+Brunswick&in=brunswick&kind=place&returnTo=%2Fsearch%3Fq%3Dcoffee%26in%3Dbrunswick", { waitUntil: "domcontentloaded" });
  const area = page.locator("[data-location-chip]");
  await expect(area).toHaveAttribute("aria-label", /Current scope: Brunswick/);
  await area.click();
  await page.getByRole("button", { name: "Show town choices", exact: true }).click();
  await page.getByRole("button", { name: "Thurmont", exact: true }).click();
  await expect(area).toHaveAttribute("aria-label", /Current scope: Thurmont/);
  await expect.poll(() => new URL(page.url()).searchParams.get("in")).toBe("thurmont");
  await expect.poll(() => new URL(page.url()).searchParams.get("q")).toBe("coffee");
  expect(new URL(page.url()).searchParams.get("kind")).toBe("place");
  expect(new URL(page.url()).searchParams.get("returnTo")).toBe("/search?q=coffee&in=brunswick");
  await area.click();
  await page.getByRole("button", { name: "Whole county", exact: true }).click();
  await expect(area).toHaveAttribute("aria-label", /Current scope: Whole county/);
  await expect.poll(() => new URL(page.url()).searchParams.get("in")).toBe("county");
});

test("a failed event map preview becomes a readable live-map link", async ({ page }) => {
  await page.route("**/api/static-map?*", (route) => route.fulfill({ status: 503, body: "Unavailable" }));
  await page.goto("/events/alive-at-five-2026-09-10", { waitUntil: "domcontentloaded" });
  const map = page.getByRole("link", { name: /Open the map centered on/ });
  await map.scrollIntoViewIfNeeded();
  await expect(map.getByText("Map preview unavailable. Open the live map.")).toBeVisible({ timeout: 15_000 });
  await expect(map.locator("img")).toBeHidden();
  await expect(map).toHaveAttribute("href", /^\/map\?c=/);
});
