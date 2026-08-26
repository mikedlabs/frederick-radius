import { expect, test, type Locator, type Page, type TestInfo } from "@playwright/test";
import { mkdirSync, writeFileSync } from "node:fs";
import { basename, dirname, join } from "node:path";

/**
 * Deliberate visual contracts for the shared surfaces where small CSS drift
 * has the largest product-wide cost: Find, Ask, Compass, the canonical detail
 * sheet, and the map command surface.
 *
 * This suite is opt-in while the Linux reference images are being reviewed:
 *
 *   PW_VISUAL_MODE=capture npx playwright test e2e/visual-contract.spec.ts
 *   PW_VISUAL_MODE=compare npx playwright test e2e/visual-contract.spec.ts
 *
 * Capture mode writes review candidates under visual-contract-candidates.
 * Compare mode uses Playwright's pixel matcher and requires reviewed,
 * platform-specific images in e2e/visual-contract.spec.ts-snapshots. Keeping
 * capture separate from compare prevents a developer's macOS font
 * rasterization from silently becoming the Linux CI baseline.
 */

const VISUAL_MODE = process.env.PW_VISUAL_MODE;
const VISUAL_ENABLED = VISUAL_MODE === "capture" || VISUAL_MODE === "compare";

test.skip(
  !VISUAL_ENABLED,
  "Set PW_VISUAL_MODE=capture or PW_VISUAL_MODE=compare to run visual contracts.",
);

test.describe.configure({ mode: "serial" });

const VIEWPORTS = [
  {
    name: "mobile-375x812",
    width: 375,
    height: 812,
    isMobile: true,
    hasTouch: true,
  },
  {
    name: "desktop-1366x900",
    width: 1366,
    height: 900,
    isMobile: false,
    hasTouch: false,
  },
] as const;

const RETURN_BRIDGE_COMPLETE = JSON.stringify({
  sessions: 1,
  lastSessionAt: 1,
  valueKind: null,
  valueAt: 0,
  dismissals: 1,
  snoozedUntil: 0,
  autoDisabled: true,
  completed: true,
  lastOfferAt: 1,
});
const VISUAL_NOW = new Date("2026-08-21T12:00:00-04:00");

async function prepareStableBrowser(page: Page) {
  await page.addInitScript((returnBridgeState) => {
    window.localStorage.clear();
    window.sessionStorage.clear();
    window.localStorage.setItem("fr:return-bridge:v1", returnBridgeState);
  }, RETURN_BRIDGE_COMPLETE);
  await page.emulateMedia({ reducedMotion: "reduce", colorScheme: "light" });
}

async function settleVisuals(page: Page) {
  await page.addStyleTag({
    content: `
      *, *::before, *::after {
        animation-delay: 0s !important;
        animation-duration: 0s !important;
        caret-color: transparent !important;
        scroll-behavior: auto !important;
        transition-delay: 0s !important;
        transition-duration: 0s !important;
      }
      video { visibility: hidden !important; }
      nextjs-portal { display: none !important; }
      canvas.mapboxgl-canvas { opacity: 0 !important; }
      .mapboxgl-ctrl-logo,
      .mapboxgl-ctrl-attrib { visibility: hidden !important; }
      .dock-host:has(canvas.mapboxgl-canvas) {
        background: var(--app-bg-sunken) !important;
      }
      .mapboxgl-marker,
      [data-live-bus-marker],
      .map-live-bus-aggregate { visibility: hidden !important; }
    `,
  });
  await page.evaluate(async () => {
    await document.fonts.ready;
    window.scrollTo({ top: 0, left: 0, behavior: "instant" });
    const images = Array.from(document.images).filter((image) => image.complete);
    await Promise.all(images.map((image) => image.decode().catch(() => undefined)));
  });
  // Two frames let layout effects settle without an arbitrary network wait.
  await page.evaluate(() => new Promise<void>((resolve) => {
    requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
  }));
}

