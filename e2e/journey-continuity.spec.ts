import { expect, test } from "@playwright/test";

test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });

test("a route result focuses the same transit map instead of ending in a directory card", async ({ page }) => {
  await page.goto("/transit", { waitUntil: "domcontentloaded" });

  await expect(page.getByRole("heading", { level: 1, name: "Transit" })).toBeVisible();
  const finder = page.locator("summary").filter({ hasText: "Find a bus route" });
  await expect(finder).toBeVisible();
  await finder.click();

  await page.getByRole("searchbox", { name: "Search routes by number or where they go" }).fill("10 Connector");
  await page.locator('[data-transit-route-id="6154"]').click();

  await expect(page.locator("#live-network-heading")).toBeInViewport();
  await expect(page.getByLabel("Bus route")).toHaveValue("6154");
});

test("expanded map search carries the exact map state through a place detail", async ({ page }) => {
  await page.goto("/map?c=-77.4100,39.4150,12.4&show=transit&layers=parks", {
    waitUntil: "domcontentloaded",
  });

  const search = page.getByRole("searchbox", { name: "Search this map" });
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
  expect(
    new URL(placeHref!, "https://frederick-radius.test").searchParams.get("returnTo"),
  ).toBe(mapReturnHref);
  await placeResult.click();

  const detailBack = page.getByRole("link", { name: "Back to map" });
  await expect(detailBack).toBeVisible();
  await expect(detailBack).toHaveAttribute("href", mapReturnHref!);
  await detailBack.click();

  await expect
    .poll(() => {
      const url = new URL(page.url());
      return `${url.pathname}${url.search}${url.hash}`;
    })
    .toBe(mapReturnHref);
  await expect(page.getByRole("searchbox", { name: "Search this map" })).toHaveValue(
    "coffee",
  );
});

test("a map place sheet carries its live camera, layers, and query to the full page", async ({ page }) => {
  await page.goto("/map?c=-77.4100,39.4150,12.4&show=transit&layers=parks", {
    waitUntil: "domcontentloaded",
  });

  await page
    .getByRole("searchbox", { name: "Search this map" })
    .fill("Gravel and Grind");
  const result = page.locator(
    '[data-map-search-result="place:gravel-and-grind-frederick"]',
  );
  await expect(result).toBeVisible();
  await result.click();

  await expect(
    page.locator('[data-map-place-slug="gravel-and-grind-frederick"]'),
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
  const detailBack = page.getByRole("link", { name: "Back to map" });
  await expect(detailBack).toHaveAttribute("href", mapReturnHref!);
  await detailBack.click();

  await expect
    .poll(() => {
      const url = new URL(page.url());
      return `${url.pathname}${url.search}${url.hash}`;
    })
    .toBe(mapReturnHref);
  await expect(page.getByRole("searchbox", { name: "Search this map" })).toHaveValue(
    "Gravel and Grind",
  );
});

test("a place detail has one thumb dock, not a second nav stacked under it", async ({ page }) => {
  await page.goto("/places/gravel-and-grind-frederick", { waitUntil: "domcontentloaded" });

  await expect(page.locator("[data-mobile-action-bar]")).toBeVisible();
  await expect(page.locator("[data-bottom-nav-shell]")).toBeHidden();
});
