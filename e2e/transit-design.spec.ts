import { join } from "node:path";
import { expect, test, type Locator, type Page } from "@playwright/test";
import { APPEARANCE_KEY } from "../src/lib/appearance";

const STOP = { id: "162950", name: "10th Street at Motter Avenue", lat: 39.42717, lng: -77.40899 };
const ROUTE_ID = "6154";
const VEHICLE_ID = "fixture-bus-15";
const SCHEDULE = "https://www.frederickcountymd.gov/207/Transit-Routes-Schedule-Information";
type FeedCase = "live" | "stale" | "unavailable" | "empty";

// The stop and route are real catalog identities. Positions, arrivals and feed
// states below are declared HTTP fixtures, never proof of current bus service.
test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, serviceWorkers: "block" });
test.setTimeout(60_000);
test.beforeEach(async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.route("**/*", (route) => {
    const request = route.request();
    const url = new URL(request.url());
    if (url.pathname === "/api/track" || url.pathname.startsWith("/_vercel/insights") || /(^|\.)plausible\.io$/.test(url.hostname)) {
      return route.fulfill({ status: 204 });
    }
    if (!["GET", "HEAD"].includes(request.method()) || url.pathname === "/api/place-photo" || /(^|\.)(mapbox\.(com|cn)|googleapis\.com|googleusercontent\.com)$/.test(url.hostname)) {
      return route.abort("blockedbyclient");
    }
    return route.continue();
  });
});

async function installFeedFixture(page: Page, scenario: FeedCase, appearance: "light" | "dark" = "light") {
  await page.addInitScript(({ key, value }) => {
    document.cookie = "fr_onboarded=1; path=/";
    document.cookie = "fr_scope=county; path=/";
    localStorage.setItem(key, value);
  }, { key: APPEARANCE_KEY, value: appearance });
  const counts = { shapes: 0 };
  const paths = new Set(["/api/transit/stop-predictions", "/api/transit/vehicles", "/api/transit/alerts", "/api/transit/marc-vehicles", "/api/transit/shapes"]);
  await page.route((url) => paths.has(url.pathname), async (route) => {
    if (!["GET", "HEAD"].includes(route.request().method())) return route.abort("blockedbyclient");
    const url = new URL(route.request().url());
    const now = Math.floor(Date.now() / 1000);
    const providerTime = scenario === "stale" ? now - 300 : now;
    const available = scenario !== "unavailable";
    const hasArrival = scenario === "live" || scenario === "stale";
    let payload: object;
    if (url.pathname === "/api/transit/shapes") {
      counts.shapes += 1;
      return route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ status: "unavailable", shapes: null }) });
    }
    if (url.pathname === "/api/transit/stop-predictions") {
      payload = {
        predictions: hasArrival && url.searchParams.get("stop") === STOP.id ? [{
          stopId: STOP.id, routeId: ROUTE_ID, tripId: "fixture-trip-10", vehicleId: VEHICLE_ID,
          headsign: "Downtown Frederick", arrivalEpoch: now + 10 * 60, timestamp: providerTime,
          tripScheduleRelationship: "SCHEDULED", scheduleRelationship: "SCHEDULED",
        }] : [],
        status: available ? "ok" : "unavailable", available,
        updatedAt: Date.now(), feedTimestamp: providerTime,
      };
    } else if (url.pathname === "/api/transit/vehicles") {
      payload = {
        vehicles: hasArrival ? [{
          vehicleId: VEHICLE_ID, routeId: ROUTE_ID, tripId: "fixture-trip-10",
          lat: 39.4258, lng: -77.4094, bearing: 8, timestamp: providerTime,
          nextStop: { ...STOP, etaEpoch: now + 10 * 60 },
        }] : [],
        status: available ? "ok" : "unavailable", available,
        updatedAt: Date.now(), feedTimestamp: providerTime, feeds: { tripUpdates: { available } },
      };
    } else if (url.pathname === "/api/transit/alerts") {
      payload = { alerts: [], status: "ok", available: true, updatedAt: Date.now() };
    } else {
      payload = { vehicles: [], status: "ok", available: true, feedTimestamp: now };
    }
    return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(payload) });
  });
  return counts;
}

async function selectedStop(page: Page) {
  const response = await page.goto(`/transit?stop=${STOP.id}#my-stop-heading`, { waitUntil: "domcontentloaded" });
  expect(response?.status()).toBe(200);
  const stop = page.getByRole("region", { name: "My stop", exact: true });
  await expect(stop).toHaveAttribute("data-transit-stop-interaction-ready", "true");
  await expect(stop.getByRole("heading", { level: 3, name: STOP.name, exact: true })).toBeVisible();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  return stop;
}