async function visualContract({
  page,
  testInfo,
  name,
  target,
  mask = [],
}: {
  page: Page;
  testInfo: TestInfo;
  name: string;
  target?: Locator;
  mask?: Locator[];
}) {
  await settleVisuals(page);
  const platformName = process.platform;
  const baselineName = `${name}-${platformName}.png`;
  // Playwright adds the project and platform through its snapshot template.
  // Derive the review artifact name from that same template so an approved
  // capture can be copied into the snapshot directory without being renamed.
  const expectedArtifactName = basename(testInfo.snapshotPath(baselineName));
  const options = {
    animations: "disabled" as const,
    caret: "hide" as const,
    mask,
    maskColor: "#e4ddd0",
    scale: "css" as const,
  };

  if (VISUAL_MODE === "compare") {
    if (target) {
      await expect(target).toHaveScreenshot(baselineName, {
        ...options,
        maxDiffPixelRatio: 0.002,
      });
    } else {
      await expect(page).toHaveScreenshot(baselineName, {
        ...options,
        maxDiffPixelRatio: 0.002,
      });
    }
    return;
  }

  // Successful Playwright runs may clean per-test output directories before a
  // later workflow step can upload them. Keep review candidates in one ignored
  // workspace directory so capture artifacts reliably survive the test run.
  const path = join(process.cwd(), "visual-contract-candidates", expectedArtifactName);
  mkdirSync(dirname(path), { recursive: true });
  const image = target
    ? await target.screenshot(options)
    : await page.screenshot(options);
  writeFileSync(path, image);
  await testInfo.attach(expectedArtifactName, {
    body: image,
    contentType: "image/png",
  });
}

