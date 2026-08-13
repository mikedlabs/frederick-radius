import { expect, test } from "@playwright/test";

test.use({
  viewport: { width: 390, height: 844 },
  geolocation: { latitude: 39.4143, longitude: -77.4108 },
  permissions: ["geolocation"],
});

test("Radius ready-made views compose an honest, shareable mobile map", async ({
  page,
}) => {
  // This journey deliberately reloads the map after exercising several
  // scenes. A cold local compiler can consume the default 30-second budget
  // before the post-reload assertions even run.
  test.setTimeout(60_000);
  await page.addInitScript(() => {
    if (window.sessionStorage.getItem("radius-scene-pref-seeded")) return;
    window.localStorage.setItem("fr:map-layers:v3", '{"radar":true}');
    window.sessionStorage.setItem("radius-scene-pref-seeded", "true");
  });
  await page.route("**/api/transit/vehicles", async (route) => {
    await route.fulfill({
      json: {
        available: true,
        status: "ok",
        feedTimestamp: Math.floor(Date.now() / 1000),
        vehicles: [],
      },
    });
  });

  await page.goto("/map", { waitUntil: "domcontentloaded" });
  const host = page.locator(".dock-host");
  await expect(host).toHaveAttribute("data-map-loaded", "true", {
    timeout: 20_000,
  });

  const browse = page.getByRole("button", { name: "Browse map contents" });
  await browse.click();
  const chooser = page.getByRole("region", { name: "Choose what to see" });
  await expect(chooser.getByText("Ready-made views", { exact: true })).toBeVisible();

  // WebGL pins have a real HTML path: collapsed by default, then named,
  // keyboard-operable results with phone-sized targets when requested.
  const placesInView = chooser.locator("[data-map-in-view-places]");
  await expect(placesInView).toBeVisible();
  await expect(placesInView.locator("details")).not.toHaveAttribute("open", "");
  await placesInView.locator("summary").click();
  const firstPlaceResult = placesInView.locator("[data-map-in-view-place]").first();
  await expect(firstPlaceResult).toBeVisible();
  expect((await firstPlaceResult.boundingBox())?.height ?? 0).toBeGreaterThanOrEqual(44);

  await chooser.getByText("Ready-made views", { exact: true }).click();
  const sceneButtons = chooser.getByRole("group", {
    name: "Ready-made map views",
  }).getByRole("button");
  await expect(sceneButtons).toHaveCount(5);
  for (const control of await sceneButtons.all()) {
    const box = await control.boundingBox();
    expect(box?.height ?? 0).toBeGreaterThanOrEqual(44);
  }

  await sceneButtons.filter({ hasText: "Buses now" }).click();
  await expect(host).toHaveAttribute("data-map-scene", "buses-now");
  await expect
    .poll(() => new URL(page.url()).searchParams.get("scene"))
    .toBe("buses-now");
  await expect
    .poll(() => new URL(page.url()).searchParams.get("show") ?? "")
    .toContain("transit");
  await expect
    .poll(() =>
      page.evaluate(() =>
        window.localStorage.getItem("fr:map-layers:v3") ?? "",
      ),
    )
    .toBe('{"radar":true}');
  await expect(page.getByText("Buses now", { exact: true })).toBeVisible();

  await page.screenshot({
    path: "output/playwright/map-radius-buses-390x844.png",
    fullPage: true,
  });

  // A manual refinement exits the temporary scene and applies only to the
  // person's original setup. Transit must not leak into tomorrow's map.
  await browse.click();
  await chooser
    .getByRole("button", { name: /^Travel & conditions/ })
    .click();
  await page.getByRole("button", { name: /^Parking/ }).click();
  await expect(host).not.toHaveAttribute("data-map-scene", "buses-now");
  await expect
    .poll(() =>
      page.evaluate(() =>
        window.localStorage.getItem("fr:map-layers:v3") ?? "",
      ),
    )
    .toBe('{"parking":true,"radar":true}');

  // A Radius view is a reproducible map state, not just a local animation.
  await page.getByRole("button", { name: "Back" }).click();
  await chooser.getByText("Ready-made views", { exact: true }).click();
  await chooser
    .getByRole("group", { name: "Ready-made map views" })
    .getByRole("button", { name: /^Buses now\./ })
    .click();
  await page.reload({ waitUntil: "domcontentloaded" });
  await expect(host).toHaveAttribute("data-map-loaded", "true", {
    timeout: 20_000,
  });
  await expect(host).toHaveAttribute("data-map-scene", "buses-now");
  await expect
    .poll(() =>
      page.evaluate(() =>
        window.localStorage.getItem("fr:map-layers:v3") ?? "",
      ),
    )
    .toBe('{"parking":true,"radar":true}');
});

