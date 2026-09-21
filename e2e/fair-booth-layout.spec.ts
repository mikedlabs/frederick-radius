import { readFileSync } from "node:fs";
import type { AxeResults } from "axe-core";
import { expect, test, type Locator, type Page } from "@playwright/test";

import type { FairLayoutData } from "../src/lib/fair/layout";
import { fairBoothNeighborhoods } from "../src/data/fair/fair-booth-context";

const FAIR_PATH = "/moments/great-frederick-fair-2026";
const LAYOUT_PATH = "/fair/layouts/great-frederick-fair-2026.json";
const OFFICIAL_GUIDE = "https://mobile.eventhub-floorplan.net/?Show_ID=18209";
const SEARCH_NAME = "Find a vendor or booth";
const VENDOR_NAME = "White Rabbit x Rad Pies";

function publishedLayout(): FairLayoutData {
  return JSON.parse(readFileSync(`public${LAYOUT_PATH}`, "utf8")) as FairLayoutData;
}

function radPiesBooths() {
  const floor = publishedLayout().maps.find((map) => map.id === "9566");
  expect(floor, "The reviewed Rad Pies section must exist").toBeDefined();
  return ["587", "588"].map((label) => {
    const booth = floor!.booths.find((item) => item.label === label);
    expect(booth, `Published booth ${label} must exist`).toBeDefined();
    return booth!;
  });
}

function boothUrl(params: Record<string, string> = {}) {
  return `${FAIR_PATH}?${new URLSearchParams({ layout: "booths", floor: "9566", ...params })}#fair-map`;
}

async function openBooths(page: Page, params: Record<string, string> = {}) {
  const response = await page.goto(boothUrl(params), { waitUntil: "domcontentloaded" });
  expect(response?.status()).toBe(200);
  await expect(page.locator("[data-fair-app]")).toHaveAttribute("data-fair-interaction-ready", "true", { timeout: 30_000 });
  const explorer = page.locator("[data-fair-booth-explorer]");
  await expect(explorer).toBeVisible({ timeout: 30_000 });
  await expect(explorer.locator("[data-fair-booth-svg]")).toBeVisible();
  return explorer;
}

async function selectRadPies(page: Page, explorer: Locator) {
  const search = explorer.getByRole("searchbox", { name: SEARCH_NAME, exact: true });
  await page.evaluate(() => document.fonts.ready);
  const map = explorer.locator("[data-fair-booth-svg]");
  const initialViewBox = await map.getAttribute("viewBox");
  expect(initialViewBox).toBeTruthy();
  await search.fill("Rad Pies");
  for (const booth of radPiesBooths()) {
    await expect(explorer.locator(`[data-fair-booth-id="${booth.id}"]`)).toHaveAttribute("data-highlighted", "true");
  }
  await expect(map).toHaveAttribute("viewBox", initialViewBox!);
  const result = explorer.getByRole("button", { name: `Show booth 587: ${VENDOR_NAME}`, exact: true });
  await expect(result).toBeVisible();
  await result.click();
  const detail = explorer.getByRole("region", { name: "Booth 587", exact: true });
  await expect(detail).toBeVisible();
  await expect(detail).toContainText(VENDOR_NAME);
  return { search, result, detail };
}

async function expectNoHorizontalOverflow(page: Page) {
  // iOS can briefly rubber-band while scrolling a result into view. Wait for
  // settled geometry without relaxing the existing one-pixel edge tolerance.
  await expect.poll(() => page.evaluate(() => {
    const viewportWidth = document.documentElement.clientWidth;
    const box = document.querySelector("[data-fair-booth-explorer]")!.getBoundingClientRect();
    return Math.max(document.documentElement.scrollWidth - viewportWidth, -box.left, box.right - viewportWidth);
  }), { message: "The document and booth finder must fit the horizontal viewport" }).toBeLessThanOrEqual(1);
}

