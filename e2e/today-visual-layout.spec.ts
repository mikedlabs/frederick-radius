import { expect, test } from "@playwright/test";

for (const width of [320, 375, 390, 430, 1366]) {
  test(`Today leads with conditions and an event card at ${width}px`, async ({ page }, testInfo) => {
    test.setTimeout(120_000);
    await page.setViewportSize({ width, height: width === 1366 ? 900 : 844 });
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.addInitScript(() => {
      localStorage.setItem("fr:scope:v1", "county");
      document.cookie = "fr_scope=county; path=/";
    });
    await page.goto("/today", { waitUntil: "domcontentloaded" });
    await page.evaluate(() => document.fonts.ready);

    const conditions = page.locator("[data-today-conditions]");
    await expect(conditions).toBeVisible();

    const firstEvent = page.locator("[data-today-event-pick]").first();
    const find = page.getByRole("link", {
      name: "Find a place, service, event, or answer", exact: true,
    });

    if (await firstEvent.count()) {
      await expect(firstEvent).toBeVisible();
      const conditionsBox = (await conditions.boundingBox())!;
      const eventBox = (await firstEvent.boundingBox())!;
      expect(eventBox.y).toBeGreaterThan(conditionsBox.y);
      if (width <= 430) {
        expect(eventBox.y).toBeLessThan(heightAboveFold(width));
        expect(eventBox.y + Math.min(eventBox.height, 80)).toBeLessThan(heightAboveFold(width) + 24);
      }
      await expect(firstEvent).toHaveAttribute("data-today-event-visual", /photo|category/);
    }

    const findBox = await find.boundingBox();
    expect(findBox).not.toBeNull();
    if (await firstEvent.count()) {
      const eventBox = (await firstEvent.boundingBox())!;
      expect(findBox!.y).toBeGreaterThan(eventBox.y);
    }

    for (const name of ["Open now", "Public essentials", "Plan a few hours", "Local services"]) {
      const shortcut = page.getByRole("link", { name, exact: true });
      const box = (await shortcut.boundingBox())!;
      expect(await shortcut.evaluate((element) => parseFloat(getComputedStyle(element).minHeight)))
        .toBeGreaterThanOrEqual(44);
      expect(Math.round(box.height * 100) / 100, `${name} has a phone-sized touch target`)
        .toBeGreaterThanOrEqual(44);
    }

    const area = page.getByRole("combobox", { name: "Choose your area" });
    await expect(area).toBeEnabled();
    await expect.poll(() => page.evaluate(() =>
      document.documentElement.scrollWidth - document.documentElement.clientWidth,
    )).toBeLessThanOrEqual(1);

    await page.screenshot({ path: testInfo.outputPath(`today-${width}.png`), fullPage: true });
    await area.selectOption("town:brunswick");
    await expect(page.getByTestId("today-scope-status")).toContainText(
      "Brunswick place picks · Countywide weather and events",
    );
    await expect(page.getByRole("link", { name: "Plan a few hours", exact: true }))
      .toHaveAttribute("href", /in=brunswick/);
  });
}

function heightAboveFold(width: number): number {
  return width === 1366 ? 820 : 720;
}
