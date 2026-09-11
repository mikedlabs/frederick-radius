import { expect, test, type Page } from "@playwright/test";

test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });

const TODAY_PLACE_SLUG = "gravel-and-grind-frederick";

async function openTodayWithConfirmedPlace(page: Page) {
  await page.route(/\/api\/want(?:\?|$)/, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        hero: {
          slug: TODAY_PLACE_SLUG,
          name: "Gravel & Grind",
          photo: null,
          where: "Frederick",
          distance: null,
          fact: "Open now",
          confidence: "confirmed",
        },
        also: [],
        soon: null,
        browseHref: "/search?q=coffee",
        contextLabel: "Across Frederick County",
        contextSource: "county",
        mayAssertNoneOpen: true,
      }),
    });
  });
  await page.goto("/today", { waitUntil: "domcontentloaded" });
  const placeLink = page.locator(`a[href="/places/${TODAY_PLACE_SLUG}"]`).first();
  await expect(placeLink).toBeVisible();
  return placeLink;
}

test("a route result focuses the same transit map instead of ending in a directory card", async ({ page }) => {
  const hydrationWarnings: string[] = [];
  page.on("console", (message) => {
    const text = message.text();
    if (text.includes("hydrated but some attributes of the server rendered HTML")) {
      hydrationWarnings.push(text);
    }
  });

  await page.goto("/transit", { waitUntil: "domcontentloaded" });

  await expect(page.getByRole("heading", { level: 1, name: "Transit" })).toBeVisible();
  const finder = page.locator("summary").filter({ hasText: "Find a bus route" });
  await expect(finder).toBeVisible();
  await finder.click();

  await page.getByRole("searchbox", { name: "Search routes by number or where they go" }).fill("10 Connector");
  await page.locator('[data-transit-route-id="6154"]').click();

  await expect(page.locator("#live-network-heading")).toBeInViewport();
  await expect(page.getByLabel("Bus route")).toHaveValue("6154");
  expect(hydrationWarnings).toEqual([]);
});

