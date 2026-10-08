import { expect, test } from "@playwright/test";

test.use({
  viewport: { width: 320, height: 568 },
  isMobile: true,
  hasTouch: true,
});

test("Today keeps the first open-place pick in view when photos fall back", async ({
  page,
}) => {
  const transparentGif = Buffer.from(
    "R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==",
    "base64",
  );

  await page.route("**/api/place-photo?*", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "image/gif",
      body: transparentGif,
    });
  });
  await page.route("**/api/want?*", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        hero: {
          slug: "first-local-pick",
          name: "First local pick",
          photo: "/api/place-photo?name=first",
          where: "Frederick",
          distance: null,
          fact: "Open now",
          confidence: "confirmed",
        },
        also: [
          {
            slug: "second-local-pick",
            name: "Second local pick",
            photo: "/api/place-photo?name=second",
            where: "Frederick",
            distance: null,
            fact: "Open now",
            confidence: "confirmed",
          },
        ],
        browseHref: "/open-now",
        contextLabel: "Across Frederick County",
        contextSource: "county",
        mayAssertNoneOpen: false,
      }),
    });
  });

  await page.goto("/today", { waitUntil: "domcontentloaded" });
  // "Plan the rest" hides itself when none of its time-gated children has
  // content, which can happen after 9 PM now that tomorrow's rows live in the
  // day program. Hidden or shown, its disclosure must start collapsed.
  await expect(
    page.locator(".today-plan-rest > h2 > button", { hasText: "Plan the rest" }),
  ).toHaveAttribute("aria-expanded", "false");
  const firstPick = page.getByRole("link", {
    name: /First local pick.*Open now/i,
  });
  await expect(firstPick).toBeVisible();
  await expect(firstPick).not.toHaveAttribute("aria-label");

  // The shelf is a two-tile grid now, not a sideways rail: both picks sit
  // inside the 320px column, the first one on the left.
  const shelf = page.getByRole("region", { name: "Open places right now" });
  const secondPick = shelf.getByRole("link", { name: /Second local pick/i });
  await expect(secondPick).toBeVisible();
  const firstBox = (await firstPick.boundingBox())!;
  const secondBox = (await secondPick.boundingBox())!;
  expect(firstBox.x).toBeGreaterThanOrEqual(0);
  expect(firstBox.x).toBeLessThan(secondBox.x);
  expect(secondBox.x + secondBox.width).toBeLessThanOrEqual(320 + 1);
  // The proxy's 1x1 failure signal is never painted as a photograph: each
  // frame falls back to the flat category mark.
  const frames = shelf.locator("[data-today-tile-frame]");
  await expect(frames).toHaveCount(2);
  await expect(frames.locator('[data-radius-photo="mark"]')).toHaveCount(2);
  await expect(frames.locator("img")).toHaveCount(0);
});
