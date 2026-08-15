import { expect, test } from "@playwright/test";

for (const viewport of [
  { label: "narrow phone", width: 320, height: 720, active: false },
  { label: "alerting phone", width: 390, height: 844, active: true },
  { label: "tablet", width: 768, height: 900, active: false },
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
        body: JSON.stringify({
          active: viewport.active,
          count: viewport.active ? 1 : 0,
          tone: viewport.active ? "alert" : "quiet",
          ok: true,
        }),
      });
    });
    await page.goto("/compass", {
      waitUntil: "domcontentloaded",
      timeout: 90_000,
    });

    const header = page.locator("header").first();
    const pulse = header.getByRole("link", { name: /^Pulse:/ });
    const compass = header.getByRole("link", { name: "Open Compass tools" });

    await expect(header.getByRole("link", { name: /tools/i })).toHaveCount(1);

    const dimensions = await header.evaluate((element) => ({
      clientWidth: element.clientWidth,
      scrollWidth: element.scrollWidth,
    }));
    expect(dimensions.scrollWidth).toBeLessThanOrEqual(dimensions.clientWidth);

    if (viewport.width >= 640) {
      await expect(pulse).toBeVisible();
      await expect(compass).toBeVisible();
      await expect(compass).toHaveAttribute("aria-current", "page");
      await expect(pulse.getByText("Pulse", { exact: true })).toBeVisible();
      await expect(compass.getByText("Compass", { exact: true })).toBeVisible();
    } else {
      if (viewport.active) await expect(pulse).toBeVisible();
      else await expect(pulse).toBeHidden();
      await expect(compass).toBeVisible();
      await expect(compass).toHaveAttribute("aria-current", "page");
      await expect(compass.getByText("Compass", { exact: true })).toBeHidden();
      await expect(header.getByText("Tools", { exact: true })).toHaveCount(0);
    }
  });
}
