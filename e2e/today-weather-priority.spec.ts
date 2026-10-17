import { expect, test, type Locator, type Page } from "@playwright/test";
import {
  dismissReturnBridge,
  emptyReturnBridgeState,
  RETURN_BRIDGE_STORAGE_KEY,
} from "../src/lib/return-bridge";

/**
 * The regular suite checks whichever real weather state resolves. Browser
 * routing cannot control server-side NWS/AirNow reads.
 * For strict unavailable coverage, use playwright.weather-guarded.config.ts
 * after the normal promoted production build.
 */
const VIEWPORTS = [
  { width: 320, height: 844 },
  { width: 375, height: 844 },
  { width: 390, height: 844 },
  { width: 430, height: 844 },
  { width: 1280, height: 900 },
] as const;

test.use({ serviceWorkers: "block" });

test.beforeEach(async ({ page, context, baseURL }) => {
  const origin = new URL(baseURL ?? "http://localhost:3010");
  await page.emulateMedia({ reducedMotion: "reduce" });
  await context.addCookies([
    { name: "fr_onboarded", value: "1", domain: origin.hostname, path: "/" },
    { name: "fr_scope", value: "county", domain: origin.hostname, path: "/" },
  ]);
  await page.addInitScript(({ key, state }) => {
    localStorage.setItem("fr:scope:v1", "county");
    localStorage.setItem(key, JSON.stringify(state));
  }, {
    key: RETURN_BRIDGE_STORAGE_KEY,
    state: dismissReturnBridge(emptyReturnBridgeState()),
  });
  await page.route("**/*", (route) => {
    const request = route.request();
    const url = new URL(request.url());
    if (url.origin !== origin.origin) return route.abort();
    if (url.pathname === "/pulse" && url.searchParams.get("open") === "weather") {
      return route.abort();
    }
    if (url.pathname === "/api/auth/me") {
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: '{"user":null}',
      });
    }
    if (url.pathname.startsWith("/api/") || !["GET", "HEAD"].includes(request.method())) {
      return route.abort();
    }
    return route.continue();
  });
});

async function fivePointForecastProbe(forecast: Locator) {
  return forecast.evaluate((link) => {
    const rect = link.getBoundingClientRect();
    const x = rect.x + rect.width / 2;
    const y = rect.y + rect.height / 2;
    const points = [[x, y], [x - 21.5, y], [x + 21.5, y], [x, y - 21.5], [x, y + 21.5]];
    return points.map(([px, py]) => {
      const hit = document.elementFromPoint(px, py);
      return px >= 0 && py >= 0 && px < innerWidth && py < innerHeight &&
        (hit === link || (hit !== null && link.contains(hit)));
    });
  });
}

async function tabToForecast(page: Page, forecast: Locator) {
  for (let presses = 0; presses < 40; presses += 1) {
    await page.keyboard.press("Tab");
    if (await forecast.evaluate((link) => document.activeElement === link)) return;
  }
  throw new Error("The forecast link was not reachable within 40 ordinary Tab presses.");
}

