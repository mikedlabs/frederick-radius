import { expect, test } from "@playwright/test";

for (const viewport of [
  { label: "narrow phone", width: 320, height: 720 },
  { label: "standard phone", width: 390, height: 844 },
  { label: "wide phone", width: 430, height: 932 },
  { label: "tablet", width: 768, height: 900 },
]) {
  test(`TopBar keeps secondary destinations calm without overflow on a ${viewport.label}`, async ({
    page,
  }) => {
    test.setTimeout(120_000);
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    await page.route("**/api/pulse/status", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ active: false, count: 0, tone: "quiet", ok: true }),
      });
    });
    await page.goto("/compass", {
      waitUntil: "domcontentloaded",
      timeout: 90_000,
    });

    const header = page.locator("header").first();
    const pulse = header.getByRole("link", { name: /^County status:/ });
    const compass = header.getByRole("link", { name: "Open tools" });

    await expect(header.getByRole("link", { name: /tools/i })).toHaveCount(1);
    const toolLabels = compass.getByText("Tools", { exact: true });
    await expect(toolLabels).toHaveCount(2);
    const visibleToolLabels = compass.locator("span:visible").filter({ hasText: /^Tools$/ });
    await expect(visibleToolLabels).toHaveCount(viewport.width >= 400 ? 1 : 0);
    if (viewport.width >= 400) {
      await expect(visibleToolLabels).toBeVisible();
    } else {
      for (const label of await toolLabels.all()) await expect(label).toBeHidden();
    }

    const dimensions = await header.evaluate((element) => ({
      clientWidth: element.clientWidth,
      scrollWidth: element.scrollWidth,
    }));
    expect(dimensions.scrollWidth).toBeLessThanOrEqual(dimensions.clientWidth);

    if (viewport.width >= 640) {
      await expect(pulse).toBeVisible();
      await expect(compass).toBeVisible();
      await expect(compass).toHaveAttribute("aria-current", "page");
      await expect(pulse.getByText("County status", { exact: true })).toBeVisible();
    } else {
      await expect(pulse).toBeHidden();
      await expect(compass).toBeVisible();
      await expect(compass).toHaveAttribute("aria-current", "page");

      if (viewport.width === 390) {
        const location = header.locator("[data-location-chip]");
        const compactScope = location.locator('[data-location-scope-label="compact"]');
        await expect(compactScope).toBeVisible();
        await expect(compactScope).toHaveText("County");
        await expect(
          location.locator('[data-location-scope-label="full"]'),
        ).toBeHidden();
        const geometry = await location.evaluate((control) => ({
          height: control.getBoundingClientRect().height,
          labelClientWidth: control.querySelector<HTMLElement>(
            '[data-location-scope-label="compact"]',
          )?.clientWidth ?? 0,
          labelScrollWidth: control.querySelector<HTMLElement>(
            '[data-location-scope-label="compact"]',
          )?.scrollWidth ?? 1,
        }));
        expect(geometry.height).toBeGreaterThanOrEqual(44);
        expect(geometry.labelScrollWidth).toBeLessThanOrEqual(
          geometry.labelClientWidth,
        );
      }
    }
  });
}

for (const status of [
  { label: "active alerts", payload: { active: true, count: 2, tone: "alert", ok: true }, name: "County status: 2 active alerts" },
  { label: "unavailable checks", payload: { active: false, count: 0, tone: "quiet", ok: false }, name: "County status: unavailable" },
]) {
  test(`TopBar keeps ${status.label} visible on a phone`, async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.route("**/api/pulse/status", async (route) => {
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(status.payload) });
    });
    await page.goto("/today", { waitUntil: "domcontentloaded" });
    const header = page.locator("header").first();
    const statusLink = header.getByRole("link", { name: status.name, exact: true });
    await expect(statusLink).toBeVisible();
    await expect(statusLink).toHaveAttribute("href", "/pulse");
    const bounds = await statusLink.boundingBox();
    expect(bounds?.height).toBeGreaterThanOrEqual(44);
    expect(bounds?.width).toBeGreaterThanOrEqual(44);
    expect(await header.evaluate((element) => element.scrollWidth - element.clientWidth)).toBeLessThanOrEqual(0);
  });
}
