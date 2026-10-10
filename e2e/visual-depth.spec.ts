import { expect, test, type Locator, type Page } from "@playwright/test";
import {
  dismissReturnBridge,
  emptyReturnBridgeState,
  RETURN_BRIDGE_STORAGE_KEY,
} from "../src/lib/return-bridge";

// Review captures are evidence, not new pixel baselines. Feed availability and
// group membership remain real: unavailable weather belongs in Source status.
test.beforeEach(async ({ page }) => {
  test.setTimeout(120_000);
  await page.addInitScript(({ key, state }) => {
    localStorage.setItem(key, JSON.stringify(state));
    localStorage.setItem("fr:scope:v1", "county");
    document.cookie = "fr_scope=county; path=/";
  }, {
    key: RETURN_BRIDGE_STORAGE_KEY,
    state: dismissReturnBridge(emptyReturnBridgeState()),
  });
});

async function expectNoOverflow(page: Page) {
  await expect.poll(() => page.evaluate(() =>
    document.documentElement.scrollWidth - document.documentElement.clientWidth,
  )).toBeLessThanOrEqual(1);
}

async function expectReadableWithinViewport(locator: Locator, width: number) {
  await expect(locator).toBeVisible();
  await expect(locator).toContainText(/\S/);
  const box = await locator.boundingBox();
  expect(box).not.toBeNull();
  expect(box!.x).toBeGreaterThanOrEqual(-1);
  expect(box!.x + box!.width).toBeLessThanOrEqual(width + 1);
  const clipped = await locator.evaluate((element) => {
    const clips = (overflow: string) => /^(hidden|clip)$/.test(overflow);
    const style = getComputedStyle(element);
    // A short line-height can put visible font ink outside its line box. Only
    // reject overflow that a clipping boundary actually hides from the reader.
    let horizontal = clips(style.overflowX) ? element.scrollWidth - element.clientWidth : 0;
    let vertical = clips(style.overflowY) ? element.scrollHeight - element.clientHeight : 0;
    const range = document.createRange();
    range.selectNodeContents(element);
    const text = range.getBoundingClientRect();
    for (let parent = element.parentElement; parent; parent = parent.parentElement) {
      const parentStyle = getComputedStyle(parent);
      const rect = parent.getBoundingClientRect();
      const left = rect.left + parent.clientLeft;
      const top = rect.top + parent.clientTop;
      if (clips(parentStyle.overflowX)) {
        horizontal = Math.max(horizontal, left - text.left, text.right - left - parent.clientWidth);
      }
      if (clips(parentStyle.overflowY)) {
        vertical = Math.max(vertical, top - text.top, text.bottom - top - parent.clientHeight);
      }
    }
    return { horizontal, vertical };
  });
  expect(clipped.horizontal, "text is not clipped horizontally").toBeLessThanOrEqual(1);
  expect(clipped.vertical, "text is not clipped vertically").toBeLessThanOrEqual(1);
}

async function expectPulseReady(page: Page) {
  const briefing = page.locator("main [data-pulse-briefing]");
  await expect(briefing).toBeVisible();
  await expect(briefing).toHaveAttribute("data-pulse-interaction-ready", "true");
  return briefing;
}

async function expectTouchTarget(locator: Locator) {
  await expect(locator).toBeVisible();
  const box = await locator.boundingBox();
  expect(box).not.toBeNull();
  // Allow floating-point representation of an exact 44px box, not a smaller
  // control. The selected controls have full-size boxes, not inline extenders.
  expect(Math.round(box!.width * 100) / 100).toBeGreaterThanOrEqual(44);
  expect(Math.round(box!.height * 100) / 100).toBeGreaterThanOrEqual(44);
}

async function openSourceStatus(page: Page) {
  await expectPulseReady(page);
  const section = page.locator('section[aria-labelledby="pulse-secondary-heading"]');
  await expect(section).toContainText("Source status");
  const summary = section.locator("summary");
  if (await summary.count()) {
    await expectTouchTarget(summary);
    if ((await section.locator("details").getAttribute("open")) === null) {
      await summary.click();
    }
    await expect(section.locator("details")).toHaveAttribute("open", "");
  }
  return section;
}

