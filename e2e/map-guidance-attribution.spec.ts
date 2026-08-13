import { expect, test, type Page } from "@playwright/test";

const FRAME_TIME = 1_784_764_800;
const TILE_PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M/wHwAF/gL+XTY2NwAAAABJRU5ErkJggg==",
  "base64",
);

/** The guidance is driven by the same deferred signal snapshot as the map.
 * Rewrite that JSON response so this remains deterministic on quiet-weather
 * CI runs without depending on a private Next.js Flight serialization shape.
 */
async function forceActiveWeatherAlert(page: Page) {
  await page.route("**/api/map/layers?*", async (route) => {
    const url = new URL(route.request().url());
    const groups = (url.searchParams.get("groups") ?? "").split(",");
    if (!groups.includes("signals")) {
      await route.continue();
      return;
    }

    const response = await route.fetch();
    const body = (await response.json()) as {
      smartSignals?: Record<string, unknown> | null;
    };
    expect(body.smartSignals).not.toBeNull();
    await route.fulfill({
      response,
      json: {
        ...body,
        smartSignals: {
          ...body.smartSignals,
          conditionsStatus: "current",
          outdoorSafetyHold: null,
          activeWeatherAlert: true,
        },
      },
    });
  });
}

test.describe("mobile map guidance and legal furniture", () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test("alert guidance clears attribution and See radar enables radar", async ({
    page,
  }) => {
    test.setTimeout(60_000);

    let radarIndexRequests = 0;
    await page.route(
      "https://api.rainviewer.com/public/weather-maps.json",
      async (route) => {
        radarIndexRequests += 1;
        await route.fulfill({
          json: {
            version: "2.0",
            generated: FRAME_TIME,
            host: "https://tilecache.rainviewer.com",
            radar: {
              past: [
                { time: FRAME_TIME - 600, path: `/v2/radar/${FRAME_TIME - 600}` },
                { time: FRAME_TIME, path: `/v2/radar/${FRAME_TIME}` },
              ],
            },
          },
        });
      },
    );
    await page.route("https://tilecache.rainviewer.com/**", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "image/png",
        body: TILE_PNG,
      });
    });

    await page.goto("/today", { waitUntil: "domcontentloaded" });
    await expect(
      page.getByRole("navigation", { name: "Primary" }),
    ).toBeVisible();
    await forceActiveWeatherAlert(page);
    await page
      .getByRole("navigation", { name: "Primary" })
      .getByRole("link", { name: "Map" })
      .click();
    await expect(page).toHaveURL(/\/map(?:\?|$)/, { timeout: 30_000 });
    await expect(page.locator(".dock-host")).toHaveAttribute(
      "data-map-loaded",
      "true",
      { timeout: 30_000 },
    );

    const guidance = page.locator(".map-smart-note");
    const attribution = page.locator(
      ".mapboxgl-ctrl-attrib, .maplibregl-ctrl-attrib",
    );
    const attributionButton = page.locator(
      ".mapboxgl-ctrl-attrib-button, .maplibregl-ctrl-attrib-button",
    );
    await expect(guidance).toBeVisible();
    await expect(guidance).toContainText("A weather alert is active.");
    await expect(attribution).toBeVisible();
    await expect(attributionButton).toBeVisible();

    const attributionBackground = await attributionButton.evaluate((element) => {
      const style = getComputedStyle(element);
      return {
        repeat: style.backgroundRepeat,
        x: style.backgroundPositionX,
        y: style.backgroundPositionY,
      };
    });
    expect(attributionBackground.repeat).toBe("no-repeat");
    expect(attributionBackground.x).toBe("50%");
    expect(attributionBackground.y).toBe("50%");

    const surfacesOverlap = await page.evaluate(() => {
      const note = document.querySelector<HTMLElement>(".map-smart-note");
      const credit = document.querySelector<HTMLElement>(
        ".mapboxgl-ctrl-attrib, .maplibregl-ctrl-attrib",
      );
      if (!note || !credit) return true;
      const first = note.getBoundingClientRect();
      const second = credit.getBoundingClientRect();
      return (
        first.left < second.right &&
        first.right > second.left &&
        first.top < second.bottom &&
        first.bottom > second.top
      );
    });
    expect(surfacesOverlap).toBe(false);

    await guidance.getByRole("button", { name: "See radar" }).click();
    await expect(guidance).toBeHidden();
    await expect.poll(() => radarIndexRequests).toBeGreaterThan(0);

    await page.getByRole("button", { name: "Explore this map" }).click();
    const options = page.getByRole("region", { name: "Choose what to see" });
    await options
      .getByRole("button", { name: "Conditions" })
      .click();
    await expect(
      page
        .getByRole("region", { name: "Conditions" })
        .getByRole("button", { name: "Radar" }),
    ).toHaveAttribute("aria-pressed", "true");
  });
});
