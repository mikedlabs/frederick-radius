import { expect, test } from "@playwright/test";

test.describe("map search selection", () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test("opens the same place slug the user selected", async ({ page }) => {
    await page.goto("/map", { waitUntil: "domcontentloaded" });

    const search = page.getByRole("combobox", { name: "Search this map" });
    await expect(search).toBeVisible({ timeout: 20_000 });
    await search.fill("Market Street Boba Beans");

    const selectedResult = page.locator(
      '[data-map-search-result="place:market-street-boba-beans"]',
    );
    await expect(selectedResult).toBeVisible({ timeout: 10_000 });
    await selectedResult.click();

    await expect(page.locator(".dock-search-results")).toHaveCount(0);
    await expect(
      page.locator('[data-map-place-slug="market-street-boba-beans"]'),
    ).toBeVisible();
    await expect(page.locator("[data-map-selection-lock]")).toHaveCount(1);
    await expect(page.locator("[data-map-selection-lock]")).toHaveCSS(
      "animation-name",
      "map-lock-on",
    );
    await expect(page.locator("[data-map-result-surface]")).toHaveCSS(
      "animation-name",
      "map-result-arrive",
    );
    await expect(page.locator("[data-map-dock]")).toHaveCSS("opacity", "0");
    await expect(page.locator(".map-edge-tools")).toBeHidden();
    await expect(
      page.locator(
        '[data-map-place-slug="calvary-united-methodist-church-of-frederick-maryland"]',
      ),
    ).toHaveCount(0);
  });

  test("selection choreography becomes static for reduced motion", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto("/map", { waitUntil: "domcontentloaded" });

    const search = page.getByRole("combobox", { name: "Search this map" });
    await search.fill("Market Street Boba Beans");
    await page
      .locator('[data-map-search-result="place:market-street-boba-beans"]')
      .click();

    await expect(page.locator("[data-map-result-surface]")).toBeVisible();
    await expect(page.locator("[data-map-result-surface]")).toHaveCSS(
      "animation-name",
      "none",
    );
    await expect(page.locator("[data-map-selection-lock]")).toHaveCSS(
      "animation-name",
      "none",
    );
  });

  test("restores a shared query without covering the map until search is active", async ({ page }) => {
    await page.goto("/map?q=Market%20Street%20Boba%20Beans", {
      waitUntil: "domcontentloaded",
    });

    const search = page.getByRole("combobox", { name: "Search this map" });
    await expect(search).toHaveValue("Market Street Boba Beans");
    await expect(page.locator(".dock-search-results")).toHaveCount(0);

    await search.focus();
    await expect(
      page.locator('[data-map-search-result="place:market-street-boba-beans"]'),
    ).toBeVisible({ timeout: 10_000 });
    await expect(search).toHaveAttribute("aria-expanded", "true");
    await expect(search).toHaveAttribute("aria-autocomplete", "list");
    await expect(search).toHaveAttribute("aria-controls", "map-search-results");

    await search.press("ArrowDown");
    const activeOptionId = await search.getAttribute("aria-activedescendant");
    expect(activeOptionId).toBeTruthy();
    await expect(page.locator(`#${activeOptionId}`)).toHaveAttribute(
      "aria-selected",
      "true",
    );

    await search.press("Escape");
    await expect(page.locator(".dock-search-results")).toHaveCount(0);
    await expect(search).toBeFocused();
    await expect(search).toHaveValue("Market Street Boba Beans");
    await expect(search).toHaveAttribute("aria-expanded", "false");
  });

  test("a trailing space cannot block a later Back query", async ({ page }) => {
    await page.route("**/api/search?**", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ results: [] }),
      });
    });
    await page.route("**/api/map/search-fallback", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          ok: false,
          action: "suggest",
          temporary: true,
          retryable: false,
          reason: "disabled",
        }),
      });
    });
    await page.goto("/map?q=starting%20point", {
      waitUntil: "domcontentloaded",
    });

    const search = page.getByRole("combobox", { name: "Search this map" });
    await search.fill("coffee ");
    await expect
      .poll(() => new URL(page.url()).searchParams.get("q"))
      .toBe("coffee");

    await page.evaluate(() => {
      window.history.pushState(
        null,
        "",
        "/map?q=Market%20Street%20Boba%20Beans",
      );
    });
    await expect(search).toHaveValue("Market Street Boba Beans");

    await page.goBack();
    await expect(search).toHaveValue("coffee");
  });

  test("the map owns one search field instead of repeating it in the header", async ({ page }) => {
    await page.goto("/map", { waitUntil: "domcontentloaded" });

    await expect(page.getByRole("button", { name: "Search this map" })).toHaveCount(0);
    const search = page.getByRole("combobox", { name: "Search this map" });
    await expect(search).toBeVisible();
    await search.click();
    await expect(search).toBeFocused();
    await expect(page.locator("#radius-find-dialog")).toHaveCount(0);
  });

  test("does not claim zero results while local and fallback searches are still running", async ({ page }) => {
    const gates: {
      releasePrimary?: () => void;
      releaseFallback?: () => void;
    } = {};

    await page.route("**/api/search?**", async (route) => {
      await new Promise<void>((resolve) => {
        gates.releasePrimary = resolve;
      });
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ results: [] }),
      });
    });
    await page.route("**/api/map/search-fallback", async (route) => {
      await new Promise<void>((resolve) => {
        gates.releaseFallback = resolve;
      });
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          ok: true,
          action: "suggest",
          temporary: true,
          provider: "Mapbox",
          suggestions: [],
        }),
      });
    });

    await page.goto("/map", { waitUntil: "domcontentloaded" });
    const search = page.getByRole("combobox", { name: "Search this map" });
    await search.fill("unlikely landmark query");

    await expect(page.getByText("Searching Radius…")).toBeVisible();
    await expect(page.getByText(/Nothing on this map matches/)).toHaveCount(0);
    await expect.poll(() => Boolean(gates.releasePrimary)).toBe(true);
    gates.releasePrimary?.();

    await expect.poll(() => Boolean(gates.releaseFallback)).toBe(true);
    await expect(page.getByText("Searching Radius…")).toBeVisible();
    await expect(page.getByText(/Nothing on this map matches/)).toHaveCount(0);
    gates.releaseFallback?.();

    await expect(page.getByText(/Nothing on this map matches/)).toBeVisible();
  });

  test("a map gesture dismisses search results before another card opens", async ({ page }) => {
    await page.goto("/map", { waitUntil: "domcontentloaded" });

    const search = page.getByRole("combobox", { name: "Search this map" });
    await search.fill("Market Street Boba Beans");
    await expect(
      page.locator('[data-map-search-result="place:market-street-boba-beans"]'),
    ).toBeVisible();

    // Pan the visible map above the bottom search sheet. A bare click can
    // legitimately select a town or pin at that coordinate; a drag exercises
    // the dismiss-before-pan contract without opening map content.
    const canvas = page.locator(
      "canvas.mapboxgl-canvas, canvas.maplibregl-canvas",
    );
    const box = await canvas.boundingBox();
    expect(box).not.toBeNull();
    await page.mouse.move(box!.x + 195, box!.y + 300);
    await page.mouse.down();
    await page.mouse.move(box!.x + 240, box!.y + 300, { steps: 4 });
    await page.mouse.up();
    await expect(search).toHaveValue("Market Street Boba Beans");
    await expect(
      page.locator('[data-map-search-result="place:market-street-boba-beans"]'),
    ).toHaveCount(0);
  });

  test("the small-screen place card keeps Close and Save from colliding", async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 568 });
    await page.goto("/map", { waitUntil: "domcontentloaded" });

    const search = page.getByRole("combobox", { name: "Search this map" });
    await search.fill("Market Street Boba Beans");
    await page
      .locator('[data-map-search-result="place:market-street-boba-beans"]')
      .click();

    const peek = page.locator('[data-map-result-surface]').filter({
      has: page.locator('[data-map-place-slug="market-street-boba-beans"]'),
    });
    await expect(peek).toBeVisible();
    await expect(page.locator("[data-map-dock]")).toHaveCSS("opacity", "0");

    const geometry = await peek.evaluate((element) => {
      const close = element.querySelector<HTMLElement>(".map-peek-close")?.getBoundingClientRect();
      const save = [...element.querySelectorAll<HTMLElement>(".map-peek-act")]
        .find((item) => item.textContent?.trim() === "Save")
        ?.getBoundingClientRect();
      if (!close || !save) {
        return { close: null, save: null, overlaps: true };
      }
      const overlaps = !(
        close.right <= save.left ||
        close.left >= save.right ||
        close.bottom <= save.top ||
        close.top >= save.bottom
      );
      return {
        close: {
          top: close.top,
          right: close.right,
          bottom: close.bottom,
          left: close.left,
        },
        save: {
          top: save.top,
          right: save.right,
          bottom: save.bottom,
          left: save.left,
        },
        overlaps,
      };
    });
    expect(geometry.overlaps, JSON.stringify(geometry)).toBe(false);

    await expect(peek).toBeFocused();
    await page
      .locator("canvas.mapboxgl-canvas, canvas.maplibregl-canvas")
      .focus();
    await page.keyboard.press("Escape");
    await expect(peek).toHaveCount(0);
    await expect(search).toBeFocused();
  });

  test("a resident utility query turns on the requested map layer", async ({ page }) => {
    await page.route("**/api/map/osm", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify([
          {
            osm_id: "test-trash",
            name: "Mapped trash can",
            category_slug: "trash",
            osm_tag: "amenity=waste_basket",
            lng: -77.4105,
            lat: 39.4143,
          },
        ]),
      });
    });
    await page.goto("/map?amenity=restroom", { waitUntil: "domcontentloaded" });

    const search = page.getByRole("combobox", { name: "Search this map" });
    await search.fill("trash can");

    const command = page.locator(
      '[data-map-search-result="action:map-trash"]',
    );
    await expect(command).toBeVisible();
    await command.click();

    await expect(page).toHaveURL(/amenity=trash/);
    await expect(page).not.toHaveURL(/amenity=[^#]*restroom/);
    await expect(page.locator(".dock-search-results")).toHaveCount(0);
    await expect(
      page.getByRole("group", { name: "Current map view" }),
    ).toContainText("County · Trash");
    await expect(page.locator("[data-map-amenity-marks]")).not.toHaveAttribute(
      "data-map-amenity-marks",
      "off",
    );

    const rail = page.getByRole("group", { name: "Current map view" });
    const railBox = await rail.boundingBox();
    const dockBox = await page.locator("[data-map-dock] .dock-head").boundingBox();
    expect(railBox?.y ?? 9999).toBeLessThan(dockBox?.y ?? 0);

    await rail.getByRole("button", { name: "Reset map view" }).click();
    await expect(rail).toHaveCount(0);
    await expect(search).toHaveValue("");
    await expect
      .poll(() => new URL(page.url()).searchParams.has("amenity"))
      .toBe(false);
  });

  test("parking is a parking command, not a parks result", async ({ page }) => {
    await page.goto("/map", { waitUntil: "domcontentloaded" });

    const search = page.getByRole("combobox", { name: "Search this map" });
    await search.fill("where can I park downtown");

    const firstResult = page.locator(".dock-search-result-item").first();
    await expect(firstResult).toContainText("Show parking on the map");
    await firstResult.click();

    await expect(page).toHaveURL(/show=parking/);
    await expect(page.locator(".dock-search-results")).toHaveCount(0);
  });

  test("keeps valid Radius results when walking-time refinement fails", async ({ page }) => {
    await page.addInitScript(() => {
      window.sessionStorage.setItem(
        "fr_geo_v1",
        JSON.stringify({
          lng: -77.4106,
          lat: 39.4143,
          accuracy: 20,
          timestamp: Date.now(),
        }),
      );
    });
    let matrixRequests = 0;
    await page.route("**/api/travel-matrix", async (route) => {
      matrixRequests += 1;
      await route.abort("failed");
    });
    await page.goto("/map", { waitUntil: "domcontentloaded" });

    const search = page.getByRole("combobox", { name: "Search this map" });
    await search.fill("coffee nearby");
    const firstRadiusResult = page.locator(
      '[data-map-search-result^="place:"]',
    ).first();
    await expect(firstRadiusResult).toBeVisible();
    const resultId = await firstRadiusResult.getAttribute("data-map-search-result");
    expect(resultId).toMatch(/^place:/);
    const localResult = page.locator(
      `[data-map-search-result="${resultId}"]`,
    );
    await expect(localResult).toBeVisible();
    await expect.poll(() => matrixRequests).toBeGreaterThan(0);

    await expect(localResult).toBeVisible();
    await expect(page.getByText("Map search didn’t finish.")).toHaveCount(0);
  });

  test("global ATM search hands off to Map without returning the same map action", async ({ page }) => {
    const searchRequests: string[] = [];
    let fallbackRequests = 0;
    page.on("request", (request) => {
      const url = new URL(request.url());
      if (url.pathname === "/api/search") searchRequests.push(url.toString());
    });
    await page.route("**/api/map/search-fallback", async (route) => {
      const body = route.request().postDataJSON() as {
        action: "suggest" | "retrieve";
        q?: string;
      };
      if (body.action === "suggest") {
        fallbackRequests += 1;
        expect(body.q).toBe("ATM");
      }
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          ok: true,
          action: "suggest",
          temporary: true,
          provider: "Mapbox",
          attribution: "Map data © Mapbox",
          suggestions: [
            {
              mapboxId: "test-atm",
              name: "Downtown ATM",
              featureType: "poi",
              fullAddress: "Frederick, Maryland 21701",
            },
          ],
        }),
      });
    });

    await page.goto("/today", { waitUntil: "domcontentloaded" });
    await page
      .getByRole("button", { name: "Ask or find across Frederick County" })
      .click();
    await page
      .getByRole("searchbox", { name: "Ask or find across Frederick County" })
      .fill("ATM");

    const results = page.getByRole("list", { name: "Search results" });
    await expect(results.getByText("Find nearby ATMs")).toBeVisible();
    const open = results.getByRole("link", { name: "Open", exact: true });
    await expect(open).toHaveAttribute("href", "/map?q=ATM");
    await open.click();

    await expect(page).toHaveURL(/\/map\?q=ATM$/, { timeout: 20_000 });
    const mapSearch = page.getByRole("combobox", { name: "Search this map" });
    await expect(mapSearch).toHaveValue("ATM", { timeout: 20_000 });
    // Shared queries restore without covering the map. Focusing the field is
    // the deliberate reveal step for the already-fetched provider result.
    await mapSearch.focus();
    await expect
      .poll(() =>
        searchRequests.some((raw) => {
          const url = new URL(raw);
          return (
            url.searchParams.get("origin") === "map" &&
            url.searchParams.get("q") === "ATM" &&
            Boolean(url.searchParams.get("lat")) &&
            Boolean(url.searchParams.get("lng"))
          );
        }),
      )
      .toBe(true);
    await expect
      .poll(() => fallbackRequests)
      .toBeGreaterThan(0);
    await expect(
      page.locator('[data-map-search-result="mapbox:test-atm"]'),
    ).toBeVisible({ timeout: 20_000 });
    await expect(
      page.locator('[data-map-search-result="action:map-atm"]'),
    ).toHaveCount(0);
  });

  test("falls back to a temporary county map result without pretending Radius verified it", async ({ page }) => {
    await page.route("**/api/search?**", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ results: [] }),
      });
    });
    await page.route("**/api/map/search-fallback", async (route) => {
      const request = route.request();
      const body = request.postDataJSON() as {
        action: "suggest" | "retrieve";
        sessionToken: string;
      };
      expect(body.sessionToken).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
      );
      if (body.action === "retrieve") {
        await new Promise((resolve) => setTimeout(resolve, 150));
      }
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(
          body.action === "suggest"
            ? {
                ok: true,
                action: "suggest",
                temporary: true,
                provider: "Mapbox",
                attribution: "Map data © Mapbox",
                suggestions: [
                  {
                    mapboxId: "test-address",
                    name: "12 East Church Street",
                    featureType: "address",
                    fullAddress: "12 East Church Street, Frederick, Maryland 21701",
                  },
                ],
              }
            : {
                ok: true,
                action: "retrieve",
                temporary: true,
                provider: "Mapbox",
                attribution: "Map data © Mapbox",
                result: {
                  mapboxId: "test-address",
                  name: "12 East Church Street",
                  featureType: "address",
                  coordinates: { lng: -77.4101, lat: 39.4159 },
                },
              },
        ),
      });
    });

    await page.goto("/map", { waitUntil: "domcontentloaded" });
    const search = page.getByRole("combobox", { name: "Search this map" });
    await search.fill("12 East Church Street");

    const fallback = page.locator('[data-map-search-result="mapbox:test-address"]');
    await expect(fallback).toBeVisible();
    await expect(fallback).toContainText("Temporary Mapbox result");
    await fallback.click();
    await expect(fallback).toHaveAttribute("aria-busy", "true");

    const spot = page.getByRole("region", { name: "12 East Church Street" });
    await expect(spot).toBeVisible();
    await expect(spot).toContainText("Temporary map result");
    await expect(spot).toContainText(
      "Radius has not verified it as a local listing.",
    );
    await expect(spot).toContainText("Map data © Mapbox");
    await expect(spot).toBeFocused();
  });

  test("groups live road context behind one honest control", async ({ page }) => {
    await page.goto("/map", { waitUntil: "domcontentloaded" });
    await page.getByRole("button", { name: "Choose what to see on this map" }).click();
    await page
      .getByRole("region", { name: "Choose what to see" })
      .getByRole("button", { name: /Get around/ })
      .click();

    const roads = page
      .getByRole("region", { name: "Get around" })
      .getByRole("button", { name: "Road reports", exact: true });
    await expect(roads).toHaveAttribute("aria-pressed", "false");
    await roads.click();

    await expect(page.getByRole("region", { name: "Get around" })).toBeVisible();
    const reopenedLayers = page.getByRole("region", { name: "Get around" });
    await expect(
      reopenedLayers.getByRole("button", {
        name: "Road reports",
        exact: true,
      }),
    ).toHaveAttribute("aria-pressed", "true");
    await reopenedLayers.getByText("Sources and limits").click();
    await expect(reopenedLayers.getByText(/Maryland CHART, WZDx, and county-published reports/)).toBeVisible();
    await expect(reopenedLayers.getByText(/does not show live congestion speeds/)).toBeVisible();
    await expect(reopenedLayers.getByText(/Medical and personal calls stay hidden/)).toBeVisible();
  });

  test("adds grouped road reports without erasing a deep-linked road layer", async ({ page }) => {
    await page.goto("/map?show=civic", { waitUntil: "domcontentloaded" });
    await page.getByRole("button", { name: "Choose what to see on this map" }).click();
    await page
      .getByRole("region", { name: "Choose what to see" })
      .getByRole("button", { name: /Get around/ })
      .click();

    const layers = page.getByRole("region", { name: "Get around" });
    const roads = layers.getByRole("button", {
      name: "Road reports",
      exact: true,
    });
    await expect(roads).toHaveAttribute("aria-pressed", "false");
    await expect(layers.getByText(/Official road reports are on/)).toBeVisible();

    await roads.click();

    await expect(layers).toBeVisible();
    const reopenedLayers = page.getByRole("region", { name: "Get around" });
    await expect(
      reopenedLayers.getByRole("button", {
        name: "Road reports",
        exact: true,
      }),
    ).toHaveAttribute("aria-pressed", "true");
    await reopenedLayers.getByText("Sources and limits").click();
    await expect(reopenedLayers.getByText(/Maryland CHART, WZDx, and county-published reports/)).toBeVisible();
    await expect(reopenedLayers.getByText(/does not show live congestion speeds/)).toBeVisible();
  });
});
