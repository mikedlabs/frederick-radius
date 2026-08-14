import { expect, test, type Page, type TestInfo } from "@playwright/test";

const MOBILE_PROJECTS = new Set(["android-mobile", "webkit-mobile"]);

type JourneyWindow = Window & {
  __radiusPlausibleEvents?: string[];
  plausible?: (name: string) => void;
  __radiusPromptCalls?: number;
};

async function dismissMapSearchWithTouch(
  page: Page,
  projectName: string,
  canvasBox: { x: number; y: number; width: number; height: number },
) {
  const start = {
    x: canvasBox.x + canvasBox.width * 0.45,
    y: canvasBox.y + Math.min(canvasBox.height * 0.25, 180),
  };

  if (projectName === "android-mobile") {
    // Chromium exposes a trusted touch stream through CDP, so this project
    // exercises an actual one-finger pan rather than translating a mouse drag.
    const session = await page.context().newCDPSession(page);
    await session.send("Input.dispatchTouchEvent", {
      type: "touchStart",
      touchPoints: [start],
    });
    for (const offset of [12, 24, 36, 48]) {
      await session.send("Input.dispatchTouchEvent", {
        type: "touchMove",
        touchPoints: [{ x: start.x + offset, y: start.y }],
      });
    }
    await session.send("Input.dispatchTouchEvent", {
      type: "touchEnd",
      touchPoints: [],
    });
    await session.detach();
    return;
  }

  // Playwright's public WebKit API supports trusted taps but not swipe paths.
  // This still validates that a touch on exposed map space dismisses the tray;
  // real iPhone pan/scroll arbitration remains a physical-device check.
  await page.touchscreen.tap(start.x, start.y);
}

async function expectGoal(page: Page, goal: string) {
  await expect
    .poll(() =>
      page.evaluate(
        (name) =>
          (window as JourneyWindow).__radiusPlausibleEvents?.includes(name) ??
          false,
        goal,
      ),
    )
    .toBe(true);
}

async function capturedGoals(page: Page): Promise<string[]> {
  return page.evaluate(
    () => (window as JourneyWindow).__radiusPlausibleEvents ?? [],
  );
}

async function expectNoHorizontalOverflow(page: Page) {
  const overflow = await page.evaluate(
    () =>
      document.documentElement.scrollWidth -
      document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);
}

async function screenshot(page: Page, testInfo: TestInfo, name: string) {
  await page.screenshot({
    path: `output/playwright/${testInfo.project.name}-${name}.png`,
    fullPage: false,
  });
}

test.beforeEach(async ({ page }, testInfo) => {
  test.skip(
    !MOBILE_PROJECTS.has(testInfo.project.name),
    "Run with npm run test:journeys:mobile so both mobile engines are explicit.",
  );
  await page.addInitScript(() => {
    const target = window as JourneyWindow;
    target.__radiusPlausibleEvents = [];
    target.plausible = (name: string) => {
      target.__radiusPlausibleEvents?.push(name);
    };
  });
  // Keep this synthetic pass out of the member log and any external service.
  // The in-page Plausible stub above is the assertion target.
  await page.route("**/api/track", (route) =>
    route.fulfill({ status: 204, body: "" }),
  );
});

test("Today exposes an answer above a clear four-item bottom navigation", async ({
  page,
}, testInfo) => {
  await page.goto("/today", { waitUntil: "domcontentloaded" });
  await expect(page.locator("main h1")).toBeVisible();

  // BottomNav and SideRail intentionally share the same accessible name; only
  // one is visible at this breakpoint.
  const nav = page.locator('nav[aria-label="Primary"]:visible');
  const links = nav.getByRole("link");
  await expect(links).toHaveCount(4);
  for (const link of await links.all()) {
    const box = await link.boundingBox();
    expect(box, "expected every bottom-navigation link to be rendered").not.toBeNull();
    expect(box?.height ?? 0).toBeGreaterThanOrEqual(44);
  }

  const lead = page.locator(
    '[data-decision-surface="today"][data-decision-position="lead"]:visible',
  ).first();
  await expect(lead).toBeVisible({ timeout: 20_000 });
  await lead.scrollIntoViewIfNeeded();
  await expectGoal(page, "today_answer_view");
  await expectNoHorizontalOverflow(page);
  await screenshot(page, testInfo, "today-answer");
});

