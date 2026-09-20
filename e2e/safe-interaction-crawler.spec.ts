import { expect, test } from "@playwright/test";
import { findErrorBoundaryMarker } from "./error-boundary-markers";
import {
  classifySafeInteraction,
  type InteractionCandidate,
} from "../src/lib/testing/safe-interaction-policy";

const SURFACES = [
  "/today",
  "/map",
  "/events",
  "/fair",
  "/ask",
  "/access",
  "/pulse",
  "/compass",
  "/my-radius",
  "/deals",
  "/beta",
] as const;

const CONTROL_SELECTOR = "main a[href], main button, main [role='tab']";
const TARGET_CONTROLS_PER_SURFACE = 3;
const DEFAULT_SURFACE_SETTLE_MS = 750;
const MAP_DOCK_SELECTOR = "[data-map-dock]";
const MAP_INTERACTIVE_BUDGET_MS = 15_000;
const READ_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);
const OBSERVATIONAL_WRITES = new Set(["/api/track"]);

type IndexedCandidate = InteractionCandidate & { index: number };

function readCandidate(element: HTMLElement, index: number): IndexedCandidate {
  const anchor = element instanceof HTMLAnchorElement ? element : null;
  const button = element instanceof HTMLButtonElement ? element : null;
  return {
    index,
    tagName: element.tagName.toLowerCase(),
    text:
      element.getAttribute("aria-label") ??
      element.innerText ??
      element.textContent ??
      "",
    href: anchor?.getAttribute("href") ?? null,
    target: anchor?.getAttribute("target") ?? null,
    download: Boolean(anchor?.hasAttribute("download")),
    buttonType: button?.type ?? null,
    disabled: Boolean(
      button?.disabled ||
        element.getAttribute("aria-disabled") === "true" ||
        element.closest("[inert], [aria-hidden='true']"),
    ),
    role: element.getAttribute("role"),
    ariaExpanded: element.getAttribute("aria-expanded"),
    ariaPressed: element.getAttribute("aria-pressed"),
    ariaHasPopup: element.getAttribute("aria-haspopup"),
    crawlerPolicy: element.getAttribute("data-crawler-safe"),
  };
}

function priority(candidate: IndexedCandidate): number {
  const kind = classifySafeInteraction(candidate).kind;
  return kind === "disclosure"
    ? 0
    : kind === "toggle"
      ? 1
      : kind === "tab"
        ? 2
        : 3;
}

async function safeControlHandles(
  page: import("@playwright/test").Page,
) {
  const handles = await page.locator(CONTROL_SELECTOR).elementHandles();
  const safe = [];
  for (let index = 0; index < handles.length; index += 1) {
    const handle = handles[index];
    if (!(await handle.isVisible())) continue;
    const candidate = await handle.evaluate(readCandidate, index);
    if (!classifySafeInteraction(candidate).safe) continue;
    safe.push({ candidate, handle });
  }
  return safe.sort(
    (left, right) =>
      priority(left.candidate) - priority(right.candidate) ||
      left.candidate.index - right.candidate.index,
  );
}

function candidateKey(candidate: IndexedCandidate): string {
  return [
    candidate.tagName,
    candidate.href ?? "",
    candidate.role ?? "",
    candidate.text.replace(/\s+/g, " ").trim().toLowerCase(),
  ].join("|");
}

async function gotoReadySurface(
  page: import("@playwright/test").Page,
  surface: (typeof SURFACES)[number],
) {
  const navigationStartedAt = Date.now();
  await page.goto(surface, {
    waitUntil: "domcontentloaded",
    timeout: surface === "/map" ? MAP_INTERACTIVE_BUDGET_MS : 120_000,
  });

  if (surface !== "/map") {
    await page.waitForTimeout(DEFAULT_SURFACE_SETTLE_MS);
    return;
  }

  // /map mounts its interactive dock from a client-only chunk. A fixed pause
  // races that chunk on slower CI runners, while an unbounded readiness wait
  // could hide a genuinely broken map. Count navigation time toward one clear
  // mobile-interactivity budget and fail if the dock cannot meet it.
  const elapsedAfterNavigation = Date.now() - navigationStartedAt;
  const remainingBudget = Math.max(
    1,
    MAP_INTERACTIVE_BUDGET_MS - elapsedAfterNavigation,
  );
  await expect(
    page.locator(MAP_DOCK_SELECTOR),
    `/map should expose its interactive dock within ${MAP_INTERACTIVE_BUDGET_MS}ms`,
  ).toBeVisible({ timeout: remainingBudget });

  expect(
    Date.now() - navigationStartedAt,
    `/map exceeded its ${MAP_INTERACTIVE_BUDGET_MS}ms interaction-readiness budget`,
  ).toBeLessThanOrEqual(MAP_INTERACTIVE_BUDGET_MS);
}

