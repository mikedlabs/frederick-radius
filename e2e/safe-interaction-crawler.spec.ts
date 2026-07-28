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
  "/ask",
  "/pulse",
  "/compass",
  "/my-radius",
  "/deals",
  "/beta",
] as const;

const CONTROL_SELECTOR = "main a[href], main button, main [role='tab']";
const TARGET_CONTROLS_PER_SURFACE = 3;
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
      button?.disabled || element.getAttribute("aria-disabled") === "true",
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

      await page.goto(surface, {
        waitUntil: "domcontentloaded",
        timeout: 120_000,
      });
      appOrigin = new URL(page.url()).origin;
      await page.waitForTimeout(750);

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
        await page.goto(surface, {
          waitUntil: "domcontentloaded",
          timeout: 120_000,
        });
        await page.waitForTimeout(750);
        sameOriginMutations.length = 0;

        // Keep the exact ElementHandle that was inspected. Streamed sections
        // and Mapbox can reorder the DOM between two locator queries; a handle
        // guarantees the crawler clicks the control whose policy it evaluated.
        const safe = await safeControlHandles(page);
        const selected = safe.find(
          ({ candidate }) => !exercisedKeys.has(candidateKey(candidate)),
        );
        if (!selected) continue;

        if (!(await selected.handle.isVisible())) continue;
        await selected.handle.click({ timeout: 15_000 });
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
        exercisedKeys.add(candidateKey(selected.candidate));
        exercised += 1;
      }

      expect(exercised).toBeGreaterThanOrEqual(minimumExpected);
    });
  }
});
