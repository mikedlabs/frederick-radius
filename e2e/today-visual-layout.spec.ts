import { expect, test } from "@playwright/test";

test.use({ serviceWorkers: "block" });

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
    // Measure the final masthead facts, not the weather Suspense placeholder.
    const renderedWeather = page.locator("[data-today-weather] [data-weather-state]");
    await expect(renderedWeather).toHaveCount(1);
    await expect(renderedWeather).toHaveAttribute("data-weather-state", /^(available|safety-only|unavailable)$/);
    await expect(renderedWeather).toBeVisible();
    await page.evaluate(() => document.fonts.ready);

    const masthead = page.locator("main .scroll-masthead");
    const find = page.getByRole("link", {
      name: "Find a place, service, event, or answer", exact: true,
    });
    const mastheadBox = (await masthead.boundingBox())!;
    const findBox = (await find.boundingBox())!;
    const weatherBox = (await page.locator("[data-today-weather]").boundingBox())!;
    const doorway = page.locator("[data-today-geographic-doorway]");
    await expect(doorway).toHaveAttribute("data-photo-state", "loaded");
    await expect(doorway).toHaveAttribute("href", "/places/carroll-creek-linear-park-frederick");
    const photoBox = (await doorway.locator("figure").boundingBox())!;
    const doorwayBox = (await doorway.boundingBox())!;
    const captionBox = (await doorway.locator("[data-today-geographic-caption]").boundingBox())!;
    const headingBox = (await masthead.locator("h1").boundingBox())!;
    expect(findBox.y).toBeGreaterThanOrEqual(mastheadBox.y + mastheadBox.height);
    // The arrival action now has a deliberate phone density; neither weather
    // facts nor the photograph are subtracted from an artificial height budget.
    expect(findBox.height).toBeGreaterThanOrEqual(60);
    expect(findBox.height).toBeLessThanOrEqual(64);
    await expect(page.locator('[data-find-density="arrival"]')).toHaveCount(1);
    expect(doorwayBox.y).toBeGreaterThanOrEqual(findBox.y + findBox.height);
    // The real named caption shares the photo's grid area; it must fit inside
    // the image rather than precede it or cover a separate blank rectangle.
    expect(captionBox.x).toBeGreaterThanOrEqual(photoBox.x - 1);
    expect(captionBox.x + captionBox.width).toBeLessThanOrEqual(photoBox.x + photoBox.width + 1);
    expect(captionBox.y).toBeGreaterThanOrEqual(photoBox.y - 1);
    expect(captionBox.y + captionBox.height).toBeLessThanOrEqual(photoBox.y + photoBox.height + 1);
    expect(Math.abs(captionBox.y + captionBox.height - photoBox.y - photoBox.height)).toBeLessThanOrEqual(1);
    expect(photoBox.width / photoBox.height).toBeCloseTo(4 / 3, 2);
    expect(photoBox.width).toBeGreaterThanOrEqual(doorwayBox.width * 0.95);
    expect(photoBox.height).toBeGreaterThan(130);
    await expect(doorway.locator("img")).toHaveAttribute("alt", "Carroll Creek in Frederick.");
    await expect(doorway.getByRole("heading", { name: "Carroll Creek", exact: true })).toBeVisible();
    await expect(doorway).toContainText("Frederick");
    await expect(doorway).toContainText("View place");
    await expect(doorway).not.toContainText(/best|open now|safe now|current conditions|Mike D|June 2023/i);
    await expect(doorway.locator("a, button, input, select")).toHaveCount(0);
    const quickNeeds = page.getByRole("group", { name: "Quick needs", exact: true });
    await expect(quickNeeds).toHaveCount(1);
    await expect(quickNeeds.getByRole("link")).toHaveCount(4);
    const quickNeedsBox = (await quickNeeds.boundingBox())!;
    let primaryNavBox: { x: number; y: number; width: number; height: number } | null = null;
    if (width < 640) {
      const primaryNav = page.locator("[data-bottom-nav-shell]").getByRole("navigation", {
        name: "Primary", exact: true,
      });
      await expect(primaryNav).toBeVisible();
      primaryNavBox = (await primaryNav.boundingBox())!;
      expect(findBox.y).toBeGreaterThanOrEqual(0);
      expect(findBox.y + findBox.height).toBeLessThanOrEqual(primaryNavBox.y);
      if (width === 375) {
        const activeAlert = page.getByRole("region", { name: "Heads up", exact: true });
        const specialDayLead = page.locator('[data-moment-spotlight-day-of="true"]');
        // The existing In The Streets day-of lead is a deliberate exception.
        // It remains above the ordinary briefing instead of being compressed.
        if (await specialDayLead.count() === 0) {
          const visiblePhotoHeight = Math.max(0, Math.min(photoBox.y + photoBox.height, primaryNavBox.y) - Math.max(photoBox.y, 0));
          if (await activeAlert.count() === 0) {
            expect(visiblePhotoHeight, "substantial local photography is visible on ordinary arrival").toBeGreaterThanOrEqual(130);
            // Large, accurate photography is intentional. The quick actions
            // follow it within one viewport of scrolling instead of forcing
            // every element into tiny cards above the fixed navigation.
            expect(quickNeedsBox.y + quickNeedsBox.height).toBeLessThanOrEqual(primaryNavBox.y + 844);
          }
          const scrollForActions = Math.max(0, quickNeedsBox.y + quickNeedsBox.height - primaryNavBox.y + 16);
          expect(scrollForActions).toBeLessThanOrEqual(844);
          await page.mouse.wheel(0, scrollForActions);
          await expect.poll(async () => {
            const actions = (await quickNeeds.boundingBox())!;
            const tabs = (await primaryNav.boundingBox())!;
            return actions.y + actions.height <= tabs.y;
          }).toBe(true);
          const visibleQuickNeeds = (await quickNeeds.boundingBox())!;
          const visibleNav = (await primaryNav.boundingBox())!;
          expect(visibleQuickNeeds.y + visibleQuickNeeds.height, "all four actions clear the fixed tabs after a normal scroll").toBeLessThanOrEqual(visibleNav.y);
          await page.evaluate(() => window.scrollTo(0, 0));
        }
      }
    }
    expect(await masthead.evaluate((element) => ({
      border: getComputedStyle(element).borderTopWidth,
      shadow: getComputedStyle(element).boxShadow,
    }))).toEqual({ border: "0px", shadow: "none" });
    await expect(masthead.locator("img")).toHaveCount(0);
    expect(headingBox.y + headingBox.height).toBeLessThanOrEqual(photoBox.y);

    for (const name of ["Open now", "Public essentials", "Plan a few hours", "Local services"]) {
      const shortcut = page.getByRole("link", { name, exact: true });
      await expect(shortcut, `${name} occurs once across Today`).toHaveCount(1);
      await expect(quickNeeds.getByRole("link", { name, exact: true })).toHaveCount(1);
      const expectedHref = ({
        "Open now": "/open-now",
        "Public essentials": "/amenities",
        "Plan a few hours": "/ask?q=Plan%20the%20next%20two%20hours&in=county",
        "Local services": "/contacts",
      } as Record<string, string>)[name];
      await expect(shortcut).toHaveAttribute("href", expectedHref);
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

    expect(weatherBox.y).toBeGreaterThanOrEqual(headingBox.y + headingBox.height);
    if (width < 640) expect(headingBox.width).toBeGreaterThanOrEqual(mastheadBox.width - 1);
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
    // None-open is also a real answer; it deliberately has no pick-card marker.
    const decision = places.locator(":scope > section");
    await expect(decision).toHaveCount(1);
    const decisionBox = (await decision.boundingBox())!;
    expect(weatherBox.y + weatherBox.height).toBeLessThanOrEqual(placesBox.y);
    expect(weatherBox.y + weatherBox.height).toBeLessThanOrEqual(eventsBox.y);
    if (width >= 640) {
      expect(Math.abs(doorwayBox.y - decisionBox.y)).toBeLessThanOrEqual(1);
      expect(decisionBox.x).toBeGreaterThanOrEqual(doorwayBox.x + doorwayBox.width);
      const firstRowBottom = Math.max(doorwayBox.y + doorwayBox.height, decisionBox.y + decisionBox.height);
      expect(quickNeedsBox.y).toBeGreaterThanOrEqual(firstRowBottom);
      expect(quickNeedsBox.y - firstRowBottom).toBeLessThanOrEqual(17);
      expect(quickNeedsBox.width).toBeGreaterThanOrEqual(placesBox.width - 1);
    } else {
      expect(quickNeedsBox.y).toBeGreaterThanOrEqual(doorwayBox.y + doorwayBox.height);
      expect(quickNeedsBox.y - doorwayBox.y - doorwayBox.height).toBeLessThanOrEqual(17);
      expect(decisionBox.y).toBeGreaterThanOrEqual(quickNeedsBox.y + quickNeedsBox.height);
      expect(decisionBox.y - quickNeedsBox.y - quickNeedsBox.height).toBeLessThanOrEqual(17);
    }
    expect(eventsBox.y).toBeGreaterThanOrEqual(placesBox.y + placesBox.height);
    await expect.poll(() => page.evaluate(() =>
      document.documentElement.scrollWidth - document.documentElement.clientWidth,
    )).toBeLessThanOrEqual(1);

    await expect.poll(() => doorway.locator("img").evaluate((element) =>
      element instanceof HTMLImageElement && element.complete && element.naturalWidth > 1 && element.naturalHeight > 1,
    )).toBe(true);
    await testInfo.attach("today-arrival-geometry", {
      contentType: "application/json",
      body: JSON.stringify({ width, mastheadBox, weatherBox, findBox, captionBox, photoBox, doorwayBox, quickNeedsBox, decisionBox, primaryNavBox,
        note: "The full-width heading and compact weather precede Find. Large 4:3 local photography is visible on ordinary arrival, with four actions reachable by scrolling. Desktop pairs the real decision with the photo." }),
    });
    await page.screenshot({ path: testInfo.outputPath(`today-${width}.png`), fullPage: true });
    await page.screenshot({ path: testInfo.outputPath(`today-${width}-viewport.png`), fullPage: false });
    await area.selectOption("town:brunswick");
    await expect(page.getByTestId("today-scope-status")).toContainText(
      "Brunswick place picks · Countywide weather and events",
    );
    await expect(page.getByRole("link", { name: "Plan a few hours", exact: true }))
      .toHaveAttribute("href", /in=brunswick/);
    await expect(page.locator("[data-today-geographic-doorway]")).toHaveCount(0);
    await expect(places.locator(":scope > section")).toHaveCount(1);
    const categoryDisclosure = page.getByRole("button", { name: "Browse all categories", exact: true });
    await expect(categoryDisclosure).toHaveCount(1);
    await expect(categoryDisclosure).toHaveAttribute("aria-expanded", "false");
    await expect(categoryDisclosure).toHaveAttribute("aria-controls", "browse-places-panel");
    await categoryDisclosure.scrollIntoViewIfNeeded();
    await categoryDisclosure.click();
    await expect(categoryDisclosure).toHaveAttribute("aria-expanded", "true");
    const categoryPanel = page.locator("#browse-places-panel");
    await expect(categoryPanel).toBeVisible();
    await expect(categoryPanel).toHaveAttribute("data-state", "open");
    await categoryDisclosure.click();
    await expect(categoryDisclosure).toHaveAttribute("aria-expanded", "false");
    await expect(categoryPanel).toHaveAttribute("data-state", "closed");
    await expect(categoryPanel).toHaveAttribute("aria-hidden", "true");
    await expect(categoryPanel).toHaveAttribute("inert", "");
    await expect(page.getByRole("group", { name: "Quick needs", exact: true })).toHaveCount(1);
  });
}