test("ready-made views remain usable on a narrow phone", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 568 });
  await page.goto("/map", { waitUntil: "domcontentloaded" });

  const host = page.locator(".dock-host");
  await expect(host).toHaveAttribute("data-map-loaded", "true", {
    timeout: 20_000,
  });
  await page.getByRole("button", { name: "Browse map contents" }).click();

  const chooser = page.getByRole("region", { name: "Choose what to see" });
  await expect(chooser).toBeVisible();
  await chooser.getByText("Ready-made views", { exact: true }).click();
  await page.waitForTimeout(350);
  const chooserBox = await chooser.boundingBox();
  expect(chooserBox?.x ?? -1).toBeGreaterThanOrEqual(0);
  expect((chooserBox?.x ?? 0) + (chooserBox?.width ?? 0)).toBeLessThanOrEqual(
    320,
  );

  const sceneButtons = chooser
    .getByRole("group", { name: "Ready-made map views" })
    .getByRole("button");
  await expect(sceneButtons).toHaveCount(5);
  await expect(
    chooser.getByRole("button", { name: /^What changed\?/ }),
  ).toContainText("Check now");
  for (const control of await sceneButtons.all()) {
    const box = await control.boundingBox();
    expect(box?.height ?? 0).toBeGreaterThanOrEqual(44);
    expect(box?.x ?? -1).toBeGreaterThanOrEqual(0);
    expect((box?.x ?? 0) + (box?.width ?? 0)).toBeLessThanOrEqual(320);
  }
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);

  await page.screenshot({
    path: "output/playwright/map-radius-scenes-320x568.png",
    fullPage: true,
  });
});

test("an old 15-minute scene link opens the real reach tool", async ({ page }) => {
  await page.goto("/map?scene=within-15-minutes", {
    waitUntil: "domcontentloaded",
  });
  await expect
    .poll(() => new URL(page.url()).searchParams.get("mode"), {
      timeout: 10_000,
    })
    .toBe("radius");
  expect(new URL(page.url()).searchParams.get("minutes")).toBe("15");
  expect(new URL(page.url()).searchParams.has("scene")).toBe(false);
  await expect(page.getByRole("button", { name: /Adjust the radius|Done adjusting/ })).toBeVisible({
    timeout: 20_000,
  });
});

test("What changed keeps City project lifecycle and source context visible", async ({
  page,
}) => {
  await page.route("**/api/overlays/planning", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/geo+json",
      headers: {
        "X-Radius-Source-Checked-At": "2026-08-11T12:00:00.000Z",
        "X-Radius-Source-Status": "current",
      },
      json: {
        type: "FeatureCollection",
        features: [
          {
            type: "Feature",
            geometry: {
              type: "Point",
              coordinates: [-77.378912, 39.406916],
            },
            properties: {
              id: "cof-cip-a37b23de",
              name: "Salt Storage",
              popup_label: "City capital project",
              status_label: "City project · Planning",
              lifecycle: "planning",
              construction_status: "not_established",
              reference_id: "110008",
              record_type: "Facilities",
              address: "111 Airport Drive E",
              source_label: "The City of Frederick",
              source_url:
                "https://spires.cityoffrederick.com/arcgis/rest/services/CapitalImprovementProjects/MapServer",
              checked_at: "2026-08-11T12:00:00.000Z",
              caveat:
                "The City project status is shown as published. A planning-stage capital project is not active construction.",
            },
          },
        ],
      },
    });
  });

  await page.goto("/map", { waitUntil: "domcontentloaded" });
  const host = page.locator(".dock-host");
  await expect(host).toHaveAttribute("data-map-loaded", "true", {
    timeout: 20_000,
  });
  await page.getByRole("button", { name: "Browse map contents" }).click();
  const chooser = page.getByRole("region", { name: "Choose what to see" });
  await chooser.getByText("Ready-made views", { exact: true }).click();
  await chooser
    .getByRole("button", { name: /^What changed\?/ })
    .click();

  await expect(host).toHaveAttribute("data-map-scene", "what-changed");
  await expect
    .poll(() => new URL(page.url()).searchParams.get("layers"))
    .toBe("planning");

  const records = page.getByLabel("Browse projects & applications on the map");
  await expect(records).toHaveCount(1);
  await records.focus();
  await records.selectOption({ label: "Salt Storage" });
  const popup = page.getByRole("dialog", { name: "Salt Storage" });
  await expect(popup).toBeVisible();
  await expect(popup).toContainText("City capital project");
  await expect(popup).toContainText("City project · Planning");
  await expect(popup).toContainText("not active construction");
  await expect(popup).toContainText("From The City of Frederick.");
});