test("Map handles permission, focus, touch dismissal, a useful result, and its place sheet", async ({
  context,
  page,
}, testInfo) => {
  test.slow();
  await context.setGeolocation({ latitude: 39.4143, longitude: -77.4108 });
  await context.grantPermissions(["geolocation"]);
  await page.goto("/map", { waitUntil: "domcontentloaded" });
  await expect(page.locator(".dock-host")).toHaveAttribute(
    "data-map-loaded",
    "true",
    { timeout: 30_000 },
  );

  const locate = page.getByRole("button", {
    name: /Locate me on the map|Recenter on my location/,
  });
  await expect(locate).toBeVisible();
  await locate.click();
  await expect
    .poll(() => page.evaluate(() => window.sessionStorage.getItem("fr_geo_v1")))
    .not.toBeNull();

  const dock = page.locator("[data-map-dock] .dock-head");
  const search = page.getByRole("combobox", { name: "Search this map" });
  const coldDock = await dock.boundingBox();
  await search.focus();
  const focusedDock = await dock.boundingBox();
  expect(
    Math.abs((focusedDock?.y ?? 0) - (coldDock?.y ?? 0)),
    "focus alone must not imitate a software-keyboard resize",
  ).toBeLessThanOrEqual(2);

  await search.fill("Gravel and Grind");
  const result = page.locator(
    '[data-map-search-result="place:gravel-and-grind-frederick"]',
  );
  await expect(result).toBeVisible({ timeout: 15_000 });

  // Exercise the map's touch-dismiss contract before selecting the result.
  // Android receives a trusted swipe; WebKit receives a trusted tap because
  // Playwright does not expose a public iPhone swipe primitive.
  const canvas = page.locator(
    "canvas.mapboxgl-canvas, canvas.maplibregl-canvas",
  );
  const canvasBox = await canvas.boundingBox();
  expect(canvasBox).not.toBeNull();
  await dismissMapSearchWithTouch(page, testInfo.project.name, canvasBox!);
  await expect(result).toHaveCount(0);

  if (testInfo.project.name === "android-mobile") {
    // Chromium retains input focus during its trusted swipe, so re-enter the
    // phrase as the explicit recovery action.
    await search.fill("");
    await search.fill("Gravel and Grind");
  } else {
    // WebKit's tap moves focus to the canvas. Returning focus reopens the
    // already-settled result without starting a second async search cycle.
    await search.focus();
  }
  await expect(result).toBeVisible({ timeout: 15_000 });
  await result.click();
  const peek = page.locator(
    '[data-map-place-slug="gravel-and-grind-frederick"]',
  );
  await expect(peek).toBeVisible({ timeout: 20_000 });
  await expectGoal(page, "map_result_view");

  const details = page.getByRole("button", { name: "Details", exact: true });
  // The result peek slides into place. Measure after that transform settles so
  // the browser's transient fractional box does not hide the 44px CSS target.
  await expect
    .poll(async () => (await details.boundingBox())?.height ?? 0)
    .toBeGreaterThanOrEqual(44);
  await details.click();
  const sheet = page.getByRole("dialog", { name: "Gravel & Grind" });
  await expect(sheet).toBeVisible();
  // The sheet enters with a short transform. Judge its settled geometry, not
  // the first animation frame, which can sit one fractional pixel above 0.
  await expect
    .poll(async () => {
      const box = await sheet.boundingBox();
      const viewportHeight = await page.evaluate(() => window.innerHeight);
      return Boolean(
        box
        && box.y >= 0
        && box.y + box.height <= viewportHeight,
      );
    })
    .toBe(true);
  await expectNoHorizontalOverflow(page);
  await screenshot(page, testInfo, "map-result-sheet");
});