for (const town of ["brunswick", "thurmont"]) {
  test(`Today keeps the first ${town} paint free of a Frederick photo doorway`, async ({ page }, testInfo) => {
    test.setTimeout(120_000);
    await page.setViewportSize({ width: 375, height: 844 });
    await page.emulateMedia({ reducedMotion: "reduce" });
    const creekRequests: string[] = [];
    page.on("request", (request) => {
      const url = new URL(request.url());
      const source = url.pathname === "/_next/image" ? url.searchParams.get("url") : url.pathname;
      if (source && decodeURIComponent(source).includes("SUMMER CARROL CREEK.jpg")) creekRequests.push(request.url());
    });
    // Freeze the server paint before Next can hydrate useSearchParams. This
    // deliberately inspects the real initial fallback, not a made-up town UI.
    const holdScripts = (route: import("@playwright/test").Route) =>
      route.request().resourceType() === "script" ? route.abort() : route.continue();
    await page.route("**/*", holdScripts);
    await page.goto(`/today?in=${town}`, { waitUntil: "domcontentloaded" });
    const pending = page.locator("[data-today-geographic-pending]");
    await expect(pending).toBeAttached();
    await expect(pending).toHaveAttribute("aria-hidden", "true");
    await expect(pending.locator("a, img, h2, button")).toHaveCount(0);
    await expect(page.locator("[data-today-geographic-doorway]")).toHaveCount(0);
    expect(creekRequests).toEqual([]);
    await page.screenshot({ path: testInfo.outputPath(`today-${town}-initial-viewport.png`), fullPage: false });

    await page.unroute("**/*", holdScripts);
    await page.reload({ waitUntil: "domcontentloaded" });
    const area = page.getByRole("combobox", { name: "Choose your area" });
    await expect(area).toBeEnabled();
    await expect(area).toHaveValue(`town:${town}`);
    await expect(page.locator("[data-today-geographic-pending]")).toHaveCount(0);
    await expect(page.locator("[data-today-geographic-doorway]")).toHaveCount(0);
    await expect(page.getByTestId("today-scope-status")).toContainText(`${town === "brunswick" ? "Brunswick" : "Thurmont"} place picks`);
    await expect(page.locator('[aria-label="Places for your area"] > section')).toHaveCount(1);
    expect(creekRequests).toEqual([]);
    await page.screenshot({ path: testInfo.outputPath(`today-${town}-hydrated-viewport.png`), fullPage: false });
    await testInfo.attach("town-arrival-photo-requests", {
      contentType: "application/json", body: JSON.stringify({ town, creekRequests, serverPaint: "Scripts held; scope-neutral fallback observed." }),
    });
  });
}