async function weatherTrigger(page: Page) {
  await expectPulseReady(page);
  const trigger = page.locator('main button[data-pulse-key="weather"]').first();
  if (!(await trigger.isVisible())) await openSourceStatus(page);
  await expect(trigger).toBeVisible();
  await expect(trigger).toHaveAccessibleName(/\S/);
  return trigger;
}

for (const width of [320, 375, 390, 430, 1366]) {
  test(`County status and Today remain readable and usable at ${width}px`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width, height: width === 1366 ? 900 : 844 });
    await page.goto("/pulse?in=county", { waitUntil: "domcontentloaded" });
    const main = page.locator("main");
    const briefing = await expectPulseReady(page);
    await page.evaluate(() => document.fonts.ready);
    await expect(main.getByRole("heading", { level: 1 })).toHaveCount(1);
    const heading = briefing.getByRole("heading", { level: 1 });
    await expectReadableWithinViewport(heading, width);
    await expect(heading).toBeInViewport();
    await expectReadableWithinViewport(briefing.getByText("County status", { exact: true }), width);
    await expectReadableWithinViewport(briefing.locator('[aria-live="polite"]'), width);
    await expectReadableWithinViewport(
      briefing.getByText(/^Page assembled /), width,
    );
    await expectNoOverflow(page);
    await page.screenshot({ path: testInfo.outputPath(`pulse-${width}.png`), fullPage: true });

    const sources = await openSourceStatus(page);
    const sourceRows = sources.locator("button[data-pulse-key]");
    // The disclosure summary is a control, not a sourced detail row. An open
    // disclosure must contain rows; the static not-connected fallback need not.
    if (await sources.locator("summary").count()) {
      await expect.poll(() => sourceRows.count()).toBeGreaterThan(0);
    }
    for (const row of await sourceRows.all()) {
      await expect(row).toHaveAccessibleName(/Source: \S/);
      await expectTouchTarget(row);
      const label = await row.getAttribute("aria-label");
      const warning = label?.match(/\b(Partial data|Feed unavailable|Not connected)\b/)?.[1];
      if (warning) await expect(row.getByText(warning, { exact: true }).first()).toBeVisible();
    }
    // Whichever source is currently degraded remains a real, reachable detail
    // action. A healthy run does not fabricate a warning to satisfy the test.
    const warningRow = sourceRows.filter({
      hasText: /Partial data|Feed unavailable|Not connected/,
    }).first();
    if (await warningRow.count()) {
      await warningRow.click();
      const dialog = page.getByRole("dialog");
      await expect(dialog).toHaveCount(1);
      await expect(dialog).toHaveAccessibleName(/\S/);
      await expect(dialog.getByText(/^Source: /)).toBeVisible();
      await page.keyboard.press("Escape");
      await expect(dialog).toHaveCount(0);
      await expect(warningRow).toBeFocused();
    }
    const trail = main.locator("footer details").filter({ hasText: "Sources & data trail" });
    await expectTouchTarget(trail.locator("summary"));
    await trail.locator("summary").click();
    const officialSource = trail.getByRole("link", { name: /source:/i }).first();
    await expect(officialSource).toBeVisible();
    await expect(officialSource).toHaveAttribute("href", /^https:\/\//);
    await expectTouchTarget(officialSource);
    for (const control of await main.locator("button[data-pulse-key]").all()) {
      await expectTouchTarget(control);
    }
    await expectNoOverflow(page);
    await page.screenshot({ path: testInfo.outputPath(`pulse-sources-${width}.png`), fullPage: true });

    await page.goto("/today?in=county", { waitUntil: "domcontentloaded" });
    const area = page.getByRole("combobox", { name: "Choose your area" });
    await expect(area).toBeEnabled();
    await expect(area).toHaveValue("county");
    await page.evaluate(() => document.fonts.ready);
    await expectTouchTarget(area);
    await expectTouchTarget(page.getByRole("link", {
      name: "Find a place, service, event, or answer", exact: true,
    }));
    for (const name of ["Open now", "Public essentials", "Plan a few hours", "Local services"]) {
      await expectTouchTarget(page.getByRole("link", { name, exact: true }));
    }
    await expectNoOverflow(page);
    await page.screenshot({ path: testInfo.outputPath(`today-${width}.png`), fullPage: true });
  });
}

