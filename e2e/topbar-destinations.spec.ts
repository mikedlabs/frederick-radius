import { chooseTodayArea, todayArea } from "./today-controls";
import { expect, test } from "@playwright/test";

for (const viewport of [
  { label: "narrow phone", width: 320, height: 720 },
  { label: "standard phone", width: 390, height: 844 },
  { label: "wide phone", width: 430, height: 932 },
  { label: "phone at the row breakpoint", width: 639, height: 844 },
  { label: "tablet at the row breakpoint", width: 640, height: 900 },
  { label: "tablet", width: 820, height: 1180 },
  { label: "desktop", width: 1280, height: 900 },
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
        body: JSON.stringify({ active: false, count: 0, tone: "quiet", level: "Clear", ok: true, lastUpdated: new Date().toISOString(), validUntil: new Date(Date.now() + 360_000).toISOString() }),
      });
    });
    await page.goto("/compass?in=brunswick", {
      waitUntil: "domcontentloaded",
      timeout: 90_000,
    });

    const header = page.locator("header").first();
    const pulse = header.locator("[data-pulse-indicator]");
    const compass = header.getByRole("link", { name: "Open tools" });
    await expect(pulse).toHaveAttribute("aria-label", "County status: Clear in checked feeds; no active alerts");
    await expect(pulse).toHaveAttribute("data-pulse-state", "ready");

    const disclosure = header.locator('details[data-today-header-disclosure="tools"]');
    const more = disclosure.locator("summary");
    await expect(more).toHaveAccessibleName("More tools");
    await expect(disclosure).not.toHaveAttribute("open");
    await expect(compass).toBeHidden();
    await more.focus();
    await page.keyboard.press("Enter");
    await expect(disclosure).toHaveAttribute("open");
    await expect(compass).toBeVisible();
    await expect(compass).toHaveAttribute("aria-current", "page");
    await expect(compass).toHaveAttribute("href", "/compass");
    const appearance = disclosure.getByRole("button", { name: /Switch to (dark|light) appearance/ });
    await expect(compass.getByText("Tools", { exact: true })).toBeVisible();
    await expect(appearance.getByText(/Switch to (dark|light) appearance/)).toBeVisible();
    for (const choice of [compass, appearance]) {
      await expect(choice).toBeVisible();
      const box = await choice.boundingBox();
      expect(box?.width).toBeGreaterThanOrEqual(44);
      expect(box?.height).toBeGreaterThanOrEqual(44);
    }
    await compass.focus();
    await page.keyboard.press("Escape");
    await expect(disclosure).not.toHaveAttribute("open");
    await expect(more).toBeFocused();
    await more.click();
    await expect(compass).toBeVisible();
    const menuBox = await disclosure.locator("summary + div").boundingBox();
    expect(menuBox).not.toBeNull();
    await page.mouse.click(2, menuBox!.y + menuBox!.height + 8);
    await expect(disclosure).not.toHaveAttribute("open");
    await expect(compass).toBeHidden();

    const dimensions = await header.evaluate((element) => ({
      clientWidth: element.clientWidth,
      scrollWidth: element.scrollWidth,
    }));
    expect(dimensions.scrollWidth).toBeLessThanOrEqual(dimensions.clientWidth);

    await expect(pulse).toBeVisible();
    await expect(pulse.getByText("County status", { exact: true }).filter({ visible: true })).toBeVisible();
    await expect(pulse.getByText("Clear in checked feeds", { exact: true }).filter({ visible: true })).toHaveCount(1);
    const identity = header.locator("[data-header-identity] :is(a[href], button)");
    const context = header.locator("[data-header-context]");
    const location = context.locator("[data-location-chip]");
    const town = location.getByText("Brunswick", { exact: true }).filter({ visible: true });
    await expect(town).toHaveCount(1);
    await expect(location).toHaveAccessibleName(/Current scope: Brunswick/);
    const controls = [identity, more, location, pulse];
    const boxes = await Promise.all(controls.map(control => control.boundingBox()));
    for (const bounds of boxes) {
      expect(bounds?.width).toBeGreaterThanOrEqual(44);
      expect(bounds?.height).toBeGreaterThanOrEqual(44);
    }
    const [brandBox, menuBoxClosed, locationBox, pulseBox] = boxes;
    const centerY = (box: { y: number; height: number }) => box.y + box.height / 2;
    expect(Math.abs(centerY(brandBox!) - centerY(menuBoxClosed!))).toBeLessThanOrEqual(5);
    expect(locationBox!.x + locationBox!.width).toBeLessThanOrEqual(pulseBox!.x + 1);
    const phone = viewport.width < 640;
    if (phone) {
      await expect(more.getByText("More", { exact: true })).toBeVisible();
      const endOfFirstRow = Math.max(brandBox!.y + brandBox!.height, menuBoxClosed!.y + menuBoxClosed!.height);
      expect(Math.min(locationBox!.y, pulseBox!.y)).toBeGreaterThanOrEqual(endOfFirstRow - 1);
    } else {
      expect(Math.abs(centerY(brandBox!) - centerY(pulseBox!))).toBeLessThanOrEqual(5);
    }
    expect((await header.boundingBox())!.height).toBeLessThan(phone ? 114 : 80);
    if (viewport.width === 390) {
      await location.click();
      await expect(page.getByRole("group", { name: "Set what you're browsing" })).toBeVisible();
      await page.getByRole("button", { name: "Done choosing an area" }).click();
      await expect(location).toBeFocused();
    }
  });
}

