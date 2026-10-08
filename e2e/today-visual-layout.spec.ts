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
    expect(findBox.y).toBeGreaterThanOrEqual(mastheadBox.y + mastheadBox.height);
    // Exclude variable active alerts above the masthead. The normal arrival
    // and its primary action fit comfortably before the phone's bottom nav.
    expect(findBox.y + findBox.height - mastheadBox.y).toBeLessThan(380);
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

    const shortcutRows = new Set<number>();
    for (const name of ["Open now", "Public essentials", "Plan a few hours", "Local services"]) {
      const shortcut = page.getByRole("link", { name, exact: true });
      const box = (await shortcut.boundingBox())!;
      shortcutRows.add(Math.round(box.y));
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
    // One row of four from 360px up; the 2x2 grid below that.
    expect(shortcutRows.size).toBe(width >= 360 ? 1 : 2);

    // The place shelf answers with pictures on the first screen. Normalize a
    // leading safety alert the way the quality floor does: it may push the
    // page down, and it leads on purpose.
    if (width === 390) {
      const placeAnswers = page.locator('[aria-label="Places for your area"]');
      const tileFrame = placeAnswers.locator("[data-today-tile-frame]").first();
      const emptyAnswer = placeAnswers.getByRole("status");
      await expect(tileFrame.or(emptyAnswer).first()).toBeVisible({ timeout: 15_000 });
      if (await tileFrame.count()) {
        const frameBox = (await tileFrame.boundingBox())!;
        const leadingNoticeSpace = Math.max(0, mastheadBox.y - 80);
        expect(frameBox.y).toBeGreaterThanOrEqual(findBox.y + findBox.height);
        expect(frameBox.y + frameBox.height - leadingNoticeSpace).toBeLessThanOrEqual(760);
      } else {
        testInfo.annotations.push({
          type: "today-shelf",
          description: "No place was open or likely open at run time, so the tile check was skipped.",
        });
      }
    }

    const weatherBox = (await page.locator("[data-today-weather]").boundingBox())!;
    expect(weatherBox.y).toBeGreaterThan(findBox.y + findBox.height);
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
    expect(weatherBox.y).toBeGreaterThanOrEqual(placesBox.y + placesBox.height);
    expect(weatherBox.y).toBeGreaterThanOrEqual(eventsBox.y + eventsBox.height);
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
    await expect(page.getByRole("button", { name: "Browse all kinds of places", exact: true }))
      .toHaveAttribute("aria-expanded", "false");
  });
}