for (const width of [390, 1366]) {
  test(`Weather opens once and browser Back restores its opener at ${width}px`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/pulse?in=county", { waitUntil: "domcontentloaded" });
    await expect(page.locator("[data-pulse-briefing]")).toBeVisible();
    const origin = page.url();
    const trigger = await weatherTrigger(page);
    await expectTouchTarget(trigger);
    await trigger.focus();
    await trigger.press("Enter");
    const dialog = page.getByRole("dialog");
    await expect(dialog).toHaveCount(1);
    await expect(dialog).toHaveAccessibleName("Weather");
    await expect(dialog).toHaveAttribute("aria-modal", "true");
    await expect(dialog.getByText("Source: NWS · weather.gov", { exact: true })).toBeVisible();
    const close = dialog.getByRole("button", { name: "Close Weather", exact: true });
    await expectTouchTarget(close);
    await expect.poll(() => new URL(page.url()).searchParams.get("open")).toBe("weather");
    expect(new URL(page.url()).searchParams.get("in")).toBe("county");
    await expectNoOverflow(page);
    await page.screenshot({ path: testInfo.outputPath(`weather-drawer-${width}.png`), fullPage: true });
    await page.goBack();
    await expect(page).toHaveURL(origin);
    await expect(dialog).toHaveCount(0);
    await expect(trigger).toBeFocused();
  });
}

test("a direct Weather link opens one sourced drawer and closes without losing the area", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/pulse?in=county&open=weather", { waitUntil: "domcontentloaded" });
  const dialog = page.getByRole("dialog");
  await expect(dialog).toHaveCount(1);
  await expect(dialog).toHaveAccessibleName("Weather");
  await expect(dialog.getByText("Source: NWS · weather.gov", { exact: true })).toBeVisible();
  await dialog.getByRole("button", { name: "Close Weather", exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await expect.poll(() => new URL(page.url()).searchParams.get("open")).toBeNull();
  expect(new URL(page.url()).pathname).toBe("/pulse");
  expect(new URL(page.url()).searchParams.get("in")).toBe("county");
  await expect(page.locator("[data-pulse-briefing]").getByRole("heading", { level: 1 })).toBeVisible();
});

test("reduced motion keeps Pulse and Today actions still on hover and navigation press", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  for (const route of ["/pulse?in=county", "/today?in=county"]) {
    await page.goto(route, { waitUntil: "domcontentloaded" });
    const action = route.startsWith("/pulse")
      ? await weatherTrigger(page)
      : page.getByRole("link", { name: "Find a place, service, event, or answer", exact: true });
    await expect(action).toBeVisible();
    await action.hover();
    await expect.poll(() => action.evaluate((element) => {
      const style = getComputedStyle(element);
      return {
        transform: style.transform,
        translate: style.translate,
        scale: style.scale,
        rotate: style.rotate,
      };
    })).toEqual({ transform: "none", translate: "none", scale: "none", rotate: "none" });
    await expectNoOverflow(page);
  }
  const current = page.getByRole("navigation", { name: "Primary", exact: true })
    .getByRole("link", { name: "Today", exact: true });
  await expect(current).toHaveAttribute("href", "/today");
  await expect(current).toHaveAttribute("aria-current", "page");
  await expectTouchTarget(current);
  const box = await current.boundingBox();
  expect(box).not.toBeNull();
  await page.mouse.move(box!.x + box!.width / 2, box!.y + box!.height / 2);
  await page.mouse.down();
  try {
    await expect.poll(() => current.evaluate((element) => element.matches(":active"))).toBe(true);
    await expect.poll(() => current.evaluate((element) => {
      const style = getComputedStyle(element);
      return { transform: style.transform, scale: style.scale };
    })).toEqual({ transform: "none", scale: "none" });
  } finally {
    // Release away from the current route's link: this checks the actual
    // pressed state without turning the assertion into a navigation action.
    await page.mouse.move(0, 0);
    await page.mouse.up();
  }
});