for (const status of [
  { label: "active alerts", payload: { active: true, count: 2, tone: "alert", level: "Urgent", ok: true }, name: "County status: Urgent; 2 alerts reported" },
  { label: "unavailable checks", payload: { active: false, count: 0, tone: "quiet", level: "Unknown", ok: false }, name: "County status: Unable to verify; current alerts are unverified" },
  { label: "unverified reports", payload: { active: false, count: 0, tone: "quiet", level: "Clear", ok: true, lastUpdated: "not-a-report-time" }, name: "County status: Unable to verify; current alerts are unverified" },
]) {
  test(`TopBar keeps ${status.label} visible on a phone`, async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.route("**/api/pulse/status", async (route) => {
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ lastUpdated: new Date().toISOString(), validUntil: new Date(Date.now() + 360_000).toISOString(), ...status.payload }) });
    });
    await page.goto("/today", { waitUntil: "domcontentloaded" });
    const header = page.locator("header").first();
    const statusLink = header.getByRole("link", { name: status.name, exact: true });
    await expect(statusLink).toBeVisible();
    await expect(statusLink).toHaveAttribute("href", "/pulse");
    if (status.label !== "active alerts") await expect(statusLink.locator("[data-pulse-mobile-state]")).toHaveText("Unverified");
    const bounds = await statusLink.boundingBox();
    expect(bounds?.height).toBeGreaterThanOrEqual(44);
    expect(bounds?.width).toBeGreaterThanOrEqual(44);
    expect(await header.evaluate((element) => element.scrollWidth - element.clientWidth)).toBeLessThanOrEqual(0);
  });
}

