import { expect, test, type Page } from "@playwright/test";

test.use({
  viewport: { width: 390, height: 844 },
  isMobile: true,
  hasTouch: true,
});

async function expectRouteAndScroll(
  page: Page,
  expectedUrl: string,
  expectedScrollY: number,
) {
  await expect(page).toHaveURL(expectedUrl);
  await expect
    .poll(async () =>
      Math.abs((await page.evaluate(() => window.scrollY)) - expectedScrollY),
    )
    .toBeLessThanOrEqual(2);
}

test("Find is reversible through Close, Escape, and browser Back", async ({
  page,
}) => {
  await page.goto("/today", { waitUntil: "domcontentloaded" });
  await expect(page.getByRole("heading", { level: 1 })).toBeAttached();
  // Today hydrates live rails below the fold. Let that first layout settle so
  // this test measures the modal's scroll contract rather than a feed card
  // arriving while the overlay happens to be open.
  await page.waitForLoadState("networkidle");
  await page.evaluate(() => window.scrollTo(0, 620));
  const scrollY = await page.evaluate(() => window.scrollY);
  expect(scrollY).toBeGreaterThan(0);
  const url = page.url();
  const trigger = page.getByRole("button", {
    name: "Ask or find across Frederick County",
  });

  const openFind = async () => {
    await trigger.click();
    await expect(
      page.getByRole("dialog", { name: "What do you need?" }),
    ).toBeVisible();
    await expect
      .poll(() =>
        page.evaluate(
          () =>
            typeof history.state?.__frederickRadiusLayer === "string",
        ),
      )
      .toBe(true);
  };

  await openFind();
  await page.getByRole("button", { name: "Close Find" }).click();
  await expect(page.locator("#radius-find-dialog")).toHaveCount(0);
  await expect(trigger).toBeFocused();
  await expectRouteAndScroll(page, url, scrollY);

  await openFind();
  await page.keyboard.press("Escape");
  await expect(page.locator("#radius-find-dialog")).toHaveCount(0);
  await expect(trigger).toBeFocused();
  await expectRouteAndScroll(page, url, scrollY);

  await openFind();
  await page.goBack();
  await expect(page.locator("#radius-find-dialog")).toHaveCount(0);
  await expect(trigger).toBeFocused();
  await expectRouteAndScroll(page, url, scrollY);
});

test("a place sheet closes in place and Save acknowledges before auth resolves", async ({
  page,
}) => {
  let releaseAuth: (() => void) | undefined;
  const authGate = new Promise<void>((resolve) => {
    releaseAuth = resolve;
  });
  await page.route("**/api/auth/me", async (route) => {
    await authGate;
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ user: null }),
    });
  });

  await page.goto(
    "/map?c=-77.4100,39.4150,12.4&show=transit&layers=parks",
    { waitUntil: "domcontentloaded" },
  );
  const search = page.getByRole("combobox", { name: "Search this map" });
  await search.fill("Gravel and Grind");
  await page
    .locator('[data-map-search-result="place:gravel-and-grind-frederick"]')
    .click();
  await expect
    .poll(() => new URL(page.url()).searchParams.get("c"))
    .toMatch(/,15(?:\.0+)?$/);
  const mapUrl = page.url();
  const details = page.getByRole("button", { name: "Details", exact: true });

  const openPlace = async () => {
    await details.focus();
    await details.click();
    await expect(
      page.getByRole("dialog", { name: "Gravel & Grind" }),
    ).toBeVisible();
  };

  await openPlace();
  const save = page
    .getByRole("dialog", { name: "Gravel & Grind" })
    .locator(
    '[data-save-ref="place:gravel-and-grind-frederick"]',
    );
  await expect(save).toHaveAttribute("aria-pressed", "false");
  await save.click();
  await expect(save).toHaveAttribute("aria-pressed", "true", { timeout: 300 });
  await expect(save).toHaveAccessibleName(
    "Remove Gravel & Grind from Saved",
  );
  await expect(
    page.getByText(/Your saved list starts here|Saved · Gravel & Grind/),
  ).toBeVisible();
  releaseAuth?.();

  await page
    .getByRole("button", { name: "Close place details" })
    .click();
  await expect(page.getByRole("dialog", { name: "Gravel & Grind" })).toHaveCount(0);
  await expect(details).toBeFocused();
  await expect(page).toHaveURL(mapUrl);

  await openPlace();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog", { name: "Gravel & Grind" })).toHaveCount(0);
  await expect(details).toBeFocused();
  await expect(page).toHaveURL(mapUrl);

  await openPlace();
  await page.goBack();
  await expect(page.getByRole("dialog", { name: "Gravel & Grind" })).toHaveCount(0);
  await expect(details).toBeFocused();
  await expect(page).toHaveURL(mapUrl);
});

