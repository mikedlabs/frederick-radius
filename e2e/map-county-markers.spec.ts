import { readFile } from "node:fs/promises";
import { expect, test, type Locator, type Page, type TestInfo } from "@playwright/test";
import { EMPTY_DEFERRED_BROWSE_LAYERS } from "../src/components/map/deferredBrowseLayers";
import { MAPBOX_FIELD_GUIDE_CONFIG } from "../src/components/map/mapboxFieldGuideStyle";
import type { EventPin, MapPinPlace } from "../src/components/map/types";
import catalog from "../src/data/places-client.json";

const baker = catalog.find((place) => place.slug === "baker-park-frederick")!;
const creek = catalog.find((place) => place.slug === "carroll-creek-linear-park-frederick")!;
const falls = catalog.find((place) => place.slug === "cunningham-falls-state-park-thurmont")!;
const venue = catalog.find((place) => place.slug === "mcfadden-park-new-market")!;
const places: MapPinPlace[] = [baker, creek, falls].map((place) => ({
  ...place,
  source: "seed",
  open_status: { state: "unknown" },
}));
const countyCamera = { lng: -77.42, lat: 39.515, zoom: 9 };
const mapPath = `/map?c=${countyCamera.lng},${countyCamera.lat},${countyCamera.zoom}`;
const time = new Date("2026-11-16T17:00:00Z");
const event: EventPin = {
  slug: "county-map-fixture-event",
  title: "County map fixture event",
  venue_name: venue.name,
  municipality: venue.municipality,
  ...venue.geom,
  starts_at: "2026-11-16T16:30:00Z",
  ends_at: "2026-11-16T18:30:00Z",
  category: "community",
};

test.use({
  viewport: { width: 390, height: 844 },
  hasTouch: true,
  contextOptions: { reducedMotion: "reduce" },
  serviceWorkers: "block",
});

// Mapbox runs its real renderer and GeoJSON clustering against a local blank
// basemap. Catalog entries, photo bytes, sheets, and UI are the actual app.
// Only transport and the fixture event are controlled. This test calls no
// provider APIs, and its screenshots do not represent the production basemap.
async function installMapBoundary(page: Page, baseURL: string | undefined) {
  if (!baseURL || !["localhost", "127.0.0.1"].includes(new URL(baseURL).hostname)) {
    throw new Error("The county marker fixture requires a loopback server.");
  }

  await page.clock.setFixedTime(time);
  await page.addInitScript(() => localStorage.setItem("fr_map_location_intro_v1", "dismissed"));
  const origin = new URL(baseURL).origin;
  const schema = Object.fromEntries(
    Object.entries(MAPBOX_FIELD_GUIDE_CONFIG.basemap).map(([key, value]) => [
      key,
      { default: value, type: typeof value === "boolean" ? "boolean" : "string" },
    ]),
  );
  await page.route("**/*", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const path = url.pathname;
    if (!["GET", "HEAD"].includes(request.method())) return route.abort("blockedbyclient");
    if (url.hostname === "events.mapbox.com") return route.fulfill({ status: 204 });
    if (url.hostname === "api.mapbox.com") {
      if (path === "/map-sessions/v1") return route.fulfill({ json: {} });
      if (path.startsWith("/styles/v1/")) {
        return route.fulfill({
          json: {
            version: 8,
            name: "County marker fixture",
            projection: { name: "mercator" },
            sources: {},
            glyphs: `${origin}/basemap/fonts/Noto%20Sans%20Regular/{range}.pbf`,
            imports: [{
              id: "basemap",
              url: "",
              data: {
                version: 8,
                schema,
                sources: {},
                layers: [
                  { id: "local-background", type: "background", paint: { "background-color": "#F4EEE2" } },
                  { id: "bottom", type: "slot" },
                  { id: "middle", type: "slot" },
                  { id: "top", type: "slot" },
                ],
              },
            }],
            layers: [],
            transition: { duration: 0 },
          },
        });
      }
      if (path.includes("mapbox.mapbox-terrain-dem-v1")) {
        return route.fulfill({ json: {
          tilejson: "2.2.0",
          tiles: [`${origin}/controlled-local-terrain/{z}/{x}/{y}.png`],
          bounds: [0, 0, .01, .01],
          minzoom: 0,
          maxzoom: 14,
        } });
      }
      const range = path.match(/(\d+-\d+)\.pbf$/)?.[1];
      if (range) {
        return route.fulfill({
          contentType: "application/x-protobuf",
          body: await readFile(`public/basemap/fonts/Noto Sans Regular/${range}.pbf`),
        });
      }
      return route.abort("blockedbyclient");
    }
    if (url.origin !== origin) return route.abort("blockedbyclient");
    if (path === "/api/map/places") return route.fulfill({ json: {
      generatedAt: time.toISOString(),
      places,
    } });
    if (path === "/api/map/layers") {
      const requestedEvents = url.searchParams.get("groups")?.split(",").includes("events");
      return route.fulfill({ json: {
        ...EMPTY_DEFERRED_BROWSE_LAYERS,
        ...(requestedEvents && {
          weekEvents: [event],
          sourceHealth: { events: { status: "current", unavailable: [], asOf: time.toISOString() } },
        }),
      } });
    }
    if (path === "/api/places/by-slugs") {
      const slugs = url.searchParams.get("slugs")?.split(",") ?? [];
      return route.fulfill({ json: { places: places.filter((place) => slugs.includes(place.slug)) } });
    }
    if (path === "/api/auth/me") return route.fulfill({ json: { user: null } });
    if (path.startsWith("/api/")) return route.fulfill({ status: 503, json: { error: "Unavailable in the county marker fixture" } });
    if (path === "/_next/image") {
      const imagePath = url.searchParams.get("url");
      if (!imagePath?.startsWith("/place-photos/")) return route.abort("blockedbyclient");
      return route.fulfill({
        contentType: "image/jpeg",
        body: await readFile(`public${imagePath}`),
      });
    }
    return route.continue();
  });
}