test("TopBar keeps Checking visible until a valid quiet report arrives", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  let release!: () => void;
  let requested = false;
  const held = new Promise<void>((resolve) => { release = resolve; });
  await page.route("**/api/pulse/status", async (route) => {
    requested = true;
    await held;
    await route.fulfill({ json: { active: false, count: 0, tone: "quiet", level: "Clear", ok: true, lastUpdated: new Date().toISOString(), validUntil: new Date(Date.now() + 360_000).toISOString() } });
  });
  try {
    await page.goto("/today", { waitUntil: "domcontentloaded" });
    await expect.poll(() => requested).toBe(true);
    const header = page.locator("header").first();
    const status = header.locator("[data-pulse-indicator]");
    await expect(status).toHaveAttribute("aria-label", "County status: checking");
    await expect(status).toBeVisible();
    await expect(status.locator("[data-pulse-mobile-state]")).toHaveText("Checking");
    await expect(status).toHaveAttribute("href", "/pulse");
    const bounds = await status.boundingBox();
    expect(bounds?.height).toBeGreaterThanOrEqual(44);
    expect(bounds?.width).toBeGreaterThanOrEqual(44);
    expect(await header.evaluate((element) => element.scrollWidth - element.clientWidth)).toBeLessThanOrEqual(0);
    await status.focus();
    await expect(status).toBeFocused();
    const more = header.getByLabel("More tools", { exact: true });
    const priorMore = await more.boundingBox();
    const priorHeader = await header.boundingBox();
    release();
    await expect(status).toHaveAttribute("aria-label", "County status: Clear in checked feeds; no active alerts");
    await expect(status).toHaveAttribute("data-pulse-state", "ready");
    await expect(status).toBeVisible();
    await expect(status).toBeFocused();
    await expect(status.getByText("County status", { exact: true }).filter({ visible: true })).toBeVisible();
    await expect(status.getByText("Clear in checked feeds", { exact: true }).filter({ visible: true })).toBeVisible();
    const nextMore = await more.boundingBox();
    expect(Math.abs(nextMore!.y - priorMore!.y)).toBeLessThanOrEqual(1);
    expect(Math.abs(nextMore!.x - priorMore!.x)).toBeLessThanOrEqual(1);
    expect(Math.abs((await header.boundingBox())!.height - priorHeader!.height)).toBeLessThanOrEqual(1);
  } finally { release(); }
});

