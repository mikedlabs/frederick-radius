import { test, expect } from "@playwright/test";
import { readFileSync } from "node:fs";
import path from "node:path";
import {
  ERROR_BOUNDARY_MARKERS_BY_KIND,
  findErrorBoundaryMarker,
} from "./error-boundary-markers";

/**
 * The standing UX gate — the July 2026 hand-run sweeps, committed.
 *
 * Two failure classes this catches, both of which reached (or nearly
 * reached) prod that month before a human noticed:
 *
 *   1. RENDER ROT — a page 500s into any app error boundary or comes up
 *      near-empty. The brewery-logo change 500'd
 *      /beer on first render (a next.config localPatterns miss) and only
 *      a screenshot caught it.
 *   2. ACCESSIBILITY ROT — axe-core WCAG A/AA violations. The first full
 *      sweep found 74 violation nodes (64 nameless links on /deals, white
 *      text on the brand red across five pages). All fixed; this test
 *      pins the count at ZERO so it can never quietly climb again.
 *
 * Every key surface renders at phone width (390px), gets the render-health
 * checks, then a full axe pass. Adding a page to the app? Add its route
 * here. Runs with the rest of the e2e suite: `npm run test:e2e`.
 */

// Plain path (not require.resolve): the spec runs under Playwright's TS
// transform where module scope is neither cleanly CJS nor ESM.
const AXE_PATH = path.join(process.cwd(), "node_modules/axe-core/axe.min.js");

// Key user-journey surfaces. Deliberately the same list the July 2026
// hand sweep used, plus /numbers (added after).
const ROUTES = [
  "/today",
  "/ask",
  "/events",
  "/search?q=animal+control",
  "/nearby",
  "/contacts",
  "/pulse",
  "/compass",
  "/places/brewers-alley-frederick",
  "/brunch",
  "/parking",
  "/open-now",
  "/happy-hour",
  "/deals",
  "/beer",
  "/live-music",
  "/shipping",
  "/amenities",
  "/towns",
  "/markers",
  "/history",
  "/my-radius",
  "/settings",
  "/plan",
  "/emergency-vet",
  "/numbers",
  "/reserve",
];

type AxeViolation = {
  id: string;
  impact: string | null;
  help: string;
  nodes: Array<{ target: string[] }>;
};

test.describe("UX gate: render health + WCAG A/AA", () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test("the detector tracks every current error-boundary message", () => {
    const boundarySources = {
      component: readFileSync(
        path.join(process.cwd(), "src/components/ui/ErrorBoundary.tsx"),
        "utf8",
      ),
      route: readFileSync(
        path.join(process.cwd(), "src/app/(app)/error.tsx"),
        "utf8",
      ),
      global: readFileSync(
        path.join(process.cwd(), "src/app/global-error.tsx"),
        "utf8",
      ),
    };

    for (const kind of Object.keys(
      ERROR_BOUNDARY_MARKERS_BY_KIND,
    ) as Array<keyof typeof ERROR_BOUNDARY_MARKERS_BY_KIND>) {
      for (const marker of ERROR_BOUNDARY_MARKERS_BY_KIND[kind]) {
        expect(
          boundarySources[kind],
          `${kind} error-boundary copy changed; update the runtime detector`,
        ).toContain(marker);
      }
    }
  });

  for (const route of ROUTES) {
    test(`${route}`, async ({ page }) => {
      // Generous on purpose: the first render of the unified event assembly
      // pulls every live feed (~2 min cold) and queues the dev server's
      // other requests behind it. The gate is about correctness, not speed
      // (npm run perf owns speed).
      test.setTimeout(300_000);
      // "domcontentloaded" — deliberately NOT "load" or "networkidle". The
      // DOM is all the render-health checks and axe need, and both fuller
      // states hang in sandboxes: fail-soft live feeds retry forever
      // (networkidle), and external subresources like map tiles can stall
      // the load event where outbound network is filtered.
      const response = await page.goto(route, { waitUntil: "domcontentloaded", timeout: 180_000 });

      // ── Render health ──
      expect(response?.status(), `${route} should serve 200`).toBe(200);
      await page.waitForTimeout(2500);
      const body = await page.textContent("body");
      const errorMarker = findErrorBoundaryMarker(body);
      expect(
        errorMarker,
        `${route} should not render an error boundary${errorMarker ? ` (matched: ${errorMarker})` : ""}`,
      ).toBeNull();
      // A complete page can legitimately fit within one phone viewport. A
      // fixed minimum document height treated concise search/chooser states as
      // blank, so assert the actual shell contract instead: visible main
      // content, one page heading, and meaningful text.
      const main = page.locator("main").first();
      await expect(main, `${route} should expose its main content`).toBeVisible();
      await expect(page.locator("main h1"), `${route} should have one page heading`).toHaveCount(1);
      const mainText = ((await main.innerText()) ?? "").replace(/\s+/g, " ").trim();
      expect(mainText.length, `${route} should render real content, not a blank shell`).toBeGreaterThan(20);

      // Search and Nearby intentionally render compact states. Preserve their
      // stronger interaction check because text alone could pass on an empty
      // chooser shell.
      if (route.startsWith("/search") || route === "/nearby") {
        expect(
          await page.locator("main a, main button").count(),
          `${route} should render real content (links/actions), not a blank shell`,
        ).toBeGreaterThan(2);
      }

      // ── Accessibility: WCAG 2.0/2.1 A + AA, pinned at zero ──
      await page.addScriptTag({ path: AXE_PATH });
      const violations = await page.evaluate(async () => {
        const axe = (window as unknown as { axe: { run: (ctx: Document, opts: object) => Promise<{ violations: unknown[] }> } }).axe;
        const result = await axe.run(document, {
          runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"] },
          resultTypes: ["violations"],
        });
        return result.violations as AxeViolation[];
      });
      const summary = (violations as AxeViolation[])
        .map((v) => `[${v.impact}] ${v.id} ×${v.nodes.length} (${v.help}) — ${v.nodes[0]?.target.join(" ")}`)
        .join("\n");
      expect(violations.length, `${route} WCAG violations:\n${summary}`).toBe(0);
    });
  }
});