async function expectUsableTarget(target: Locator) {
  await expect(target).toBeVisible();
  const geometry = await target.evaluate((element) => {
    const box = element.getBoundingClientRect();
    return {
      width: Math.round(box.width),
      height: Math.round(box.height),
      clickable: element.contains(document.elementFromPoint(box.x + box.width / 2, box.y + box.height / 2)),
    };
  });
  expect(geometry.width).toBeGreaterThanOrEqual(44);
  expect(geometry.height).toBeGreaterThanOrEqual(44);
  expect(geometry.clickable).toBe(true);
}

async function expectVisibleLabel(target: Locator, name: string) {
  const label = target.getByText(name, { exact: true });
  await expect(label).toBeVisible();
  const fits = await label.evaluate((element) => {
    const control = element.closest("button, a");
    if (!control) return false;
    const text = element.getBoundingClientRect();
    const bounds = control.getBoundingClientRect();
    return text.left >= bounds.left && text.right <= bounds.right &&
      text.top >= bounds.top && text.bottom <= bounds.bottom;
  });
  expect(fits).toBe(true);
}

async function capture(page: Page, info: TestInfo, name: string) {
  const path = info.outputPath(`${name}.png`);
  await page.screenshot({ path, style: "nextjs-portal { visibility: hidden !important; }" });
  await info.attach(name, { path, contentType: "image/png" });
}

async function tapCountyMap(
  page: Page,
  canvas: Locator,
  point: { lng: number; lat: number },
  offsetX: number,
) {
  const bounds = await canvas.boundingBox();
  expect(bounds).not.toBeNull();
  if (!bounds) return;
  const worldSize = 512 * 2 ** countyCamera.zoom;
  const mercatorY = (lat: number) => Math.asinh(Math.tan(lat * Math.PI / 180)) / (2 * Math.PI);
  const x = bounds.x + bounds.width / 2 + (point.lng - countyCamera.lng) * worldSize / 360 + offsetX;
  const y = bounds.y + bounds.height / 2 + (mercatorY(countyCamera.lat) - mercatorY(point.lat)) * worldSize;
  expect(await canvas.evaluate((element, { x, y }) => document.elementFromPoint(x, y) === element, { x, y })).toBe(true);
  await page.touchscreen.tap(x, y);
}

