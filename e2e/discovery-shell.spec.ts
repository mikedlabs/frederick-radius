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
    await page.goto("/map", { waitUntil: "domcontentloaded" });

    const mapFind = page.getByRole("searchbox", { name: "Search this map" });
    await expect(mapFind).toHaveAttribute("id", "map-search-input");
    await mapFind.click();
    await expect(mapFind).toBeFocused();
    await expect(page.getByRole("dialog")).toHaveCount(0);

    const contentsButton = page.getByRole("button", { name: "Map options" });
    await expect(contentsButton).toBeVisible();
    await expect(page.locator("[data-map-dock] .dock-head button")).toHaveCount(1);
    await expect(page.getByText("No buses reporting right now")).toHaveCount(0);
    await expect(page.locator(".fr-ev-pulse")).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Show list view" })).toHaveCount(0);

    const mapSearch = page.getByRole("searchbox", { name: "Search this map" });
    await mapSearch.fill("coffee");
    await expect(page.locator(".dock-search-results")).toBeVisible();
    await contentsButton.click();
    await expect(page.locator(".dock-search-results")).toHaveCount(0);
    const contentsPane = page.getByRole("region", { name: "Map options" });
    await expect(contentsPane).toBeVisible();
    await expect(contentsPane).toBeFocused();
    await expect(contentsPane.getByRole("button", { name: /Places and businesses/ })).toBeVisible();
    await expect(contentsPane.getByRole("button", { name: /Events and time/ })).toBeVisible();
    await expect(contentsPane.getByRole("button", { name: /Public essentials/ })).toBeVisible();

    await contentsPane
      .getByRole("button", { name: "Live and reference map layers" })
      .click();
    const layersPane = page.getByRole("region", { name: "Map layers" });
    await expect(layersPane).toBeVisible();
    await expect(layersPane.getByRole("button", { name: /Transit/ })).toBeVisible();
    await expect(layersPane.getByRole("button", { name: /Radar/ })).toBeVisible();
    await expect(layersPane.getByRole("button", { name: "Back" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Done" })).toBeVisible();
    const moreLocalLayers = layersPane.getByRole("button", { name: "More local layers" });
    await expect(moreLocalLayers).toBeVisible();
    await expect(layersPane.getByRole("button", { name: /Trails/ })).toHaveCount(0);
    await moreLocalLayers.click();
    const localLayersPane = page.getByRole("region", { name: "Local layers" });
    await expect(localLayersPane).toBeVisible();
    await expect(localLayersPane.getByRole("button", { name: /Trails/ })).toBeVisible();
    await localLayersPane.getByRole("button", { name: "Back" }).click();
    await expect(layersPane).toBeVisible();
    const transit = layersPane.getByRole("button", { name: /Transit/ });
    await expect(transit).toHaveAttribute("aria-pressed", "false");
    await transit.click();
    await expect(transit).toHaveAttribute("aria-pressed", "true");

    await page.keyboard.press("Escape");
    await expect(layersPane).toBeHidden();
    await expect(contentsButton).toBeFocused();
    await expect(contentsButton).toContainText("Options");
    await expect(contentsButton.locator(".dock-layer-count")).toHaveText("1");

    await contentsButton.click();
    await expect(page.getByRole("region", { name: "Map options" })).toBeVisible();
    await page.locator(".mapboxgl-canvas").click({ position: { x: 12, y: 300 } });
    await expect(page.getByRole("region", { name: "Map options" })).toBeHidden();
  });

  test("focused search surfaces keep their local query and the permanent global find", async ({ page }) => {
    await page.goto("/search", { waitUntil: "domcontentloaded" });
    await expect(page.getByRole("searchbox", { name: "Search Frederick County" })).toBeVisible();
    await expect(
      page.getByRole("button", {
        name: "Ask or find across Frederick County",
      }),
    ).toBeVisible();

    await page.goto("/compass", { waitUntil: "domcontentloaded" });
    await expect(page.getByRole("searchbox", { name: "Search all tools" })).toBeVisible();
    await expect(
      page.getByRole("button", {
        name: "Ask or find across Frederick County",
      }),
    ).toBeVisible();
  });

  test("map options never create a sideways or document scroll trap", async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 568 });
    await page.goto("/map", { waitUntil: "domcontentloaded" });

    const contentsButton = page.getByRole("button", { name: "Map options" });
    await expect(contentsButton).toBeVisible();
    const dockBox = await page.locator("[data-map-dock] .dock-head").boundingBox();
    expect(dockBox?.height ?? 999).toBeLessThanOrEqual(60);

    await contentsButton.click();
    const pane = page.getByRole("region", { name: "Map options" });
    await expect(pane).toBeFocused();
    const paneBox = await pane.boundingBox();
    const mapBox = await page.locator(".dock-host").boundingBox();
    expect((paneBox?.height ?? 999) / (mapBox?.height ?? 1)).toBeLessThanOrEqual(0.58);
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
      .getByRole("button", { name: "Live and reference map layers" })
      .click();
    const layersPane = page.getByRole("region", { name: "Map layers" });
    await expect(layersPane).toBeVisible();
    const layersPaneBox = await layersPane.boundingBox();
    expect((layersPaneBox?.height ?? 999) / (mapBox?.height ?? 1)).toBeLessThanOrEqual(0.58);
    expect(await paneScroll.evaluate((element) => element.scrollTop)).toBeLessThanOrEqual(1);
    expect(
      await paneScroll.evaluate((element) => element.scrollWidth - element.clientWidth),
    ).toBeLessThanOrEqual(1);
    await expect(page.getByRole("button", { name: "Back" })).toBeVisible();

    await page.keyboard.press("Escape");
    await page.setViewportSize({ width: 390, height: 844 });
    await page.reload({ waitUntil: "domcontentloaded" });
    const regularContents = page.getByRole("button", { name: "Map options" });
    await regularContents.click();
    const regularMapBox = await page.locator(".dock-host").boundingBox();
    const regularContentsBox = await page
      .getByRole("region", { name: "Map options" })
      .boundingBox();
    expect(
      (regularContentsBox?.height ?? 999) / (regularMapBox?.height ?? 1),
    ).toBeLessThanOrEqual(0.42);
    expect(
      await page
        .getByRole("region", { name: "Map options" })
        .locator(".dock-content-list")
        .evaluate((element) => element.scrollWidth - element.clientWidth),
    ).toBeLessThanOrEqual(1);
    await page
      .getByRole("region", { name: "Map options" })
      .getByRole("button", { name: "Live and reference map layers" })
      .click();
    const regularLayersBox = await page
      .getByRole("region", { name: "Map layers" })
      .boundingBox();
    expect(
      (regularLayersBox?.height ?? 999) / (regularMapBox?.height ?? 1),
    ).toBeLessThanOrEqual(0.5);

    await page.keyboard.press("Escape");
    await page.setViewportSize({ width: 844, height: 390 });
    await page.reload({ waitUntil: "domcontentloaded" });
    const landscapeContents = page.getByRole("button", { name: "Map options" });
    await expect(landscapeContents).toBeVisible();
    await expect(page.getByRole("searchbox", { name: "Search this map" })).toBeVisible();
    await landscapeContents.click();
    const landscapePane = page.getByRole("region", { name: "Map options" });
    const landscapePaneBox = await landscapePane.boundingBox();
    expect((landscapePaneBox?.height ?? 999) / (await page.locator(".dock-host").boundingBox())!.height)
      .toBeLessThanOrEqual(0.58);
    expect(
      await landscapePane
        .locator(".dock-content-list")
        .evaluate((element) => element.scrollWidth - element.clientWidth),
    ).toBeLessThanOrEqual(1);
    await expect(landscapeContents).toBeVisible();
    await expect(landscapeContents).toHaveAttribute("aria-expanded", "true");
  });

  test("the county reset appears after a same-zoom pan clips the overview", async ({ page }) => {
    await page.goto("/map?c=-77.6196,39.4705,8.63", { waitUntil: "domcontentloaded" });

    const reset = page.getByRole("button", { name: "Show the whole county" });
    await expect(reset).toBeVisible();
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
    );
  });

  test("explicit transit and GIS links keep the requested map content", async ({ page }) => {
    await page.goto(
      "/map?amenity=restroom&show=transit,firestations&layers=art,parks",
      {
      waitUntil: "domcontentloaded",
      },
    );
    await expect(page.locator("[data-map-amenity-marks]")).toHaveAttribute(
      "data-map-amenity-marks",
      "ready",
    );
    await page.getByRole("button", { name: "Map options" }).click();
    await page
      .getByRole("button", { name: "Live and reference map layers" })
      .click();
    await page.getByRole("button", { name: "Hide all map layers" }).click();
    await expect(page).not.toHaveURL(/amenity=/);
    await expect(page).not.toHaveURL(/show=/);
    await expect(page).not.toHaveURL(/layers=/);
    await expect(page.locator("[data-map-amenity-marks]")).toHaveAttribute(
      "data-map-amenity-marks",
      "off",
    );
    await page.reload({ waitUntil: "domcontentloaded" });
    await expect(page).not.toHaveURL(/amenity=|show=|layers=/);
    await page.getByRole("button", { name: "Map options" }).click();
    await page
      .getByRole("button", { name: "Live and reference map layers" })
      .click();
    await expect(
      page.getByRole("region", { name: "Map layers" }).getByRole("button", {
        name: /Transit/,
      }),
    ).toHaveAttribute("aria-pressed", "false");
    await page
      .getByRole("region", { name: "Map layers" })
      .getByRole("button", { name: "More local layers" })
      .click();
    await expect(
      page.getByRole("region", { name: "Local layers" }).getByRole("button", {
        name: /Public art/,
      }),
    ).toHaveAttribute("aria-pressed", "false");

    await page.goto("/map?at=39.4142,-77.4105&show=transit", {
      waitUntil: "domcontentloaded",
    });
    await page.getByRole("button", { name: "Map options" }).click();
    await page
      .getByRole("button", { name: "Live and reference map layers" })
      .click();
    await expect(
      page.getByRole("region", { name: "Map layers" }).getByRole("button", {
        name: /Transit/,
      }),
    ).toHaveAttribute("aria-pressed", "true");

    await page.goto("/map?mode=browse&layers=art", {
      waitUntil: "domcontentloaded",
    });
    await expect(page).toHaveURL(/layers=art/);
    await page.getByRole("button", { name: "Map options" }).click();
    await page
      .getByRole("button", { name: "Live and reference map layers" })
      .click();
    await page
      .getByRole("region", { name: "Map layers" })
      .getByRole("button", { name: "More local layers" })
      .click();
    await expect(
      page.getByRole("region", { name: "Local layers" }).getByRole("button", {
        name: /Public art/,
      }),
    ).toHaveAttribute("aria-pressed", "true");
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

  test("event windows and live music never leave contradictory hidden state", async ({ page }) => {
    await page.goto("/map?music=tonight&t=weekend", {
      waitUntil: "domcontentloaded",
    });
    await page.getByRole("button", { name: "Map options" }).click();
    await page.getByRole("button", { name: /Events and time/ }).click();

    await page.getByRole("button", { name: /weekend/i }).click();
    await expect(page).toHaveURL(/t=weekend/);
    await expect(page).not.toHaveURL(/music=/);

    await page.getByRole("button", { name: /Live music tonight/ }).click();
    await expect(page).toHaveURL(/music=tonight/);
    await expect(page).not.toHaveURL(/[?&]t=/);
  });

  test("All tools starts with quick access and reveals one chosen outcome", async ({ page }) => {
    await page.goto("/compass", { waitUntil: "domcontentloaded" });

    const toolSearch = page.getByRole("searchbox", { name: "Search all tools" });
    await expect(toolSearch).toBeVisible();
    await expect(toolSearch).toHaveAttribute("data-compass-ready", "true");
    await expect(page.getByRole("navigation", { name: "Start here" })).toBeVisible();

    await toolSearch.fill("coffee");
    await expect(toolSearch).toHaveAttribute("type", "text");
    await expect(toolSearch).toHaveAttribute("inputmode", "search");
    await expect(page.getByRole("button", { name: "Clear tool filter" })).toHaveCount(1);
    await expect(page.getByRole("link", { name: /Search Frederick for “coffee”/ })).toHaveAttribute("href", "/search?q=coffee");
    await toolSearch.fill("weather");
    await expect(page.getByRole("link", { name: /Live conditions/ })).toHaveAttribute("href", "/pulse");
    await toolSearch.fill("");

    const outcomes = page.getByRole("group", { name: "Choose what you need" });
    const goingOut = outcomes.getByRole("button", { name: /Eat, drink, or go out/ });
    const explore = outcomes.getByRole("button", { name: /Explore Frederick/ });
    await expect(goingOut).toHaveAttribute("aria-expanded", "false");
    await explore.click();
    await expect(goingOut).toHaveAttribute("aria-expanded", "false");
    await expect(explore).toHaveAttribute("aria-expanded", "true");
    await expect(page.getByRole("heading", { name: "Outdoors" })).toBeVisible();
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
    await expect(page.getByRole("heading", { name: /At a glance|Other conditions/ })).toBeVisible();
    await expect(page.getByText("Open for details")).toBeVisible();
  });
});