for (const width of [375, 1366]) {
  test(`Find resumes only its words and rechecks the selected area at ${width}px`, async ({ page }) => {
    test.setTimeout(120_000);
    await page.setViewportSize({ width, height: 900 });
    const requests: Array<{ query: string; scope: string }> = [];
    await page.route("**/api/search?**", async (route) => {
      const url = new URL(route.request().url());
      const cookies = (await route.request().allHeaders()).cookie ?? "";
      const scope = decodeURIComponent(cookies.match(/(?:^|;\s*)fr_scope=([^;]*)/)?.[1] ?? "");
      requests.push({ query: url.searchParams.get("q") ?? "", scope });
      const area = scope === "town:brunswick" ? "Brunswick" : "Whole county";
      // Controlled answers let the browser prove it made a new read rather
      // than reusing an old result. The detail destination is a real place.
      await route.fulfill({
        contentType: "application/json",
        body: JSON.stringify({
          results: [{
            type: "place", id: "place:beans-in-the-belfry-brunswick",
            title: `Fresh search fixture ${requests.length}`, subtitle: area,
            href: "/places/beans-in-the-belfry-brunswick",
          }],
          meta: {
            qualifiers: { constrained: true, categoryLabel: url.searchParams.get("q") === "pizza" ? "Pizza" : "Coffee" },
            contextLabel: area,
          },
        }),
      });
    });
    await page.goto("/today", { waitUntil: "domcontentloaded" });
    const area = todayArea(page);
    await expect(area).toBeEnabled();
    await chooseTodayArea(page, "county");
    const opener = page.getByRole("link", { name: "Find a place, service, event, or answer", exact: true });
    const dialog = page.getByRole("dialog", { name: "What do you need?", exact: true });
    const field = dialog.getByRole("searchbox", { name: "Ask or find across the whole county", exact: true });
    await opener.click();
    await field.fill("coffee");
    await expect(dialog.getByText("Fresh search fixture 1", { exact: true })).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(dialog).toHaveCount(0);
    await expect(opener).toBeFocused();
    await opener.click();
    await expect(field).toHaveValue("coffee");
    await expect(dialog.getByText("Fresh search fixture 2", { exact: true })).toBeVisible();
    await expect(dialog.getByText("Fresh search fixture 1", { exact: true })).toHaveCount(0);
    await expect(page.getByRole("dialog")).toHaveCount(1);
    await page.goBack();
    await expect(dialog).toHaveCount(0);
    await expect(opener).toBeFocused();

    await chooseTodayArea(page, "town:brunswick");
    await opener.click();
    // The field names the area it now searches.
    const townField = dialog.getByRole("searchbox", { name: "Ask or find in Brunswick", exact: true });
    await expect(townField).toHaveValue("coffee");
    await expect(dialog.getByText("Fresh search fixture 3", { exact: true })).toBeVisible();
    await expect(dialog.getByText("Coffee · Brunswick", { exact: true })).toBeVisible();
    expect(requests).toEqual([
      { query: "coffee", scope: "county" },
      { query: "coffee", scope: "county" },
      { query: "coffee", scope: "town:brunswick" },
    ]);

    await dialog.getByRole("listitem")
      .filter({ hasText: "Fresh search fixture 3" })
      .getByRole("link", { name: "Fresh search fixture 3", exact: true }).click();
    await expect(page).toHaveURL(/\/places\/beans-in-the-belfry-brunswick/);
    await expect(page.getByRole("heading", { name: "Beans in the Belfry", exact: true })).toBeVisible();
    const detailOpener = page.getByRole("button", { name: "Ask or find across Frederick County", exact: true });
    await expect(detailOpener).toBeEnabled();
    await detailOpener.click();
    await expect(townField).toHaveValue("coffee");
    await expect(dialog.getByText("Fresh search fixture 4", { exact: true })).toBeVisible();
    const nextQuery = width === 375 ? "pizza" : "";
    if (nextQuery) {
      await townField.fill(nextQuery);
      await expect(dialog.getByText("Fresh search fixture 5", { exact: true })).toBeVisible();
    } else {
      await dialog.getByRole("button", { name: "Clear search", exact: true }).click();
    }
    if (width === 375) {
      // A landscape resize moves the masthead context onto its first row.
      // Find must retain its draft and return focus to the visible launcher.
      await page.setViewportSize({ width: 812, height: 375 });
      await expect(townField).toHaveValue(nextQuery);
    }
    await dialog.getByRole("button", { name: "Close Find", exact: true }).click();
    await expect(dialog).toHaveCount(0);
    await expect(detailOpener).toBeFocused();
    if (width === 375) {
      await page.setViewportSize({ width, height: 900 });
      await expect(detailOpener).toBeFocused();
    }
    await expect.poll(() => page.evaluate(() => window.history.state?.__frederickRadiusLayer ?? null)).toBeNull();
    await page.goBack();
    await expect(page).toHaveURL(/\/today(?:\?|$)/);
    // Back restores the original coffee result. A later manual Find session
    // still resumes the newer words (or the explicit clear) from the detail page.
    await expect(dialog).toBeVisible();
    await expect(townField).toHaveValue("coffee");
    const returnRead = nextQuery ? 6 : 5;
    await expect(dialog.getByRole("link", { name: `Fresh search fixture ${returnRead}`, exact: true })).toBeFocused();
    expect(requests.at(-1)).toEqual({ query: "coffee", scope: "town:brunswick" });
    await dialog.getByRole("button", { name: "Close Find", exact: true }).click();
    await expect(dialog).toHaveCount(0);
    await opener.click();
    await expect(townField).toHaveValue(nextQuery);
    if (nextQuery) {
      await expect(dialog.getByText("Fresh search fixture 7", { exact: true })).toBeVisible();
      await expect(dialog.getByText("Pizza · Brunswick", { exact: true })).toBeVisible();
      expect(requests.at(-1)).toEqual({ query: "pizza", scope: "town:brunswick" });
      await dialog.getByRole("button", { name: "Clear search", exact: true }).click();
      await dialog.getByRole("button", { name: "Close Find", exact: true }).click();
      await expect(dialog).toHaveCount(0);
      await expect(opener).toBeFocused();
      await opener.click();
    }
    await expect(townField).toHaveValue("");
    await expect(dialog.getByText("Useful now", { exact: true })).toBeVisible();
    await expect(dialog.getByText("Fresh search fixture 4", { exact: true })).toHaveCount(0);
  });
}