async function expectNoOverflow(page: Page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
}

async function expectReachableTarget(target: Locator) {
  await target.evaluate((node) => node.scrollIntoView({ block: "center" }));
  await expect(target).toBeVisible();
  // Include real pseudo-element extenders; a small visual face can still have
  // a full44px effective target. Every cardinal point must reach this control.
  await expect.poll(() => target.evaluate((node) => {
    const box = node.getBoundingClientRect();
    const x = box.left + box.width / 2, y = box.top + box.height / 2;
    return [[x, y], [x - 21.5, y], [x + 21.5, y], [x, y - 21.5], [x, y + 21.5]].every(([px, py]) => {
      const hit = document.elementFromPoint(px, py);
      return hit === node || Boolean(hit && node.contains(hit));
    });
  })).toBe(true);
}

async function expectTextUnclipped(text: Locator) {
  await text.evaluate((node) => node.scrollIntoView({ block: "center", inline: "nearest" }));
  await expect(text).toBeVisible();
  const geometry = await text.evaluate((node) => {
    const box = (rect: DOMRect) => ({ left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom });
    const ownBox = box(node.getBoundingClientRect());
    const range = document.createRange();
    range.selectNodeContents(node);
    const lines = [...range.getClientRects()].filter((rect) => rect.width > 0 && rect.height > 0).map(box);
    const clips = [{
      node: "viewport", x: true, y: true,
      box: { left: 0, top: 0, right: document.documentElement.clientWidth, bottom: innerHeight },
    }];
    // A visible-overflow line box is not a clipping boundary. Font metrics may
    // exceed a tight line-height while every glyph still paints completely.
    for (let ancestor: Element | null = node; ancestor; ancestor = ancestor.parentElement) {
      const style = getComputedStyle(ancestor);
      const x = ["hidden", "clip", "auto", "scroll"].includes(style.overflowX);
      const y = ["hidden", "clip", "auto", "scroll"].includes(style.overflowY);
      if (!x && !y) continue;
      const bounds = ancestor.getBoundingClientRect();
      const left = bounds.left + ancestor.clientLeft, top = bounds.top + ancestor.clientTop;
      clips.push({
        node: ancestor.tagName.toLowerCase() + (ancestor.id ? `#${ancestor.id}` : ""), x, y,
        box: { left, top, right: left + ancestor.clientWidth, bottom: top + ancestor.clientHeight },
      });
    }
    const unclipped = lines.length > 0 && clips.every((clip) => lines.every((line) =>
      (!clip.x || (line.left >= clip.box.left && line.right <= clip.box.right)) &&
      (!clip.y || (line.top >= clip.box.top && line.bottom <= clip.box.bottom)),
    ));
    return {
      text: node.textContent?.trim(), ownBox, range: box(range.getBoundingClientRect()), clips, unclipped,
      extendsOwnLineBox: lines.some((line) => line.left < ownBox.left || line.right > ownBox.right || line.top < ownBox.top || line.bottom > ownBox.bottom),
    };
  });
  if (geometry.extendsOwnLineBox) {
    console.info("transit-text-clipping-geometry", JSON.stringify(geometry));
    await test.info().attach("text-clipping-geometry", { contentType: "application/json", body: JSON.stringify(geometry) });
  }
  expect(geometry.unclipped, JSON.stringify(geometry)).toBe(true);
}

async function expectSeparateText(first: Locator, second: Locator) {
  const a = (await first.boundingBox())!, b = (await second.boundingBox())!;
  expect(Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x) <= 1 || Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y) <= 1).toBe(true);
}

async function expectOfficialSchedule(stop: Locator) {
  const schedule = stop.getByRole("link", { name: "Check the official schedule", exact: true });
  await expect(schedule).toHaveAttribute("href", SCHEDULE);
  await expect(schedule).toHaveAttribute("target", "_blank");
  await expectReachableTarget(schedule);
}

