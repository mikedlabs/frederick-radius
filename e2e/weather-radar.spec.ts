import { expect, test, type Page } from "@playwright/test";

test.describe("weather radar", () => {
  const FRAME_TIME = 1_784_764_800;
  const TILE_PNG = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M/wHwAF/gL+XTY2NwAAAABJRU5ErkJggg==",
    "base64",
  );

  async function exerciseRadar(page: Page) {
    const radarRequests: string[] = [];
    await page.route("https://api.rainviewer.com/public/weather-maps.json", async (route) => {
      await route.fulfill({
        json: {
          version: "2.0",
          generated: FRAME_TIME,
          host: "https://tilecache.rainviewer.com",
          radar: { past: [{ time: FRAME_TIME, path: `/v2/radar/${FRAME_TIME}` }] },
        },
      });
    });
    await page.route("https://tilecache.rainviewer.com/**", async (route) => {
      radarRequests.push(route.request().url());
      await route.fulfill({ status: 200, contentType: "image/png", body: TILE_PNG });
    });
    page.on("request", (request) => {
      if (request.url().includes("weather-maps.json")) radarRequests.push(request.url());
    });

    await page.goto("/map", { waitUntil: "domcontentloaded" });

    await page.getByRole("button", { name: "What the map shows" }).click();
    const options = page.getByRole("region", { name: "What the map shows" });
    await options
      .getByRole("button", { name: "Check live conditions and map layers" })
      .click();

    const layers = page.getByRole("region", { name: "Live conditions" });
    const radar = layers.getByRole("button", { name: "Radar" });
    await radar.click();

    await expect(radar).toHaveAttribute("aria-pressed", "true");
    await expect.poll(() => radarRequests.some((url) => url.includes("weather-maps.json"))).toBe(true);
    await expect.poll(() => radarRequests.some((url) => url.includes("tilecache.rainviewer.com"))).toBe(true);

    const tileZooms = radarRequests.flatMap((url) => {
      const match = url.match(/\/256\/(\d+)\//);
      return match ? [Number(match[1])] : [];
    });
    expect(tileZooms.length).toBeGreaterThan(0);
    expect(Math.max(...tileZooms)).toBeLessThanOrEqual(7);

    await expect(
      layers.getByText(/Latest RainViewer frame|Showing the last good frames/),
    ).toBeVisible();
  }

  test("uses supported radar tiles on a phone", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await exerciseRadar(page);
  });

  test("uses supported radar tiles on desktop", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await exerciseRadar(page);
  });
});