test("short phone at 200% text keeps the last area and More actions above primary navigation", async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 320, height: 568 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.route("**/api/pulse/status", route => route.fulfill({ json: {
    active: false, count: 0, tone: "quiet", level: "Clear", ok: true,
    lastUpdated: new Date().toISOString(), validUntil: new Date(Date.now() + 360_000).toISOString(),
  } }));
  await page.goto("/today?in=county", { waitUntil: "domcontentloaded" });
  const header = page.getByRole("banner").first();
  const navigation = page.getByRole("navigation", { name: "Primary", exact: true });
  await expect(header.locator("[data-pulse-indicator]")).toHaveAttribute("data-pulse-state", "ready");
  await page.evaluate(() => { document.documentElement.style.fontSize = "200%"; });
  await expect.poll(() => page.evaluate(() => getComputedStyle(document.documentElement).fontSize)).toBe("32px");
  await expect(navigation).toBeVisible();

  const journeys = [
    { trigger: todayArea(page), stops: [
      header.getByRole("combobox", { name: "Choose your area", exact: true }),
      header.getByRole("button", { name: "Use my location", exact: true }),
    ] },
    { trigger: header.getByLabel("More tools", { exact: true }), stops: [
      header.getByRole("link", { name: "Open tools", exact: true }),
      header.getByRole("button", { name: "Send feedback", exact: true }),
      header.getByRole("button", { name: /Switch to (dark|light) appearance/ }),
    ] },
  ];
  for (const { trigger, stops } of journeys) {
    await trigger.focus();
    await page.keyboard.press("Enter");
    for (const stop of stops) {
      await page.keyboard.press("Tab");
      await expect(stop).toBeFocused();
    }
    const last = stops[stops.length - 1];
    const target = await last.evaluate(control => {
      const box = control.getBoundingClientRect();
      const x = box.left + box.width / 2;
      const y = box.top + box.height / 2;
      const hitOffsets = [[0, 0], [-21.5, 0], [21.5, 0], [0, -21.5], [0, 21.5]];
      return {
        name: control.getAttribute("aria-label") || control.textContent?.trim(),
        top: box.top, bottom: box.bottom, width: box.width, height: box.height,
        visibleHits: hitOffsets.map(([dx, dy]) => control.contains(document.elementFromPoint(x + dx, y + dy))),
      };
    });
    const dock = (await navigation.boundingBox())!;
    await testInfo.attach(`last-action-${target.name}`, { body: JSON.stringify({ target, dock }), contentType: "application/json" });
    expect(target.width).toBeGreaterThanOrEqual(44);
    expect(target.height).toBeGreaterThanOrEqual(44);
    expect(target.top).toBeGreaterThanOrEqual(0);
    expect(target.bottom, `${target.name} clears the fixed primary navigation`).toBeLessThanOrEqual(dock.y);
    expect(target.visibleHits, `${target.name} has an unobstructed 44px target`).toEqual([true, true, true, true, true]);
    await page.keyboard.press("Escape");
    await expect(trigger).toBeFocused();
    await expect(last).toBeHidden();
  }
});

for (const route of ["/today", "/parking"]) {
  test(`feedback in More tools keeps ${route} clear and restores keyboard focus`, async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto(route, { waitUntil: "domcontentloaded" });
    const more = page.getByLabel("More tools", { exact: true });
    const feedback = page.getByRole("button", { name: "Send feedback", exact: true });
    await expect(feedback).toBeHidden();
    await more.click();
    await expect(feedback).toBeVisible();
    await feedback.click();
    const dialog = page.getByRole("dialog", { name: "Send feedback" });
    await expect(dialog).toBeVisible();
    await expect(more.locator("..")).not.toHaveAttribute("open", "");
    await page.keyboard.press("Escape");
    await expect(dialog).toBeHidden();
    await expect(more).toBeFocused();
    await expect(feedback).toBeHidden();
  });
}
