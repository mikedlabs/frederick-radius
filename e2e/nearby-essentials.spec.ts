import { expect, test } from "@playwright/test";

test.use({
  viewport: { width: 390, height: 844 },
  isMobile: true,
  hasTouch: true,
  geolocation: { longitude: -77.4105, latitude: 39.4143 },
  permissions: ["geolocation"],
});

test("a person downtown can get from one need to one useful answer", async ({
  page,
}) => {
  await page.goto("/amenities", { waitUntil: "domcontentloaded" });

  await expect(
    page.getByRole("heading", { level: 1, name: "What do you need?" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Trash", exact: true }).click();

  await expect(page.getByText(/^Closest mapped ·/)).toBeVisible();
  const directions = page.getByRole("link", { name: "Walk there" });
  const map = page.getByRole("link", { name: "See all" });

  await expect(directions).toHaveAttribute(
    "href",
    /^https:\/\/www\.google\.com\/maps\/dir\/\?/,
  );
  const mapHref = await map.getAttribute("href");
  const mapUrl = new URL(mapHref!, "https://frederickradius.app");
  expect(mapUrl.pathname).toBe("/map");
  expect(mapUrl.searchParams.get("amenity")).toBe("trash");
  expect(mapUrl.searchParams.get("at")).toMatch(/^-?\d+\.\d+,-?\d+\.\d+$/);
});

test("the full amenity catalog stays behind one disclosure", async ({ page }) => {
  await page.goto("/amenities", { waitUntil: "domcontentloaded" });

  const more = page.locator("summary").filter({
    hasText: "More useful things nearby",
  });
  await expect(more).toBeVisible();
  await expect(page.getByText("Free Wi-Fi", { exact: true })).toBeHidden();

  await more.click();
  await expect(page.getByText("Free Wi-Fi", { exact: true })).toBeVisible();
  await expect(
    page.getByRole("link", { name: /Show all essentials on the map/ }),
  ).toBeVisible();
});
