import { expect, test } from "@playwright/test";

const STOP = {
  id: "162950",
  name: "10th Street at Motter Avenue",
  lat: 39.42717,
  lng: -77.40899,
};
const ROUTE_ID = "6154";
const VEHICLE_ID = "bus-15";

test.use({
  viewport: { width: 390, height: 844 },
  isMobile: true,
  hasTouch: true,
});

test("a rider can find, save, and track the exact inbound bus without mobile overflow", async ({
  page,
}) => {
  await page.route("**/api/transit/stop-predictions?**", async (route) => {
    const stopId = new URL(route.request().url()).searchParams.get("stop");
    const nowSeconds = Math.floor(Date.now() / 1000);
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        predictions:
          stopId === STOP.id
            ? [
                {
                  stopId: STOP.id,
                  routeId: ROUTE_ID,
                  tripId: "test-trip-10",
                  vehicleId: VEHICLE_ID,
                  headsign: "Downtown Frederick",
                  arrivalEpoch: nowSeconds + 10 * 60,
                  timestamp: nowSeconds,
                  tripScheduleRelationship: "SCHEDULED",
                  scheduleRelationship: "SCHEDULED",
                },
              ]
            : [],
        updatedAt: Date.now(),
        status: "ok",
        available: true,
        feedTimestamp: nowSeconds,
      }),
    });
  });

  await page.route("**/api/transit/vehicles", async (route) => {
    const nowSeconds = Math.floor(Date.now() / 1000);
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        vehicles: [
          {
            vehicleId: VEHICLE_ID,
            routeId: ROUTE_ID,
            tripId: "test-trip-10",
            lat: 39.4258,
            lng: -77.4094,
            bearing: 8,
            timestamp: nowSeconds,
            nextStop: {
              ...STOP,
              etaEpoch: nowSeconds + 10 * 60,
            },
          },
        ],
        updatedAt: Date.now(),
        status: "ok",
        available: true,
        feedTimestamp: nowSeconds,
        feeds: { tripUpdates: { available: true } },
      }),
    });
  });

  await page.route("**/api/transit/alerts", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        alerts: [],
        status: "ok",
        available: true,
        updatedAt: Date.now(),
      }),
    });
  });

  await page.route("**/api/transit/marc-vehicles", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        vehicles: [],
        status: "ok",
        available: true,
        feedTimestamp: Math.floor(Date.now() / 1000),
      }),
    });
  });

  await page.goto("/transit", { waitUntil: "domcontentloaded" });

  const commandCenter = page.getByRole("region", { name: "My stop" });
  await expect(commandCenter).toBeVisible();
  const stopSearch = commandCenter.getByRole("searchbox", {
    name: "Search bus stops by name",
  });
  await stopSearch.fill("10th Street at Motter");
  await commandCenter
    .getByRole("button", { name: STOP.name, exact: true })
    .click();

  await expect(
    commandCenter.getByRole("heading", { level: 3, name: STOP.name }),
  ).toBeVisible();
  await expect(commandCenter.getByText("To Downtown Frederick")).toBeVisible();
  await expect(commandCenter.getByText("Live estimate")).toBeVisible();
  await expect(commandCenter.getByText(/^(9|10) min$/)).toBeVisible();

  await commandCenter
    .getByRole("button", { name: "Save stop", exact: true })
    .click();
  await expect(
    commandCenter.getByRole("button", { name: "Saved stop", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await expect
    .poll(() =>
      page.evaluate((key) => {
        const raw = window.localStorage.getItem(key);
        return raw ? JSON.parse(raw) : [];
      }, "fr.transit.saved-stops.v1"),
    )
    .toEqual([
      expect.objectContaining({
        id: STOP.id,
        name: STOP.name,
        lat: STOP.lat,
        lng: STOP.lng,
      }),
    ]);

  const saveBus = commandCenter.getByRole("button", {
    name: `Save bus ${VEHICLE_ID}`,
  });
  await saveBus.click();
  await expect(
    commandCenter.getByRole("button", {
      name: `Remove bus ${VEHICLE_ID} from Saved`,
    }),
  ).toHaveAttribute("aria-pressed", "true");
  await expect
    .poll(() =>
      page.evaluate((key) => {
        const raw = window.localStorage.getItem(key);
        return raw ? JSON.parse(raw) : [];
      }, "fr.transit.saved-buses.v1"),
    )
    .toEqual([
      expect.objectContaining({
        watchId: `${VEHICLE_ID}:test-trip-10`,
        vehicleId: VEHICLE_ID,
        tripId: "test-trip-10",
        routeId: ROUTE_ID,
        headsign: "Downtown Frederick",
        targetStop: expect.objectContaining({
          id: STOP.id,
          name: STOP.name,
        }),
      }),
    ]);

  await page.evaluate(() => {
    const target = window as unknown as {
      __transitVehicleFocusEvents?: unknown[];
    };
    target.__transitVehicleFocusEvents = [];
    window.addEventListener("fr:transit-vehicle-focus", (event) => {
      target.__transitVehicleFocusEvents?.push(
        (event as CustomEvent<unknown>).detail,
      );
    });
  });

  await commandCenter
    .getByRole("button", {
      name: "Track 10 Connector to Downtown Frederick on the live map",
    })
    .click();

  await expect
    .poll(() =>
      page.evaluate(() => {
        const target = window as unknown as {
          __transitVehicleFocusEvents?: unknown[];
        };
        return target.__transitVehicleFocusEvents?.at(-1) ?? null;
      }),
    )
    .toMatchObject({
      vehicleId: VEHICLE_ID,
      routeId: ROUTE_ID,
      bus: { lng: -77.4094, lat: 39.4258 },
      stop: { lng: STOP.lng, lat: STOP.lat },
      stopId: STOP.id,
      stopName: STOP.name,
    });
  await expect(page.locator("#live-network-heading")).toBeInViewport();
  await expect(page.getByLabel("Bus route")).toHaveValue(ROUTE_ID);
  await expect(
    page.getByRole("status").filter({
      hasText: `Tracking bus ${VEHICLE_ID} to ${STOP.name}`,
    }),
  ).toBeAttached();

  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);

  await page.reload({ waitUntil: "domcontentloaded" });
  await expect(
    commandCenter.getByRole("heading", { level: 3, name: STOP.name }),
  ).toBeVisible();
  await expect(
    commandCenter.getByRole("button", { name: "Saved stop", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await expect(
    commandCenter
      .locator('[aria-label="Saved bus stops"]')
      .getByRole("button", { name: STOP.name, exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);

  await page.goto("/my-radius", { waitUntil: "domcontentloaded" });
  const savedTransit = page.getByRole("region", { name: "Saved transit" });
  await expect(savedTransit).toBeVisible();
  await expect(savedTransit.getByText(STOP.name).first()).toBeVisible();
  await expect(savedTransit.getByText(`bus ${VEHICLE_ID}`)).toBeVisible();
  await expect(savedTransit.getByText("Live now")).toBeVisible();
  await expect(
    page.getByText(
      "Save a place, event, bus, or stop to keep it here for later.",
    ),
  ).toBeHidden();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);

  await savedTransit.getByRole("link", { name: "See arrivals" }).click();
  await expect(page).toHaveURL(
    new RegExp(`/transit\\?stop=${STOP.id}#my-stop-heading$`),
  );
  await expect(
    page
      .getByRole("region", { name: "My stop" })
      .getByRole("heading", { level: 3, name: STOP.name }),
  ).toBeVisible();

  await page.setViewportSize({ width: 320, height: 568 });
  await page.goto("/my-radius", { waitUntil: "domcontentloaded" });
  await expect(
    page.getByRole("region", { name: "Saved transit" }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
});
