import { test, expect } from "@playwright/test";

/**
 * Guard: no page silently degrades to the global ErrorBoundary fallback.
 *
 * Two real production bugs (#202) passed tsc, lint, vitest, and Playwright
 * smoke — both only surfaced when a real browser ran the JS:
 *
 *  - `readModeFromCookie` exported from a "use client" module → every
 *    Server Component that called it threw → ErrorBoundary swallowed
 *    PrimaryActionCard / AdaptiveGreeting on /today.
 *  - `useSyncExternalStore` getSnapshot returning new objects per call →
 *    infinite re-render → ErrorBoundary swallowed FeaturedTonightPicker
 *    + RightNowGrid on /today.
 *
 * Either failure mode produces the same visible artifact: the global
 * ErrorBoundary's "Something glitched / Try again / Reload page" card.
 * This spec walks every key public surface and asserts that card is
 * NOT in the DOM after first paint.
 *
 * If a test here fails, it doesn't tell you *what* broke, but it tells
 * you *which surface* — the developer can then open dev tools on that
 * route and read the actual error from the console.
 */

// Routes that should always render their real content. `/map` is
// deliberately omitted: headless Chrome + Mapbox is flaky in CI (the
// canvas occasionally NO_FCPs) — that flake would mask real ErrorBoundary
// regressions on every other route.
const PUBLIC_ROUTES = [
  "/today",
  "/events",
  "/parks",
  "/history",
  "/about",
  "/access",
  "/tonight",
  "/discover",
  "/transit",
  "/compass",
  "/m/frederick",
  "/category/food",
] as const;

test.describe("no ErrorBoundary fallback on first paint", () => {
  for (const route of PUBLIC_ROUTES) {
    test(`${route} renders without "Something glitched"`, async ({ page, context, baseURL }) => {
      // Bypass the /welcome onboarding redirect on / and /today so we
      // exercise the real surface, not the welcome flow.
      const target = new URL(baseURL ?? "http://localhost:3010");
      await context.addCookies([
        {
          name: "fr_onboarded",
          value: "1",
          domain: target.hostname,
          path: "/",
        },
      ]);

      const response = await page.goto(route, {
        waitUntil: "domcontentloaded",
      });
      expect(response?.status(), `${route} should not 4xx/5xx`).toBeLessThan(400);

      // The fallback is a React render failure, so wait for the real document
      // and main surface instead of the browser's full `load` event. A slow
      // image or third-party asset must not turn this render-health guard into
      // a network-completion test.
      await expect(page.locator("main").first()).toBeVisible();
      await expect(page.locator("main h1").first()).toBeVisible();
      await page.waitForTimeout(1500);

      // ErrorBoundary.tsx renders a single distinctive headline. If it's
      // anywhere on the page, a component threw and the user is seeing
      // the fallback instead of real content.
      const fallbackHeader = page.getByRole("heading", {
        name: /Something glitched/i,
      });
      await expect(
        fallbackHeader,
        `${route}: ErrorBoundary fallback is visible — open dev tools on this route and check the console for the underlying error`,
      ).toHaveCount(0);

      // Defensive belt-and-braces: also assert role="alert" with the
      // exact body copy is absent. Catches a future ErrorBoundary
      // redesign that drops the headline but keeps the role.
      const alertBody = page.locator(
        '[role="alert"]:has-text("A piece of this page failed to render")',
      );
      await expect(alertBody, `${route}: ErrorBoundary alert is visible`).toHaveCount(0);
    });
  }
});
