import { expect, test } from "@playwright/test";

test.use({
  viewport: { width: 390, height: 844 },
  geolocation: { latitude: 39.4143, longitude: -77.4108 },
  permissions: ["geolocation"],
});

test("task-first map stays clear and makes the useful actions obvious", async ({ page }) => {
  await page.goto("/map", { waitUntil: "domcontentloaded" });
  await expect(page.locator(".dock-host")).toHaveAttribute("data-map-loaded", "true", {
    timeout: 20_000,
  });
  await expect(page.locator('[aria-label="The Frederick County map is loading."]')).toHaveAttribute(
    "data-state",
    "ready",
  );
  await page.waitForTimeout(260);
  await page.screenshot({ path: "output/playwright/map-polish-cold-390x844.png", fullPage: true });

  const search = page.getByRole("combobox", { name: "Search this map" });
  await search.focus();
  const shortcuts = page.getByRole("group", { name: "Map shortcuts" });
  await expect(shortcuts).toBeVisible();
  await expect(shortcuts.getByRole("button")).toHaveCount(4);
  await page.screenshot({
    path: "output/playwright/map-polish-search-start-390x844.png",
    fullPage: true,
  });

  await shortcuts.getByRole("button", { name: "Conditions" }).click();
  const conditions = page.getByRole("region", { name: "Travel & conditions" });
  await expect(conditions).toBeVisible();
  await page.waitForTimeout(300);
  await page.screenshot({
    path: "output/playwright/map-polish-conditions-390x844.png",
    fullPage: true,
  });
  await conditions.getByRole("button", { name: "Done" }).click();

  const show = page.getByRole("button", { name: "Choose what to see" });
  await show.click();
  const chooser = page.getByRole("region", { name: "Choose what to see" });
  await expect(chooser.getByRole("button", { name: "Find something nearby" })).toBeVisible();
  await expect(
    chooser.getByRole("button", { name: "See what is happening today and tonight" }),
  ).toBeVisible();
  await expect(
    chooser.getByRole("button", { name: "Check travel and live conditions" }),
  ).toBeVisible();
  await expect(
    chooser.getByRole("button", { name: "See Frederick details on the map" }),
  ).toBeVisible();
  await page.screenshot({
    path: "output/playwright/map-polish-chooser-390x844.png",
    fullPage: true,
  });

  await chooser.getByRole("button", { name: "Find something nearby" }).click();
  const find = page.getByRole("region", { name: "Find nearby" });
  await expect(find.getByRole("button", { name: "See what is within reach" })).toBeVisible();
  await expect(find.getByRole("button", { name: "Find a nearby essential" })).toBeVisible();
  await expect(find.getByText("All place categories")).toBeVisible();
  await page.screenshot({
    path: "output/playwright/map-polish-find-390x844.png",
    fullPage: true,
  });
});

test("the same command model fits the narrowest supported phone", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 568 });
  await page.goto("/map", { waitUntil: "domcontentloaded" });
  await expect(page.locator(".dock-host")).toHaveAttribute("data-map-loaded", "true", {
    timeout: 20_000,
  });
  const search = page.getByRole("combobox", { name: "Search this map" });
  await search.focus();
  const shortcuts = page.getByRole("group", { name: "Map shortcuts" });
  await expect(shortcuts).toBeVisible();
  for (const shortcut of await shortcuts.getByRole("button").all()) {
    const box = await shortcut.boundingBox();
    expect(box?.height ?? 0).toBeGreaterThanOrEqual(44);
  }
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);
  await page.screenshot({
    path: "output/playwright/map-polish-search-start-320x568.png",
    fullPage: true,
  });
});

