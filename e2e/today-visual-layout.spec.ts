import { expect, test } from "@playwright/test";

/** The events chapter's name on the one daypart clock (src/lib/daypart.ts,
 *  dayProgramLabel in TomorrowPreview.tsx), for an Eastern hour. */
function dayProgramLabelAt(instant: Date): string {
  const hour = Number(
    new Intl.DateTimeFormat("en-US", {
      timeZone: "America/New_York",
      hour: "numeric",
      hourCycle: "h23",
    }).format(instant),
  );
  if (hour >= 5 && hour < 16) return "Today's events";
  if (hour >= 16 && hour < 21) return "Tonight";
  return hour < 5 ? "Overnight and today" : "Tonight and tomorrow";
}

/** Today revalidates every 300 seconds, so a cached render may predate a
 *  daypart boundary by a few minutes. Accept the label for either instant. */
function expectedDayProgramLabels(): string[] {
  const now = new Date();
  return [...new Set([dayProgramLabelAt(now), dayProgramLabelAt(new Date(now.getTime() - 6 * 60_000))])];
}

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

    // Weather is one link row to the full forecast under a 1px rule, not a
    // sunken card.
    const weather = page.locator("[data-today-weather]");
    await expect(weather.getByRole("link")).toHaveCount(1);
    await expect(weather.getByRole("link")).toHaveAttribute("href", "/pulse?open=weather");
    expect(await weather.evaluate((element) => ({
      rule: getComputedStyle(element).borderTopWidth,
      background: getComputedStyle(element).backgroundColor,
    }))).toEqual({ rule: "1px", background: "rgba(0, 0, 0, 0)" });
    expect(Math.round((await weather.getByRole("link").boundingBox())!.height))
      .toBeGreaterThanOrEqual(56);

    const places = page.locator('[aria-label="Places for your area"]');
    // The events chapter is named by the daypart: "Today's events", then
    // "Tonight" from the evening daypart.
    const labels = expectedDayProgramLabels();
    const labelName = new RegExp(`^(?:${labels.join("|")})$`);
    const events = page.getByRole("group", { name: labelName });
    await expect(events).toHaveCount(1);
    // The column is named by a real h2 in the same register as the place
    // heading beside it, so heading navigation reaches the events and the two
    // columns read by type. The chapter's caps register is not shown.
    const eventsHeading = events.getByRole("heading", { level: 2, name: labelName });
    await expect(eventsHeading).toHaveCount(1);
    await expect(eventsHeading).toBeVisible();
    await expect(events.locator(".content-chapter__register")).toBeHidden();
    const placesHeading = page
      .locator('[aria-label="Places for your area"]')
      .getByRole("heading", { level: 2 })
      .first();
    await expect(placesHeading).toBeVisible({ timeout: 15_000 });
    const headingType = (locator: typeof eventsHeading) => locator.evaluate((element) => ({
      size: parseFloat(getComputedStyle(element).fontSize),
      caps: getComputedStyle(element).textTransform === "uppercase",
    }));
    const eventsType = await headingType(eventsHeading);
    expect(eventsType.caps).toBe(false);
    expect(eventsType.size).toBeGreaterThanOrEqual(18);
    // The place shelf's empty state uses Today's own heading, which steps up
    // a pixel from 640px, so allow that one pixel.
    expect(Math.abs(eventsType.size - (await headingType(placesHeading)).size))
      .toBeLessThanOrEqual(1);
    if (width >= 640) {
      // Side by side, the two column headings share a top line. The place
      // heading's See all link may center its title a few pixels lower.
      const eventsHeadingBox = (await eventsHeading.boundingBox())!;
      const placesHeadingBox = (await placesHeading.boundingBox())!;
      expect(Math.abs(eventsHeadingBox.y - placesHeadingBox.y)).toBeLessThanOrEqual(4);
    }
    const placesBox = (await places.boundingBox())!;
    const eventsBox = (await events.boundingBox())!;
    expect(weatherBox.y).toBeGreaterThanOrEqual(placesBox.y + placesBox.height);
    expect(weatherBox.y).toBeGreaterThanOrEqual(eventsBox.y + eventsBox.height);
    // Paper, not boxes: neither column is a card at any width.
    for (const column of [places, events]) {
      expect(await column.evaluate((element) => ({
        border: getComputedStyle(element).borderTopWidth,
        shadow: getComputedStyle(element).boxShadow,
      }))).toEqual({ border: "0px", shadow: "none" });
    }
    if (width >= 640) {
      expect(Math.abs(placesBox.y - eventsBox.y)).toBeLessThanOrEqual(1);
      expect(eventsBox.x).toBeGreaterThan(placesBox.x + placesBox.width);
    } else {
      expect(eventsBox.y).toBeGreaterThanOrEqual(placesBox.y + placesBox.height);
    }
    if (width >= 1024) {
      // Places on the left at 5 parts, events on the right at 7, 32px apart.
      expect(eventsBox.width / placesBox.width).toBeGreaterThan(1.3);
      expect(eventsBox.width / placesBox.width).toBeLessThan(1.5);
      expect(Math.round(eventsBox.x - (placesBox.x + placesBox.width))).toBe(32);
    }

    // The pin map draws only when two or more rows have a precise venue, and
    // only the instance for this breakpoint is displayed.
    const visibleMaps = events.locator("[data-today-tonight-map]:visible");
    const mapCount = await visibleMaps.count();
    expect(mapCount).toBeLessThanOrEqual(1);
    if (mapCount === 1) {
      const map = visibleMaps.first();
      await expect(map).toHaveAttribute(
        "data-today-tonight-map",
        width >= 1024 ? "wide" : "compact",
      );
      const mapBox = (await map.boundingBox())!;
      // 176px on phones and 300px from 1024px, plus the 1px frame.
      expect(Math.round(mapBox.height)).toBe(width >= 1024 ? 302 : 178);
      const pins = await map.locator("[data-mini-map-pin]").evaluateAll((nodes) =>
        nodes.map((node) => node.getAttribute("data-mini-map-pin")).sort());
      const discs = await events.locator("[data-today-pin-disc]:visible").evaluateAll((nodes) =>
        nodes.map((node) => node.textContent?.trim()).sort());
      expect(pins.length).toBeGreaterThanOrEqual(2);
      expect(discs).toEqual(pins);
    } else {
      // No map means no numbered discs either.
      await expect(events.locator("[data-today-pin-disc]:visible")).toHaveCount(0);
      testInfo.annotations.push({
        type: "today-tonight-map",
        description: "Fewer than two listed rows had a precise venue at run time, so no map was drawn.",
      });
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
