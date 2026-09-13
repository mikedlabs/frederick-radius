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
  await expect(
    page.getByRole("button", { name: /Plan the rest/ }),
  ).toHaveAttribute("aria-expanded", "false");
  const firstPick = page.getByRole("link", {
    name: /First local pick.*Open now/i,
  });
  await expect(firstPick).toBeVisible();
  await expect(firstPick).not.toHaveAttribute("aria-label");

  const rail = page
    .getByRole("region", { name: "Open places right now" })
    .locator(".shelf-rail");
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
});