test("the Radius summary clears the bottom nav on the narrowest supported phone", async ({
  page,
}) => {
  await page.setViewportSize({ width: 320, height: 568 });
  await page.goto("/map?mode=radius", { waitUntil: "domcontentloaded" });

  const adjust = page.getByRole("button", { name: "Adjust the radius" });
  const countyMap = page.getByRole("link", { name: "Back to county map" });
  const bottomNav = page.locator("[data-bottom-nav-shell]");
  await expect(adjust).toBeVisible({ timeout: 20_000 });
  await expect(countyMap).toBeVisible();
  await expect(bottomNav).toBeVisible();

  // Vaul animates the persistent Radius sheet into its collapsed snap point.
  // Measure the settled controls so this contract catches a real thumb target
  // slipping under the fixed navigation, rather than a transitional frame.
  await page.waitForTimeout(1_200);

  const geometry = await page.evaluate(() => {
    const adjustControl = document.querySelector<HTMLElement>(
      'button[aria-label="Adjust the radius"]',
    );
    const countyMapControl = document.querySelector<HTMLElement>(
      'a[aria-label="Back to county map"]',
    );
    const nav = document.querySelector<HTMLElement>("[data-bottom-nav-shell]");
    if (!adjustControl || !countyMapControl || !nav) return null;

    const adjustBox = adjustControl.getBoundingClientRect();
    const countyMapBox = countyMapControl.getBoundingClientRect();
    const navBox = nav.getBoundingClientRect();
    const intersects = (first: DOMRect, second: DOMRect) =>
      first.left < second.right &&
      first.right > second.left &&
      first.top < second.bottom &&
      first.bottom > second.top;

    return {
      adjustHeight: adjustBox.height,
      countyMapHeight: countyMapBox.height,
      adjustOverlapsNav: intersects(adjustBox, navBox),
      countyMapOverlapsNav: intersects(countyMapBox, navBox),
    };
  });

  expect(geometry).not.toBeNull();
  expect(geometry?.adjustHeight ?? 0).toBeGreaterThanOrEqual(44);
  expect(geometry?.countyMapHeight ?? 0).toBeGreaterThanOrEqual(44);
  expect(geometry?.adjustOverlapsNav).toBe(false);
  expect(geometry?.countyMapOverlapsNav).toBe(false);
});

test("a shared map reproduces its layers without replacing this device's preferences", async ({
  page,
}) => {
  await page.addInitScript(() => {
    window.localStorage.setItem(
      "fr:map-layers:v2",
      JSON.stringify({ transit: true, parking: true }),
    );
  });
  await page.goto("/map?show=none", { waitUntil: "domcontentloaded" });
  await expect(page.locator(".dock-host")).toHaveAttribute("data-map-loaded", "true", {
    timeout: 20_000,
  });

  await page.getByRole("button", { name: "Choose what to see" }).click();
  await page
    .getByRole("region", { name: "Choose what to see" })
    .getByRole("button", { name: "Check travel and live conditions" })
    .click();
  const conditions = page.getByRole("region", { name: "Travel & conditions" });
  const transit = conditions.getByRole("button", { name: /Transit/ });
  const parking = conditions.getByRole("button", { name: /Parking/ });

  await expect(transit).toHaveAttribute("aria-pressed", "false");
  await expect(parking).toHaveAttribute("aria-pressed", "false");
  await expect(page).toHaveURL(/show=none/);
  await expect
    .poll(() =>
      page.evaluate(() => window.localStorage.getItem("fr:map-layers:v2")),
    )
    .toBe('{"transit":true,"parking":true}');

  await transit.click();
  await expect(page).toHaveURL(/show=transit/);
  await expect
    .poll(() =>
      page.evaluate(() => window.localStorage.getItem("fr:map-layers:v2")),
    )
    .toBe('{"transit":true,"parking":true}');
});

test("a nearby-essential choice opens one named nearest result with directions", async ({
  page,
}) => {
  await page.goto("/map", { waitUntil: "domcontentloaded" });
  await expect(page.locator(".dock-host")).toHaveAttribute("data-map-loaded", "true", {
    timeout: 20_000,
  });
  const locate = page.locator(".dock-locate");
  await expect(locate).toBeVisible();
  if ((await locate.getAttribute("aria-label")) === "Use my location") {
    await locate.click();
  }
  await expect(page.getByRole("button", { name: "Center on my location" })).toBeVisible({
    timeout: 10_000,
  });

  await page.getByRole("button", { name: "Choose what to see" }).click();
  const chooser = page.getByRole("region", { name: "Choose what to see" });
  await chooser.getByRole("button", { name: "Find something nearby" }).click();
  await page
    .getByRole("region", { name: "Find nearby" })
    .getByRole("button", { name: "Find a nearby essential" })
    .click();
  const essentials = page.getByRole("region", { name: "Nearby essentials" });
  await expect(essentials.getByText("Using your location")).toBeVisible();
  await essentials.getByRole("button", { name: /Restrooms/ }).click();

  await expect(page.getByText("Nearest mapped restrooms")).toBeVisible();
  await expect(page.getByText(/from you/)).toBeVisible();
  await expect(page.getByRole("link", { name: "Directions" })).toBeVisible();
  await page.screenshot({
    path: "output/playwright/map-polish-nearest-essential-390x844.png",
    fullPage: true,
  });
});
