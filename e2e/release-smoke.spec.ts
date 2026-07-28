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
];

const VIEWPORTS = [
  { label: "phone", width: 390, height: 844 },
  { label: "desktop", width: 1440, height: 900 },
] as const;

function installRuntimeGuards(page: Page, appOrigin: string) {
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
    if (
      url.origin === appOrigin &&
      !canceledRscPrefetch &&
      !documentedNavigationAbort
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
          await expect(
            header.getByRole("link", { name: "Open Compass" }),
          ).toBeVisible();
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

test("map search keeps its exact state through place details and Back", async ({
  page,
  baseURL,
}) => {
  test.setTimeout(120_000);
  await page.setViewportSize({ width: 390, height: 844 });
  const appOrigin = new URL(baseURL ?? "http://localhost:3010").origin;
  const issues = installRuntimeGuards(page, appOrigin);

  await page.goto(
    "/map?c=-77.4100,39.4150,12.4&show=transit&layers=parks",
    { waitUntil: "domcontentloaded", timeout: 90_000 },
  );

  await page
    .getByRole("searchbox", { name: "Search this map" })
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
  await expect(fullPage).toBeVisible();
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
  await expect(
    page.getByRole("searchbox", { name: "Search this map" }),
  ).toHaveValue("Gravel and Grind");
  expect(issues, "map → place → map runtime failures").toEqual([]);
});