async function expectBoothVisibleAndTappable(explorer: Locator, boothId: string) {
  const booth = explorer.locator(`[data-fair-booth-id="${boothId}"]`);
  // This WebKit build reports zero-area IntersectionObserver bounds for SVG
  // shapes. Measure the rendered booth against both clipping boundaries and
  // require its center to hit the exact source shape, not a covering label.
  await expect(async () => {
    const geometry = await booth.evaluate((element) => {
      const box = element.getBoundingClientRect();
      const canvas = element.closest("[data-fair-booth-canvas]")!.getBoundingClientRect();
      const viewport = document.documentElement;
      const hit = document.elementFromPoint(box.left + box.width / 2, box.top + box.height / 2);
      return {
        width: box.width,
        height: box.height,
        left: box.left,
        right: box.right,
        top: box.top,
        bottom: box.bottom,
        visibleLeft: Math.max(0, canvas.left),
        visibleRight: Math.min(viewport.clientWidth, canvas.right),
        visibleTop: Math.max(0, canvas.top),
        visibleBottom: Math.min(viewport.clientHeight, canvas.bottom),
        hitBoothId: hit?.getAttribute("data-fair-booth-id") ?? null,
      };
    });
    expect(geometry.width).toBeGreaterThan(0);
    expect(geometry.height).toBeGreaterThan(0);
    expect(geometry.left).toBeGreaterThanOrEqual(geometry.visibleLeft);
    expect(geometry.right).toBeLessThanOrEqual(geometry.visibleRight);
    expect(geometry.top).toBeGreaterThanOrEqual(geometry.visibleTop);
    expect(geometry.bottom).toBeLessThanOrEqual(geometry.visibleBottom);
    expect(geometry.hitBoothId).toBe(boothId);
  }).toPass({ timeout: 5_000 });
}

async function expectAccessibleExplorer(page: Page) {
  await page.addScriptTag({ content: readFileSync("node_modules/axe-core/axe.min.js", "utf8") });
  const violations = await page.evaluate(async () => {
    const axe = (window as unknown as {
      axe: { run: (context: string, options: object) => Promise<AxeResults> };
    }).axe;
    const result = await axe.run("[data-fair-booth-explorer]", {
      runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"] },
      resultTypes: ["violations"],
    });
    return result.violations.map(({ id, impact, help, nodes }) => ({
      id, impact, help, targets: nodes.map(({ target }) => target),
    }));
  });
  expect(violations).toEqual([]);
}