function cameraZoom(page: Page): number {
  return Number(new URL(page.url()).searchParams.get("c")?.split(",")[2]);
}

test("county markers open places and events at 390px", async ({ page, baseURL }, info) => {
  test.setTimeout(90_000);
  await installMapBoundary(page, baseURL);
  await page.goto(mapPath, { waitUntil: "domcontentloaded" });

  const host = page.locator(".dock-host");
  const canvas = host.locator("canvas.mapboxgl-canvas");
  await expect(canvas).toBeVisible({ timeout: 30_000 });
  await expect(host).toHaveAttribute("data-map-loaded", "true");
  await expect(host).toHaveAttribute("data-map-place-marks", "ready", { timeout: 15_000 });
  expect(cameraZoom(page)).toBe(countyCamera.zoom);

  const locate = host.locator(".map-edge-tool-locate");
  const essentials = host.locator(".map-edge-tool-essential");
  await expectVisibleLabel(locate, "Find me");
  await expectVisibleLabel(essentials, "Nearby essentials");
  await expectUsableTarget(locate);
  await expectUsableTarget(essentials);

  const eventMarker = host.getByRole("button", { name: `${event.title} at ${venue.name}` });
  await expectUsableTarget(eventMarker);
  await capture(page, info, "county-map-390");

  // A tap outside the small painted marker must still hit its 44px region.
  await tapCountyMap(page, canvas, {
    lng: (baker.geom.lng + creek.geom.lng) / 2,
    lat: (baker.geom.lat + creek.geom.lat) / 2,
  }, 16);
  const cluster = page.getByRole("dialog", { name: "Places in this cluster" });
  await expect(cluster).toBeVisible();
  await expect(cluster.getByRole("button", { name: baker.name, exact: true })).toBeVisible();
  const creekRow = cluster.getByRole("button", { name: creek.name, exact: true });
  await expectUsableTarget(creekRow);
  expect(cameraZoom(page)).toBe(countyCamera.zoom);
  await capture(page, info, "county-cluster-390");
  await creekRow.tap();
  await expect(cluster).toBeHidden();
  const creekCard = host.getByRole("region", { name: creek.name, exact: true });
  await expect(creekCard).toBeVisible();
  expect(cameraZoom(page)).toBe(countyCamera.zoom);
  await creekCard.getByRole("button", { name: `Close ${creek.name}` }).tap();
  await expect(creekCard).toBeHidden();

  await tapCountyMap(page, canvas, falls.geom, -16);
  const place = host.locator(`[data-map-place-slug="${falls.slug}"]`);
  await expect(place.getByText(falls.name, { exact: true })).toBeVisible();
  const photograph = place.locator('img[data-map-peek-photo-state="ready"]');
  await expect(photograph).toBeVisible();
  await expect.poll(() => photograph.evaluate((image: HTMLImageElement) => image.naturalWidth)).toBeGreaterThan(1);
  expect(cameraZoom(page)).toBe(countyCamera.zoom);
  await capture(page, info, "county-place-390");
  await place.getByRole("button", { name: `Open details for ${falls.name}` }).click();
  const detail = page.getByRole("dialog", { name: falls.name, exact: true });
  await expect(detail.getByRole("heading", { name: falls.name, exact: true })).toBeVisible();

  await page.goto(mapPath, { waitUntil: "domcontentloaded" });
  await eventMarker.tap();
  const result = host.getByRole("region", { name: event.title, exact: true });
  await expect(result.getByRole("link", { name: "Event details" })).toHaveAttribute("href", /\/events\/county-map-fixture-event/);
  await capture(page, info, "county-event-390");
});
