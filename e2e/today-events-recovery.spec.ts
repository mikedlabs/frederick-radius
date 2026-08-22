import { expect, test } from "@playwright/test";

test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });

test("Today restores the current event board after a promoted-build archive miss", async ({
  page,
}) => {
  let recoveryRequests = 0;
  await page.route("**/api/today/events", async (route) => {
    recoveryRequests += 1;
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        partial: false,
        events: [
          {
            slug: "black-frederick-festival-2026-08-22",
            title: "Black Frederick Festival",
            venue: "Carroll Creek Outdoor Amphitheater",
            municipality: "frederick",
            time: "12:00 PM",
            moment: "Now",
            image: null,
            free: true,
          },
        ],
      }),
    });
  });

  await page.goto("/today", { waitUntil: "domcontentloaded" });

  const recovery = page.locator('[data-today-event-recovery="true"]');
  await expect(recovery).toBeVisible();
  await expect(
    recovery.locator(
      'a[href="/events/black-frederick-festival-2026-08-22"]',
    ),
  ).toContainText("Black Frederick Festival");
  await expect(recovery).toContainText("Now");
  await expect(recovery).toContainText("Carroll Creek Outdoor Amphitheater");
  expect(recoveryRequests).toBe(1);
});
