import { expect, test } from "@playwright/test";

const VENDOR_HREF = "/moments/great-frederick-fair-2026?vendor=vendor-white-rabbit-rad-pies#fair-map";
const VENDOR_TITLE = "White Rabbit x Rad Pies at the 2026 Fair";

test.use({ viewport: { width: 390, height: 844 }, serviceWorkers: "block" });

test.beforeEach(async ({ page }) => {
  // This navigation regression must not spend on optional provider photos.
  await page.route("**/api/place-photo?*", (route) => route.fulfill({
    status: 200,
    contentType: "image/svg+xml",
    body: '<svg xmlns="http://www.w3.org/2000/svg" width="1" height="1"/>',
  }));
  await page.addInitScript(() => {
    localStorage.setItem("fr:scope:v1", "town:frederick");
    document.cookie = "fr_scope=town%3Afrederick; path=/";
  });
});

test("submitted vendor search opens its reviewed Fair details and Back preserves the search area", async ({ page }) => {
  test.setTimeout(90_000);
  await page.goto("/search?q=Rad%20Pies&in=frederick", { waitUntil: "domcontentloaded" });
  const lead = page.locator('main a[data-decision-position="lead"]');
  await expect(lead).toContainText(VENDOR_TITLE);
  await expect(lead).toHaveAttribute("href", VENDOR_HREF);
  await expect(lead).toContainText("not a permanent business location");
  await lead.click();
  const drawer = page.getByRole("dialog", { name: "Food & vendors", exact: true });
  await expect(drawer).toBeVisible({ timeout: 30_000 });
  await expect(drawer.getByRole("heading", { name: "White Rabbit x Rad Pies", exact: true })).toBeVisible();
  await expect(drawer).toContainText("Booth reference: 587, 588");
  await expect(drawer).toContainText("It is not an exact map pin");
  await expect(drawer).toContainText("Vendor hours are not confirmed");
  await expect(drawer.getByRole("button", { name: /Show.*map/i })).toHaveCount(0);
  await page.goBack();
  await expect(page.getByRole("searchbox", { name: "Search Frederick County" })).toHaveValue("Rad Pies");
  await expect(page.getByRole("button", { name: "Frederick City", exact: true })).toHaveAttribute("aria-pressed", "true");
  expect(new URL(page.url()).searchParams.get("in")).toBe("frederick");
});

test("global Find and its API distinguish the restaurant from its Fair vendor", async ({ page, request }) => {
  test.setTimeout(90_000);
  for (const [query, expected] of [
    ["Rad Pies", VENDOR_HREF],
    ["White Rabbit", "/places/white-rabbit-gastropub"],
    ["White Rabbit at the fair", VENDOR_HREF],
  ]) {
    const response = await request.get(`/api/search?${new URLSearchParams({ q: query, in: "frederick" })}`);
    expect(response.ok()).toBe(true);
    const payload = await response.json();
    expect(payload.results[0].href).toBe(expected);
    expect(payload.results.some((result: { href: string }) => result.href === VENDOR_HREF)).toBe(true);
  }
  const scoped = await request.get("/api/search?q=Rad%20Pies&in=brunswick");
  expect((await scoped.json()).results.some((result: { href: string }) => result.href === VENDOR_HREF)).toBe(false);

  await page.goto("/today", { waitUntil: "domcontentloaded" });
  await expect(page.getByRole("combobox", { name: "Choose your area" })).toBeEnabled();
  await page.getByRole("link", { name: "Find a place, service, event, or answer", exact: true }).click();
  const find = page.getByRole("dialog", { name: "What do you need?", exact: true });
  await find.getByRole("searchbox", { name: "Ask or find across Frederick County" }).fill("Rad Pies");
  const best = find.locator("#search-opt-0");
  await expect(best).toContainText(VENDOR_TITLE, { timeout: 20_000 });
  await expect(best.getByRole("link", { name: "Open", exact: true })).toHaveAttribute("href", VENDOR_HREF);
  await best.getByRole("link", { name: "Open", exact: true }).click();
  await expect(page.getByRole("dialog", { name: "Food & vendors", exact: true })).toBeVisible({ timeout: 30_000 });
  await expect(page.getByRole("heading", { name: "White Rabbit x Rad Pies", exact: true })).toBeVisible();
});
