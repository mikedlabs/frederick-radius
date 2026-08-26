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
  // Focusing an empty search should leave the map calm. The old four-button
  // shortcut tray duplicated Browse and covered the very map people came to
  // use.
  await expect(page.getByRole("group", { name: "Map shortcuts" })).toHaveCount(0);
  await expect(page.locator(".dock-search-results")).toHaveCount(0);
  await page.screenshot({
    path: "output/playwright/map-polish-search-ready-390x844.png",
    fullPage: true,
  });

  const browse = page.getByRole("button", { name: "Choose what to see on this map" });
  await expect(browse).toContainText("What to see");
  const browseLabel = browse.locator(".dock-contents-label");
  await expect(browseLabel).toBeVisible();
  expect(
    await browseLabel.evaluate((label) => label.scrollWidth <= label.clientWidth),
  ).toBe(true);
  await browse.click();
  const chooser = page.getByRole("region", { name: "Choose what to see" });
  await chooser.getByRole("button", { name: /^Get around/ }).click();
  const conditions = page.getByRole("region", { name: "Get around" });
  await expect(conditions).toBeVisible();
  await expect(conditions.getByText("Choose a travel view")).toBeVisible();
  await expect(conditions.getByText(/places|close within the hour/i)).toHaveCount(0);
  await page.waitForTimeout(300);
  await page.screenshot({
    path: "output/playwright/map-polish-conditions-390x844.png",
    fullPage: true,
  });
  await conditions.getByRole("button", { name: "Done" }).click();

  await browse.click();
  await expect(chooser.getByRole("button", { name: /^Nearby/ })).toBeVisible();
  await expect(
    chooser.getByRole("button", { name: /^Happening/ }),
  ).toBeVisible();
  await expect(
    chooser.getByRole("button", { name: /^Get around/ }),
  ).toBeVisible();
  await expect(
    chooser.getByRole("button", { name: /^Conditions/ }),
  ).toBeVisible();
  await expect(
    chooser.getByRole("button", { name: /^More/ }),
  ).toBeVisible();
  await page.screenshot({
    path: "output/playwright/map-polish-chooser-390x844.png",
    fullPage: true,
  });

  await chooser.getByRole("button", { name: /^Nearby/ }).click();
  await expect(chooser).toBeHidden();
  await expect
    .poll(() => page.evaluate(() => window.sessionStorage.getItem("fr_geo_v1")), {
      timeout: 10_000,
    })
    .not.toBeNull();
  await expect
    .poll(() => {
      return new URL(page.url()).searchParams.get("in");
    }, { timeout: 5_000 })
    .toBe("nearme");
  await page.screenshot({
    path: "output/playwright/map-polish-find-390x844.png",
    fullPage: true,
  });
});

test("touching the map dismisses Browse without stranding focus in the inert pane", async ({
  page,
}) => {
  await page.goto("/map", { waitUntil: "domcontentloaded" });
  await expect(page.locator(".dock-host")).toHaveAttribute("data-map-loaded", "true", {
    timeout: 20_000,
  });

  await page
    .getByRole("button", { name: "Choose what to see on this map" })
    .click();
  const chooser = page.locator("#dock-pane");
  await expect(chooser).toBeFocused();

  const canvas = page.locator(".mapboxgl-canvas, .maplibregl-canvas").first();
  await canvas.dispatchEvent("pointerdown", {
    bubbles: true,
    button: 0,
    pointerType: "touch",
  });

  await expect(chooser).toHaveAttribute("aria-hidden", "true");
  await expect(chooser).toHaveAttribute("inert", "");
  await expect(canvas).toBeFocused();
});

test("the same command model fits the narrowest supported phone", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 568 });
  await page.goto("/map", { waitUntil: "domcontentloaded" });
  await expect(page.locator(".dock-host")).toHaveAttribute("data-map-loaded", "true", {
    timeout: 20_000,
  });
  const scope = page.locator("[data-location-chip]");
  await expect(scope).toBeVisible();
  const compactScope = scope.locator('[data-location-scope-label="compact"]');
  await expect(compactScope).toBeVisible();
  await expect(compactScope).toHaveText("County");
  await expect(scope.locator('[data-location-scope-label="full"]')).toBeHidden();
  const headerGeometry = await page.locator('header[data-map-header="true"]').evaluate((header) => ({
    clientWidth: header.clientWidth,
    scrollWidth: header.scrollWidth,
  }));
  expect(headerGeometry.scrollWidth).toBeLessThanOrEqual(headerGeometry.clientWidth);
  const search = page.getByRole("combobox", { name: "Search this map" });
  await search.focus();
  await expect(page.getByRole("group", { name: "Map shortcuts" })).toHaveCount(0);
  for (const control of await page.locator("[data-map-dock] .dock-head > button").all()) {
    const box = await control.boundingBox();
    expect(box?.height ?? 0).toBeGreaterThanOrEqual(44);
  }
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);
  await page.screenshot({
    path: "output/playwright/map-polish-search-ready-320x568.png",
    fullPage: true,
  });
});

