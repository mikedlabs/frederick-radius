import { expect, test } from "@playwright/test";
import { mkdir } from "node:fs/promises";

const fair = "/moments/great-frederick-fair-2026";

test.describe("mobile friction checks", () => {
  test.use({ hasTouch: true, isMobile: true });
  for (const viewport of [{ width: 320, height: 568 }, { width: 844, height: 390 }]) {
    test(`ticket controls remain reachable at ${viewport.width}x${viewport.height}`, async ({ page }) => {
      await page.setViewportSize(viewport);
      await page.goto(fair);
      await page.getByRole("button", { name: "Review tickets", exact: true }).tap();
      const ready = page.getByRole("button", { name: "I already have tickets", exact: true });
      await ready.scrollIntoViewIfNeeded();
      await ready.tap();
      await page.getByRole("button", { name: "Close Tickets", exact: true }).tap();
      // Completing tickets advances the primary action to travel. The
      // admission tile remains the stable way to revisit ticket choices.
      await page.getByRole("button", { name: "Review ticket and admission choices", exact: true }).tap();
      await page.getByText("Estimate for my group", { exact: true }).tap();
      const adults = page.getByRole("spinbutton", { name: "Adults 11+" });
      await adults.fill("2");
      const copy = page.getByRole("button", { name: "Copy ticket checklist", exact: true });
      await copy.scrollIntoViewIfNeeded();
      const box = await copy.boundingBox();
      expect(box?.height).toBeGreaterThanOrEqual(44);
      expect(box?.y).toBeGreaterThanOrEqual(0);
      expect((box?.y ?? 0) + (box?.height ?? 0)).toBeLessThanOrEqual(viewport.height);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
      await mkdir("output/playwright/finishing", { recursive: true });
      await page.screenshot({ path: `output/playwright/finishing/fair-tickets-${viewport.width}x${viewport.height}.png` });
      await page.getByRole("button", { name: "Close Tickets", exact: true }).tap();
    });
  }
});

for (const width of [390, 1440]) {
  test(`photo-led Fair entrance at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: width === 390 ? 844 : 1000 });
    await page.goto(fair);
    await expect(page.getByRole("heading", { name: "The Great Frederick Fair", exact: true })).toBeVisible();
    const photo = page.locator("[data-fair-hero] img");
    await expect(photo).toHaveAttribute("alt", /Mike D.*2024/);
    await expect.poll(() => photo.evaluate((img) => (img as HTMLImageElement).naturalWidth)).toBeGreaterThan(0);
    await page.evaluate(() => document.fonts.ready);
    await mkdir("output/playwright/finishing", { recursive: true });
    await page.screenshot({ path: `output/playwright/finishing/fair-home-${width}.png` });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  });
}

test("Fair live buses are opt-in, source-labeled and do not impersonate Fair service", async ({ page }) => {
  let requests = 0;
  await page.route("**/api/transit/vehicles", async (route) => {
    requests++;
    const now = Math.floor(Date.now() / 1000);
    await route.fulfill({ json: {
      available: true, status: "ok", feedTimestamp: now,
      feeds: { tripUpdates: { available: false } },
      vehicles: [{ vehicleId: "fixture-bus", lat: 39.4125, lng: -77.3943, timestamp: now }],
    } });
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`${fair}#fair-map`);
  const toggle = page.getByRole("button", { name: "Live county buses" });
  await expect(toggle).toBeVisible({ timeout: 30000 });
  expect(requests).toBe(0);
  await toggle.click();
  await expect(page.getByText("1 county bus nearby now.", { exact: true })).toBeVisible();
  await expect(page.getByText(/Nearby does not mean Fair service/)).toBeVisible();
  await expect(page.getByRole("link", { name: /County bus fixture-bus/ })).toBeVisible();
  await toggle.click();
  await expect(page.getByText("1 county bus nearby now.", { exact: true })).toHaveCount(0);
});

test("ticket checklist copies the user's plan without claiming a transferred cart", async ({ page, context }) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await page.goto(fair);
  await page.getByRole("button", { name: "Review tickets", exact: true }).click();
  await page.getByText("Estimate for my group", { exact: true }).click();
  await page.getByRole("spinbutton", { name: "Adults 11+" }).fill("2");
  await page.getByRole("button", { name: "Copy ticket checklist" }).click();
  await expect(page.getByText("Ticket checklist copied. Nothing has been purchased.", { exact: true })).toBeVisible();
  const copied = await page.evaluate(() => navigator.clipboard.readText());
  expect(copied).toContain("2 adults 11+");
  expect(copied).toContain("Planning checklist only.");
  expect(copied).toContain("2026-09-18");
});
