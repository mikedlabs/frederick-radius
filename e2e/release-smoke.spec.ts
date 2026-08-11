import { expect, test, type Page } from "@playwright/test";
import { findErrorBoundaryMarker } from "./error-boundary-markers";

/**
 * Compact release gate for the surfaces that join Frederick Radius together.
 *
 * The full browser suite remains nightly. This smaller matrix is designed to
 * run against `next build && next start` on every pull request so a page that
 * compiles but hydrates, renders, or routes incorrectly cannot ship.
 */
const ROUTES = [
  "/",
  "/today",
  "/map",
  "/events",
  "/ask",
  "/transit",
  "/my-radius",
  "/deals",
  "/places/brewers-alley-frederick",
] as const;

const EXPECTED_FAIL_SOFT_RESPONSES = new Set([
  // The map has a committed static transit network and deliberately keeps
  // working when the optional runtime shape service is not configured.
  "503 /api/transit/shapes",
]);

const EXPECTED_NAVIGATION_ABORTS = [
  // Local map results render immediately; these optional enrichments can still
  // be in flight when the user opens a result or leaves its sheet.
  /^\/api\/search$/,
  /^\/api\/places\/map-card\//,
  // The calm map probes this optional live layer so its options door can show
  // honest availability. Leaving the map may cancel that no-store request;
  // it carries no user state and LiveRotorcraft already fails soft.
  /^\/api\/aviation\/rotorcraft$/,
  // A place sheet can still be painting its optional static preview when the
  // user follows the full-page link. Navigation cancels that image request;
  // real HTTP failures remain covered by the response-status guard above.
  /^\/api\/static-map$/,
];

const VIEWPORTS = [
  { label: "phone", width: 390, height: 844 },
  { label: "desktop", width: 1440, height: 900 },
] as const;

function installRuntimeGuards(
  page: Page,
  appOrigin: string,
  options: {
    allowBasemapNavigationAbort?: boolean;
    allowOptimizedImageNavigationAbort?: boolean;
  } = {},
) {
  const issues: string[] = [];

  page.on("pageerror", (error) => {
    issues.push(`pageerror: ${error.message}`);
  });

  page.on("console", (message) => {
    if (message.type() !== "error") return;
    const source = message.location().url;
    const text = message.text();
    const externalSource =
      source && new URL(source, appOrigin).origin !== appOrigin;
    // Ignore only resource/network noise from a third-party origin. Runtime
    // exceptions raised by an external SDK remain release-blocking.
    if (
      externalSource &&
      /Failed to load resource|ERR_|blocked by|network error/i.test(text)
    ) {
      return;
    }
    if (!source && /Failed to load resource/i.test(text)) return;
    issues.push(`console.error: ${text}`);
  });

  page.on("response", (response) => {
    const url = new URL(response.url());
    if (url.origin === appOrigin && response.status() >= 500) {
      const failure = `${response.status()} ${url.pathname}`;
      if (!EXPECTED_FAIL_SOFT_RESPONSES.has(failure)) issues.push(failure);
    }
  });

  page.on("requestfailed", (request) => {
    const url = new URL(request.url());
    const failure = request.failure()?.errorText ?? "request failed";
    const canceledRscPrefetch =
      url.searchParams.has("_rsc") &&
      /ERR_ABORTED|NS_BINDING_ABORTED/i.test(failure);
    const documentedNavigationAbort =
      /ERR_ABORTED|NS_BINDING_ABORTED/i.test(failure) &&
      EXPECTED_NAVIGATION_ABORTS.some((pattern) => pattern.test(url.pathname));
    // This is enabled only for the explicit map → place → map journey below.
    // Its two client navigations can cancel an in-flight optimized hero image;
    // HTTP image failures still reach the response-status guard above.
    const optimizedImageNavigationAbort =
      options.allowOptimizedImageNavigationAbort === true &&
      url.pathname === "/_next/image" &&
      /ERR_ABORTED|NS_BINDING_ABORTED/i.test(failure);
    // PMTiles uses bounded range requests. Leaving and then restoring the map
    // can cancel ranges that the previous renderer no longer needs. A missing
    // or broken basemap still fails the map render checks and response guard.
    const basemapNavigationAbort =
      options.allowBasemapNavigationAbort === true &&
      url.pathname === "/basemap/frederick-county.pmtiles" &&
      /ERR_ABORTED|NS_BINDING_ABORTED/i.test(failure);
    if (
      url.origin === appOrigin &&
      !canceledRscPrefetch &&
      !documentedNavigationAbort &&
      !optimizedImageNavigationAbort &&
      !basemapNavigationAbort
    ) {
      issues.push(`${failure} ${url.pathname}`);
    }
  });

  return issues;
}

