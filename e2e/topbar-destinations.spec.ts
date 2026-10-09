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
        body: JSON.stringify({ active: false, count: 0, tone: "quiet", level: "Clear", ok: true, lastUpdated: new Date().toISOString() }),
      });
    });
    await page.goto("/compass", {
      waitUntil: "domcontentloaded",
      timeout: 90_000,
    });

    const header = page.locator("header").first();
    const pulse = header.locator("[data-pulse-indicator]");
    const compass = header.getByRole("link", { name: "Open tools" });
    await expect(pulse).toHaveAttribute("aria-label", "County status: Clear in checked feeds; no active alerts");
    await expect(pulse).toHaveAttribute("data-pulse-state", "ready");

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
  { label: "active alerts", payload: { active: true, count: 2, tone: "alert", level: "Urgent", ok: true }, name: "County status: Urgent; 2 alerts reported" },
  { label: "unavailable checks", payload: { active: false, count: 0, tone: "quiet", level: "Unknown", ok: false }, name: "County status: Unable to verify; current alerts are unverified" },
  { label: "unverified reports", payload: { active: false, count: 0, tone: "quiet", level: "Clear", ok: true, lastUpdated: "not-a-report-time" }, name: "County status: Unable to verify; current alerts are unverified" },
]) {
  test(`TopBar keeps ${status.label} visible on a phone`, async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.route("**/api/pulse/status", async (route) => {
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ lastUpdated: new Date().toISOString(), ...status.payload }) });
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
    await route.fulfill({ json: { active: false, count: 0, tone: "quiet", level: "Clear", ok: true, lastUpdated: new Date().toISOString() } });
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
    release();
    await expect(status).toHaveAttribute("aria-label", "County status: Clear in checked feeds; no active alerts");
    await expect(status).toHaveAttribute("data-pulse-state", "ready");
    await expect(status).toBeHidden();
    await expect(status.locator("[data-pulse-mobile-state]")).toHaveText("Clear");
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
    const area = page.getByRole("combobox", { name: "Choose your area", exact: true });
    await expect(area).toBeEnabled();
    await area.selectOption("county");
    const opener = page.getByRole("link", { name: "Find a place, service, event, or answer", exact: true });
    const dialog = page.getByRole("dialog", { name: "What do you need?", exact: true });
    const field = dialog.getByRole("searchbox", { name: "Ask or find across Frederick County", exact: true });
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

    await area.selectOption("town:brunswick");
    await opener.click();
    await expect(field).toHaveValue("coffee");
    await expect(dialog.getByText("Fresh search fixture 3", { exact: true })).toBeVisible();
    await expect(dialog.getByText("Coffee · Brunswick", { exact: true })).toBeVisible();
    expect(requests).toEqual([
      { query: "coffee", scope: "county" },
      { query: "coffee", scope: "county" },
      { query: "coffee", scope: "town:brunswick" },
    ]);

    await dialog.getByRole("listitem")
      .filter({ hasText: "Fresh search fixture 3" })
      .getByRole("link", { name: "Open", exact: true }).click();
    await expect(page).toHaveURL(/\/places\/beans-in-the-belfry-brunswick/);
    await expect(page.getByRole("heading", { name: "Beans in the Belfry", exact: true })).toBeVisible();
    const detailOpener = page.getByRole("button", { name: "Ask or find across Frederick County", exact: true });
    await expect(detailOpener).toBeEnabled();
    await detailOpener.click();
    await expect(field).toHaveValue("coffee");
    await expect(dialog.getByText("Fresh search fixture 4", { exact: true })).toBeVisible();
    const nextQuery = width === 375 ? "pizza" : "";
    if (nextQuery) {
      await field.fill(nextQuery);
      await expect(dialog.getByText("Fresh search fixture 5", { exact: true })).toBeVisible();
    } else {
      await dialog.getByRole("button", { name: "Clear search", exact: true }).click();
    }
    await dialog.getByRole("button", { name: "Close Find", exact: true }).click();
    await expect(dialog).toHaveCount(0);
    await expect(detailOpener).toBeFocused();
    await expect.poll(() => page.evaluate(() => window.history.state?.__frederickRadiusLayer ?? null)).toBeNull();
    await page.goBack();
    await expect(page).toHaveURL(/\/today(?:\?|$)/);
    // No reload: Back may restore a BFCache header with an older memory draft.
    await expect(area).toBeEnabled();
    await opener.click();
    await expect(field).toHaveValue(nextQuery);
    if (nextQuery) {
      await expect(dialog.getByText("Fresh search fixture 6", { exact: true })).toBeVisible();
      await expect(dialog.getByText("Pizza · Brunswick", { exact: true })).toBeVisible();
      expect(requests.at(-1)).toEqual({ query: "pizza", scope: "town:brunswick" });
      await dialog.getByRole("button", { name: "Clear search", exact: true }).click();
      await dialog.getByRole("button", { name: "Close Find", exact: true }).click();
      await expect(dialog).toHaveCount(0);
      await expect(opener).toBeFocused();
      await opener.click();
    }
    await expect(field).toHaveValue("");
    await expect(dialog.getByText("Useful now", { exact: true })).toBeVisible();
    await expect(dialog.getByText("Fresh search fixture 4", { exact: true })).toHaveCount(0);
  });
}