test("Events opens a detail and records a completed save", async ({ page }, testInfo) => {
  await page.goto("/events", { waitUntil: "domcontentloaded" });
  await expect(page.locator("main h1")).toBeVisible();
  // Before hydration, the real event links intentionally navigate. Wait for
  // the board's own readiness marker so this check genuinely exercises its
  // enhanced in-place detail journey instead of racing the client boundary.
  await expect(page.locator("[data-events-interaction-ready]"))
    .toHaveAttribute("data-events-interaction-ready", "true");

  const open = page.locator(
    '[data-decision-surface="events"]:visible [data-decision-action="open"]:visible',
  ).first();
  await expect(open).toBeVisible({ timeout: 20_000 });
  await open.scrollIntoViewIfNeeded();
  await open.click();
  await expectGoal(page, "events_detail_open");
  await expect
    .poll(async () =>
      (await capturedGoals(page)).filter(
        (goal) => goal === "events_detail_open",
      ).length,
    )
    .toBe(1);

  const detail = page.getByRole("dialog").last();
  await expect(detail).toBeVisible({ timeout: 20_000 });
  const save = detail.locator('[data-save-ref^="event:"]').first();
  // A cold development server may still be compiling the event-detail route
  // after the shell opens. Wait for the real action rather than mistaking the
  // intentionally short Loading state for a detail failure.
  await expect(save).toBeVisible({ timeout: 20_000 });
  await expect(save).toHaveAttribute("aria-pressed", "false");
  await save.click();
  await expect(save).toHaveAttribute("aria-pressed", "true");
  await expectGoal(page, "save_event");

  const serializedGoals = JSON.stringify(await capturedGoals(page));
  expect(serializedGoals).not.toMatch(/query|answer|gravel|email|address/i);
  await expectNoHorizontalOverflow(page);
  await screenshot(page, testInfo, "event-detail-save");
});

test("Install completion stays honest about what the browser can prove", async ({
  page,
}, testInfo) => {
  // WebKit can spend most of the default 30-second budget waiting for a cold
  // development route build. The product assertions below remain bounded.
  test.slow();
  await page.goto("/today", { waitUntil: "domcontentloaded" });
  await expect(page.locator("main h1")).toBeVisible({ timeout: 20_000 });

  if (testInfo.project.name === "android-mobile") {
    await expect(page.locator("html")).toHaveAttribute(
      "data-return-bridge-ready",
      "true",
      { timeout: 20_000 },
    );
    await page.evaluate(() => {
      const target = window as JourneyWindow;
      target.__radiusPromptCalls = 0;
      const installEvent = new Event("beforeinstallprompt", {
        bubbles: false,
        cancelable: true,
      }) as Event & {
        prompt: () => Promise<void>;
        userChoice: Promise<{ outcome: "accepted"; platform: string }>;
      };
      installEvent.prompt = async () => {
        target.__radiusPromptCalls = (target.__radiusPromptCalls ?? 0) + 1;
      };
      installEvent.userChoice = Promise.resolve({
        outcome: "accepted",
        platform: "web",
      });
      window.dispatchEvent(installEvent);
      window.dispatchEvent(new Event("fr:open-install"));
    });

    const panel = page.locator("[data-return-bridge]");
    await expect(panel).toHaveAttribute("data-surface", "native");
    await panel.getByRole("button", { name: "Add to Home Screen" }).click();
    await expectGoal(page, "install_complete");
    await expect
      .poll(() =>
        page.evaluate(
          () => (window as JourneyWindow).__radiusPromptCalls ?? 0,
        ),
      )
      .toBe(1);
  } else {
    const panel = page.locator("[data-return-bridge]");
    // Assert the public behavior directly. The internal readiness marker can
    // disappear during a layout remount even though the global listener is
    // active, so retry the harmless open request until the panel responds.
    await expect
      .poll(async () => {
        await page.evaluate(() =>
          window.dispatchEvent(new Event("fr:open-install")),
        );
        return panel.getAttribute("data-surface");
      }, { timeout: 20_000 })
      .toBe("ios-safari");
    await panel.getByRole("button", { name: "I added Radius" }).click();
    await expectGoal(page, "install_reported_complete");
    expect(await capturedGoals(page)).not.toContain("install_complete");
  }

  await screenshot(page, testInfo, "install-completion");
});
