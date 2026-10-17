import { expect, test } from "@playwright/test";

test.use({ serviceWorkers: "block" });

function creekPhotoListener(page: import("@playwright/test").Page) {
  const creekRequests: string[] = [];
  page.on("request", (request) => {
    const url = new URL(request.url());
    const source = url.pathname === "/_next/image" ? url.searchParams.get("url") : url.pathname;
    if (source && decodeURIComponent(source).includes("SUMMER CARROL CREEK.jpg")) {
      creekRequests.push(request.url());
    }
  });
  return creekRequests;
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
    const creekRequests = creekPhotoListener(page);
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
    const headingBox = (await masthead.locator("h1").boundingBox())!;
    expect(findBox.y).toBeGreaterThanOrEqual(mastheadBox.y + mastheadBox.height);
    expect(findBox.height).toBeGreaterThanOrEqual(56);
    expect(findBox.height).toBeLessThanOrEqual(56);
    await expect(page.locator('[data-find-density="arrival"]')).toHaveCount(1);
    await expect(page.locator("[data-today-geographic-doorway]")).toHaveCount(0);
    await expect(page.locator("[data-today-geographic-pending]")).toHaveCount(0);
    expect(creekRequests).toEqual([]);
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
        if (await specialDayLead.count() === 0) {
          const dateline = masthead.locator("[data-today-dateline]");
          await expect(dateline).toBeVisible();
          const datelineBox = (await dateline.boundingBox())!;
          if (await activeAlert.count() === 0) {
            expect(datelineBox.y + datelineBox.height).toBeLessThanOrEqual(primaryNavBox.y);
            expect(weatherBox.y + weatherBox.height).toBeLessThanOrEqual(primaryNavBox.y);
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
      expect(await shortcut.evaluate((element) => parseFloat(getComputedStyle(element).minHeight)))
        .toBeGreaterThanOrEqual(44);
      expect(Math.round(box.height * 100) / 100, `${name} has a phone-sized touch target`)
        .toBeGreaterThanOrEqual(44);
      expect(box.width).toBeGreaterThanOrEqual(44);
      expect(box.x).toBeGreaterThanOrEqual(0);
      expect(box.x + box.width).toBeLessThanOrEqual(width + 1);
    }

    expect(weatherBox.y).toBeGreaterThanOrEqual(headingBox.y + headingBox.height);
    const dateline = masthead.locator("[data-today-dateline]");
    await expect(dateline).toBeVisible();
    const datelineBox = (await dateline.boundingBox())!;
    expect(headingBox.x).toBeGreaterThanOrEqual(mastheadBox.x);
    expect(headingBox.x + headingBox.width).toBeLessThanOrEqual(mastheadBox.x + mastheadBox.width + 1);
    expect(datelineBox.x).toBeGreaterThanOrEqual(mastheadBox.x);
    expect(datelineBox.x + datelineBox.width).toBeLessThanOrEqual(mastheadBox.x + mastheadBox.width + 1);
    expect(datelineBox.y + datelineBox.height).toBeLessThanOrEqual(weatherBox.y);
    expect(datelineBox.x >= headingBox.x + headingBox.width - 1 || datelineBox.y >= headingBox.y + headingBox.height - 1).toBe(true);
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
    const decision = places.locator(":scope > section");
    await expect(decision).toHaveCount(1);
    await expect.poll(() => places.evaluate((element) => {
      const decisionBox = element.querySelector(":scope > section")?.getBoundingClientRect();
      const quick = element.querySelector('[role="group"][aria-label="Quick needs"]')?.getBoundingClientRect();
      if (!decisionBox || !quick) return false;
      const gap = quick.y - decisionBox.bottom;
      return gap >= 0 && gap <= 17;
    })).toBe(true);
    const currentLayout = await places.evaluate((element) => {
      const read = (selector: string) => {
        const r = element.querySelector(selector)!.getBoundingClientRect();
        return { x: r.x, y: r.y, width: r.width, height: r.height };
      };
      return { decision: read(":scope > section"), quick: read('[role="group"][aria-label="Quick needs"]') };
    });
    const decisionBox = currentLayout.decision;
    const currentQuickNeedsBox = currentLayout.quick;
    expect(weatherBox.y + weatherBox.height).toBeLessThanOrEqual(placesBox.y);
    expect(weatherBox.y + weatherBox.height).toBeLessThanOrEqual(eventsBox.y);
    expect(decisionBox.y).toBeGreaterThanOrEqual(findBox.y + findBox.height);
    expect(currentQuickNeedsBox.y).toBeGreaterThanOrEqual(decisionBox.y + decisionBox.height);
    expect(currentQuickNeedsBox.y - decisionBox.y - decisionBox.height).toBeLessThanOrEqual(17);
    expect(currentQuickNeedsBox.width).toBeGreaterThanOrEqual(placesBox.width - 1);
    const placeCards = places.locator("[data-today-place-card]");
    if (await placeCards.count()) {
      expect(await placeCards.count()).toBeLessThanOrEqual(3);
      await expect(placeCards.getByRole("button")).toHaveCount(0);
      for (const card of await placeCards.all()) {
        await expect(card.locator('a[href^="/places/"]')).toHaveCount(1);
      }
    }
    if (width < 640 && primaryNavBox) {
      const activeAlert = page.getByRole("region", { name: "Heads up", exact: true });
      const specialDay = page.locator('[data-moment-spotlight-day-of="true"]');
      if (width >= 375 && await activeAlert.count() === 0 && await specialDay.count() === 0) {
        expect(weatherBox.y + weatherBox.height, "conditions stay on the first screen").toBeLessThanOrEqual(primaryNavBox.y);
        expect(decisionBox.y, "today's best three begin before navigation").toBeLessThan(primaryNavBox.y);
      }
    }
    expect(eventsBox.y).toBeGreaterThanOrEqual(placesBox.y + placesBox.height);
    await expect.poll(() => page.evaluate(() =>
      document.documentElement.scrollWidth - document.documentElement.clientWidth,
    )).toBeLessThanOrEqual(1);

    await testInfo.attach("today-arrival-geometry", {
      contentType: "application/json",
      body: JSON.stringify({
        width, mastheadBox, weatherBox, findBox, datelineBox, quickNeedsBox, decisionBox, primaryNavBox, creekRequests,
        note: "Date and conditions precede today's best three. The seasonal archive photograph is not on Today.",
      }),
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
    const creekRequests = creekPhotoListener(page);
    const holdScripts = (route: import("@playwright/test").Route) =>
      route.request().resourceType() === "script" ? route.abort() : route.continue();
    await page.route("**/*", holdScripts);
    await page.goto(`/today?in=${town}`, { waitUntil: "domcontentloaded" });
    await expect(page.locator("[data-today-geographic-pending]")).toHaveCount(0);
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
      contentType: "application/json", body: JSON.stringify({ town, creekRequests, serverPaint: "No seasonal Frederick doorway on Today." }),
    });
  });
}