test("revealed map choices clear the fixed navigation and the area picker keeps the map visible", async ({
  page,
}) => {
  await page.goto("/map", { waitUntil: "domcontentloaded" });
  await expect(page.locator(".dock-host")).toHaveAttribute("data-map-loaded", "true", {
    timeout: 20_000,
  });

  const nav = page.locator("[data-bottom-nav-shell]");
  await page.getByRole("button", { name: "Choose what to see on this map" }).click();
  const chooser = page.getByRole("region", { name: "Choose what to see" });
  await expect(chooser).toBeVisible();

  const chooserGeometry = await chooser.evaluate((pane) => {
    const nav = document.querySelector<HTMLElement>("[data-bottom-nav-shell]");
    const scroll = pane.querySelector<HTMLElement>(".dock-pane-scroll");
    const actions = [...pane.querySelectorAll<HTMLElement>(".dock-content-secondary button")];
    if (!nav || !scroll || actions.length === 0) return null;
    const paneBox = pane.getBoundingClientRect();
    const navBox = nav.getBoundingClientRect();
    return {
      paneBottom: paneBox.bottom,
      navTop: navBox.top,
      actionHeights: actions.map((action) => action.getBoundingClientRect().height),
      scrollPaddingBottom: Number.parseFloat(getComputedStyle(scroll).paddingBottom),
    };
  });
  expect(chooserGeometry).not.toBeNull();
  expect(chooserGeometry?.paneBottom ?? 999).toBeLessThanOrEqual(chooserGeometry?.navTop ?? 0);
  expect(Math.min(...(chooserGeometry?.actionHeights ?? [0]))).toBeGreaterThanOrEqual(44);
  expect(chooserGeometry?.scrollPaddingBottom ?? 0).toBeGreaterThanOrEqual(20);

  const lastMapAction = chooser.getByRole("button", { name: /^Share/ });
  await lastMapAction.scrollIntoViewIfNeeded();
  const lastMapActionBox = await lastMapAction.boundingBox();
  const navBox = await nav.boundingBox();
  expect(lastMapActionBox).not.toBeNull();
  expect(navBox).not.toBeNull();
  if (!lastMapActionBox || !navBox) throw new Error("Expected visible map action and navigation boxes");
  expect(lastMapActionBox.y + lastMapActionBox.height).toBeLessThanOrEqual(navBox.y);
  await page.screenshot({
    path: "output/playwright/map-mobile-revealed-actions-clear-nav-390x844.png",
    fullPage: false,
  });

  await chooser.getByRole("button", { name: "Done" }).click();
  const scopeTrigger = page.getByRole("button", { name: /Change town or location scope/i });
  await scopeTrigger.click();
  const scopeMenu = page.locator("[data-location-scope-menu]");
  const done = scopeMenu.getByRole("button", { name: "Done choosing an area" });
  await expect(scopeMenu).toBeVisible();
  await expect(done).toBeVisible();

  const scopeGeometry = await page.evaluate(() => {
    const menu = document.querySelector<HTMLElement>("[data-location-scope-menu]");
    const map = document.querySelector<HTMLElement>(".dock-host");
    if (!menu || !map) return null;
    const menuBox = menu.getBoundingClientRect();
    const mapBox = map.getBoundingClientRect();
    return {
      closeHeight: document.querySelector<HTMLElement>('[aria-label="Done choosing an area"]')?.getBoundingClientRect().height ?? 0,
      menuHeight: menuBox.height,
      mapHeight: mapBox.height,
      visibleMapBelow: Math.max(0, mapBox.bottom - menuBox.bottom),
    };
  });
  expect(scopeGeometry).not.toBeNull();
  expect(scopeGeometry?.closeHeight ?? 0).toBeGreaterThanOrEqual(44);
  expect(scopeGeometry?.menuHeight ?? 999).toBeLessThanOrEqual((scopeGeometry?.mapHeight ?? 0) * 0.72);
  expect(scopeGeometry?.visibleMapBelow ?? 0).toBeGreaterThan(80);
  await expect(nav).toBeVisible();
  await page.screenshot({
    path: "output/playwright/map-mobile-bounded-scope-picker-390x844.png",
    fullPage: false,
  });
  await done.focus();
  await page.keyboard.press("Escape");
  await expect(scopeMenu).toBeHidden();
  await expect(scopeTrigger).toBeFocused();

  await scopeTrigger.click();
  await expect(scopeMenu).toBeVisible();
  await done.click();
  await expect(scopeMenu).toBeHidden();
  await expect(scopeTrigger).toBeFocused();
});

test("expanded Compass actions open as a focused mobile task", async ({ page }) => {
  await page.goto("/compass", { waitUntil: "domcontentloaded" });
  await expect(page.locator("[data-compass-ready]")).toHaveAttribute("data-compass-ready", "true");

  const trigger = page.getByRole("button", {
    name: /^Essentials & local help/i,
  });
  await trigger.click();

  const dialog = page.getByRole("dialog", {
    name: "Essentials & local help",
  });
  await expect(dialog).toBeVisible();
  await expect(
    dialog.getByRole("button", {
      name: "Close Essentials & local help",
    }),
  ).toBeFocused();

  const finalAction = dialog.getByRole("link").last();
  await finalAction.scrollIntoViewIfNeeded();
  await expect(finalAction).toBeVisible();
  await page.screenshot({
    path: "output/playwright/compass-mobile-task-sheet-390x844.png",
    fullPage: false,
  });
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
  await expect(trigger).toBeFocused();
});

