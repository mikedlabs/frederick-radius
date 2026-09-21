import { expect, test, type Page } from "@playwright/test";

const FAIR_PATH = "/moments/great-frederick-fair-2026";
const VENDOR_ID = "vendor-white-rabbit-rad-pies";
const VENDOR_NAME = "White Rabbit x Rad Pies";
const PLAN_KEY = "fr:fair-plan:great-frederick-fair-2026:v1";
const MAP_SEARCH_NAME = "Find a place, event, or vendor on the Fair grounds map";

async function openMap(page: Page) {
  await page.goto(`${FAIR_PATH}#fair-map`, { waitUntil: "domcontentloaded" });
  await expect(page.locator("[data-fair-app]")).toHaveAttribute("data-fair-interaction-ready", "true", { timeout: 20_000 });
  await expect(page.locator("[data-fair-grounds-map]")).toBeVisible({ timeout: 20_000 });
  await expect(page.locator("[data-fair-grounds-map] canvas")).toBeVisible({ timeout: 20_000 });
}

async function findRadPies(page: Page) {
  const search = page.getByRole("searchbox", { name: MAP_SEARCH_NAME });
  const compactTrigger = page.getByRole("button", { name: "Search the Fair map", exact: true });
  if (await compactTrigger.isVisible()) await compactTrigger.click();
  await expect(search).toBeVisible();
  await search.fill("Rad Pies");
  const result = page.locator("#fair-map-search-results").getByRole("button", { name: `Find booths for ${VENDOR_NAME}`, exact: true });
  await expect(result).toBeVisible();
  await result.click();
  const explorer = page.locator("[data-fair-booth-explorer]");
  const booth = explorer.getByRole("region", { name: "Booth 587", exact: true });
  await expect(booth).toBeVisible();
  await expect(booth).toContainText(VENDOR_NAME);
  await expect(explorer.locator('[data-fair-booth-id="9566:3353619"]')).toHaveAttribute("data-selected", "true");
  await expect(explorer.locator('[data-fair-booth-id="9566:3353618"]')).toHaveAttribute("data-highlighted", "true");
  await expect(page.getByRole("dialog", { name: "Food & vendors", exact: true })).toHaveCount(0);
  await booth.getByRole("button", { name: "View menu and details", exact: true }).click();
  const drawer = page.getByRole("dialog", { name: "Food & vendors", exact: true });
  await expect(drawer).toBeVisible();
  await expect(drawer.getByRole("heading", { name: VENDOR_NAME, exact: true })).toBeVisible();
  return { search, result, drawer, explorer, booth };
}

