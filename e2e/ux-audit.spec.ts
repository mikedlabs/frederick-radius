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
  "/map",
  "/ask",
  "/events",
  "/fair",
  "/search?q=animal+control",
  "/nearby",
  "/contacts",
  "/access",
  "/pulse",
  "/compass",
  "/places/brewers-alley-frederick",
  "/brunch",
  "/parking",
  "/open-now",
  "/happy-hour",
  "/deals",
  "/beer",
  "/food-trucks",
  "/live-music",
  "/shipping",
  "/amenities",
  "/sports",
  "/towns",
  "/markers",
  "/trails",
  "/history",
  "/my-radius",
  "/settings",
  "/install",
  "/plan",
  "/emergency",
  "/emergency-vet",
  "/scanner",
  "/numbers",
  "/reserve",
  // /trust carries live coverage numbers since Aug 2026 — a data-bearing
  // credibility surface belongs under the same zero-violation gate.
  "/trust",
  // CEO-ready partner concepts still ship on the public runtime. Keep the
  // standalone presentation surface at the same render/accessibility bar.
  "/concept/wlr",
  // The front door. Every visitor sees it before anything else, and it
  // drifted through three rejected design drafts while ungated (owner
  // review, 2026-07-19) — it holds to the same bar as what it gates.
  "/beta",
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
      // ── No clipped chrome ──
      // The app bar is a fixed row, never a scroller, so when its content
      // outgrows the viewport the overflow is CLIPPED: a control loses its
      // border and part of its tap target, silently.
      //
      // This gate already ran at 390px, which is exactly the width where
      // that happened, and could not see it. Render health passes on a
      // sliced chip and so does axe, because the element is present,
      // labelled and the right colour. Nothing here measured whether it
      // fit. On 2026-08-21 the Tools chip was 5px over on the most common
      // phone width there is.
      //
      // Scoped to the header on purpose. Horizontal scrollers elsewhere
      // (the /today shelves) are deliberate and must stay allowed.
      const headerFit = await page.evaluate(() => {
        const header = document.querySelector("header");
        if (!header) return null;
        return { needs: header.scrollWidth, has: header.clientWidth };
      });
      if (headerFit) {
        expect(
          headerFit.needs,
          `${route}: the header needs ${headerFit.needs}px in ${headerFit.has}px, so ${headerFit.needs - headerFit.has}px of a control is clipped off the screen edge`,
        ).toBeLessThanOrEqual(headerFit.has);
      }

      const main = page.locator("main").first();
      await expect(main, `${route} should expose its main content`).toBeVisible();
      await expect(page.locator("main h1"), `${route} should have one page heading`).toHaveCount(1);
      const mainText = ((await main.innerText()) ?? "").replace(/\s+/g, " ").trim();
      expect(mainText.length, `${route} should render real content, not a blank shell`).toBeGreaterThan(20);

      if (route === "/map") {
        const geometry = await page.evaluate(() => {
          const header = document.querySelector("header");
          const mainElement = document.querySelector("main");
          return {
            headerBottom: header?.getBoundingClientRect().bottom ?? 0,
            mainTop: mainElement?.getBoundingClientRect().top ?? 0,
            documentHeight: document.documentElement.scrollHeight,
            viewportHeight: window.innerHeight,
          };
        });
        expect(
          geometry.mainTop,
          "/map content should start below the TopBar instead of sliding under it",
        ).toBeGreaterThanOrEqual(geometry.headerBottom - 1);
        expect(
          geometry.documentHeight,
          "/map should not add a reading-page scroll tail below its viewport-locked canvas",
        ).toBeLessThanOrEqual(geometry.viewportHeight + 2);
      }

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
