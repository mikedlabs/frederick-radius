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
      headers: { "x-photo-fallback": "daily-cap" },
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
  await expect(
    page.getByRole("button", { name: /Plan the rest/ }),
  ).toHaveAttribute("aria-expanded", "false");

  const lead = page.locator("[data-today-place-preview], [data-today-opening-soon]").first();
  await expect(lead).toBeVisible();
  const firstName = (await lead.locator("[data-today-pick-name]").innerText()).trim();
  expect(firstName.length).toBeGreaterThan(0);
  expect(firstName).not.toBe("First local pick");

  await page.waitForLoadState("networkidle");

  await expect(lead.locator("[data-today-pick-name]")).toHaveText(firstName);
  await expect(page.getByText("First local pick")).toHaveCount(0);
  await expect(lead).toBeVisible();

  const rail = page.locator(".today-answer-shelf.shelf-rail").first();
  if (await rail.count()) {
    await expect
      .poll(() => rail.evaluate((element) => element.scrollLeft))
      .toBe(0);
    expect(
      await rail.evaluate((element) => {
        const first = element.firstElementChild?.getBoundingClientRect();
        const frame = element.getBoundingClientRect();
        return Boolean(first && first.left >= frame.left - 1);
      }),
    ).toBe(true);
  }
});