test.describe("safe interaction crawler", () => {
  test.use({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
    geolocation: { longitude: -77.4106, latitude: 39.4143 },
    permissions: ["geolocation"],
    // A previously installed PWA worker must not be able to satisfy or issue a
    // request behind the crawler's write barrier.
    serviceWorkers: "block",
  });

  for (const surface of SURFACES) {
    test(`${surface} exercises representative read-only controls`, async ({
      page,
      context,
    }) => {
      test.setTimeout(180_000);
      const sameOriginMutations: string[] = [];
      let appOrigin = "";

      // Context-wide routing also covers a popup's first request. Page routing
      // alone can miss that navigation, which would leave a window for a
      // misclassified `aria-haspopup` control to escape the write barrier.
      await context.route("**/*", async (route) => {
        const request = route.request();
        if (READ_METHODS.has(request.method())) {
          await route.continue();
          return;
        }
        const url = new URL(request.url());
        if (
          appOrigin &&
          url.origin === appOrigin &&
          !OBSERVATIONAL_WRITES.has(url.pathname)
        ) {
          sameOriginMutations.push(`${request.method()} ${url.pathname}`);
        }
        // The crawl is observational. It never lets a write leave the browser,
        // including analytics or a control whose markup was misclassified.
        await route.abort("blockedbyclient");
      });

      await gotoReadySurface(page, surface);
      appOrigin = new URL(page.url()).origin;

      const initialSafe = await safeControlHandles(page);
      expect(
        initialSafe.length,
        `${surface} should expose at least one provably read-only control`,
      ).toBeGreaterThan(0);

      const minimumExpected = Math.min(2, initialSafe.length);
      let exercised = 0;
      const exercisedKeys = new Set<string>();

      for (
        let attempt = 0;
        attempt < 8 && exercised < TARGET_CONTROLS_PER_SURFACE;
        attempt += 1
      ) {
        await gotoReadySurface(page, surface);
        sameOriginMutations.length = 0;

        // Inspect a concrete handle first. Streamed sections and the map may
        // replace that node after scrolling, so the crawler re-inspects the
        // live DOM below before it clicks the same semantic control.
        const safe = await safeControlHandles(page);
        const selected = safe.find(
          ({ candidate }) => !exercisedKeys.has(candidateKey(candidate)),
        );
        if (!selected) continue;
        const selectedKey = candidateKey(selected.candidate);

        if (!(await selected.handle.isVisible())) continue;
        // Sticky page controls can cover the browser's minimal automatic
        // scroll target even though the candidate is valid. Center the exact
        // inspected handle, then retain Playwright's normal hit-target check.
        await selected.handle.evaluate((element) => {
          (element as Element).scrollIntoView({
            block: "center",
            inline: "center",
            behavior: "instant",
          });
        });
        await page.waitForTimeout(100);
        const refreshed = (await safeControlHandles(page)).find(
          ({ candidate }) => candidateKey(candidate) === selectedKey,
        );
        if (!refreshed || !(await refreshed.handle.isVisible())) continue;
        try {
          await refreshed.handle.click({ timeout: 15_000 });
        } catch (error) {
          // A live map can replace a valid control between the final policy
          // check and the pointer action. Retry the whole inspect-and-click
          // transaction; never click an uninspected replacement node.
          if (String(error).includes("Element is not attached to the DOM")) {
            continue;
          }
          throw new Error(`${surface}: could not activate "${selected.candidate.text}"`, { cause: error });
        }
        await page.waitForTimeout(350);

        expect(
          sameOriginMutations,
          `${surface}: ${selected.candidate.text} attempted a write`,
        ).toEqual([]);
        expect(new URL(page.url()).origin).toBe(appOrigin);
        const main = page.locator("main").first();
        await expect(main).toBeVisible();
        const errorMarker = findErrorBoundaryMarker(await page.textContent("body"));
        expect(
          errorMarker,
          `${surface}: ${selected.candidate.text} opened an error boundary`,
        ).toBeNull();
        exercisedKeys.add(selectedKey);
        exercised += 1;
      }

      expect(exercised).toBeGreaterThanOrEqual(minimumExpected);
    });
  }
});