for (const viewport of VIEWPORTS) {
  test.describe(viewport.name, () => {
    test.use({
      viewport: { width: viewport.width, height: viewport.height },
      isMobile: viewport.isMobile,
      hasTouch: viewport.hasTouch,
      locale: "en-US",
      timezoneId: "America/New_York",
    });

    test.beforeEach(async ({ page }) => {
      await page.clock.setFixedTime(VISUAL_NOW);
      await prepareStableBrowser(page);
      await page.route("**/api/pulse/status", async (route) => {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          json: { active: false, count: 0, tone: "quiet", ok: true },
        });
      });
    });

    test("global Find opens as one focused task surface", async ({ page }, testInfo) => {
      await page.goto("/today", { waitUntil: "domcontentloaded" });
      const trigger = page.getByRole("button", {
        name: "Ask or find across Frederick County",
      });
      await expect(trigger).toBeVisible({ timeout: 20_000 });
      await trigger.click();

      const dialog = page.getByRole("dialog", { name: "What do you need?" });
      await expect(dialog).toBeVisible();
      await expect(
        page.getByRole("searchbox", {
          name: "Ask or find across Frederick County",
        }),
      ).toBeFocused();

      await visualContract({
        page,
        testInfo,
        name: `find-empty-${viewport.name}`,
        target: dialog,
      });
    });

    test("Ask Radius starts with a clear composer and examples", async ({ page }, testInfo) => {
      await page.goto("/ask", { waitUntil: "domcontentloaded" });
      const ask = page.locator('[data-ask-interaction-ready="true"]');
      await expect(ask).toBeVisible({ timeout: 20_000 });
      await expect(page.getByRole("heading", { name: "Ask Radius." })).toBeVisible();
      await expect(page.getByRole("search", { name: "Ask Radius" })).toBeVisible();

      await visualContract({
        page,
        testInfo,
        name: `ask-empty-${viewport.name}`,
        target: ask,
      });
    });

    test("Ask Radius keeps a stable, branded working state", async ({ page }, testInfo) => {
      const requestGate: { release: (() => void) | null } = { release: null };
      await page.route("**/api/ask", async (route) => {
        await new Promise<void>((resolve) => {
          requestGate.release = resolve;
        });
        await route.abort();
      });
      await page.goto("/ask", { waitUntil: "domcontentloaded" });
      await expect(page.locator('[data-ask-interaction-ready="true"]')).toBeVisible({
        timeout: 20_000,
      });
      await page
        .getByRole("textbox", { name: "Ask Radius" })
        .fill("What is worth doing tonight?");
      await page.getByRole("button", { name: "Ask Radius" }).click();

      const working = page.locator("[data-ask-working-panel]");
      await expect(working).toBeVisible();
      await visualContract({
        page,
        testInfo,
        name: `ask-working-${viewport.name}`,
        target: working,
      });
      requestGate.release?.();
    });

    test("the live-bus map opens in the canonical solid sheet", async ({ page }, testInfo) => {
      await page.route("**/api/transit/vehicles", async (route) => {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          json: { available: true, status: "ok", vehicles: [] },
        });
      });
      await page.route("**/api/transit/alerts", async (route) => {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          json: { available: true, status: "ok", alerts: [] },
        });
      });
      await page.route("**/api/transit/shapes", async (route) => {
        await route.fulfill({
          status: 503,
          contentType: "application/json",
          json: { error: "visual fixture" },
        });
      });
      await page.goto("/pulse", { waitUntil: "domcontentloaded" });
      const trigger = page.getByRole("button", { name: "Show current buses" });
      await expect(trigger).toBeVisible({ timeout: 20_000 });
      // The trigger is server-rendered before React can handle its click. The
      // summary changes only after the client effect has run and both mocked
      // feeds have answered, which gives this interaction a semantic hydration
      // boundary instead of relying on an arbitrary timeout.
      await expect(page.locator("#pulse-live-buses-summary")).not.toHaveText(
        "Checking live service…",
        { timeout: 20_000 },
      );
      await trigger.click();

      const dialog = page.getByRole("dialog", { name: "Buses right now" });
      await expect(dialog).toBeVisible({ timeout: 20_000 });
      const panel = dialog.locator("[data-bottom-sheet-panel]");
      await visualContract({
        page,
        testInfo,
        name: `pulse-bus-sheet-${viewport.name}`,
        target: panel,
      });
    });

    test("Compass leads with decisions instead of its full inventory", async ({
      page,
    }, testInfo) => {
      await page.route("**/api/deck", async (route) => {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          json: { keys: [] },
        });
      });
      await page.goto("/compass", { waitUntil: "domcontentloaded" });
      const compass = page.locator('[data-compass-ready="true"]');
      await expect(compass).toBeVisible({ timeout: 20_000 });
      await expect(
        compass.getByRole("heading", { name: "Choose a direction" }),
      ).toBeVisible();
      await expect(
        compass.getByRole("button", { name: /Find something/ }),
      ).toBeVisible();

      await visualContract({
        page,
        testInfo,
        name: `compass-directions-${viewport.name}`,
      });
    });

    test("the map chooser preserves the map while revealing one command layer", async ({
      page,
    }, testInfo) => {
      await page.route("**/api/transit/vehicles", async (route) => {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          json: {
            available: true,
            status: "ok",
            feedTimestamp: 1_786_789_800,
            vehicles: [],
          },
        });
      });
      await page.route("**/api/transit/alerts", async (route) => {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          json: { available: true, status: "ok", alerts: [] },
        });
      });
      // Explicitly empty layers prevent the map's moment-aware cold-start
      // suggestion from changing the chooser between otherwise identical runs.
      await page.goto("/map?show=none", { waitUntil: "domcontentloaded" });
      await expect(page.locator(".dock-host")).toHaveAttribute(
        "data-map-loaded",
        "true",
        { timeout: 25_000 },
      );
      await page
        .getByRole("button", { name: "Choose what to see on this map" })
        .click();
      const chooser = page.getByRole("region", { name: "Choose what to see" });
      await expect(chooser).toBeVisible();
      await expect(chooser.getByRole("button", { name: /^Near me/ })).toBeVisible();

      await visualContract({
        page,
        testInfo,
        name: `map-chooser-${viewport.name}`,
      });
    });
  });
}
