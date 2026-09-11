import { expect, test } from "@playwright/test";

/**
 * Protect the small-screen discovery shell. These checks cover the handoff
 * between the top-bar search action and the map's own search, plus the
 * disclosure hierarchy used by Pulse and Compass.
 */
test.describe("mobile discovery shell", () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test("Find opens as a focused full-screen task surface", async ({ page }) => {
    await page.goto("/today", { waitUntil: "domcontentloaded" });
    // DOMContentLoaded can precede React hydration on a cold dev compile.
    // Wait for the shell to be interactive before exercising its client-only
    // dialog; otherwise the first synthetic tap can land on inert SSR markup.
    await page.waitForLoadState("networkidle");

    const openFind = page.getByRole("button", {
      name: "Ask or find across Frederick County",
    });
    await expect(openFind).toBeVisible();
    await expect(openFind).toHaveAttribute("aria-haspopup", "dialog");
    await expect(openFind).toHaveAttribute("aria-expanded", "false");
    const primaryNav = page.getByRole("navigation", { name: "Primary" });
    await expect(primaryNav.getByRole("link")).toHaveCount(4);
    await expect(primaryNav.getByText("Find", { exact: true })).toHaveCount(0);
    const searchBox = await openFind.boundingBox();
    expect(searchBox?.width ?? 0).toBeGreaterThanOrEqual(40);
    expect(searchBox?.height ?? 0).toBeGreaterThanOrEqual(40);
    await openFind.click();

    const dialog = page.getByRole("dialog", { name: "What do you need?" });
    await expect(dialog).toBeVisible();
    await expect(openFind).toHaveAttribute("aria-controls", "radius-find-dialog");
    await expect(openFind).toHaveAttribute("aria-expanded", "true");
    await expect(
      page.getByRole("searchbox", {
        name: "Ask or find across Frederick County",
      }),
    ).toBeFocused();
    await expect(page.getByRole("button", { name: "Close Find" })).toBeVisible();

    await page.keyboard.press("Escape");
    await expect(dialog).toBeHidden();
    await expect(openFind).toBeFocused();
  });

  test("the map opens calm and reveals choices through one options door", async ({ page }) => {
    test.slow();
    await page.route("**/api/transit/vehicles", async (route) => {
      await route.fulfill({
        json: {
          available: true,
          status: "ok",
          feedTimestamp: Math.floor(Date.now() / 1000),
          vehicles: [
            {
              vehicleId: "test-bus-1",
              routeId: "6154",
              lat: 39.4143,
              lng: -77.4105,
              timestamp: Math.floor(Date.now() / 1000),
            },
            {
              vehicleId: "test-bus-2",
              routeId: "6155",
              lat: 39.421,
              lng: -77.403,
              timestamp: Math.floor(Date.now() / 1000),
            },
          ],
        },
      });
    });
    await page.goto("/map", { waitUntil: "domcontentloaded" });

    const mapFind = page.getByRole("combobox", { name: "Search this map" });
    await expect(mapFind).toHaveAttribute("id", "map-search-input", {
      timeout: 20_000,
    });
    await expect(page.locator(".dock-host")).toHaveAttribute(
      "data-map-loaded",
      "true",
      { timeout: 20_000 },
    );
    await expect(page.locator("[data-map-context-rail]")).toHaveCount(0);
    await expect(page.locator(".map-live-bus-aggregate")).toBeVisible({
      timeout: 20_000,
    });
    await expect(page.locator("[data-live-bus-marker]")).toHaveCount(0);
    const coldDockBox = await page.locator("[data-map-dock] .dock-head").boundingBox();
    const coldMapBox = await page.locator(".dock-host").boundingBox();
    expect(coldDockBox?.y ?? 0).toBeGreaterThan(
      (coldMapBox?.y ?? 0) + (coldMapBox?.height ?? 0) * 0.55,
    );
    await mapFind.click();
    await expect(mapFind).toBeFocused();
    await expect(page.getByRole("dialog")).toHaveCount(0);

    const contentsButton = page.getByRole("button", { name: "Choose what to see on this map" });
    await expect(contentsButton).toBeVisible();
    await expect(page.locator(".map-edge-tool-locate")).toBeHidden();
    // Starting Search retires first-use guidance instead of replacing the
    // active task with a second location control.
    await expect(page.locator(".map-location-offer")).toHaveCount(0);
    await expect(
      page.getByRole("button", { name: "Locate me on the map" }),
    ).toHaveCount(0);
    await expect(page.locator(".map-edge-tool-essential")).toBeHidden();
    const focusedDockBox = await page.locator("[data-map-dock] .dock-head").boundingBox();
    // A focus event alone does not prove that a software keyboard opened.
    // Keep the command at thumb height until visualViewport reports an actual
    // keyboard contraction; moving it on every tap made the map jump under a
    // person's finger on hardware-keyboard and desktop-touch devices.
    expect(
      Math.abs((focusedDockBox?.y ?? 0) - (coldDockBox?.y ?? 0)),
    ).toBeLessThanOrEqual(2);
    // Search plus one explicit choices door; location no longer adds a third
    // command beside the map's primary tasks.
    await expect(page.locator("[data-map-dock] .dock-head > button")).toHaveCount(1);
    await expect(
      page.getByRole("button", { name: /Open map tools|Map tools,/ }),
    ).toHaveCount(0);
    await expect(page.getByText("Live map tools")).toHaveCount(0);
    await expect(page.getByText("No buses reporting right now")).toHaveCount(0);
    await expect(page.locator(".fr-ev-pulse")).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Show list view" })).toHaveCount(0);

    const mapSearch = page.getByRole("combobox", { name: "Search this map" });
    await mapSearch.fill("coffee");
    await expect(page.locator(".dock-search-results")).toBeVisible();
    await contentsButton.click();
    await expect(page.locator(".dock-search-results")).toHaveCount(0);
    const contentsPane = page.getByRole("region", { name: "Choose what to see" });
    await expect(contentsPane).toBeVisible();
    await expect(contentsPane).toBeFocused();
    await expect(
      contentsPane.getByRole("button", { name: /^Nearby/ }),
    ).toBeVisible();
    await expect(contentsPane.getByRole("button", { name: /^Happening/ })).toBeVisible();
    await expect(contentsPane.getByRole("button", { name: /^Get around/ })).toBeVisible();
    await expect(contentsPane.getByRole("button", { name: /^Conditions/ })).toBeVisible();
    await expect(contentsPane.getByRole("button", { name: /^What changed/ })).toBeVisible();
    await expect(contentsPane.getByRole("button", { name: /^More/ })).toBeVisible();
    await expect(contentsPane.getByText("Ready-made views", { exact: true })).toHaveCount(0);
    await contentsPane.getByRole("button", { name: /^Get around/ }).click();
    const busesNow = page
      .getByRole("region", { name: "Get around" })
      .getByRole("button", { name: /^Buses now\./ });
    await expect(busesNow).toContainText("2 live");
    await busesNow.click();
    await expect(page).toHaveURL(/show=transit/);
    await expect(page).toHaveURL(/scene=buses-now/);
    await expect(page.getByRole("group", { name: "Current map view" })).toContainText(
      "2 buses live · current",
      { timeout: 20_000 },
    );
    await expect(page.locator("[data-live-bus-marker]")).toHaveCount(2);
    await page.getByRole("button", { name: "Reset map view" }).click();
    await contentsButton.click();
    await expect(contentsPane).toBeVisible();

    await contentsPane
      .getByRole("button", { name: /^Get around/ })
      .click();
    const layersPane = page.getByRole("region", { name: "Get around" });
    await expect(layersPane).toBeVisible();
    await expect(layersPane.getByRole("button", { name: /Transit/ })).toBeVisible();
    await expect(layersPane.getByRole("button", { name: /Radar/ })).toHaveCount(0);
    await expect(layersPane.getByRole("button", { name: "Back" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Done" })).toBeVisible();
    await expect(layersPane.getByRole("button", { name: /Trails/ })).toHaveCount(0);
    await layersPane.getByRole("button", { name: "Back" }).click();
    await contentsPane.getByRole("button", { name: /^More/ }).click();
    const localLayersPane = page.getByRole("region", { name: "More map details" });
    await expect(localLayersPane).toBeVisible();
    await expect(localLayersPane.getByRole("button", { name: /Trails/ })).toBeVisible();
    await localLayersPane.getByRole("button", { name: "Back" }).click();
    await contentsPane.getByRole("button", { name: /^Get around/ }).click();
    const transit = layersPane.getByRole("button", { name: /Transit/ });
    await expect(transit).toHaveAttribute("aria-pressed", "false");
    await transit.click();
    await expect(layersPane).toBeVisible();
    await layersPane.getByRole("button", { name: "Done" }).click();
    await expect(contentsButton).toBeFocused();
    await expect(contentsButton).toContainText("What to see");
    // Active state is explained in words by the context rail. The old
    // unitless count badge was deliberately removed from the Browse control.
    await expect(contentsButton.locator(".dock-layer-count")).toHaveCount(0);

    const contextRail = page.getByRole("group", { name: "Current map view" });
    await expect(page.locator(".dock-host")).toHaveAttribute(
      "data-map-loaded",
      "true",
      { timeout: 20_000 },
    );
    await expect(contextRail).toBeVisible();
    await expect(contextRail).not.toContainText("Showing");
    await expect(contextRail).toContainText("County · Transit");
    await expect(contextRail).toContainText("2 buses live · current");
    await expect(page.locator(".dock-active-state")).toHaveCount(0);

    const contextBox = await contextRail.boundingBox();
    const activeDockBox = await page.locator("[data-map-dock] .dock-head").boundingBox();
    expect(contextBox?.height ?? 0).toBeGreaterThanOrEqual(44);
    expect(activeDockBox?.y ?? 0).toBeGreaterThan(contextBox?.y ?? 9999);
    const contextActions = contextRail.getByRole("button");
    // The rail is a status readout with one Reset action. Editing stays behind
    // the consistent What to see control instead of making the readout itself
    // behave like a second unlabeled door.
    await expect(contextActions).toHaveCount(1);
    for (const action of await contextActions.all()) {
      const box = await action.boundingBox();
      expect(Math.round(box?.height ?? 0)).toBeGreaterThanOrEqual(44);
    }
    const topFurnitureOverlaps = await page.evaluate(() => {
      const rail = document.querySelector<HTMLElement>("[data-map-context-rail]");
      if (!rail) return true;
      const a = rail.getBoundingClientRect();
      const intersects = (b: DOMRect) =>
        a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
      return [
        document.querySelector<HTMLElement>(
          ".mapboxgl-ctrl-logo, .maplibregl-ctrl-logo",
        ),
        document.querySelector<HTMLElement>(
          ".mapboxgl-ctrl-attrib, .maplibregl-ctrl-attrib",
        ),
      ]
        .filter((element): element is HTMLElement => Boolean(element?.offsetParent))
        .some((element) => intersects(element.getBoundingClientRect()));
    });
    expect(topFurnitureOverlaps).toBe(false);

    await contentsButton.click();
    const focusContainedPane = page.getByRole("region", {
      name: "Choose what to see",
    });
    await expect(focusContainedPane).toBeVisible();
    await expect(focusContainedPane).toBeFocused();
    await page.keyboard.press("Tab");
    await expect(
      focusContainedPane.getByRole("button", { name: "Done" }),
    ).toBeFocused();
    await page.keyboard.press("Shift+Tab");
    await expect.poll(() =>
      page.evaluate(() =>
        Boolean(
          document
            .querySelector("#dock-pane")
            ?.contains(document.activeElement),
        ),
      ),
    ).toBe(true);
    await page.keyboard.press("Escape");
    await expect(contentsButton).toBeFocused();

    await contentsButton.click();
    await page
      .getByRole("region", { name: "Choose what to see" })
      .getByRole("button", { name: /^Get around/ })
      .click();
    const reopenedLayersPane = page.getByRole("region", { name: "Get around" });
    await expect(
      reopenedLayersPane.getByRole("button", { name: /Transit/ }),
    ).toHaveAttribute("aria-pressed", "true");
    await page.keyboard.press("Escape");
    await expect(reopenedLayersPane).toBeHidden();

    await contentsButton.click();
    await expect(page.getByRole("region", { name: "Choose what to see" })).toBeVisible();
    await page
      .locator(".mapboxgl-canvas, .maplibregl-canvas")
      .click({ position: { x: 12, y: 100 } });
    await expect(page.getByRole("region", { name: "Choose what to see" })).toBeHidden();

    await contentsButton.click();
    const finalContentsPane = page.getByRole("region", {
      name: "Choose what to see",
    });
    await finalContentsPane
      .getByRole("button", { name: /^Nearby/ })
      .click();
    const placesPane = page.getByRole("region", { name: "Find nearby" });
    await expect(placesPane).toBeVisible();
    await expect(placesPane.getByText("All place categories")).toBeVisible();
    const withinReach = placesPane.getByRole("button", {
      name: /^Compare travel reach/,
    });
    await withinReach.click();
    await expect(placesPane).toBeHidden();
    await expect(page).toHaveURL(/\/map\?mode=radius(?:&c=[^&]+)?$/);
    const countyMap = page.getByRole("link", { name: "Back to county map" });
    await expect(countyMap).toBeVisible();
    await countyMap.click();
    await expect(page).toHaveURL(/[?&]mode=browse(?:&|$)/);
    await expect(page.getByRole("combobox", { name: "Search this map" })).toBeVisible();
  });

  test("focused search surfaces keep one route-owned query instead of duplicating global Find", async ({ page }) => {
    await page.goto("/search", { waitUntil: "domcontentloaded" });
    await expect(page.getByRole("searchbox", { name: "Search Frederick County" })).toBeVisible();
    await expect(
      page.getByRole("button", {
        name: "Ask or find across Frederick County",
      }),
    ).toHaveCount(0);

    await page.goto("/compass", { waitUntil: "domcontentloaded" });
    await expect(
      page.getByRole("searchbox", { name: /Search Radius tools/ }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", {
        name: "Ask or find across Frederick County",
      }),
    ).toHaveCount(0);
  });

  test("required map credits stay compact and never overlap the Radius HUD on a narrow phone", async ({ page }) => {
    test.setTimeout(60_000);
    await page.setViewportSize({ width: 320, height: 568 });
    await page.goto("/map?show=transit", { waitUntil: "domcontentloaded" });
    await expect(page.locator(".dock-host")).toHaveAttribute(
      "data-map-loaded",
      "true",
      { timeout: 30_000 },
    );
    const attribution = page.locator(
      ".mapboxgl-ctrl-attrib, .maplibregl-ctrl-attrib",
    );
    await expect(attribution).not.toHaveClass(
      /(mapboxgl|maplibregl)-compact-show/,
    );

    const geometry = await page.evaluate(() => {
      const host = document.querySelector<HTMLElement>(".dock-host");
      const rail = document.querySelector<HTMLElement>("[data-map-context-rail]");
      const attribution = document.querySelector<HTMLElement>(
        ".mapboxgl-ctrl-attrib, .maplibregl-ctrl-attrib",
      );
      if (!host || !rail || !attribution) return null;
      const hostBox = host.getBoundingClientRect();
      const railBox = rail.getBoundingClientRect();
      const intersects = (first: DOMRect, second: DOMRect) =>
        first.left < second.right &&
        first.right > second.left &&
        first.top < second.bottom &&
        first.bottom > second.top;
      return {
        insideHost:
          railBox.left >= hostBox.left &&
          railBox.right <= hostBox.right &&
          railBox.top >= hostBox.top &&
          railBox.bottom <= hostBox.bottom,
        overlapsAttribution: intersects(
          railBox,
          attribution.getBoundingClientRect(),
        ),
        documentOverflow:
          document.documentElement.scrollWidth - window.innerWidth,
      };
    });

    expect(geometry).not.toBeNull();
    expect(geometry?.insideHost).toBe(true);
    expect(geometry?.overlapsAttribution).toBe(false);
    expect(geometry?.documentOverflow ?? 999).toBeLessThanOrEqual(1);

    await page.locator(
      ".mapboxgl-ctrl-attrib-button, .maplibregl-ctrl-attrib-button",
    ).click();
    await expect(attribution).toHaveClass(
      /(mapboxgl|maplibregl)-compact-show/,
    );
    const expandedCredits = await page.evaluate(() => {
      const host = document.querySelector<HTMLElement>(".dock-host");
      const attribution = document.querySelector<HTMLElement>(
        ".mapboxgl-ctrl-attrib, .maplibregl-ctrl-attrib",
      );
      const attributionCopy = attribution?.querySelector<HTMLElement>(
        ".mapboxgl-ctrl-attrib-inner, .maplibregl-ctrl-attrib-inner",
      );
      const attributionButton = attribution?.querySelector<HTMLElement>(
        ".mapboxgl-ctrl-attrib-button, .maplibregl-ctrl-attrib-button",
      );
      if (
        !host ||
        !attribution ||
        !attributionCopy ||
        !attributionButton
      ) {
        return null;
      }
      const hostBox = host.getBoundingClientRect();
      const attributionBox = attribution.getBoundingClientRect();
      const copyBox = attributionCopy.getBoundingClientRect();
      const buttonBox = attributionButton.getBoundingClientRect();
      return {
        insideHost:
          attributionBox.left >= hostBox.left &&
          attributionBox.right <= hostBox.right &&
          attributionBox.top >= hostBox.top &&
          attributionBox.bottom <= hostBox.bottom,
        copyClearsButton: copyBox.right <= buttonBox.left,
        documentOverflow: document.documentElement.scrollWidth - window.innerWidth,
      };
    });

    expect(expandedCredits).not.toBeNull();
    expect(expandedCredits?.insideHost).toBe(true);
    expect(expandedCredits?.copyClearsButton).toBe(true);
    expect(expandedCredits?.documentOverflow ?? 999).toBeLessThanOrEqual(1);
  });

  test("map options never create a sideways or document scroll trap", async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 568 });
    await page.goto("/map", { waitUntil: "domcontentloaded" });

    const contentsButton = page.getByRole("button", { name: "Choose what to see on this map" });
    await expect(contentsButton).toBeVisible();
    const dockBox = await page.locator("[data-map-dock] .dock-head").boundingBox();
    expect(dockBox?.height ?? 999).toBeLessThanOrEqual(60);

    await contentsButton.click();
    const pane = page.getByRole("region", { name: "Choose what to see" });
    await expect(pane).toBeFocused();
    const paneBox = await pane.boundingBox();
    const mapBox = await page.locator(".dock-host").boundingBox();
    expect((paneBox?.height ?? 999) / (mapBox?.height ?? 1)).toBeLessThanOrEqual(0.72);
    const optionsGrid = pane.locator(".dock-content-list");
    const gridOverflow = await optionsGrid.evaluate((element) => ({
      horizontal: element.scrollWidth - element.clientWidth,
      vertical: element.scrollHeight - element.clientHeight,
    }));
    expect(gridOverflow.horizontal).toBeLessThanOrEqual(1);
    expect(gridOverflow.vertical).toBeLessThanOrEqual(1);
    expect(
      await page.evaluate(() => document.documentElement.scrollHeight - window.innerHeight),
    ).toBeLessThanOrEqual(1);

    const paneScroll = page.locator("#dock-pane .dock-pane-scroll");
    await pane
      .getByRole("button", { name: /^Get around/ })
      .click();
    const layersPane = page.getByRole("region", { name: "Get around" });
    await expect(layersPane).toBeVisible();
    const layersPaneBox = await layersPane.boundingBox();
    expect((layersPaneBox?.height ?? 999) / (mapBox?.height ?? 1)).toBeLessThanOrEqual(0.72);
    expect(await paneScroll.evaluate((element) => element.scrollTop)).toBeLessThanOrEqual(1);
    expect(
      await paneScroll.evaluate((element) => element.scrollWidth - element.clientWidth),
    ).toBeLessThanOrEqual(1);
    await expect(page.getByRole("button", { name: "Back" })).toBeVisible();

    await page.keyboard.press("Escape");
    await page.setViewportSize({ width: 390, height: 844 });
    await page.reload({ waitUntil: "domcontentloaded" });
    const regularContents = page.getByRole("button", { name: "Choose what to see on this map" });
    await regularContents.click();
    const regularMapBox = await page.locator(".dock-host").boundingBox();
    const regularContentsBox = await page
      .getByRole("region", { name: "Choose what to see" })
      .boundingBox();
    expect(
      (regularContentsBox?.height ?? 999) / (regularMapBox?.height ?? 1),
    ).toBeLessThanOrEqual(0.68);
    expect(
      await page
        .getByRole("region", { name: "Choose what to see" })
        .locator(".dock-content-list")
        .evaluate((element) => element.scrollWidth - element.clientWidth),
    ).toBeLessThanOrEqual(1);
    await page
      .getByRole("region", { name: "Choose what to see" })
      .getByRole("button", { name: /^Get around/ })
      .click();
    const regularLayersBox = await page
      .getByRole("region", { name: "Get around" })
      .boundingBox();
    expect(
      (regularLayersBox?.height ?? 999) / (regularMapBox?.height ?? 1),
    ).toBeLessThanOrEqual(0.68);

    await page.keyboard.press("Escape");
    await page.setViewportSize({ width: 844, height: 390 });
    await page.reload({ waitUntil: "domcontentloaded" });
    const landscapeContents = page.getByRole("button", { name: "Choose what to see on this map" });
    await expect(landscapeContents).toBeVisible();
    await expect(page.getByRole("combobox", { name: "Search this map" })).toBeVisible();
    await landscapeContents.click();
    const landscapePane = page.getByRole("region", { name: "Choose what to see" });
    const landscapePaneBox = await landscapePane.boundingBox();
    expect((landscapePaneBox?.height ?? 999) / (await page.locator(".dock-host").boundingBox())!.height)
      .toBeLessThanOrEqual(0.72);
    expect(
      await landscapePane
        .locator(".dock-content-list")
        .evaluate((element) => element.scrollWidth - element.clientWidth),
    ).toBeLessThanOrEqual(1);
    await expect(landscapePane).toBeVisible();
    await expect(landscapeContents).toBeHidden();
  });

  test("the county reset appears after a same-zoom pan clips the overview", async ({ page }) => {
    await page.goto("/map?c=-77.6196,39.4705,8.63", { waitUntil: "domcontentloaded" });
    await expect(page.locator(".dock-host")).toHaveAttribute(
      "data-map-loaded",
      "true",
      { timeout: 20_000 },
    );

    const reset = page.getByRole("button", { name: "Show the whole county" });
    await expect(reset).toBeVisible({ timeout: 20_000 });
    await reset.click();
    await expect(reset).toBeHidden();
  });

  test("the map renders Frederick Radius place marks, not only hit targets", async ({ page }) => {
    await page.goto("/map?c=-77.4105,39.4143,11.5", {
      waitUntil: "domcontentloaded",
    });

    await expect(page.locator("[data-map-place-marks]")).toHaveAttribute(
      "data-map-place-marks",
      "ready",
      { timeout: 20_000 },
    );
  });

  test("explicit transit and GIS links keep the requested map content", async ({ page }) => {
    test.setTimeout(60_000);
    await page.goto(
      "/map?amenity=restroom&show=transit&layers=art",
      {
      waitUntil: "domcontentloaded",
      },
    );
    await expect(page.locator("[data-map-amenity-marks]")).toHaveAttribute(
      "data-map-amenity-marks",
      "ready",
      { timeout: 20_000 },
    );
    await page.getByRole("button", { name: "Choose what to see on this map" }).click();
    await page
      .getByRole("button", { name: /^Get around/ })
      .click();
    await page
      .getByRole("region", { name: "Get around" })
      .getByRole("button", { name: "Clear layers" })
      .click();
    await expect(page).not.toHaveURL(/amenity=/);
    await expect(page).not.toHaveURL(/show=/);
    await expect(page).not.toHaveURL(/layers=/);
    await expect(page.locator("[data-map-amenity-marks]")).toHaveAttribute(
      "data-map-amenity-marks",
      "off",
    );
    await page.reload({ waitUntil: "domcontentloaded" });
    await expect(page).not.toHaveURL(/amenity=|show=|layers=/);
    await page.getByRole("button", { name: "Choose what to see on this map" }).click();
    await page
      .getByRole("button", { name: /^Get around/ })
      .click();
    await expect(
      page.getByRole("region", { name: "Get around" }).getByRole("button", {
        name: /Transit/,
      }),
    ).toHaveAttribute("aria-pressed", "false");
    await page.getByRole("region", { name: "Get around" }).getByRole("button", { name: "Back" }).click();
    await page.getByRole("region", { name: "Choose what to see" }).getByRole("button", { name: /^More/ }).click();
    await expect(
      page.getByRole("region", { name: "More map details" }).getByRole("button", {
        name: /Public art/,
      }),
    ).toHaveCount(0);

    await page.goto("/map?at=39.4142,-77.4105&show=transit", {
      waitUntil: "domcontentloaded",
    });
    await page.getByRole("button", { name: "Choose what to see on this map" }).click();
    await page
      .getByRole("button", { name: /^Get around/ })
      .click();
    await expect(
      page.getByRole("region", { name: "Get around" }).getByRole("button", {
        name: /Transit/,
      }),
    ).toHaveAttribute("aria-pressed", "true");

    await page.goto("/map?mode=browse&layers=art", {
      waitUntil: "domcontentloaded",
    });
    await expect(page).toHaveURL(/layers=art/);
    await page.getByRole("button", { name: "Choose what to see on this map" }).click();
    await page.getByRole("button", { name: /^More/ }).click();
    await expect(
      page.getByRole("region", { name: "More map details" }).getByRole("button", {
        name: /Public art/,
      }),
    ).toHaveCount(0);
  });

  test("a public-essential link never selects an empty map layer", async ({ page }) => {
    await page.route("**/api/map/osm", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: "[]",
      });
    });
    await page.goto("/map?amenity=safety", {
      waitUntil: "domcontentloaded",
    });

    await expect(page).not.toHaveURL(/amenity=safety/);
    await expect(page.locator("[data-map-amenity-marks]")).toHaveAttribute(
      "data-map-amenity-marks",
      "off",
    );
    await expect(
      page.getByText(/No verified map points are available yet for AED & shelter/),
    ).toBeVisible();
  });

  test("event windows clear contradictory live-music state and hide empty choices", async ({ page }) => {
    await page.goto("/map?music=tonight&t=weekend", {
      waitUntil: "domcontentloaded",
    });
    await page.getByRole("button", { name: "Choose what to see on this map" }).click();
    await page.getByRole("button", { name: /^Happening/ }).click();

    // The active music lens keeps Tonight reachable even when the event count
    // is zero. Other windows may appear only when they have real inventory.
    await page.getByRole("button", { name: /^Tonight\b/i }).click();
    await expect(page).toHaveURL(/t=tonight/);
    await expect(page).not.toHaveURL(/music=/);

    // Weekend is optional because inventory is live. Tonight and the music
    // state below carry the actual contract this journey is verifying.

    const liveMusic = page.getByRole("button", { name: /Live music tonight/ });
    if (await liveMusic.count()) {
      await liveMusic.click();
      await expect(page).toHaveURL(/music=tonight/);
      await expect(page).not.toHaveURL(/[?&]t=/);
    } else {
      // A zero-count live-music control is not a useful choice and should not
      // occupy the task sheet merely to make an internal-state test possible.
      await expect(liveMusic).toHaveCount(0);
    }
  });

  test("Compass search stays useful without creating horizontal overflow", async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 568 });
    await page.goto("/compass", { waitUntil: "domcontentloaded" });

    await expect(
      page.getByRole("heading", { level: 1, name: "What do you need?" }),
    ).toBeVisible();
    const toolSearch = page.getByRole("searchbox", {
      name: /Search Radius tools/,
    });
    await expect(toolSearch).toBeVisible();
    await expect(page.locator("[data-compass-ready]")).toHaveAttribute(
      "data-compass-ready",
      "true",
    );
    const pinned = page.locator(
      'section[aria-labelledby="compass-pinned-heading"]',
    );
    for (const label of [
      "Ask Radius",
      "Near me",
      "Live conditions",
      "Nearby essentials",
    ]) {
      await expect(
        pinned.getByRole("link", { name: new RegExp(`^${label}\\b`) }),
      ).toBeVisible();
    }
    for (const shortcut of await pinned.getByRole("link").all()) {
      const box = await shortcut.boundingBox();
      expect(box).not.toBeNull();
      expect((box?.x ?? 999) + (box?.width ?? 999)).toBeLessThanOrEqual(320);
    }

    await toolSearch.fill("coffee");
    await expect(toolSearch).toHaveAttribute("type", "text");
    await expect(toolSearch).toHaveAttribute("inputmode", "search");
    await expect(page.getByRole("button", { name: "Clear tool search" })).toHaveCount(1);
    await expect(page.getByRole("link", { name: /Search Frederick for “coffee”/ })).toHaveAttribute("href", "/search?q=coffee");
    await expect(page.getByRole("link", { name: /Search Frederick for “coffee”/ })).toHaveCount(1);
    await toolSearch.fill("ask");
    await expect(page.getByRole("link", { name: /^Ask Radius\b/ })).toHaveCount(1);
    await toolSearch.fill("weather");
    await expect(page.getByRole("link", { name: /Live conditions/ })).toHaveAttribute("href", "/pulse");
    await toolSearch.fill("");

    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      ),
    ).toBeLessThanOrEqual(1);

    await page.getByRole("button", { name: "Edit" }).click();
    const dialog = page.getByRole("dialog", { name: "Edit shortcuts" });
    await expect(dialog).toBeVisible();
    await expect(dialog.getByRole("searchbox")).toHaveCount(1);
    expect(
      await dialog.evaluate((element) => element.scrollWidth - element.clientWidth),
    ).toBeLessThanOrEqual(1);
  });

  test("search does not turn unrelated typo fragments into a local match", async ({ page }) => {
    await page.goto("/search?q=zzzxxyy-no-match", { waitUntil: "domcontentloaded" });

    await expect(page.getByText(/There are no matches for/)).toContainText(
      "zzzxxyy-no-match",
    );
    await expect(page.getByRole("link", { name: /New Market Grange/ })).toHaveCount(0);
  });

  test("place detail keeps nearby suggestions useful and anchored", async ({ page }) => {
    await page.goto("/places/brewers-alley-frederick", {
      waitUntil: "domcontentloaded",
    });

    await expect(page.getByRole("heading", { name: "Nearby" })).toBeVisible();
    await expect(page.getByRole("link", { name: "View area" })).toHaveAttribute(
      "href",
      "/map?c=-77.41046,39.41609,15.5",
    );
    await expect(page.getByText("St Johns Catholic Prep School")).toHaveCount(0);
    await expect(page.getByText("Claiming is coming soon")).toHaveCount(0);
    await expect(
      page.getByRole("link", { name: "Report incorrect info" }),
    ).toHaveAttribute("href", /mailto:hello@frederickradius\.app/);
  });

  test("Pulse leads with a compact live briefing", async ({ page }) => {
    await page.goto("/pulse", { waitUntil: "domcontentloaded" });
    await expect(page.getByText("Frederick Pulse", { exact: true })).toBeVisible();
    const quietDisclosure = page.locator(
      'section[aria-labelledby="pulse-secondary-heading"] details',
    );
    await expect(quietDisclosure.locator("summary")).toContainText(/source/i);
    await expect(quietDisclosure).not.toHaveAttribute("open", "");
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBe(true);
    await quietDisclosure.locator("summary").click();
    const firstSource = quietDisclosure
      .locator("#pulse-local-updates")
      .getByRole("button")
      .first();
    await expect(firstSource).toBeVisible();
    await expect(firstSource).toHaveAttribute("aria-label", /Source:/);
    await firstSource.click();
    await expect(page.getByRole("dialog")).toBeVisible();
  });
});