test.describe("Fair vendor discovery and My Day", () => {
  test.use({
    viewport: { width: 390, height: 844 },
    locale: "en-US",
    timezoneId: "America/New_York",
    serviceWorkers: "block",
  });

  test("locates a vendor on the booth map first, then opens its menu and returns through My Day", async ({ page }) => {
    test.setTimeout(60_000);
    await openMap(page);
    const { drawer, booth } = await findRadPies(page);
    await expect(page).toHaveURL(`${FAIR_PATH}?vendor=${VENDOR_ID}#fair-map`);
    await expect(drawer).toContainText("Booth reference: 587, 588");
    await expect(drawer).toContainText("Vendor hours are not confirmed");
    await expect(drawer.getByRole("link", { name: "Rad Pies restaurant menu" })).toHaveAttribute("href", "https://www.radpies.com/menu/pizza/");
    await expect(page.locator("[data-fair-map-selection]:visible")).toHaveCount(0);
    const vendorPins = page.locator('[data-fair-map-marker-group][aria-label*="Rad Pies"], [data-fair-map-marker-group][aria-label*="White Rabbit"]');
    await expect(vendorPins).toHaveCount(0);
    await expect(page.locator('dialog[open], [role="dialog"][data-state="open"]')).toHaveCount(1);

    await drawer.getByRole("button", { name: `Save ${VENDOR_NAME} to My Day`, exact: true }).click();
    await expect(drawer.getByRole("button", { name: `Remove ${VENDOR_NAME} from My Day`, exact: true })).toHaveAttribute("aria-pressed", "true");
    await expect.poll(() => page.evaluate((key) => {
      const plan = JSON.parse(localStorage.getItem(key) ?? "null");
      return { dayId: plan?.selectedDayId, vendorStops: plan?.vendorStops, scheduleCount: plan?.steps?.length };
    }, PLAN_KEY)).toMatchObject({
      vendorStops: [{ vendorId: VENDOR_ID, labelSnapshot: VENDOR_NAME, sourceState: "current" }],
      scheduleCount: 0,
    });

    await drawer.getByRole("button", { name: "Close Food & vendors", exact: true }).click();
    await expect(drawer).toBeHidden();
    await expect(booth).toBeVisible();
    expect(new URL(page.url()).searchParams.get("booth")).toBe("9566:3353619");
    await page.locator("[data-mobile-action-bar]").getByRole("button", { name: /^My Day/ }).click();
    await expect(page.getByRole("heading", { name: "My Fair Day", exact: true })).toBeVisible();
    const saved = page.getByRole("list", { name: "Saved Fair vendors" });
    await expect(saved).toContainText(VENDOR_NAME);
    await expect(page.getByRole("button", { name: "Share saved stops", exact: true })).toBeVisible();
    await expect(page.getByRole("list", { name: "My Fair Day timeline" })).toHaveCount(0);

    // Reload proves this is the existing on-device plan, not drawer-only state.
    await page.reload({ waitUntil: "domcontentloaded" });
    await expect(saved).toContainText(VENDOR_NAME);
    await saved.getByRole("button", { name: `View ${VENDOR_NAME} in the Fair guide`, exact: true }).click();
    await expect(drawer).toBeVisible();
    await expect(drawer.getByRole("button", { name: `Remove ${VENDOR_NAME} from My Day`, exact: true })).toHaveAttribute("aria-pressed", "true");
    await page.goBack();
    await expect(drawer).toBeHidden();
    await expect(page).toHaveURL(`${FAIR_PATH}#my-day`);
    await expect(saved).toContainText(VENDOR_NAME);
  });

  test("shows honest recovery for an unknown shared vendor in the same drawer", async ({ page }) => {
    await page.goto(`${FAIR_PATH}?vendor=vendor-no-longer-present#fair-map`, { waitUntil: "domcontentloaded" });
    const drawer = page.getByRole("dialog", { name: "Food & vendors", exact: true });
    await expect(drawer).toBeVisible({ timeout: 20_000 });
    await expect(drawer.getByRole("heading", { name: "This vendor is not in the reviewed guide." })).toBeVisible();
    await expect(drawer.getByRole("button", { name: /^Save .* to My Day$/ })).toHaveCount(0);
    await expect(drawer.getByRole("link", { name: "Browse the full official vendor directory" })).toHaveAttribute("href", /mobile\.eventhub-floorplan\.net\/exhibitors-g2app\.php\?Show_ID=18209/);
    await drawer.getByRole("button", { name: "Browse reviewed vendors", exact: true }).click();
    await expect(drawer.getByRole("heading", { name: "Find your next Fair stop." })).toBeVisible();
    await expect(drawer.getByRole("list", { name: "Reviewed Fair vendors" })).toBeVisible();
    await expect(page.locator('dialog[open], [role="dialog"][data-state="open"]')).toHaveCount(1);
    await drawer.getByRole("button", { name: "Close Food & vendors", exact: true }).click();
    await expect(drawer).toBeHidden();
    expect(new URL(page.url()).searchParams.has("vendor")).toBe(false);
    await expect(page.getByRole("heading", { name: "Fairgrounds map", exact: true })).toBeVisible();
  });

  test("keeps menus usable at 320px and returns to the selected booth after Escape", async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 568 });
    await openMap(page);
    const { drawer, explorer, booth } = await findRadPies(page);
    await expect(drawer).toHaveAttribute("data-drawer-surface", "solid");
    const close = drawer.getByRole("button", { name: "Close Food & vendors", exact: true });
    const closeBox = await close.boundingBox();
    expect(closeBox?.height ?? 0).toBeGreaterThanOrEqual(44);
    expect(closeBox?.width ?? 0).toBeGreaterThanOrEqual(44);
    const detail = drawer.locator("[data-fair-vendor-detail]");
    expect(await detail.evaluate((element) => element.scrollWidth <= element.clientWidth + 1)).toBe(true);
    const geometry = await drawer.evaluate((element) => {
      const box = element.getBoundingClientRect();
      return { left: box.left, right: box.right, viewport: window.innerWidth, documentWidth: document.documentElement.scrollWidth };
    });
    expect(geometry.left).toBeGreaterThanOrEqual(-1);
    expect(geometry.right).toBeLessThanOrEqual(geometry.viewport + 1);
    expect(geometry.documentWidth).toBeLessThanOrEqual(geometry.viewport + 1);
    const save = drawer.getByRole("button", { name: `Save ${VENDOR_NAME} to My Day`, exact: true });
    await save.scrollIntoViewIfNeeded();
    const saveBox = await save.boundingBox();
    expect(saveBox?.height ?? 0).toBeGreaterThanOrEqual(44);
    expect(saveBox?.width ?? 0).toBeGreaterThanOrEqual(44);
    await save.focus();
    await page.keyboard.press("Escape");
    await expect(drawer).toBeHidden();
    await expect(booth).toBeVisible();
    expect(new URL(page.url()).searchParams.get("booth")).toBe("9566:3353619");
    await expect(explorer.getByRole("searchbox", { name: "Find a vendor or booth", exact: true })).toHaveValue(VENDOR_NAME);
    await expect.poll(() => booth.evaluate((element) => {
      const focused = document.activeElement;
      return element.contains(focused) ? "booth details" : focused?.outerHTML.slice(0, 300);
    }), { message: "Closing the menu must return keyboard focus to the selected booth, not removed UI or the page body." }).toBe("booth details");
  });
});
