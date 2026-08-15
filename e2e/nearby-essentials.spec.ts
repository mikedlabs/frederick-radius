import { expect, test } from "@playwright/test";

test.use({
  viewport: { width: 390, height: 844 },
  isMobile: true,
  hasTouch: true,
  geolocation: { longitude: -77.4105, latitude: 39.4143 },
  permissions: ["geolocation"],
});

test("a person downtown can get from one need to one useful answer", async ({
  page,
}) => {
  await page.goto("/amenities", { waitUntil: "domcontentloaded" });

  await expect(
    page.getByRole("heading", { level: 1, name: "What do you need?" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Trash", exact: true }).click();

  await expect(page.getByText(/^Closest mapped ·/)).toBeVisible();
  const directions = page.getByRole("link", { name: "Walk there" });
  const map = page.getByRole("link", { name: "See all" });

  await expect(directions).toHaveAttribute(
    "href",
    /^https:\/\/www\.google\.com\/maps\/dir\/\?/,
  );
  const mapHref = await map.getAttribute("href");
  const mapUrl = new URL(mapHref!, "https://frederickradius.app");
  expect(mapUrl.pathname).toBe("/map");
  expect(mapUrl.searchParams.get("amenity")).toBe("trash");
  expect(mapUrl.searchParams.get("at")).toMatch(/^-?\d+\.\d+,-?\d+\.\d+$/);
});

test("the full amenity catalog stays behind one disclosure", async ({ page }) => {
  await page.goto("/amenities", { waitUntil: "domcontentloaded" });

  const more = page.locator("summary").filter({
    hasText: "More useful things nearby",
  });
  await expect(more).toBeVisible();
  await expect(page.getByText("Free Wi-Fi", { exact: true })).toBeHidden();

  await more.click();
  await expect(page.getByText("Free Wi-Fi", { exact: true })).toBeVisible();
  await expect(
    page.getByRole("link", { name: /Show all essentials on the map/ }),
  ).toBeVisible();
});

test("Today playgrounds opens the complete layer around the current location", async ({
  page,
}) => {
  await page.addInitScript(() => {
    window.sessionStorage.setItem(
      "fr_geo_v1",
      JSON.stringify({
        lng: -77.4105,
        lat: 39.4143,
        accuracy: 15,
        municipality_slug: "frederick",
        label: "Downtown Frederick",
        timestamp: Date.now(),
      }),
    );
  });

  await page.goto("/today", { waitUntil: "domcontentloaded" });
  await page.getByRole("button", { name: "Browse nearby places by category" }).click();
  await page.getByRole("button", { name: "Get outside" }).click();

  const playgrounds = page.getByRole("link", { name: "Playgrounds" });
  await expect(playgrounds).toHaveAttribute(
    "href",
    "/map?intent=outside&sub=playgrounds&amenity=play&in=nearme",
  );
  await playgrounds.click();

  await expect(page).toHaveURL(
    (url) =>
      url.pathname === "/map" &&
      url.searchParams.get("intent") === "outside" &&
      url.searchParams.get("sub") === "playgrounds" &&
      url.searchParams.get("amenity") === "play" &&
      url.searchParams.get("in") === "nearme",
    { timeout: 15_000 },
  );

  await expect(page.locator(".dock-host")).toHaveAttribute(
    "data-map-loaded",
    "true",
    { timeout: 30_000 },
  );
  await expect(
    page.getByRole("button", { name: "Show the whole county" }),
  ).toBeVisible({ timeout: 15_000 });
  await expect(
    page.getByRole("button", { name: "Recenter on my location" }),
  ).toBeVisible();
  expect(new URL(page.url()).searchParams.get("in")).toBe("nearme");
});

test("Today playgrounds preserves a deliberately selected town", async ({
  page,
}) => {
  await page.addInitScript(() => {
    window.localStorage.setItem("fr:scope:v1", "town:brunswick");
    // A cached downtown fix must not displace the town the visitor chose.
    window.sessionStorage.setItem(
      "fr_geo_v1",
      JSON.stringify({
        lng: -77.4105,
        lat: 39.4143,
        accuracy: 15,
        municipality_slug: "frederick",
        label: "Downtown Frederick",
        timestamp: Date.now(),
      }),
    );
  });

  await page.goto("/today", { waitUntil: "domcontentloaded" });
  await page.getByRole("button", { name: "Browse nearby places by category" }).click();
  await page.getByRole("button", { name: "Get outside" }).click();

  const playgrounds = page.getByRole("link", { name: "Playgrounds" });
  await expect(playgrounds).toHaveAttribute(
    "href",
    "/map?intent=outside&sub=playgrounds&amenity=play&in=brunswick",
  );
  await playgrounds.click();

  await expect(page).toHaveURL(
    (url) =>
      url.pathname === "/map" &&
      url.searchParams.get("amenity") === "play" &&
      url.searchParams.get("in") === "brunswick",
    { timeout: 15_000 },
  );
});

test("a direct Near me link fits an already-granted location without a cached fix", async ({
  page,
}) => {
  await page.goto(
    "/map?intent=outside&sub=playgrounds&amenity=play&in=nearme",
    { waitUntil: "domcontentloaded" },
  );

  await expect(page.locator(".dock-host")).toHaveAttribute(
    "data-map-loaded",
    "true",
    { timeout: 30_000 },
  );
  await expect(
    page.getByRole("button", { name: "Show the whole county" }),
  ).toBeVisible({ timeout: 15_000 });
  await expect(
    page.getByRole("button", { name: "Recenter on my location" }),
  ).toBeVisible();
  expect(new URL(page.url()).searchParams.get("in")).toBe("nearme");
});

test("a plain map keeps the Near me decision made in Ask", async ({ page }) => {
  await page.addInitScript(() => {
    window.localStorage.setItem("fr:scope:v1", "nearme");
    window.sessionStorage.setItem(
      "fr_geo_v1",
      JSON.stringify({
        lng: -77.4105,
        lat: 39.4143,
        accuracy: 15,
        municipality_slug: "frederick",
        label: "Downtown Frederick",
        timestamp: Date.now(),
      }),
    );
  });

  await page.goto("/map", { waitUntil: "domcontentloaded" });
  await expect(page.locator(".dock-host")).toHaveAttribute(
    "data-map-loaded",
    "true",
    { timeout: 30_000 },
  );
  await expect(
    page.getByRole("button", { name: "Show the whole county" }),
  ).toBeVisible({ timeout: 15_000 });
  await expect(
    page.getByRole("button", { name: "Recenter on my location" }),
  ).toBeVisible();
  await expect
    .poll(() => {
      const camera = new URL(page.url()).searchParams.get("c");
      return Number(camera?.split(",")[2] ?? 0);
    })
    .toBeGreaterThanOrEqual(12);
});

test("a direct Near me link falls back honestly when location is unavailable", async ({
  page,
}) => {
  await page.context().clearPermissions();
  await page.goto(
    "/map?intent=outside&sub=playgrounds&amenity=play&in=nearme",
    { waitUntil: "domcontentloaded" },
  );

  await expect
    .poll(() => new URL(page.url()).searchParams.get("in"), {
      timeout: 15_000,
    })
    .toBeNull();
  await expect(
    page.getByText(
      "Location is not available yet. Showing the whole county. Use the location button to turn on Near me.",
      { exact: true },
    ).first(),
  ).toBeVisible();
});

test("a shared Near me camera cannot survive without this device's location", async ({
  page,
}) => {
  await page.context().clearPermissions();
  await page.goto(
    "/map?intent=outside&sub=playgrounds&amenity=play&in=nearme&c=-77.4105,39.4143,15",
    { waitUntil: "domcontentloaded" },
  );

  await expect
    .poll(() => new URL(page.url()).searchParams.get("in"), {
      timeout: 15_000,
    })
    .toBeNull();
  await expect(
    page.getByText(
      "Location is not available yet. Showing the whole county. Use the location button to turn on Near me.",
      { exact: true },
    ).first(),
  ).toBeVisible();
});