for (const colorScheme of ["light", "dark"] as const) {
  test.describe("Today weather priority in " + colorScheme, () => {
    test.use({ colorScheme });

    for (const viewport of VIEWPORTS) {
      test.describe(viewport.width + "x" + viewport.height, () => {
        test.use({
          viewport,
          isMobile: viewport.width < 640,
          hasTouch: viewport.width < 640,
        });

        test("resolved weather leads Find and browsing above the fold", async ({ page }, testInfo) => {
          test.setTimeout(60_000);
          const providerMode = testInfo.config.metadata.weatherProviderMode ?? "actual";
          expect(["actual", "guarded-unavailable"]).toContain(providerMode);
          const runtimeErrors: string[] = [];
          page.on("pageerror", (error) => runtimeErrors.push(error.message));
          const response = await page.goto("/today?in=county", { waitUntil: "domcontentloaded" });
          expect(response?.status()).toBe(200);
          await expect(page.locator("main h1")).toHaveCount(1);
          await expect(page.getByRole("combobox", { name: "Choose your area" })).toBeEnabled();
          const weather = page.locator("[data-today-weather]");
          const renderedWeather = weather.locator("[data-weather-state]");
          const forecast = weather.locator('a[href*="open=weather"]');
          const find = page.locator('[data-surface-row="find"]');
          const firstEvent = page.locator("[data-today-event-pick]").first();
          await expect(weather).toHaveCount(1);
          await expect(forecast).toHaveCount(1);
          await expect(page.locator('a[href*="/pulse"][href*="open=weather"]')).toHaveCount(1);
          await expect(forecast.locator("a, button, input, select, textarea")).toHaveCount(0);
          await expect(renderedWeather).toHaveCount(1);
          await expect(renderedWeather).toHaveAttribute("data-weather-state", /^(available|safety-only|unavailable)$/);
          await expect(renderedWeather).toBeVisible();
          const weatherState = await renderedWeather.getAttribute("data-weather-state");
          if (providerMode === "guarded-unavailable") {
            await test.step("guarded server resolves honest unavailable weather", async () => {
              expect(weatherState).toBe("unavailable");
              await expect(weather).toContainText("The NWS forecast is briefly unavailable.");
            });
          }
          await expect(find).toBeVisible();
          await page.evaluate(async () => {
            await document.fonts.ready;
            await new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
          });

          const order = await weather.evaluate((element) => {
            const before = (selector: string) => {
              const next = document.querySelector(selector);
              return next !== null && Boolean(element.compareDocumentPosition(next) & Node.DOCUMENT_POSITION_FOLLOWING);
            };
            return {
              beforeFind: before('[data-surface-row="find"]'),
              beforeEvents: before("[data-today-event-pick]") || document.querySelector("[data-today-event-pick]") === null,
            };
          });
          expect(order.beforeFind).toBe(true);

          const weatherBox = (await weather.boundingBox())!;
          const findBox = (await find.boundingBox())!;
          expect(await page.evaluate(() => window.scrollY)).toBe(0);
          expect(weatherBox.height).toBeGreaterThan(0);
          expect(weatherBox.y + weatherBox.height).toBeLessThanOrEqual(viewport.height);
          expect(weatherBox.y + weatherBox.height).toBeLessThanOrEqual(findBox.y);
          if (await firstEvent.count()) {
            const eventBox = (await firstEvent.boundingBox())!;
            expect(eventBox.y).toBeGreaterThan(weatherBox.y);
            expect(findBox.y).toBeGreaterThan(eventBox.y);
          }
          expect(weatherBox.x).toBeGreaterThanOrEqual(0);
          expect(weatherBox.x + weatherBox.width).toBeLessThanOrEqual(viewport.width);
          await expect.poll(() => page.evaluate(() =>
            document.documentElement.scrollWidth - window.innerWidth,
          )).toBeLessThanOrEqual(1);

          const forecastBox = (await forecast.boundingBox())!;
          expect(Math.round(forecastBox.height * 100) / 100).toBeGreaterThanOrEqual(44);
          expect(forecastBox.width).toBeGreaterThanOrEqual(44);
          await expect.poll(() => fivePointForecastProbe(forecast)).toEqual([true, true, true, true, true]);
          expect(runtimeErrors).toEqual([]);
          await testInfo.attach("weather-priority-geometry", {
            contentType: "application/json",
            body: JSON.stringify({ viewport, colorScheme, providerMode, state: weatherState, order, weatherBox, forecastBox,
              probe: "Center and four cardinal points at +/-21.5px; bounded samples, not exhaustive area proof." }),
          });
          const screenshotPath = testInfo.outputPath(`today-weather-${colorScheme}-${viewport.width}.png`);
          await page.screenshot({ path: screenshotPath, fullPage: true });
          await testInfo.attach("weather-priority-screenshot", { path: screenshotPath, contentType: "image/png" });
          const firstScreenPath = testInfo.outputPath(`today-first-screen-${colorScheme}-${viewport.width}.png`);
          await page.screenshot({ path: firstScreenPath, fullPage: false });
          await testInfo.attach("weather-priority-first-screen", { path: firstScreenPath, contentType: "image/png" });

          await tabToForecast(page, forecast);
          await expect(forecast).toBeFocused();
          const href = new URL((await forecast.getAttribute("href"))!, page.url());
          expect(href.pathname).toBe("/pulse");
          expect(href.searchParams.get("open")).toBe("weather");
          const [request] = await Promise.all([
            page.waitForRequest((candidate) => {
              const url = new URL(candidate.url());
              return url.pathname === "/pulse" && url.searchParams.get("open") === "weather";
            }),
            page.keyboard.press("Enter"),
          ]);
          expect(request.method()).toBe("GET");
        });
      });
    }
  });
}