for (const viewport of VIEWPORTS) {
  test.describe(`production release smoke · ${viewport.label}`, () => {
    test.use({
      viewport: { width: viewport.width, height: viewport.height },
      serviceWorkers: "block",
    });

    for (const route of ROUTES) {
      test(`${route} renders its real connected surface`, async ({
        page,
        baseURL,
      }) => {
        test.setTimeout(120_000);
        const appOrigin = new URL(baseURL ?? "http://localhost:3010").origin;
        const issues = installRuntimeGuards(page, appOrigin);

        const response = await page.goto(route, {
          waitUntil: "domcontentloaded",
          timeout: 90_000,
        });
        expect(response?.status(), `${route} should serve HTTP 200`).toBe(200);
        const requestedUrl = new URL(route, appOrigin);
        const finalUrl = new URL(page.url());
        expect(
          finalUrl.pathname,
          `${route} should not be replaced by the legacy beta wall`,
        ).toBe(route === "/" ? "/today" : requestedUrl.pathname);
        expect(finalUrl.search, `${route} should preserve its requested query`).toBe(
          requestedUrl.search,
        );

        await page.waitForTimeout(1_000);
        const main = page.locator("main").first();
        await expect(main, `${route} should show its main content`).toBeVisible();
        await expect(
          page.locator("main h1"),
          `${route} should expose one page heading`,
        ).toHaveCount(1);

        const mainText = (await main.innerText()).replace(/\s+/g, " ").trim();
        expect(
          mainText.length,
          `${route} should render meaningful content`,
        ).toBeGreaterThan(20);

        const errorMarker = findErrorBoundaryMarker(await page.textContent("body"));
        expect(
          errorMarker,
          `${route} rendered an error boundary: ${errorMarker ?? ""}`,
        ).toBeNull();

        const geometry = await page.evaluate(() => ({
          clientWidth: document.documentElement.clientWidth,
          scrollWidth: document.documentElement.scrollWidth,
        }));
        expect(
          geometry.scrollWidth,
          `${route} should not overflow horizontally at ${viewport.width}px`,
        ).toBeLessThanOrEqual(geometry.clientWidth + 1);

        if (route === "/today") {
          const primary = page.getByRole("navigation", { name: "Primary" });
          for (const destination of ["Today", "Map", "Events", "Saved"]) {
            await expect(
              primary.getByRole("link", { name: destination, exact: true }),
            ).toBeVisible();
          }
          const header = page.locator("header").first();
          await expect(
            header.getByRole("link", { name: /^Pulse:/ }),
          ).toBeVisible();
          if (viewport.width >= 640) {
            await expect(
              header.getByRole("link", { name: "Open Compass" }),
            ).toBeVisible();
          } else {
            await expect(
              header.getByRole("button", {
                name: "Ask or find across Frederick County",
              }),
            ).toBeVisible();
          }
        }

        if (route === "/events") {
          await expect(
            page.getByRole("group", { name: "When" }),
          ).toBeVisible();
        }

        if (route === "/ask") {
          await expect(
            page.getByRole("textbox", { name: "Ask Radius" }),
          ).toBeVisible();
          await expect(page.locator('form[aria-label="Ask Radius"]')).toBeVisible();
        }

        expect(issues, `${route} browser runtime failures`).toEqual([]);
      });
    }
  });
}