for (const { width, appearance } of [{ width: 320, appearance: "dark" }, { width: 390, appearance: "light" }] as const) {
  test(`the selected stop stays readable and actionable at ${width}px in explicit ${appearance} appearance`, async ({ page }, info) => {
    await page.setViewportSize({ width, height: width === 320 ? 568 : 844 });
    await installFeedFixture(page, "live", appearance);
    const stop = await selectedStop(page);
    await expect(page.locator("html")).toHaveAttribute("data-appearance", appearance);
    expect(await page.evaluate(() => getComputedStyle(document.documentElement).colorScheme)).toBe(appearance);
    expect(await page.evaluate(() => matchMedia("(prefers-reduced-motion: reduce)").matches)).toBe(true);
    const heading = stop.getByRole("heading", { level: 3, name: STOP.name, exact: true });
    const destination = stop.getByText("To Downtown Frederick", { exact: true });
    const arrival = stop.getByText(/^(9|10) min$/);
    await expect(stop.getByText("Live", { exact: true })).toBeVisible();
    await expect(stop.getByText(/Live estimate/)).toBeVisible();
    await expectTextUnclipped(heading);
    await expectTextUnclipped(destination);
    await expectTextUnclipped(arrival);
    await expectSeparateText(destination, arrival);
    for (const action of [
      stop.getByRole("button", { name: "Save stop", exact: true }),
      stop.getByRole("link", { name: "Walking directions to this stop", exact: true }),
      stop.getByRole("button", { name: `Save bus ${VEHICLE_ID}`, exact: true }),
      stop.getByRole("button", { name: "Track 10 Connector to Downtown Frederick on the live map", exact: true }),
    ]) await expectReachableTarget(action);
    const walk = new URL((await stop.getByRole("link", { name: "Walking directions to this stop", exact: true }).getAttribute("href"))!);
    expect(walk.searchParams.get("destination")).toBe(`${STOP.lat},${STOP.lng}`);
    expect(walk.searchParams.get("travelmode")).toBe("walking");
    await expectNoOverflow(page);
    expect(await stop.evaluate((node) => node.getAnimations({ subtree: true }).filter((animation) => animation.playState === "running" && animation.effect?.getTiming().iterations === Infinity).length)).toBe(0);
    await page.addScriptTag({ path: join(process.cwd(), "node_modules/axe-core/axe.min.js") });
    const violations = await page.evaluate(async () => {
      const axe = (window as unknown as { axe: { run: (context: Element, options: object) => Promise<{ violations: unknown[] }> } }).axe;
      return (await axe.run(document.querySelector('[aria-labelledby="my-stop-heading"]')!, { runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"] }, resultTypes: ["violations"] })).violations;
    });
    expect(violations).toEqual([]);
    await heading.scrollIntoViewIfNeeded();
    await page.screenshot({ path: info.outputPath(`transit-HTTP-fixture-${width}-${appearance}.png`) });
    await info.attach("declared-transit-fixture", { contentType: "application/json", body: JSON.stringify({ stop: STOP.id, route: ROUTE_ID, vehicle: VEHICLE_ID, scenario: "live", width, appearance, reducedMotion: true, proof: "Actual app/catalog and layout with HTTP fixture arrivals; not proof of current bus service or a working remote map." }) });
    if (width === 390) {
      const fallback = page.getByRole("alert", { name: "Transit map unavailable", exact: true });
      await expect(fallback).toBeVisible({ timeout: 25_000 });
      await expect(fallback).toContainText("The route and arrival information on this page is still available.");
      await expect(heading).toBeVisible();
      await expect(stop.getByText("To Downtown Frederick", { exact: true })).toBeVisible();
      await expectNoOverflow(page);
    }
  });
}

test("a provider-stale stop remains a delayed estimate rather than a live countdown or zero buses", async ({ page }) => {
  await installFeedFixture(page, "stale");
  const stop = await selectedStop(page);
  await expect(stop.getByText("Feed delayed", { exact: true })).toBeVisible();
  await expect(stop.getByText(/Estimate delayed/)).toBeVisible();
  await expect(stop.getByText("To Downtown Frederick", { exact: true })).toBeVisible();
  await expect(stop.getByText(/Live estimate/)).toHaveCount(0);
  await expect(stop.getByText(/^(Due|\d+ min)$/)).toHaveCount(0);
  await expect(stop.getByRole("button", { name: /Track .* on the live map/ })).toHaveCount(0);
  await expect(stop.getByText(/No live arrival is reporting|No inbound buses|0 buses/)).toHaveCount(0);
  await expectOfficialSchedule(stop);
  await expectNoOverflow(page);
});

test("an unavailable selected-stop feed keeps uncertainty and the official schedule instead of reporting zero", async ({ page }) => {
  await installFeedFixture(page, "unavailable");
  const stop = await selectedStop(page);
  await expect(stop.getByText("Feed unavailable", { exact: true })).toBeVisible();
  await expect(stop.getByText("Live arrivals are unavailable for this stop right now.", { exact: true })).toBeVisible();
  await expect(stop.getByText(/Live estimate|No live arrival is reporting|No inbound buses|0 buses/)).toHaveCount(0);
  await expect(stop.getByRole("button", { name: /Track .* on the live map/ })).toHaveCount(0);
  await expectOfficialSchedule(stop);
  await expectNoOverflow(page);
});

test("a healthy empty stop feed reports no live arrival and still offers the official schedule", async ({ page }) => {
  await installFeedFixture(page, "empty");
  const stop = await selectedStop(page);
  await expect(stop.getByText("Live", { exact: true })).toBeVisible();
  await expect(stop.getByText("No live arrival is reporting for this stop right now. Check the official schedule before leaving.", { exact: true })).toBeVisible();
  await expect(stop.getByText(/Feed unavailable|Feed delayed|Live estimate/)).toHaveCount(0);
  await expect(stop.getByRole("button", { name: /Track .* on the live map/ })).toHaveCount(0);
  await expectOfficialSchedule(stop);
  await expectNoOverflow(page);
});

test("Pulse keeps unavailable bus status honest and offers one usable sheet and a real transit handoff when the route map fails", async ({ page }, info) => {
  await page.setViewportSize({ width: 320, height: 568 });
  const counts = await installFeedFixture(page, "unavailable", "dark");
  const response = await page.goto("/pulse?in=county", { waitUntil: "domcontentloaded" });
  expect(response?.status()).toBe(200);
  const reveal = page.getByRole("region", { name: "Live TransIT buses", exact: true });
  const summary = reveal.getByRole("status");
  await expect(summary).toHaveText("Bus locations unavailable · no service alerts posted");
  await expect(summary).not.toContainText("No buses reporting positions");
  await expectTextUnclipped(summary);
  expect(counts.shapes).toBe(0);
  const trigger = reveal.getByRole("button", { name: "Show current buses", exact: true });
  await expect(trigger).toHaveAttribute("aria-expanded", "false");
  await expectReachableTarget(trigger);
  await trigger.click();
  const dialog = page.getByRole("dialog", { name: "Buses right now", exact: true });
  await expect(page.getByRole("dialog")).toHaveCount(1);
  await expect(dialog.getByRole("heading", { name: "Buses right now", exact: true })).toBeVisible();
  await expect(dialog.getByRole("alert")).toContainText("The live bus map did not load. Try again in a moment.");
  await expectReachableTarget(dialog.getByRole("button", { name: "Try map again", exact: true }));
  const arrivals = dialog.getByRole("link", { name: "Find stop arrivals", exact: true });
  await expect(arrivals).toHaveAttribute("href", "/transit");
  await expectReachableTarget(arrivals);
  await expectNoOverflow(page);
  await page.screenshot({ path: info.outputPath("pulse-map-failure-HTTP-fixture-320-dark.png") });
  const close = dialog.getByRole("button", { name: "Close Buses right now", exact: true });
  await expectReachableTarget(close);
  await close.click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(trigger).toBeFocused();
  await expect(trigger).toHaveAttribute("aria-expanded", "false");
  await expect(summary).toHaveText("Bus locations unavailable · no service alerts posted");
  expect(counts.shapes).toBe(1);
  await trigger.click();
  await expect(page.getByRole("dialog")).toHaveCount(1);
  await expect(dialog.getByRole("heading", { name: "Buses right now", exact: true })).toBeVisible();
  await expect(dialog.getByRole("alert")).toContainText("The live bus map did not load.");
  await arrivals.click();
  await expect(page).toHaveURL(/\/transit$/);
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page.getByRole("region", { name: "My stop", exact: true })).toHaveAttribute("data-transit-stop-interaction-ready", "true");
  await expectNoOverflow(page);
  await info.attach("declared-pulse-failure-fixture", { contentType: "application/json", body: JSON.stringify({ width: 320, appearance: "dark", vehicles: "Unavailable HTTP fixture, not zero", routeGeometry: "HTTP503 fixture", mapboxTransport: "blocked", deliberateGeometryRequests: counts.shapes, actualTransitDestination: new URL(page.url()).pathname, proof: "App fallback/interaction proof; not an assertion about the public provider's present availability." }) });
});
