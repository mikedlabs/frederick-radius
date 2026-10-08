import { expect, test, type Locator, type Page } from "@playwright/test";
import {
  dismissReturnBridge,
  emptyReturnBridgeState,
  RETURN_BRIDGE_STORAGE_KEY,
} from "../src/lib/return-bridge";

/**
 * Run against the existing promoted-data server with its Node egress guard.
 * Browser routing cannot control TodayCard's server-side NWS/AirNow reads.
 * The real unavailable card must resolve; no healthy/partial forecast or page
 * markup is fabricated here. Async adapter states belong to component tests.
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
    // Record keyboard navigation to the real forecast destination without
    // entering Pulse's server/provider work. This proves the route request,
    // not the destination's weather data or complete navigation lifecycle.
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

        test("the real unavailable forecast leads Find and browsing above the fold", async ({ page }, testInfo) => {
          test.setTimeout(60_000);
          const runtimeErrors: string[] = [];
          page.on("pageerror", (error) => runtimeErrors.push(error.message));
          const response = await page.goto("/today?in=county", { waitUntil: "domcontentloaded" });
          expect(response?.status()).toBe(200);
          await expect(page.locator("main h1")).toHaveCount(1);
          await expect(page.getByRole("combobox", { name: "Choose your area" })).toBeEnabled();
          // An ordinary guarded day has no interruption above the masthead.
          // Active alert placement is separately guarded by TodayHierarchy.
          await expect(page.getByRole("region", { name: "Heads up", exact: true })).toHaveCount(0);

          const weather = page.locator("[data-today-weather]");
          const forecast = weather.locator('a[href*="open=weather"]');
          const find = page.locator('[data-surface-row="find"]');
          const places = page.locator('[data-today-current-content] > [aria-label="Places for your area"]');
          const events = page.locator("#whats-on");
          await expect(weather).toHaveCount(1);
          await expect(forecast).toHaveCount(1);
          await expect(page.locator('a[href*="/pulse"][href*="open=weather"]')).toHaveCount(1);
          await expect(forecast.locator("a, button, input, select, textarea")).toHaveCount(0);
          await expect(weather.locator('[data-weather-state="unavailable"]')).toBeVisible();
          await expect(weather).toContainText("The NWS forecast is briefly unavailable.");
          await expect(weather.locator('[aria-label="Today in Frederick"]')).toHaveCount(0);
          await expect(find).toBeVisible();
          await expect(places).toBeAttached();
          await expect(events).toBeAttached();
          await page.evaluate(async () => {
            await document.fonts.ready;
            await new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
          });

          const order = await weather.evaluate((element) => {
            const before = (selector: string) => {
              const next = document.querySelector(selector);
              return next !== null && Boolean(element.compareDocumentPosition(next) & Node.DOCUMENT_POSITION_FOLLOWING);
            };
            const masthead = document.querySelector("main .scroll-masthead");
            return {
              afterMasthead: masthead !== null && Boolean(masthead.compareDocumentPosition(element) & Node.DOCUMENT_POSITION_FOLLOWING),
              beforeFind: before('[data-surface-row="find"]'),
              beforePlaces: before('[data-today-current-content] > [aria-label="Places for your area"]'),
              beforeEvents: before("#whats-on"),
            };
          });
          expect(order).toEqual({ afterMasthead: true, beforeFind: true, beforePlaces: true, beforeEvents: true });

          const weatherBox = (await weather.boundingBox())!;
          const mastheadBox = (await page.locator("main .scroll-masthead").boundingBox())!;
          const findBox = (await find.boundingBox())!;
          expect(await page.evaluate(() => window.scrollY)).toBe(0);
          expect(weatherBox.height).toBeGreaterThan(0);
          if (viewport.width < 960) {
            expect(weatherBox.y).toBeGreaterThanOrEqual(mastheadBox.y + mastheadBox.height);
          } else {
            expect(Math.abs(weatherBox.y - mastheadBox.y)).toBeLessThanOrEqual(1);
            expect(weatherBox.x).toBeGreaterThanOrEqual(mastheadBox.x + mastheadBox.width);
          }
          expect(weatherBox.y + weatherBox.height).toBeLessThanOrEqual(viewport.height);
          expect(weatherBox.y + weatherBox.height).toBeLessThanOrEqual(findBox.y);
          expect(weatherBox.x).toBeGreaterThanOrEqual(0);
          expect(weatherBox.x + weatherBox.width).toBeLessThanOrEqual(viewport.width);
          await expect.poll(() => page.evaluate(() =>
            document.documentElement.scrollWidth - window.innerWidth,
          )).toBeLessThanOrEqual(1);

          const forecastBox = (await forecast.boundingBox())!;
          // Round only CSS-transform representation, as in the existing layout gate.
          expect(Math.round(forecastBox.height * 100) / 100).toBeGreaterThanOrEqual(44);
          expect(forecastBox.width).toBeGreaterThanOrEqual(44);
          await expect.poll(() => fivePointForecastProbe(forecast)).toEqual([true, true, true, true, true]);
          expect(runtimeErrors).toEqual([]);
          await testInfo.attach("weather-priority-geometry", {
            contentType: "application/json",
            body: JSON.stringify({ viewport, colorScheme, state: "unavailable", order, weatherBox, forecastBox,
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
