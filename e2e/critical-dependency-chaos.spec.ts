import { expect, test, type Page, type Route } from "@playwright/test";
import { findErrorBoundaryMarker } from "./error-boundary-markers";

type FailureKind = "hanging" | "malformed" | "unavailable";

const hits: Record<FailureKind, string[]> = {
  hanging: [],
  malformed: [],
  unavailable: [],
};

function remember(kind: FailureKind, route: Route) {
  hits[kind].push(new URL(route.request().url()).pathname);
}

async function installDependencyChaos(page: Page) {
  await page.route("**/api/**", async (route) => {
    const { pathname } = new URL(route.request().url());

    // A request that starts but never produces a usable response. Keep the
    // delay short enough for a required PR check while still exercising the
    // mounted component's pending state and aborted-request path.
    if (pathname === "/api/sports/keys" || pathname === "/api/search") {
      remember("hanging", route);
      await new Promise((resolve) => setTimeout(resolve, 300));
      await route.abort("timedout");
      return;
    }

    // Nominal 200 with an invalid payload. This catches the dangerous case
    // where status-only handling mistakes malformed upstream data for empty.
    if (
      pathname === "/api/food-trucks/live" ||
      pathname === "/api/map/search-fallback"
    ) {
      remember("malformed", route);
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: "{not-valid-json",
      });
      return;
    }

    // Explicit dependency outage. Each surface must preserve a next action
    // and describe the outage instead of translating it to "nothing."
    if (
      pathname === "/api/sports/local" ||
      pathname === "/api/events/browse" ||
      pathname === "/api/ask"
    ) {
      remember("unavailable", route);
      await route.fulfill({
        status: 503,
        contentType: "application/json",
        body: JSON.stringify({
          status: "unavailable",
          message: "The source is temporarily unavailable.",
        }),
      });
      return;
    }

    await route.continue();
  });
}

async function expectHealthyShell(page: Page, route: string) {
  await expect(page.locator("main").first(), `${route} keeps main content`).toBeVisible();
  await expect(page.locator("main h1"), `${route} keeps one page heading`).toHaveCount(1);
  const body = await page.textContent("body");
  expect(
    findErrorBoundaryMarker(body),
    `${route} must not collapse into an error boundary`,
  ).toBeNull();
}

test.describe("critical surfaces under combined dependency failure", () => {
  test.use({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
    geolocation: { longitude: -77.4106, latitude: 39.4143 },
    permissions: ["geolocation"],
    serviceWorkers: "block",
  });

  test("Today, Map, Events, and Ask remain honest and actionable", async ({
    page,
  }) => {
    test.setTimeout(150_000);
    hits.hanging.length = 0;
    hits.malformed.length = 0;
    hits.unavailable.length = 0;

    const pageErrors: string[] = [];
    page.on("pageerror", (error) => pageErrors.push(error.message));
    await installDependencyChaos(page);

    // TODAY: a stalled score, unavailable local sports feed, and malformed
    // live-truck payload happen together. The published vendor roster remains
    // useful, and no failed live read is described as proof of zero trucks.
    let response = await page.goto("/today", {
      waitUntil: "domcontentloaded",
      timeout: 90_000,
    });
    expect(response?.status()).toBe(200);
    await expectHealthyShell(page, "/today");
    await expect(page.getByRole("link", { name: "Open Ask Radius" })).toBeVisible();
    await page
      .getByRole("button", { name: "More for today", exact: true })
      .click();
    await expect(page.getByRole("link", { name: /Food trucks/i })).toBeVisible();
    await expect
      .poll(() => hits.malformed.includes("/api/food-trucks/live"))
      .toBe(true);
    await expect
      .poll(() => hits.hanging.includes("/api/sports/keys"))
      .toBe(true);
    await expect
      .poll(() => hits.unavailable.includes("/api/sports/local"))
      .toBe(true);
    await expect(page.getByText(/No food trucks|Nothing.*food truck/i)).toHaveCount(0);

    // MAP: even when the drawing engine cannot initialize in headless CI, the
    // route must preserve either its search instrument or the readable-list
    // recovery action. Both are real ways forward, not a blank canvas.
    response = await page.goto("/map", {
      waitUntil: "domcontentloaded",
      timeout: 90_000,
    });
    expect(response?.status()).toBe(200);
    await expectHealthyShell(page, "/map");
    const mapSearch = page.getByRole("combobox", { name: "Search this map" });
    const mapFallback = page.getByRole("link", { name: "All places" });
    await expect
      .poll(async () => (await mapSearch.isVisible()) || (await mapFallback.isVisible()))
      .toBe(true);

    // EVENTS: choosing an interest requests the complete calendar. A 503 must
    // be named as an outage while the already-rendered board and retry remain.
    response = await page.goto("/events", {
      waitUntil: "domcontentloaded",
      timeout: 90_000,
    });
    expect(response?.status()).toBe(200);
    await expectHealthyShell(page, "/events");
    const eventsExplorer = page.locator("[data-events-interaction-ready]");
    await expect(eventsExplorer).toHaveAttribute(
      "data-events-interaction-ready",
      "true",
      { timeout: 30_000 },
    );
    await page
      .getByRole("tablist", { name: "Browse events by what you want to do" })
      .getByRole("tab", { name: /Music/i })
      .click();
    const eventsWereComplete =
      await eventsExplorer.getAttribute("data-events-complete") === "true";
    if (!eventsWereComplete) {
      await expect
        .poll(() => hits.unavailable.includes("/api/events/browse"), {
          timeout: 15_000,
        })
        .toBe(true);
      await expect(
        page.getByText("Couldn’t load the rest of the calendar. Try again."),
      ).toBeVisible();
      await expect(page.getByRole("button", { name: "Retry" })).toBeVisible();
    }
    await expect(page.getByText(/No events are on the calendar/i)).toHaveCount(0);

    // ASK: the answer service is down, but the question remains editable and
    // a retry is explicit. It must not fabricate "nothing matched."
    response = await page.goto("/ask", {
      waitUntil: "domcontentloaded",
      timeout: 90_000,
    });
    expect(response?.status()).toBe(200);
    await expectHealthyShell(page, "/ask");
    const ask = page.getByRole("textbox", { name: "Ask Radius" });
    const askSubmit = page.getByRole("button", {
      name: "Ask Radius",
      exact: true,
    });
    await expect(
      page.locator("[data-ask-interaction-ready]"),
    ).toHaveAttribute("data-ask-interaction-ready", "true", {
      timeout: 30_000,
    });
    await expect(ask).toBeEditable();
    await ask.fill("What is on tonight?");
    await expect(askSubmit).toBeEnabled();
    await askSubmit.click();
    await expect(page.getByRole("button", { name: "Try again" })).toBeVisible();
    await expect(ask).toHaveValue("What is on tonight?");
    await expect(page.getByText(/nothing matched|nothing nearby/i)).toHaveCount(0);

    expect(hits.hanging, "at least one hanging dependency was exercised").not.toHaveLength(0);
    expect(hits.malformed, "at least one malformed dependency was exercised").not.toHaveLength(0);
    expect(hits.unavailable, "at least one unavailable dependency was exercised").not.toHaveLength(0);
    expect(pageErrors, `uncaught browser errors:\n${pageErrors.join("\n")}`).toEqual([]);
  });
});