test("expanded map search carries the exact map state through a place detail", async ({ page }) => {
  await page.goto("/map?c=-77.4100,39.4150,12.4&show=transit&layers=parks", {
    waitUntil: "domcontentloaded",
  });

  const search = page.getByRole("combobox", { name: "Search this map" });
  await search.fill("coffee");
  await expect(page.getByRole("button", { name: "See all results" })).toBeVisible();
  await page.getByRole("button", { name: "See all results" }).click();

  await expect(page).toHaveURL(/\/search\?q=coffee&returnTo=/);
  const back = page.getByRole("link", { name: "Back to the map" });
  const mapReturnHref = await back.getAttribute("href");
  expect(mapReturnHref).toBeTruthy();

  const mapReturnUrl = new URL(mapReturnHref!, "https://frederick-radius.test");
  expect(mapReturnUrl.pathname).toBe("/map");
  expect(mapReturnUrl.searchParams.get("c")).toBeTruthy();
  expect(mapReturnUrl.searchParams.get("show")).toBe("transit");
  expect(mapReturnUrl.searchParams.get("layers")).toBe("parks");
  expect(mapReturnUrl.searchParams.get("q")).toBe("coffee");

  const placeResult = page
    .locator('section[aria-label*="results for coffee"] a[href^="/places/"]')
    .first();
  await expect(placeResult).toBeVisible();
  const placeHref = await placeResult.getAttribute("href");
  const searchReturnHref = new URL(placeHref!, "https://frederick-radius.test").searchParams.get("returnTo")!;
  const searchReturnUrl = new URL(searchReturnHref, "https://frederick-radius.test");
  expect(searchReturnUrl.pathname).toBe("/search");
  expect(searchReturnUrl.searchParams.get("q")).toBe("coffee");
  expect(searchReturnUrl.searchParams.get("returnTo")).toBe(mapReturnHref);
  await placeResult.click();

  // A cold local server can still be generating the static place page after
  // the link has been activated. Prove the journey reached the detail route
  // before asserting against its client-side return control.
  await expect(page).toHaveURL(/\/places\//, { timeout: 15_000 });

  const detailBack = page.getByRole("link", { name: "Back to search results" });
  await expect(detailBack).toBeVisible({ timeout: 10_000 });
  await expect(detailBack).toHaveAttribute("href", searchReturnHref);
  await detailBack.click();

  await expect(page).toHaveURL(new RegExp(searchReturnHref.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  await expect(page.getByRole("searchbox", { name: "Search Frederick County" })).toHaveValue("coffee");
  await page.getByRole("link", { name: "Back to the map" }).click();

  await expect
    .poll(() => {
      const url = new URL(page.url());
      return `${url.pathname}${url.search}${url.hash}`;
    }, { timeout: 20_000 })
    .toBe(mapReturnHref);
  await expect(page.getByRole("combobox", { name: "Search this map" })).toHaveValue(
    "coffee",
  );
});

test("a map place sheet carries its live camera, layers, and query to the full page", async ({ page }) => {
  test.setTimeout(60_000);
  const missingCategoryImages: string[] = [];
  page.on("console", (message) => {
    const text = message.text();
    if (text.includes('Image "cat-') && text.includes("could not be loaded")) {
      missingCategoryImages.push(text);
    }
  });

  await page.goto("/map?c=-77.4100,39.4150,12.4&show=transit&layers=parks", {
    waitUntil: "domcontentloaded",
  });

  await page
    .getByRole("combobox", { name: "Search this map" })
    .fill("Gravel and Grind");
  const result = page.locator(
    '[data-map-search-result="place:gravel-and-grind-frederick"]',
  );
  await expect(result).toBeVisible();
  await result.click();

  await expect(
    page.locator(
      '.map-peek-body[data-map-place-slug="gravel-and-grind-frederick"]',
    ),
  ).toBeVisible();
  await page.getByRole("button", { name: "Details", exact: true }).click();

  const fullPage = page.getByRole("link", { name: /See full page/ });
  await expect(fullPage).toBeVisible();
  const fullPageHref = await fullPage.getAttribute("href");
  const mapReturnHref = new URL(
    fullPageHref!,
    "https://frederick-radius.test",
  ).searchParams.get("returnTo");
  expect(mapReturnHref).toBeTruthy();

  const mapReturnUrl = new URL(mapReturnHref!, "https://frederick-radius.test");
  expect(mapReturnUrl.pathname).toBe("/map");
  expect(mapReturnUrl.searchParams.get("c")).toBeTruthy();
  expect(mapReturnUrl.searchParams.get("show")).toBe("transit");
  expect(mapReturnUrl.searchParams.get("layers")).toBe("parks");
  expect(mapReturnUrl.searchParams.get("q")).toBe("Gravel and Grind");
  expect(mapReturnUrl.searchParams.get("place")).toBe(
    "gravel-and-grind-frederick",
  );

  await fullPage.click();
  await expect(page).toHaveURL(/\/places\/gravel-and-grind-frederick\?/);
  // The app layout persists across this client navigation. Its route-scoped
  // sheet must be gone before the destination page becomes interactive.
  await expect(
    page.getByRole("dialog", { name: "Gravel & Grind" }),
  ).toHaveCount(0);
  const detailBack = page.getByRole("link", { name: "Back to map" });
  await expect(detailBack).toHaveAttribute("href", mapReturnHref!);
  await detailBack.click();

  await expect
    .poll(() => {
      const url = new URL(page.url());
      return `${url.pathname}${url.search}${url.hash}`;
    }, { timeout: 20_000 })
    .toBe(mapReturnHref);
  // The exact selected place is part of the return state, so its phone peek
  // intentionally sits above the search controls. Prove that selection came
  // back, then close it before checking the restored query field.
  const closeReturnedPlace = page.getByRole("button", {
    name: "Close Gravel & Grind",
  });
  // A document-level return is deliberate here: it prevents the old map's
  // camera writer from racing the exact return URL. Allow a cold local map
  // enough time to rebuild its WebGL surface before judging the handoff.
  await expect(closeReturnedPlace).toBeVisible({ timeout: 20_000 });
  await closeReturnedPlace.click();
  await expect(page.getByRole("combobox", { name: "Search this map" })).toHaveValue(
    "Gravel and Grind",
  );
  expect(missingCategoryImages).toEqual([]);
});

test("a Today place opens in context and Back or Escape restores its exact card", async ({ page }) => {
  let releasePlaceLookup = () => {};
  const heldPlaceLookup = new Promise<void>((resolve) => {
    releasePlaceLookup = resolve;
  });
  await page.route(/\/api\/places\/by-slugs(?:\?|$)/, async (route) => {
    const url = new URL(route.request().url());
    if (url.searchParams.get("slugs") !== TODAY_PLACE_SLUG) {
      await route.continue();
      return;
    }
    const response = await route.fetch();
    await heldPlaceLookup;
    await route.fulfill({ response });
  });

  const placeLink = await openTodayWithConfirmedPlace(page);
  await placeLink.scrollIntoViewIfNeeded();
  await placeLink.focus();
  const returnScrollY = await page.evaluate(() => window.scrollY);
  await placeLink.click();

  await expect(page).toHaveURL(/\/today$/);
  await expect(
    page.getByRole("dialog", { name: "Loading place details" }),
  ).toBeVisible();

  // A dismissed slow request must never reopen after its response arrives.
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(placeLink).toBeFocused();
  await expect
    .poll(() => page.evaluate((top) => Math.abs(window.scrollY - top), returnScrollY))
    .toBeLessThanOrEqual(1);
  releasePlaceLookup();
  await page.waitForTimeout(100);
  await expect(page.getByRole("dialog")).toHaveCount(0);

  await placeLink.scrollIntoViewIfNeeded();
  const escapeReturnScrollY = await page.evaluate(() => window.scrollY);
  await placeLink.click();
  await expect(page.getByRole("dialog", { name: "Gravel & Grind" })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(placeLink).toBeFocused();
  await expect
    .poll(() => page.evaluate((top) => Math.abs(window.scrollY - top), escapeReturnScrollY))
    .toBeLessThanOrEqual(1);

  await placeLink.scrollIntoViewIfNeeded();
  const backReturnScrollY = await page.evaluate(() => window.scrollY);
  await placeLink.click();
  await expect(page.getByRole("dialog", { name: "Gravel & Grind" })).toBeVisible();
  await page.goBack();
  await expect(page).toHaveURL(/\/today$/);
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(placeLink).toBeFocused();
  await expect
    .poll(() => page.evaluate((top) => Math.abs(window.scrollY - top), backReturnScrollY))
    .toBeLessThanOrEqual(1);
});

for (const lookup of [
  { label: "unknown", status: 200, body: { places: [] } },
  { label: "failed", status: 503, body: { error: "unavailable" } },
]) {
  test(`a ${lookup.label} Today place lookup reaches the canonical page`, async ({ page }) => {
    await page.route(/\/api\/places\/by-slugs(?:\?|$)/, async (route) => {
      const url = new URL(route.request().url());
      if (url.searchParams.get("slugs") !== TODAY_PLACE_SLUG) {
        await route.continue();
        return;
      }
      await route.fulfill({
        status: lookup.status,
        contentType: "application/json",
        body: JSON.stringify(lookup.body),
      });
    });

    const placeLink = await openTodayWithConfirmedPlace(page);
    await placeLink.click();

    await expect(page).toHaveURL((url) =>
      url.pathname === `/places/${TODAY_PLACE_SLUG}` &&
      url.searchParams.get("returnTo") === "/today",
    { timeout: 20_000 });
    await expect(page.getByRole("dialog")).toHaveCount(0);
    const back = page.getByRole("link", { name: "Back to Today", exact: true });
    await expect(back).toHaveAttribute("href", "/today");
    await back.click();
    await expect(page).toHaveURL(/\/today$/);
  });
}

test("a place detail has one thumb dock, not a second nav stacked under it", async ({ page }) => {
  await page.goto("/places/gravel-and-grind-frederick", { waitUntil: "domcontentloaded" });

  await expect(page.locator("[data-mobile-action-bar]")).toBeVisible();
  await expect(page.locator("[data-bottom-nav-shell]")).toBeHidden();
});
