import { expect, test, type Page } from "@playwright/test";

const COFFEE_SLUGS = [
  "gravel-and-grind-frederick",
  "dublin-roasters-frederick",
  "frederick-coffee-company-frederick",
  "ibiza-cafe",
  "the-perfect-blend-cafe",
  "market-street-boba-beans",
  "shab-row-tea-emporium",
];

async function waitForMap(page: Page) {
  const canvas = page.locator(
    "canvas.mapboxgl-canvas, canvas.maplibregl-canvas",
  );
  await expect(canvas).toBeVisible({ timeout: 20_000 });
  await expect(page.locator(".dock-host")).toHaveAttribute(
    "data-map-loaded",
    "true",
    { timeout: 20_000 },
  );
  return canvas;
}

async function pan(page: Page, fromX: number, toX: number) {
  const canvas = page.locator(
    "canvas.mapboxgl-canvas, canvas.maplibregl-canvas",
  );
  const box = await canvas.boundingBox();
  expect(box).not.toBeNull();
  if (!box) return;
  // Pan across the upper map so the gesture never starts on the dock or list.
  const y = box.y + box.height * 0.3;
  await page.mouse.move(box.x + box.width * fromX, y);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * toX, y, { steps: 8 });
  await page.mouse.up();
}

test.describe("deliberate map result areas", () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true });
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.setItem("fr_map_location_intro_v1", "dismissed");
    });
  });

  test("plain browsing never offers to search an area", async ({ page }) => {
    const committedCamera = "-77.4100,39.4200,13.00";
    await page.goto(`/map?c=${committedCamera}`, {
      waitUntil: "domcontentloaded",
    });
    await waitForMap(page);
    await pan(page, 0.68, 0.28);
    // The camera settles and is shared, but with no question asked there is
    // no area to search and no list to change.
    await expect
      .poll(() => new URL(page.url()).searchParams.get("c"))
      .toBe(committedCamera);
    await expect(
      page.getByRole("button", { name: "Search this area" }),
    ).toHaveCount(0);
    await expect(page.locator("[data-map-list-peek]")).toHaveCount(0);
  });

  test("re-runs an active task for the visible map and raises its list", async ({
    page,
  }) => {
    const committedCamera = "-77.4100,39.4200,13.00";
    await page.goto(`/map?c=${committedCamera}&intent=coffee&in=county`, {
      waitUntil: "domcontentloaded",
    });
    await waitForMap(page);

    const list = page.locator("[data-map-list-peek]");
    await expect(list).toBeVisible();
    await expect(list).toContainText("Coffee · Whole county");
    await expect(list).not.toContainText("map center");
    await expect(list.locator("[data-map-list-place]")).toHaveCount(5);
    await expect(list.getByRole("button", { name: /^Show \d+ more places?$/ })).toBeVisible();

    await pan(page, 0.68, 0.28);
    const commit = page.getByRole("button", { name: "Search this area" });
    await expect(commit).toBeVisible({ timeout: 10_000 });
    expect(new URL(page.url()).searchParams.get("c")).toBe(committedCamera);
    // A person panning wants the map, so the list folds to its title.
    await expect(list).toHaveAttribute("data-expanded", "false");

    const commitBox = await commit.boundingBox();
    // Chromium can report a nominal 44px CSS target as 43.99999 physical
    // pixels after device-scale conversion. Round only for this tap-size
    // contract; the layout assertion remains a real 44px minimum.
    expect(Math.round(commitBox?.height ?? 0)).toBeGreaterThanOrEqual(44);

    await commit.click();
    await expect(commit).toHaveCount(0);
    await expect
      .poll(() => new URL(page.url()).searchParams.get("c"))
      .not.toBe(committedCamera);
    await expect(list).toHaveAttribute("data-expanded", "true");
    await expect(list).toContainText("Coffee · This area");
    await expect(page.locator("[data-map-result-announcement]")).toContainText(
      /(?:Showing [\d,]+ places?|No matching places) in this area\./,
    );
  });

  test("Enter keeps the camera and answers with a ranked list, not one shop", async ({
    page,
  }) => {
    await page.route("**/api/search?**", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          results: COFFEE_SLUGS.map((slug) => ({
            type: "place",
            id: `place:${slug}`,
            title: slug,
            subtitle: "Coffee · Frederick",
            href: `/places/${slug}`,
          })),
        }),
      });
    });
    const camera = "-77.4100,39.4150,12.40";
    await page.goto(`/map?c=${camera}`, { waitUntil: "domcontentloaded" });
    await waitForMap(page);

    const search = page.getByRole("combobox", { name: "Search this map" });
    await search.fill("espresso bar");
    await expect(page.locator("[data-map-search-result]").first()).toBeVisible({
      timeout: 10_000,
    });
    await search.press("Enter");

    const list = page.locator("[data-map-list-peek]");
    await expect(list).toBeVisible();
    await expect(list).toContainText("“espresso bar” · Whole county");
    await expect(list.locator("[data-map-list-place]")).toHaveCount(5);
    await list.getByRole("button", { name: "Show 2 more places" }).click();
    await expect(list.locator("[data-map-list-place]")).toHaveCount(7);
    // No place opened by itself and the camera did not move.
    expect(new URL(page.url()).searchParams.has("place")).toBe(false);
    expect(new URL(page.url()).searchParams.get("c")).toBe(camera);
    await expect(page.locator("[data-map-result-surface]")).toHaveCount(0);

    // Opening one place stays an explicit tap.
    await list.locator('[data-map-list-place="dublin-roasters-frederick"]').click();
    await expect
      .poll(() => new URL(page.url()).searchParams.get("place"))
      .toBe("dublin-roasters-frederick");
  });

  test("does not animate the contextual control when reduced motion is requested", async ({
    page,
  }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto("/map?c=-77.4100,39.4200,13.00&intent=coffee", {
      waitUntil: "domcontentloaded",
    });
    await waitForMap(page);
    await pan(page, 0.66, 0.3);

    const commit = page.getByRole("button", { name: "Search this area" });
    await expect(commit).toBeVisible({ timeout: 10_000 });
    await expect(commit).toHaveCSS("animation-name", "none");
  });
});