test("an active query uses the full mobile command width without stacking overlays", async ({
  page,
}) => {
  await page.goto("/map", { waitUntil: "domcontentloaded" });
  await expect(page.locator(".dock-host")).toHaveAttribute("data-map-loaded", "true", {
    timeout: 20_000,
  });

  const search = page.getByRole("combobox", { name: "Search this map" });
  const cameraBeforeTyping = new URL(page.url()).searchParams.get("c");
  await search.fill("Gravel and Grind");
  const results = page.locator(".dock-search-results");
  await expect(results).toBeVisible({ timeout: 10_000 });
  await expect(results.getByText("Gravel & Grind", { exact: true })).toBeVisible();
  await expect(results.getByText(/Grindstone/i)).toHaveCount(0);
  await expect(page.getByRole("region", { name: "Choose what to see" })).toBeHidden();

  // Typing narrows the choices without moving the map or choosing on the
  // user's behalf. Camera movement belongs to an explicit result selection.
  await expect
    .poll(() => {
      return new URL(page.url()).searchParams.get("c");
    }, { timeout: 5_000 })
    .toBe(cameraBeforeTyping);
  await expect
    .poll(() => new URL(page.url()).searchParams.get("place"))
    .toBeNull();

  const geometry = await page.evaluate(() => {
    const dock = document.querySelector<HTMLElement>("[data-map-dock]");
    const head = document.querySelector<HTMLElement>("[data-map-dock] .dock-head");
    const panel = document.querySelector<HTMLElement>(".dock-search-results");
    const input = document.querySelector<HTMLElement>("#map-search-input");
    if (!dock || !head || !panel || !input) return null;
    const dockBox = dock.getBoundingClientRect();
    const headBox = head.getBoundingClientRect();
    const panelBox = panel.getBoundingClientRect();
    return {
      queryActive: dock.dataset.queryActive,
      inputWidth: input.getBoundingClientRect().width,
      panelWidth: panelBox.width,
      headWidth: headBox.width,
      panelInsideViewport: panelBox.left >= 0 && panelBox.right <= window.innerWidth,
      panelAlignedToDock: Math.abs(panelBox.left - dockBox.left) <= 1,
    };
  });

  expect(geometry).not.toBeNull();
  expect(geometry?.queryActive).toBe("true");
  expect(geometry?.inputWidth ?? 0).toBeGreaterThan(130);
  // Borders and the Chromium overlay scrollbar can account for a few device
  // pixels. The result surface should still read as the full command width.
  expect(Math.abs((geometry?.panelWidth ?? 0) - (geometry?.headWidth ?? 0))).toBeLessThanOrEqual(6);
  expect(geometry?.panelInsideViewport).toBe(true);
  expect(geometry?.panelAlignedToDock).toBe(true);
  await page.screenshot({
    path: "output/playwright/map-polish-active-search-390x844.png",
    fullPage: true,
  });

  await page.getByRole("button", { name: "Choose what to see on this map" }).click();
  await expect(results).toHaveCount(0);
  await expect(page.getByRole("region", { name: "Choose what to see" })).toBeVisible();
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
      "fr:map-layers:v3",
      JSON.stringify({ transit: true, parking: true }),
    );
  });
  await page.goto("/map?show=none", { waitUntil: "domcontentloaded" });
  await expect(page.locator(".dock-host")).toHaveAttribute("data-map-loaded", "true", {
    timeout: 20_000,
  });

  await page.getByRole("button", { name: "Choose what to see on this map" }).click();
  await page
    .getByRole("region", { name: "Choose what to see" })
    .getByRole("button", { name: /^Get around/ })
    .click();
  const conditions = page.getByRole("region", { name: "Get around" });
  const transit = conditions.getByRole("button", { name: /Transit/ });
  const parking = conditions.getByRole("button", { name: /Parking/ });

  await expect(transit).toHaveAttribute("aria-pressed", "false");
  await expect(parking).toHaveAttribute("aria-pressed", "false");
  await expect(page).toHaveURL(/show=none/);
  await expect
    .poll(() =>
      page.evaluate(() => window.localStorage.getItem("fr:map-layers:v3")),
    )
    .toBe('{"transit":true,"parking":true}');

  await transit.click();
  await expect(page).toHaveURL(/show=transit/);
  await expect
    .poll(() =>
      page.evaluate(() => window.localStorage.getItem("fr:map-layers:v3")),
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
  // The location marker owns the shortest route to urgent public essentials;
  // it should not require opening the general map chooser first.
  const essentialsShortcut = page.getByRole("button", {
    name: "Open nearby essentials from my location",
  });
  await expect(essentialsShortcut).toBeVisible({
    timeout: 10_000,
  });
  await essentialsShortcut.click();
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