test.describe("Fair numbered booth layout", () => {
  test.use({
    viewport: { width: 375, height: 812 },
    locale: "en-US",
    timezoneId: "America/New_York",
    serviceWorkers: "block",
  });

  test.beforeEach(async ({ page }) => {
    // Optional provider photos are outside this local layout release check.
    await page.route("**/api/place-photo?*", (route) => route.fulfill({
      status: 200,
      contentType: "image/svg+xml",
      body: '<svg xmlns="http://www.w3.org/2000/svg" width="1" height="1"/>',
    }));
  });

  test("opens visible booth geometry from the desktop Vendors map control", async ({ page }) => {
    await page.setViewportSize({ width: 1366, height: 900 });
    await page.goto(`${FAIR_PATH}#fair-map`, { waitUntil: "domcontentloaded" });
    const grounds = page.locator("[data-fair-grounds-map]");
    await expect(grounds.locator("canvas")).toBeVisible({ timeout: 30_000 });
    await grounds.getByRole("button", { name: "Vendors", exact: true }).click();
    const explorer = page.locator("[data-fair-booth-explorer]");
    await expect(explorer.locator("[data-fair-booth-svg]")).toBeVisible({ timeout: 30_000 });
    await expect(explorer.locator("[data-fair-booth-id]").first()).toBeAttached();
    await expect(page.getByRole("dialog", { name: "Food & vendors", exact: true })).toHaveCount(0);
    expect(new URL(page.url()).searchParams.get("layout")).toBe("booths");
    const { detail } = await selectRadPies(page, explorer);
    await expect(detail).toContainText(VENDOR_NAME);
    await expect(explorer.locator("[data-fair-selected-vendor]")).toContainText(VENDOR_NAME);
    await expectBoothVisibleAndTappable(explorer, "9566:3353619");
    await expectBoothVisibleAndTappable(explorer, "9566:3353618");
  });

  test("the phone vendor map selector shows booths and returns to all grounds places", async ({ page }) => {
    await page.goto(`${FAIR_PATH}#fair-map`, { waitUntil: "domcontentloaded" });
    const grounds = page.locator("[data-fair-grounds-map]");
    await expect(grounds.locator("canvas")).toBeVisible({ timeout: 30_000 });
    const selector = grounds.locator("[data-fair-map-filter-select]");
    await expect(selector).toHaveValue("all");
    await selector.selectOption("vendors");
    const explorer = page.locator("[data-fair-booth-explorer]");
    await expect(explorer.locator("[data-fair-booth-svg]")).toBeVisible({ timeout: 30_000 });
    await expect(explorer.locator("[data-fair-area-vendors]")).toBeVisible();
    await expect(page.getByRole("dialog", { name: "Food & vendors", exact: true })).toHaveCount(0);
    await expectNoHorizontalOverflow(page);
    await expectAccessibleExplorer(page);
    await explorer.getByRole("button", { name: "Whole fair", exact: true }).click();
    await expect(grounds.locator("canvas")).toBeVisible({ timeout: 30_000 });
    await expect(selector).toHaveValue("all");
    expect(new URL(page.url()).searchParams.has("layout")).toBe(false);
  });

  test("tapping a vendor name on the map selects its real source booth", async ({ page }) => {
    const explorer = await openBooths(page);
    const label = explorer.locator("[data-fair-vendor-label]").first();
    await expect(label).toBeVisible();
    const vendorId = await label.getAttribute("data-vendor-id");
    const boothId = await label.getAttribute("data-fair-booth-label-for");
    const layout = publishedLayout();
    const vendor = layout.vendors.find((item) => item.id === vendorId);
    const booth = layout.maps.flatMap((map) => map.booths).find((item) => item.id === boothId);
    expect(vendor).toBeDefined();
    expect(booth).toBeDefined();
    expect(vendor!.boothIds).toContain(boothId);
    const target = label.locator("rect");
    const targetBox = await target.boundingBox();
    expect(targetBox?.height ?? 0).toBeGreaterThanOrEqual(44);
    expect(targetBox?.width ?? 0).toBeGreaterThanOrEqual(44);
    await target.click();
    const detail = explorer.getByRole("region", { name: `Booth ${booth!.label}`, exact: true });
    await expect(detail).toBeVisible();
    await expect(detail).toContainText(vendor!.name);
    await expect(explorer.locator(`[data-fair-booth-id="${boothId}"]`)).toHaveAttribute("data-selected", "true");
    await expect(explorer.locator("[data-fair-selected-vendor]")).toContainText(vendor!.name);
    expect(new URL(page.url()).searchParams.get("booth")).toBe(boothId);
    await expect(page.getByRole("dialog", { name: "Food & vendors", exact: true })).toHaveCount(0);
  });

  test("vendor map controls offer an honest retry when booth data is unavailable", async ({ page }) => {
    await page.route(`**${LAYOUT_PATH}`, (route) => route.fulfill({ status: 503, body: "Layout unavailable" }));
    await page.goto(`${FAIR_PATH}#fair-map`, { waitUntil: "domcontentloaded" });
    const grounds = page.locator("[data-fair-grounds-map]");
    await expect(grounds.locator("canvas")).toBeVisible({ timeout: 30_000 });
    await grounds.locator("[data-fair-map-filter-select]").selectOption("vendors");
    const fallback = page.locator("[data-fair-booth-layout-fallback]");
    await expect(fallback).toBeVisible();
    await expect(fallback.getByRole("button", { name: "Try loading the layout again", exact: true })).toBeVisible();
    await expect(fallback.locator(`a[href="${OFFICIAL_GUIDE}"]`)).toBeVisible();
    await expect(page.locator("[data-fair-booth-explorer]")).toHaveCount(0);
    await expect(page.getByRole("dialog", { name: "Food & vendors", exact: true })).toHaveCount(0);
  });

  test("finds both Rad Pies booths and Back dismisses details without losing the query", async ({ page }) => {
    const explorer = await openBooths(page);
    const { search, detail } = await selectRadPies(page, explorer);
    const selectedUrl = new URL(page.url());
    expect(selectedUrl.searchParams.get("booth")).toBe(radPiesBooths()[0].id);
    expect(selectedUrl.searchParams.get("floor")).toBe("9566");
    expect(selectedUrl.searchParams.get("bq")).toBe("Rad Pies");
    expect(selectedUrl.hash).toBe("#fair-map");
    await expect(page.locator('dialog[open], [role="dialog"][data-state="open"]')).toHaveCount(0);

    await detail.getByRole("button", { name: "View menu and details", exact: true }).click();
    const vendor = page.getByRole("dialog", { name: "Food & vendors", exact: true });
    await expect(vendor).toBeVisible();
    await expect(vendor.getByRole("heading", { name: VENDOR_NAME, exact: true })).toBeVisible();
    await vendor.getByRole("button", { name: "Close Food & vendors", exact: true }).click();
    await expect(vendor).toBeHidden();
    await expect(detail).toBeVisible();
    await expect(search).toHaveValue("Rad Pies");
    expect(new URL(page.url()).searchParams.get("booth")).toBe(radPiesBooths()[0].id);

    await page.goBack();
    await expect(detail).toBeHidden();
    await expect(search).toHaveValue("Rad Pies");
    expect(new URL(page.url()).searchParams.has("booth")).toBe(false);
    for (const booth of radPiesBooths()) {
      await expect(explorer.locator(`[data-fair-booth-id="${booth.id}"]`)).toHaveAttribute("data-highlighted", "true");
    }
  });

  test("opens a shared booth after reload and closes its related booth inside the same section", async ({ page }) => {
    const explorer = await openBooths(page, { booth: radPiesBooths()[0].id, bq: "Rad Pies" });
    const detail = explorer.getByRole("region", { name: "Booth 587", exact: true });
    await expect(detail).toContainText(VENDOR_NAME);
    await page.reload({ waitUntil: "domcontentloaded" });
    await expect(detail).toBeVisible({ timeout: 30_000 });
    await expect(detail).toContainText(VENDOR_NAME);
    await expect(explorer.getByRole("searchbox", { name: SEARCH_NAME, exact: true })).toHaveValue("Rad Pies");
    await detail.getByRole("button", { name: `Show booth 588: ${VENDOR_NAME}`, exact: true }).click();
    const relatedDetail = explorer.getByRole("region", { name: "Booth 588", exact: true });
    await expect(relatedDetail).toBeVisible();
    expect(new URL(page.url()).searchParams.get("booth")).toBe(radPiesBooths()[1].id);
    await relatedDetail.getByRole("button", { name: "Close booth details", exact: true }).click();
    await expect(relatedDetail).toBeHidden();
    await expect(detail).toBeHidden();
    expect(new URL(page.url()).pathname).toBe(FAIR_PATH);
    expect(new URL(page.url()).searchParams.get("layout")).toBe("booths");
    expect(new URL(page.url()).searchParams.get("floor")).toBe("9566");
    expect(new URL(page.url()).searchParams.has("booth")).toBe(false);
  });

  test("opens all seven reviewed booth areas and shows original sheets only on request", async ({ page }) => {
    const explorer = await openBooths(page);
    const maps = publishedLayout().maps;
    expect(maps.map(({ id }) => id).sort()).toEqual(["9564", "9565", "9566"]);
    const areas = explorer.getByRole("combobox", { name: "Choose a booth area", exact: true });
    await expect(areas.locator("option")).toHaveCount(7);
    for (const area of fairBoothNeighborhoods) {
      const map = maps.find((item) => item.id === area.mapId)!;
      await areas.selectOption(area.id);
      await expect(areas).toHaveValue(area.id);
      await expect(explorer.locator("[data-fair-booth-id]")).toHaveCount(map.booths.length);
      for (const id of area.boothIds) await expect(explorer.locator(`[data-fair-booth-id="${id}"]`)).toBeAttached();
      await expect(explorer.locator("[data-fair-booth-svg] image")).toHaveCount(0);
      const context = explorer.locator("[data-fair-booth-context]");
      await expect(context).toBeVisible();
      expect(await context.locator("path, polygon, rect, line, polyline").count()).toBeGreaterThan(0);
      expect(await context.locator("text").count()).toBeGreaterThan(0);
      await explorer.getByRole("button", { name: "Show original layout", exact: true }).click();
      await expect(explorer.locator("[data-fair-booth-svg] image")).toHaveAttribute("href", map.backgroundUrl);
      expect((await page.request.get(map.backgroundUrl)).ok()).toBe(true);
      await explorer.getByRole("button", { name: "Hide original layout", exact: true }).click();
      await expect(explorer.locator("[data-fair-booth-svg] image")).toHaveCount(0);
      await expect(context).toBeVisible();
      expect(new URL(page.url()).searchParams.get("floor")).toBe(map.id);
      await expectNoHorizontalOverflow(page);
    }
  });

  test("keeps the phone layout accessible and offers no invented booth GPS directions", async ({ page }) => {
    let locationCalls = 0;
    await page.exposeFunction("recordBoothLocationRequest", () => { locationCalls += 1; });
    await page.addInitScript(() => {
      const recordRequest = () => {
        void (window as unknown as { recordBoothLocationRequest: () => Promise<void> }).recordBoothLocationRequest();
      };
      Object.defineProperty(navigator.geolocation, "getCurrentPosition", { configurable: true, value: recordRequest });
      Object.defineProperty(navigator.geolocation, "watchPosition", { configurable: true, value: () => { recordRequest(); return 0; } });
    });
    const explorer = await openBooths(page);
    await expectNoHorizontalOverflow(page);
    await expectAccessibleExplorer(page);
    const { detail } = await selectRadPies(page, explorer);
    await expectNoHorizontalOverflow(page);
    await expectAccessibleExplorer(page);
    await expect(explorer.getByRole("link", { name: /directions|navigate to|walk to/i })).toHaveCount(0);
    await expect(explorer.getByRole("button", { name: /directions|use my location|locate me|navigate to/i })).toHaveCount(0);
    const closeBox = await detail.getByRole("button", { name: "Close booth details", exact: true }).boundingBox();
    expect(closeBox?.width ?? 0).toBeGreaterThanOrEqual(44);
    expect(closeBox?.height ?? 0).toBeGreaterThanOrEqual(44);
    for (const width of [320, 390, 430]) {
      await page.setViewportSize({ width, height: 812 });
      await expect(detail).toBeVisible();
      await expectNoHorizontalOverflow(page);
    }
    expect(locationCalls).toBe(0);
  });

  test("keeps the official guide available when the reviewed layout cannot load", async ({ page }) => {
    await page.route(`**${LAYOUT_PATH}`, (route) => route.fulfill({ status: 503, body: "Layout unavailable" }));
    await page.goto(boothUrl(), { waitUntil: "domcontentloaded" });
    const fallback = page.locator("[data-fair-booth-layout-fallback]");
    await expect(fallback).toBeVisible({ timeout: 30_000 });
    await expect(fallback.locator(`a[href="${OFFICIAL_GUIDE}"]`)).toBeVisible();
    await expect(page.locator("[data-fair-booth-explorer]")).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Grounds & services", exact: true })).toBeVisible();
    await page.unroute(`**${LAYOUT_PATH}`);
    await fallback.getByRole("button", { name: "Try loading the layout again", exact: true }).click();
    await expect(page.locator("[data-fair-booth-explorer]")).toBeVisible({ timeout: 30_000 });
    await expect(fallback).toBeHidden();
  });

  test("opens numbered booths from reviewed vendor details without stacking a second overlay", async ({ page }) => {
    await page.goto(`${FAIR_PATH}?vendor=vendor-white-rabbit-rad-pies#fair-map`, { waitUntil: "domcontentloaded" });
    const vendor = page.getByRole("dialog", { name: "Food & vendors", exact: true });
    await expect(vendor).toBeVisible({ timeout: 30_000 });
    await vendor.getByRole("button", { name: "Find numbered booths", exact: true }).click();
    const explorer = page.locator("[data-fair-booth-explorer]");
    await expect(explorer).toBeVisible({ timeout: 30_000 });
    await expect(vendor).toBeHidden();
    await expect(explorer.getByRole("searchbox", { name: SEARCH_NAME, exact: true })).toHaveValue(VENDOR_NAME);
    for (const booth of radPiesBooths()) {
      await expect(explorer.locator(`[data-fair-booth-id="${booth.id}"]`)).toHaveAttribute("data-highlighted", "true");
    }
    await expect(page.locator('dialog[open], [role="dialog"][data-state="open"]')).toHaveCount(0);
  });

  test("finds Casimir Bakery in its correct section when starting from a fresh vendor visit", async ({ page }) => {
    await page.goto(`${FAIR_PATH}?vendor=vendor-casimir-bakery#fair-map`, { waitUntil: "domcontentloaded" });
    const vendor = page.getByRole("dialog", { name: "Food & vendors", exact: true });
    await expect(vendor.getByRole("heading", { name: "Casimir Bakery", exact: true })).toBeVisible({ timeout: 30_000 });
    await vendor.getByRole("button", { name: "Find numbered booths", exact: true }).click();
    const explorer = page.locator("[data-fair-booth-explorer]");
    const detail = explorer.getByRole("region", { name: "Booth 53", exact: true });
    await expect(detail).toBeVisible({ timeout: 30_000 });
    await expect(detail).toContainText("Casimir Bakery");
    await expect(vendor).toBeHidden();
    const url = new URL(page.url());
    expect(url.searchParams.get("floor")).toBe("9564");
    expect(url.searchParams.get("booth")).toBe("9564:3353140");
    await expect(explorer.getByRole("searchbox", { name: SEARCH_NAME, exact: true })).toHaveValue("Casimir Bakery");
    await expect(explorer.locator('[data-fair-booth-id="9564:3353140"]')).toHaveAttribute("data-selected", "true");
  });

  test("starts a new search from a selected booth without moving the map or restoring the old query", async ({ page }) => {
    const explorer = await openBooths(page);
    const { search, detail } = await selectRadPies(page, explorer);
    await expect(explorer.locator("[data-fair-booth-canvas]")).not.toHaveAttribute("data-zoom", "1.000");
    const map = explorer.locator("[data-fair-booth-svg]");
    const selectedViewBox = await map.getAttribute("viewBox");
    expect(selectedViewBox).toBeTruthy();
    await search.fill("Casimir");
    await expect(detail).toBeHidden();
    await expect(explorer.locator('[data-fair-booth-id][data-selected="true"]')).toHaveCount(0);
    await expect(search).toHaveValue("Casimir");
    await expect(map).toHaveAttribute("viewBox", selectedViewBox!);
    expect(new URL(page.url()).searchParams.has("booth")).toBe(false);
    expect(new URL(page.url()).searchParams.get("bq")).toBe("Casimir");
    const result = explorer.getByRole("button", { name: "Show booth 53: Casimir Bakery", exact: true });
    await expect(result).toBeVisible();
    await result.click();
    const newDetail = explorer.getByRole("region", { name: "Booth 53", exact: true });
    await expect(newDetail).toBeVisible();
    await newDetail.getByRole("button", { name: "Close booth details", exact: true }).click();
    await expect(newDetail).toBeHidden();
    await expect(search).toHaveValue("Casimir");
    expect(new URL(page.url()).searchParams.get("bq")).toBe("Casimir");
  });

  test("finds a directory vendor through the whole-fair search and returns from its booth", async ({ page }) => {
    const layout = publishedLayout();
    const vendor = layout.vendors.find((item) => !item.richProfileId && item.boothIds.length === 1);
    expect(vendor, "The published directory includes vendors outside the reviewed profiles").toBeDefined();
    const floor = layout.maps.find((map) => map.booths.some((booth) => booth.id === vendor!.boothIds[0]));
    const booth = floor?.booths.find((item) => item.id === vendor!.boothIds[0]);
    expect(booth).toBeDefined();

    await page.goto(`${FAIR_PATH}#fair-map`, { waitUntil: "domcontentloaded" });
    await expect(page.locator("[data-fair-app]")).toHaveAttribute("data-fair-interaction-ready", "true", { timeout: 30_000 });
    const grounds = page.locator("[data-fair-grounds-map]");
    await expect(grounds.locator("canvas")).toBeVisible({ timeout: 30_000 });
    const compactSearch = page.getByRole("button", { name: "Search the Fair map", exact: true });
    if (await compactSearch.isVisible()) await compactSearch.click();
    const search = page.getByRole("searchbox", { name: "Find a place, event, or vendor on the Fair grounds map", exact: true });
    await search.fill(vendor!.name);
    const result = page.locator("#fair-map-search-results").getByRole("button", { name: `Find booths for ${vendor!.name}`, exact: true });
    await expect(result).toBeVisible();
    await result.click();

    const explorer = page.locator("[data-fair-booth-explorer]");
    const detail = explorer.getByRole("region", { name: `Booth ${booth!.label}`, exact: true });
    await expect(detail).toBeVisible({ timeout: 30_000 });
    await expect(detail).toContainText(vendor!.name);
    expect(new URL(page.url()).searchParams.get("floor")).toBe(floor!.id);
    expect(new URL(page.url()).searchParams.get("booth")).toBe(booth!.id);
    await explorer.getByRole("button", { name: "Whole fair", exact: true }).click();
    await expect(explorer).toBeHidden();
    await expect(grounds.locator("canvas")).toBeVisible({ timeout: 30_000 });
    expect(new URL(page.url()).searchParams.has("booth")).toBe(false);
    expect(new URL(page.url()).searchParams.has("layout")).toBe(false);
    expect(new URL(page.url()).hash).toBe("#fair-map");
    await expect(search).toHaveValue(vendor!.name);

    const emptyFloor = layout.maps.find((map) => map.booths.some((item) => /^\d+$/.test(item.label) && item.vendorIds.length === 0));
    const emptyBooth = emptyFloor?.booths.find((item) => /^\d+$/.test(item.label) && item.vendorIds.length === 0);
    expect(emptyBooth, "The official layout has numbered spaces without a listed exhibitor").toBeDefined();
    await search.fill(emptyBooth!.label);
    const emptyResult = page.getByRole("list", { name: "Numbered Fair booths", exact: true }).getByRole("button", { name: new RegExp(`^Booth ${emptyBooth!.label}\\b`) });
    await expect(emptyResult).toContainText("No exhibitor listed");
    await emptyResult.click();
    const emptyDetail = explorer.getByRole("region", { name: `Booth ${emptyBooth!.label}`, exact: true });
    await expect(emptyDetail).toBeVisible();
    await expect(emptyDetail).toContainText("The official guide does not list a vendor for this booth.");
    expect(new URL(page.url()).searchParams.get("floor")).toBe(emptyFloor!.id);
    expect(new URL(page.url()).searchParams.get("booth")).toBe(emptyBooth!.id);
  });
});