test.describe("Today hydration clock boundary", () => {
  test.use({
    viewport: { width: 390, height: 844 },
    serviceWorkers: "block",
  });

  test("keeps the first client render stable when its clock crosses a minute", async ({
    page,
    baseURL,
  }) => {
    test.setTimeout(120_000);
    const appOrigin = new URL(baseURL ?? "http://localhost:3010").origin;
    const issues = installRuntimeGuards(page, appOrigin);

    // ISR HTML and the browser never share an exact wall clock. Move the
    // browser ninety seconds ahead so any Today client component that reads
    // Date during its first render crosses a minute boundary relative to the
    // server. Live labels must use a server timestamp or wait until mount;
    // otherwise React reports hydration error #418 here.
    await page.addInitScript(({ offsetMs }) => {
      const NativeDate = window.Date;
      const OffsetDate = new Proxy(NativeDate, {
        apply(target, thisArg, args) {
          return Reflect.apply(
            target,
            thisArg,
            args.length > 0 ? args : [target.now() + offsetMs],
          );
        },
        construct(target, args) {
          return Reflect.construct(
            target,
            args.length > 0 ? args : [target.now() + offsetMs],
          );
        },
      });
      Object.defineProperty(window, "Date", {
        configurable: true,
        value: OffsetDate,
      });
    }, { offsetMs: 90_000 });

    const response = await page.goto("/today", {
      waitUntil: "domcontentloaded",
      timeout: 90_000,
    });
    expect(response?.status()).toBe(200);
    await expect(page.locator("main h1")).toHaveCount(1);
    await expect(page.locator('[aria-label="Today in Frederick"]')).toBeVisible();
    const readyCollapsibles = page.locator(
      '[data-collapsible-interaction-ready="true"]',
    );
    await expect(readyCollapsibles.first()).toBeAttached();
    expect(await readyCollapsibles.count()).toBeGreaterThan(0);

    expect(issues, "Today browser runtime failures across clock drift").toEqual([]);
  });
});

test("map search keeps its exact state through place details and Back", async ({
  page,
  baseURL,
}) => {
  test.setTimeout(120_000);
  await page.setViewportSize({ width: 390, height: 844 });
  const appOrigin = new URL(baseURL ?? "http://localhost:3010").origin;
  const issues = installRuntimeGuards(page, appOrigin, {
    allowBasemapNavigationAbort: true,
    allowOptimizedImageNavigationAbort: true,
  });

  await page.goto(
    "/map?c=-77.4100,39.4150,12.4&show=transit&layers=parks",
    { waitUntil: "domcontentloaded", timeout: 90_000 },
  );

  await page
    .getByRole("combobox", { name: "Search this map" })
    .fill("Gravel and Grind");
  const result = page.locator(
    '[data-map-search-result="place:gravel-and-grind-frederick"]',
  );
  await expect(result).toBeVisible();
  await result.click();
  await expect(
    page.locator('[data-map-place-slug="gravel-and-grind-frederick"]'),
  ).toBeVisible();

  await page.getByRole("button", { name: "Details", exact: true }).click();
  const fullPage = page.getByRole("link", { name: /See full page/ });
  // The map warms this lazy sheet after first paint. Keep a bounded cold-start
  // allowance for a saturated CI runner while still failing a genuinely stuck
  // loader well inside the journey's release timeout.
  await expect(fullPage).toBeVisible({ timeout: 10_000 });
  const fullPageHref = await fullPage.getAttribute("href");
  expect(fullPageHref).toBeTruthy();
  const returnTo = new URL(
    fullPageHref!,
    "https://frederick-radius.test",
  ).searchParams.get("returnTo");
  expect(returnTo).toBeTruthy();

  const mapState = new URL(returnTo!, "https://frederick-radius.test");
  expect(mapState.pathname).toBe("/map");
  expect(mapState.searchParams.get("c")).toBeTruthy();
  expect(mapState.searchParams.get("show")).toBe("transit");
  expect(mapState.searchParams.get("layers")).toBe("parks");
  expect(mapState.searchParams.get("q")).toBe("Gravel and Grind");
  expect(mapState.searchParams.get("place")).toBe(
    "gravel-and-grind-frederick",
  );

  await fullPage.click();
  const back = page.getByRole("link", { name: "Back to map" });
  await expect(back).toHaveAttribute("href", returnTo!);
  await back.click();
  await expect
    .poll(() => {
      const url = new URL(page.url());
      return `${url.pathname}${url.search}${url.hash}`;
    })
    .toBe(returnTo);
  // The returned place remains open on a phone, so the dock is intentionally
  // inert behind its peek. Close that foreground result before checking the
  // restored search field a person can actually interact with.
  await page
    .getByRole("button", { name: "Close Gravel & Grind" })
    .click();
  await expect(
    page.getByRole("combobox", { name: "Search this map" }),
  ).toHaveValue("Gravel and Grind");
  expect(issues, "map → place → map runtime failures").toEqual([]);
});
