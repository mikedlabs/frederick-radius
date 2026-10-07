import { expect, test } from "@playwright/test";

const savedAt = "2026-09-01T12:00:00Z";
const listing = {
  slug: "day-plan-canonical", title: "Day Plan public fixture", description: "A controlled public JSON listing.",
  starts_at: "2027-03-15T20:00:00Z", ends_at: "2027-03-15T22:00:00Z", timezone: "America/New_York",
  venue_name: "Memorial Park", address: "Frederick, MD", municipality: "frederick", category: "music",
  audience: [], is_free: true, source: "manual", is_verified: false, source_id: "fixture",
  source_url: null, license: "Demonstration fixture", confidence: "curated", first_seen_at: savedAt,
  last_verified_at: savedAt, geom: { lng: -77.41, lat: 39.41 }, geo_confidence: "area",
};
const response = { events: [listing], resolvedSlugs: [{ requestedSlug: "day-plan-legacy", canonicalSlug: listing.slug }], missingSlugs: [], unresolvedSlugs: [], degraded: false };

for (const width of [390, 1366]) {
  test.describe(`Day Plan device collection at ${width}`, () => {
    test.use({ viewport: { width, height: 844 } });
    test.beforeEach(async ({ page }) => {
      await page.addInitScript(({ savedAt }) => {
        // Seed only once so reload verifies the user's actual remove result.
        if (!sessionStorage.getItem("day-plan-fixture-seeded")) {
          localStorage.setItem("fr:itinerary:v1", JSON.stringify([{ id: "day-plan-legacy", added_at: savedAt }]));
          sessionStorage.setItem("day-plan-fixture-seeded", "yes");
        }
        localStorage.setItem("fr_map_location_intro_v1", "dismissed");
      }, { savedAt });
    });

    test("opens from Saved, retries in both views, and removes the original alias without rewriting its date", async ({ page }) => {
      let requests = 0;
      await page.route("**/api/events/by-slugs", async (route) => {
        if (route.request().method() !== "POST") return route.abort();
        expect(route.request().postDataJSON()).toEqual({ slugs: ["day-plan-legacy"] });
        requests += 1;
        return route.fulfill({ status: requests < 3 ? 503 : 200, contentType: "application/json", body: requests < 3 ? "{}" : JSON.stringify(response) });
      });
      await page.goto("/my-radius", { waitUntil: "domcontentloaded" });
      await page.getByRole("link", { name: /Day Plan/ }).click();
      await expect(page).toHaveURL(/\/itinerary$/);
      await expect(page.getByText("Some saved events could not be checked.", { exact: false })).toBeVisible();
      const original = JSON.stringify([{ id: "day-plan-legacy", added_at: savedAt }]);
      expect(await page.evaluate(() => localStorage.getItem("fr:itinerary:v1"))).toBe(original);
      await page.getByRole("button", { name: "Map", exact: true }).click();
      await expect(page.getByText("No checked event locations to show.", { exact: false })).toBeVisible();
      await page.getByRole("button", { name: "Check again", exact: true }).click();
      await expect(page.getByRole("button", { name: "Check again", exact: true })).toBeEnabled();
      await expect(page.getByText("Some saved events could not be checked.", { exact: false })).toBeVisible();
      await page.getByRole("button", { name: "Timeline", exact: true }).click();
      await page.getByRole("button", { name: "Check again", exact: true }).click();
      await expect(page.getByRole("link", { name: /Day Plan public fixture/ })).toHaveAttribute("href", `/events/${listing.slug}`);
      expect(await page.evaluate(() => localStorage.getItem("fr:itinerary:v1"))).toBe(original);
      await page.getByRole("button", { name: `Remove ${listing.title} from Day Plan` }).click();
      await expect(page.getByRole("heading", { name: "Your day plan is empty" })).toBeVisible();
      expect(await page.evaluate(() => JSON.parse(localStorage.getItem("fr:itinerary:v1") ?? "[]"))).toEqual([]);
      await page.reload({ waitUntil: "domcontentloaded" });
      await expect(page.getByRole("heading", { name: "Your day plan is empty" })).toBeVisible();
      expect(requests).toBe(3);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    });

    test("preserves a no-longer-listed reference without exposing its old title and offers explicit removal", async ({ page }) => {
      await page.route("**/api/events/by-slugs", (route) => route.fulfill({ contentType: "application/json", body: JSON.stringify({ events: [], resolvedSlugs: [], missingSlugs: ["day-plan-legacy"], unresolvedSlugs: [], degraded: false }) }));
      await page.goto("/itinerary", { waitUntil: "domcontentloaded" });
      await expect(page.getByText("This event is no longer publicly listed.", { exact: true })).toBeVisible();
      await expect(page.getByText(listing.title, { exact: true })).toHaveCount(0);
      expect(await page.evaluate(() => JSON.parse(localStorage.getItem("fr:itinerary:v1") ?? "[]"))).toEqual([{ id: "day-plan-legacy", added_at: savedAt }]);
      await page.getByRole("button", { name: "Remove unlisted event 1 from Day Plan" }).click();
      await expect(page.getByRole("heading", { name: "Your day plan is empty" })).toBeVisible();
    });
  });
}
