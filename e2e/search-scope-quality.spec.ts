import { expect, test } from "@playwright/test";

test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });

test("changing the search area refreshes matches and Back restores the previous county search", async ({ page }) => {
  await page.goto("/search?q=coffee&in=county&kind=place", { waitUntil: "domcontentloaded" });
  const county = page.getByRole("button", { name: "Whole county", exact: true });
  const brunswick = page.getByRole("button", { name: "Brunswick", exact: true });
  await expect(county).toHaveAttribute("aria-pressed", "true");
  await brunswick.click();
  await expect(brunswick).toHaveAttribute("aria-pressed", "true", { timeout: 20_000 });
  await expect(county).toHaveAttribute("aria-pressed", "false");
  await expect(page.locator('a[href^="/places/beans-in-the-belfry-brunswick"]')).toBeVisible();
  await expect(page.getByRole("link", { name: "View on map", exact: true })).toHaveAttribute("href", /in=brunswick/);
  expect(new URL(page.url()).searchParams.get("kind")).toBe("place");
  await page.goBack();
  await expect(county).toHaveAttribute("aria-pressed", "true", { timeout: 20_000 });
  await expect(page.getByRole("searchbox", { name: "Search Frederick County" })).toHaveValue("coffee");
  expect(new URL(page.url()).searchParams.get("in")).toBe("county");
  expect(new URL(page.url()).searchParams.get("kind")).toBe("place");
});

test("a new area replaces the town embedded in the request without losing the place filter", async ({ page }) => {
  await page.goto("/search?q=coffee%20in%20Thurmont&in=thurmont&kind=place", { waitUntil: "domcontentloaded" });
  const brunswick = page.getByRole("button", { name: "Brunswick", exact: true });
  await brunswick.click();
  await expect(brunswick).toHaveAttribute("aria-pressed", "true", { timeout: 20_000 });
  await expect(page.getByRole("searchbox", { name: "Search Frederick County" })).toHaveValue("coffee");
  await expect(page.locator('a[href^="/places/beans-in-the-belfry-brunswick"]')).toBeVisible();
  expect(new URL(page.url()).searchParams.get("in")).toBe("brunswick");
  expect(new URL(page.url()).searchParams.get("kind")).toBe("place");
  await page.getByRole("button", { name: "Whole county", exact: true }).click();
  await expect(page.getByRole("button", { name: "Whole county", exact: true })).toHaveAttribute("aria-pressed", "true");
  expect(new URL(page.url()).searchParams.get("in")).toBe("county");
});
