import { expect, test } from "@playwright/test";

for (const width of [320, 375, 390, 430, 1366]) {
  test(`Today keeps the editorial layout useful at ${width}px`, async ({ page }, testInfo) => {
    test.setTimeout(120_000);
    await page.setViewportSize({ width, height: width === 1366 ? 900 : 844 });
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.addInitScript(() => {
      localStorage.setItem("fr:scope:v1", "county");
      document.cookie = "fr_scope=county; path=/";
    });
    await page.goto("/today", { waitUntil: "domcontentloaded" });
    const area = page.getByRole("combobox", { name: "Choose your area" });
    await expect(area).toBeEnabled();
    await page.evaluate(() => document.fonts.ready);

    const masthead = page.locator("main .scroll-masthead");
    const find = page.getByRole("link", {
      name: "Find a place, service, event, or answer", exact: true,
    });
    const mastheadBox = (await masthead.boundingBox())!;
    const findBox = (await find.boundingBox())!;
    const weatherBox = (await page.locator("[data-today-weather]").boundingBox())!;
    expect(findBox.y).toBeGreaterThanOrEqual(mastheadBox.y + mastheadBox.height);
    // Keep the original masthead + Find density budget, excluding only the
    // newly prioritized weather band. Desktop weather shares the arrival row.
    const addedWeatherBand = width < 960
      ? Math.max(0, weatherBox.y + weatherBox.height - (mastheadBox.y + mastheadBox.height))
      : 0;
    expect(findBox.y + findBox.height - mastheadBox.y - addedWeatherBand).toBeLessThan(380);
    if (width < 640) {
      const primaryNav = page.locator("[data-bottom-nav-shell]").getByRole("navigation", {
        name: "Primary", exact: true,
      });
      await expect(primaryNav).toBeVisible();
      const primaryNavBox = (await primaryNav.boundingBox())!;
      expect(findBox.y).toBeGreaterThanOrEqual(0);
      expect(findBox.y + findBox.height).toBeLessThanOrEqual(primaryNavBox.y);
    }
    expect(await masthead.evaluate((element) => ({
      border: getComputedStyle(element).borderTopWidth,
      shadow: getComputedStyle(element).boxShadow,
    }))).toEqual({ border: "0px", shadow: "none" });
    expect(await masthead.locator("figcaption").evaluate((element) =>
      parseFloat(getComputedStyle(element).fontSize),
    )).toBeGreaterThanOrEqual(11);
    // The owned photo is a readable editorial frame, with archival context
    // visible beside it. It never substitutes for current weather evidence.
    const photoBox = (await masthead.locator("figure").boundingBox())!;
    expect(photoBox.width).toBeGreaterThanOrEqual(mastheadBox.width * 0.95);
    await expect(masthead.locator("figcaption")).toContainText("Archive");

    for (const name of ["Open now", "Public essentials", "Plan a few hours", "Local services"]) {
      const shortcut = page.getByRole("link", { name, exact: true });
      const box = (await shortcut.boundingBox())!;
      // CSS transforms can report 43.999969px for an exact 44px target.
      // Check the declared minimum and round only subpixel representation.
      expect(await shortcut.evaluate((element) => parseFloat(getComputedStyle(element).minHeight)))
        .toBeGreaterThanOrEqual(44);
      expect(Math.round(box.height * 100) / 100, `${name} has a phone-sized touch target`)
        .toBeGreaterThanOrEqual(44);
      expect(box.width).toBeGreaterThanOrEqual(44);
      expect(box.x).toBeGreaterThanOrEqual(0);
      expect(box.x + box.width).toBeLessThanOrEqual(width + 1);
    }

    if (width < 960) {
      expect(weatherBox.y).toBeGreaterThanOrEqual(mastheadBox.y + mastheadBox.height);
    } else {
      expect(Math.abs(weatherBox.y - mastheadBox.y)).toBeLessThanOrEqual(1);
      expect(weatherBox.x).toBeGreaterThanOrEqual(mastheadBox.x + mastheadBox.width);
    }
    expect(weatherBox.y + weatherBox.height).toBeLessThanOrEqual(findBox.y);
    const campaign = page.locator("[data-today-fair-feature]");
    if (await campaign.count()) {
      const campaignBox = (await campaign.boundingBox())!;
      expect(campaignBox.y).toBeGreaterThan(findBox.y + findBox.height);
      expect(campaignBox.height).toBeLessThan(210);
      await expect(campaign).toHaveAttribute("data-fair-feature-tone", "briefing");
    }

    const places = page.locator('[aria-label="Places for your area"]');
    const events = page.getByRole("group", { name: "Follow the day", exact: true });
    const placesBox = (await places.boundingBox())!;
    const eventsBox = (await events.boundingBox())!;
    expect(weatherBox.y + weatherBox.height).toBeLessThanOrEqual(placesBox.y);
    expect(weatherBox.y + weatherBox.height).toBeLessThanOrEqual(eventsBox.y);
    if (width >= 640) {
      expect(Math.abs(placesBox.y - eventsBox.y)).toBeLessThanOrEqual(1);
      expect(eventsBox.x).toBeGreaterThan(placesBox.x + placesBox.width);
    } else {
      expect(eventsBox.y).toBeGreaterThanOrEqual(placesBox.y + placesBox.height);
    }
    await expect.poll(() => page.evaluate(() =>
      document.documentElement.scrollWidth - document.documentElement.clientWidth,
    )).toBeLessThanOrEqual(1);

    await expect.poll(() => masthead.locator("img").evaluate((element) =>
      element instanceof HTMLImageElement && element.complete && element.naturalWidth > 0,
    )).toBe(true);
    await page.screenshot({ path: testInfo.outputPath(`today-${width}.png`), fullPage: true });
    await area.selectOption("town:brunswick");
    await expect(page.getByTestId("today-scope-status")).toContainText(
      "Brunswick place picks · Countywide weather and events",
    );
    await expect(page.getByRole("link", { name: "Plan a few hours", exact: true }))
      .toHaveAttribute("href", /in=brunswick/);
    await expect(page.getByRole("button", { name: "Browse all categories", exact: true }))
      .toHaveAttribute("aria-expanded", "false");
  });
}
