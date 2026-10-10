import { expect, test } from "@playwright/test";

const NOW = new Date("2026-10-06T20:00:00Z");

// The browser intercepts the existing public JSON boundary. The real callers,
// refresh clock, recovery controls, and cache run unchanged. External rendering
// resources are blocked; garage-marker success is a configured-map release check.
for (const viewport of [{ width: 390, height: 844 }, { width: 1366, height: 900 }]) {
  test.describe(`Map operational freshness at ${viewport.width}px`, () => {
    test.use({ viewport });
    test("the legacy Radius view keeps older events visible with dated recovery", async ({ page }) => {
      test.setTimeout(60_000);
      await page.route("**/*", async (route) => {
        const url = new URL(route.request().url());
        if (["localhost", "127.0.0.1"].includes(url.hostname)) await route.continue();
        else await route.abort("blockedbyclient");
      });
      await page.clock.install({ time: NOW });
      let eventChecks = 0;
      let failEvents = false;
      let snapshotAt = NOW.toISOString();
      await page.route("**/api/map/layers?*", async (route) => {
        const group = new URL(route.request().url()).searchParams.get("groups")!;
        if (group === "events") {
          eventChecks += 1;
          if (failEvents) { await route.fulfill({ status: 503, body: "Unavailable" }); return; }
        }
        await route.fulfill({ json: {
          sourceHealth: { [group]: { status: "current", unavailable: [], asOf: snapshotAt } },
          ...(group === "events" ? { weekEvents: [{ slug: "radius-test-event", title: `Radius event ${eventChecks}`, starts_at: "2026-10-06T21:00:00Z", venue_name: "Test hall", category: "arts", lng: -77.4105, lat: 39.4143 }] } : {}),
        } });
      });
      await page.goto("/map?mode=radius", { waitUntil: "domcontentloaded" });
      await expect(page.getByRole("link", { name: /Radius event 1/ })).toBeVisible({ timeout: 30_000 });
      failEvents = true;
      await page.clock.fastForward(300_100);
      const notice = page.getByRole("status", { name: "Current Radius data" });
      await expect(notice).toContainText("could not be updated");
      await expect(notice).toContainText("Last snapshot: Oct 6, 4:00 PM.");
      await expect(page.getByRole("link", { name: /Radius event 1/ })).toBeVisible();
      failEvents = false;
      snapshotAt = new Date(NOW.getTime() + 300_100).toISOString();
      if (viewport.width < 768) await page.getByRole("button", { name: "Adjust the radius" }).click();
      await notice.getByRole("button", { name: "Check again" }).click();
      await expect(notice).toHaveCount(0);
      await expect(page.getByRole("link", { name: /Radius event 3/ })).toBeVisible();
      expect(eventChecks).toBe(3);
    });

    test("keeps readable recovery and bounded refresh when the renderer is unavailable", async ({ page }) => {
      test.setTimeout(60_000);
      await page.route("**/*", async (route) => {
        const url = new URL(route.request().url());
        if (["localhost", "127.0.0.1"].includes(url.hostname)) await route.continue();
        else await route.abort("blockedbyclient");
      });
      await page.clock.install({ time: NOW });
      let snapshotAt = NOW.toISOString();
      const requests: string[] = [];
      await page.route("**/api/map/places", async (route) => route.fulfill({ json: { generatedAt: snapshotAt, places: [] } }));
      await page.route("**/api/map/layers?*", async (route) => {
        const group = new URL(route.request().url()).searchParams.get("groups")!;
        requests.push(group);
        await route.fulfill({ json: {
          sourceHealth: { [group]: { status: "current", unavailable: [], asOf: snapshotAt } },
          ...(group === "signals" ? { smartSignals: { conditionsStatus: "current", activeWeatherAlert: false, marketsOpenTodayCount: 0, roadsTrendingLongerCount: 0 } } : {}),
        } });
      });
      await page.goto("/map?show=parking&at=39.4143,-77.4105", { waitUntil: "domcontentloaded" });
      await expect(page.locator(".dock-host")).toHaveAttribute("data-map-error", "true", { timeout: 30_000 });
      const fallback = page.locator(".map-error-fallback");
      await expect(fallback.getByRole("heading")).toHaveText(/Map view is not enabled right now|The map is temporarily unavailable|This browser cannot draw the map/);
      await expect(page.getByRole("combobox", { name: "Search Frederick Radius", exact: true })).toBeVisible();
      await expect(fallback.getByRole("link", { name: "All places", exact: true })).toBeVisible();
      await expect.poll(() => requests.filter((group) => group === "parking").length).toBe(1);
      snapshotAt = new Date(NOW.getTime() + 60_100).toISOString();
      await page.clock.fastForward(60_100);
      await expect.poll(() => requests.filter((group) => group === "parking").length).toBe(2);
      expect(requests.filter((group) => group === "context")).toHaveLength(1);
      expect(requests.every((group) => ["context", "signals", "parking"].includes(group))).toBe(true);
      test.info().annotations.push({ type: "proof-bound", description: "Guarded local fallback: garage-marker success requires configured-map release acceptance; actual selection and active-layer lifecycle are covered by component/caller tests." });
      await page.screenshot({ path: test.info().outputPath(`map-fallback-${viewport.width}.png`), fullPage: true });
      await fallback.getByRole("link", { name: "All places", exact: true }).click();
      await expect(page).toHaveURL(/\/places$/);
      const checksAfterLeaving = requests.length;
      await page.clock.fastForward(120_000);
      expect(requests).toHaveLength(checksAfterLeaving);
    });
  });
}