test("the place-page Save CTA names its pending action immediately", async ({
  page,
}) => {
  let releaseAuth: (() => void) | undefined;
  const authGate = new Promise<void>((resolve) => {
    releaseAuth = resolve;
  });
  await page.route("**/api/auth/me", async (route) => {
    await authGate;
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ user: null }),
    });
  });

  await page.goto("/places/gravel-and-grind-frederick", {
    waitUntil: "domcontentloaded",
  });
  const save = page.locator(
    '[data-place-save="gravel-and-grind-frederick"]',
  );
  await expect(save).toHaveAttribute("aria-pressed", "false");
  await save.click();
  await expect(save).toHaveAttribute("aria-pressed", "true", { timeout: 300 });
  await expect(save).toHaveAccessibleName("Saving Gravel & Grind");
  await expect(save).toContainText("Saving");

  releaseAuth?.();
  await expect(save).toHaveAccessibleName(
    "Saved. Tap to remove Gravel & Grind",
  );
  await expect(save).toContainText("Saved");
});

test("an event sheet keeps its route and restores the event trigger", async ({
  page,
}) => {
  await page.route("**/api/events/*/summary", async (route) => {
    const pathname = new URL(route.request().url()).pathname;
    const slug = decodeURIComponent(
      pathname.split("/api/events/")[1]?.replace("/summary", "") ??
        "interaction-contract-event",
    );
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        event: {
          slug,
          title: "Interaction contract event",
          description: "A verified event used to protect sheet behavior.",
          starts_at: "2026-07-29T23:00:00.000Z",
          ends_at: "2026-07-30T01:00:00.000Z",
          timezone: "America/New_York",
          venue_name: "Carroll Creek",
          address: "44 South Market Street, Frederick, MD",
          geom: { lng: -77.4105, lat: 39.4142 },
          municipality: "frederick",
          category: "music",
          audience: [],
          is_free: true,
          source: "manual",
          source_url: null,
          is_verified: true,
          last_verified_at: "2026-07-29T12:00:00.000Z",
          source_id: `test:${slug}`,
          license: "First party editorial",
          confidence: "curated",
          first_seen_at: "2026-07-29T12:00:00.000Z",
          geo_confidence: "exact_address",
          category_name: "Music",
          municipality_name: "Frederick",
        },
      }),
    });
  });

  await page.goto("/events", { waitUntil: "domcontentloaded" });
  const trigger = page.locator('article a[href^="/events/"]').first();
  await expect(trigger).toBeVisible();
  await trigger.scrollIntoViewIfNeeded();
  const scrollY = await page.evaluate(() => window.scrollY);
  const url = page.url();

  const openEvent = async () => {
    await trigger.focus();
    await trigger.click();
    await expect(
      page.getByRole("dialog", { name: "Interaction contract event" }),
    ).toBeVisible();
  };
  const close = page
    .getByRole("button", { name: "Close", exact: true })
    .filter({ hasText: "Close" });

  await openEvent();
  await close.click();
  await expect(
    page.getByRole("dialog", { name: "Interaction contract event" }),
  ).toHaveCount(0);
  await expect(trigger).toBeFocused();
  await expectRouteAndScroll(page, url, scrollY);

  await openEvent();
  await page.keyboard.press("Escape");
  await expect(
    page.getByRole("dialog", { name: "Interaction contract event" }),
  ).toHaveCount(0);
  await expect(trigger).toBeFocused();
  await expectRouteAndScroll(page, url, scrollY);

  await openEvent();
  await page.goBack();
  await expect(
    page.getByRole("dialog", { name: "Interaction contract event" }),
  ).toHaveCount(0);
  await expect(trigger).toBeFocused();
  await expectRouteAndScroll(page, url, scrollY);
});

test("event filters and map layers acknowledge the tap before data work finishes", async ({
  page,
}) => {
  await page.goto("/events", { waitUntil: "domcontentloaded" });
  const when = page.getByRole("group", { name: "When" });
  const weekend = when.getByRole("button", { name: "This weekend" });
  await expect(weekend).toHaveAttribute("aria-pressed", "false");
  await weekend.click();
  await expect(weekend).toHaveAttribute("aria-pressed", "true", {
    timeout: 300,
  });

  await page.goto("/map", { waitUntil: "domcontentloaded" });
  await page.getByRole("button", { name: "What the map shows" }).click();
  await page
    .getByRole("region", { name: "What the map shows" })
    .getByRole("button", {
      name: "Check live conditions and map layers",
    })
    .click();
  const transit = page
    .getByRole("region", { name: "Live conditions" })
    .getByRole("button", { name: /Transit/ });
  await expect(transit).toHaveAttribute("aria-pressed", "false");
  await transit.click();
  await expect(page.getByRole("region", { name: "Live conditions" })).toBeHidden({
    timeout: 300,
  });
  await page.getByRole("button", { name: "What the map shows" }).click();
  await page
    .getByRole("region", { name: "What the map shows" })
    .getByRole("button", { name: "Check live conditions and map layers" })
    .click();
  await expect(
    page
      .getByRole("region", { name: "Live conditions" })
      .getByRole("button", { name: /Transit/ }),
  ).toHaveAttribute("aria-pressed", "true");
});
