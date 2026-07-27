import { expect, test } from "@playwright/test";

test.use({
  viewport: { width: 390, height: 844 },
  isMobile: true,
  hasTouch: true,
  geolocation: { longitude: -77.4106, latitude: 39.4143 },
  permissions: ["geolocation"],
});

test("sign-in cancel preserves the safe page the visitor meant to open", async ({ page }) => {
  await page.goto("/auth/login?next=%2Fsettings", { waitUntil: "domcontentloaded" });

  await expect(page.getByRole("link", { name: "keep browsing" })).toHaveAttribute(
    "href",
    "/settings",
  );
});

test("the food-truck operator console always has a way back to the public board", async ({ page }) => {
  await page.goto("/food-trucks/out", { waitUntil: "domcontentloaded" });

  await expect(page.getByRole("link", { name: "Back to food trucks" })).toHaveAttribute(
    "href",
    "/food-trucks",
  );
  await expect(page.getByRole("heading", { name: "This link is not active." })).toBeVisible();
});

test("a successful food-truck check-in leads to the live board", async ({ page }) => {
  let posted = false;
  await page.route("**/api/food-trucks/beacon**", async (route) => {
    if (route.request().method() === "POST") {
      posted = true;
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ ok: true, id: "beacon-test", expiresAt: "2026-07-27T16:00:00.000Z" }),
      });
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        truckSlug: "blues-bbq",
        truckName: "Blues BBQ Co.",
        live: posted
          ? {
              spot: "Baker Park",
              note: "Brisket",
              minsLeft: 120,
              phase: "out",
              label: "Out now",
              expiresAt: "2026-07-27T16:00:00.000Z",
            }
          : null,
      }),
    });
  });
  await page.addInitScript(() => {
    window.localStorage.setItem("fr:truck:token", "a".repeat(32));
  });

  await page.goto("/food-trucks/out", { waitUntil: "domcontentloaded" });
  await page.getByRole("button", { name: "Use my location" }).click();
  await page.getByRole("button", { name: "Drop my live pin" }).click();

  await expect(page.getByRole("link", { name: "View on the board" })).toHaveAttribute(
    "href",
    "/food-trucks#near-me",
  );
});

test("a failed shared-list request is recoverable and is not called an empty list", async ({ page }) => {
  await page.route("**/api/places/by-slugs**", async (route) => {
    await route.fulfill({
      status: 503,
      contentType: "application/json",
      body: JSON.stringify({ error: "temporarily-unavailable" }),
    });
  });

  await page.goto("/radius/shared?p=gravel-and-grind-frederick", {
    waitUntil: "domcontentloaded",
  });

  await expect(page.getByText("This shared list did not load.")).toBeVisible();
  await expect(page.getByText("This shared list is empty.")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Retry" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Go to Today" })).toHaveAttribute(
    "href",
    "/today",
  );
});

test("legacy wheel links converge on Compass", async ({ page }) => {
  await page.goto("/wheel", { waitUntil: "domcontentloaded" });

  await expect(page).toHaveURL(/\/compass$/);
});

test("the contacts directory hands uncertain questions to Ask Radius", async ({ page }) => {
  await page.goto("/contacts", { waitUntil: "domcontentloaded" });

  await expect(page.getByRole("link", { name: "Not sure who to call?" })).toHaveAttribute(
    "href",
    "/ask",
  );
});

test("a cold report deep link closes to the map instead of a blank browser page", async ({ page }) => {
  await page.goto("/report", { waitUntil: "domcontentloaded" });

  await page.getByRole("link", { name: "Close and go back" }).click();
  await expect(page).toHaveURL(/\/map$/);
});

test("a cold From Above deep link returns to Today", async ({ page }) => {
  await page.goto("/from-above/preview", { waitUntil: "domcontentloaded" });

  await page.getByRole("link", { name: "Back to Frederick Radius" }).click();
  await expect(page).toHaveURL(/\/today$/);
});
