import { expect, test } from "@playwright/test";
import { CURRENT_TRANSIT_STOPS } from "../src/lib/transit-static";

const STOP = CURRENT_TRANSIT_STOPS.find((stop) => stop.id === "162950")!;
const SCHEDULE = "https://www.frederickcountymd.gov/207/Transit-Routes-Schedule-Information";

// This gate deliberately blocks Mapbox and fixtures unavailable live feeds.
// It proves the real app's static-stop handoff/fallback, not working WebGL or
// current transit service. Root verifies the real map independently.
test.use({ isMobile: true, hasTouch: true, serviceWorkers: "block" });
test.setTimeout(60_000);
for (const width of [320, 390]) {
  test(`a selected stop remains actionable through failed arrivals and basemap at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: width === 320 ? 568 : 844 });
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.addInitScript(() => {
      document.cookie = "fr_onboarded=1; path=/";
      document.cookie = "fr_scope=county; path=/";
    });
    await page.route("**/*", async (route) => {
      const request = route.request();
      const url = new URL(request.url());
      if (url.pathname === "/api/track" || url.pathname.startsWith("/_vercel/insights") || /(^|\.)plausible\.io$/.test(url.hostname)) {
        return route.fulfill({ status: 204 });
      }
      if (!["GET", "HEAD"].includes(request.method()) || url.pathname === "/api/place-photo" || /(^|\.)(mapbox\.(com|cn)|googleapis\.com|googleusercontent\.com)$/.test(url.hostname)) {
        return route.abort("blockedbyclient");
      }
      if (url.pathname.startsWith("/api/transit/")) {
        const payload = url.pathname.endsWith("/alerts") ? { alerts: [] }
          : url.pathname.endsWith("/stop-predictions") ? { predictions: [] }
            : { vehicles: [] };
        return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ...payload, available: false, status: "unavailable", updatedAt: Date.now() }) });
      }
      return route.continue();
    });

    const response = await page.goto(`/transit?stop=${STOP.id}&in=county#my-stop-heading`, { waitUntil: "domcontentloaded" });
    expect(response?.status()).toBe(200);
    const myStop = page.getByRole("region", { name: "My stop", exact: true });
    await expect(myStop).toHaveAttribute("data-transit-stop-interaction-ready", "true");
    await expect(myStop.getByRole("heading", { level: 3, name: STOP.name, exact: true })).toBeVisible();
    await expect(myStop.getByText("Live arrivals are unavailable for this stop right now.", { exact: true })).toBeVisible();
    const show = myStop.getByRole("button", { name: "Show stop on map", exact: true });
    await expect(show).toBeEnabled();
    await show.scrollIntoViewIfNeeded();
    const bounds = await show.boundingBox();
    expect(bounds!.width).toBeGreaterThanOrEqual(44);
    expect(bounds!.height).toBeGreaterThanOrEqual(44);
    const stateBefore = await page.evaluate(() => history.state);
    await show.click();

    const fallback = page.getByRole("alert", { name: "Transit map unavailable", exact: true });
    await expect(fallback).toBeVisible({ timeout: 25_000 });
    await expect(fallback).toContainText(`${STOP.name} remains selected.`);
    await expect(fallback).toContainText("The route and arrival information on this page is still available.");
    await expect(page.getByRole("dialog")).toHaveCount(0);
    expect(new URL(page.url()).searchParams.get("stop")).toBe(STOP.id);
    expect(new URL(page.url()).searchParams.get("in")).toBe("county");
    expect(await page.evaluate(() => history.state)).toEqual(stateBefore);
    await expect(myStop.getByRole("link", { name: "Check the official schedule", exact: true })).toHaveAttribute("href", SCHEDULE);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  });
}