test("Outside now reveals City walking records without adding another map control", async ({
  page,
}) => {
  await page.route("**/api/overlays/city-mobility?**", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/geo+json",
      headers: {
        "X-Radius-Source-Checked-At": "2026-08-11T12:00:00.000Z",
        "X-Radius-Source-Status": "current",
        "X-Radius-Source-Coverage": "complete",
      },
      json: {
        type: "FeatureCollection",
        features: [
          {
            type: "Feature",
            geometry: {
              type: "LineString",
              coordinates: [
                [-77.412, 39.414],
                [-77.409, 39.416],
              ],
            },
            properties: {
              id: "cof-path-17",
              name: "Carroll Creek path",
              mobility_kind: "path",
              status: "EXISTING",
              routing_eligible: true,
              routing_role: "network",
              surface_type: "PAVED",
              source_id: "cof_path_plan",
            },
          },
        ],
        radius: {
          status: "current",
          coverage: "complete",
          checkedAt: "2026-08-11T12:00:00.000Z",
          queryBounds: {
            west: -77.44,
            south: 39.39,
            east: -77.38,
            north: 39.44,
          },
          queryDetail: "network",
          geography: "City of Frederick",
          routingRule: "Only confirmed EXISTING linework may inform a route.",
          sources: {
            sidewalks: {
              label: "City of Frederick sidewalk inventory",
              status: "current",
              count: 0,
              coverage: "complete",
              sourceUrl:
                "https://spires.cityoffrederick.com/arcgis/rest/services/Sidewalks/MapServer/2",
            },
            ramps: {
              label: "City of Frederick sidewalk ramp inventory",
              status: "unavailable",
              count: 0,
              coverage: "partial",
              sourceUrl:
                "https://spires.cityoffrederick.com/arcgis/rest/services/Sidewalks/MapServer/0",
            },
            paths: {
              label: "City of Frederick Path Plan",
              status: "current",
              count: 1,
              coverage: "complete",
              checkedAt: "2026-08-11T12:00:00.000Z",
              sourceUrl:
                "https://spires.cityoffrederick.com/arcgis/rest/services/PathPlan/MapServer/0",
            },
            bikePaths: {
              label: "City of Frederick BikePaths service",
              status: "unavailable",
              count: 0,
              coverage: "partial",
              sourceUrl:
                "https://spires.cityoffrederick.com/arcgis/rest/services/BikePaths/MapServer",
            },
          },
        },
      },
    });
  });

  await page.goto("/map", { waitUntil: "domcontentloaded" });
  const host = page.locator(".dock-host");
  await expect(host).toHaveAttribute("data-map-loaded", "true", {
    timeout: 20_000,
  });
  await page.getByRole("button", { name: "Browse map contents" }).click();
  const chooser = page.getByRole("region", { name: "Choose what to see" });
  await chooser.getByText("Ready-made views", { exact: true }).click();
  await chooser
    .getByRole("button", { name: /^Outside now\./ })
    .click();

  await expect(host).toHaveAttribute("data-map-scene", "outside-now");
  // Detailed City linework is intentionally viewport-bound. The existing
  // location control supplies the consented local view; Outside now must not
  // introduce another floating control or trigger a permission prompt itself.
  await page
    .getByRole("button", { name: "Recenter on my location" })
    .click();
  await expect
    .poll(
      () => {
        const raw = new URL(page.url()).searchParams.get("c");
        return Number(raw?.split(",")[2] ?? 0);
      },
      { timeout: 12_000 },
    )
    .toBeGreaterThanOrEqual(12.5);
  const paths = page.getByLabel("Browse City paths");
  await expect(paths).toHaveCount(1, { timeout: 20_000 });
  await paths.focus();
  await paths.selectOption({ label: "Carroll Creek path · existing" });

  const popup = page.getByRole("dialog", { name: "Carroll Creek path" });
  await expect(popup).toBeVisible();
  await expect(popup).toContainText("Mapped as existing");
  await expect(popup).toContainText("current condition and access are not guaranteed");
  await expect(popup).toContainText("City of Frederick Path Plan");
});
