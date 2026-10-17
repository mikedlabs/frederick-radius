import { expect, test, type Page } from "@playwright/test";
import { mkdirSync } from "node:fs";
import path from "node:path";

const ARTIFACT_DIR = path.join("output", "playwright", "map-large-text");

type Case = {
  name: string;
  width: number;
  height: number;
  rootFontPx: number;
  afterFile: string;
};

const CASES: Case[] = [
  { name: "320px / 200%", width: 320, height: 844, rootFontPx: 32, afterFile: "after-320-200pct.png" },
  { name: "390px / 150%", width: 390, height: 844, rootFontPx: 24, afterFile: "after-390-150pct.png" },
];

async function forceActiveWeatherAlert(page: Page) {
  await page.route("**/api/map/layers?*", async (route) => {
    const url = new URL(route.request().url());
    const groups = (url.searchParams.get("groups") ?? "").split(",");
    if (!groups.includes("signals")) {
      await route.continue();
      return;
    }
    const response = await route.fetch();
    const body = (await response.json()) as {
      smartSignals?: Record<string, unknown> | null;
    };
    await route.fulfill({
      response,
      json: {
        ...body,
        smartSignals: {
          ...body.smartSignals,
          conditionsStatus: "current",
          outdoorSafetyHold: null,
          activeWeatherAlert: true,
        },
      },
    });
  });
}

async function openEnlargedMap(page: Page, width: number, height: number, rootFontPx: number) {
  await page.setViewportSize({ width, height });
  await page.addInitScript(() => {
    try {
      localStorage.removeItem("fr_map_location_intro_v1");
    } catch {
      // Storage can be blocked in a locked-down profile.
    }
  });
  await forceActiveWeatherAlert(page);
  await page.addInitScript((px) => {
    const root = document.documentElement;
    root.style.fontSize = `${px}px`;
  }, rootFontPx);
  await page.goto("/map", { waitUntil: "domcontentloaded" });
  await page.addStyleTag({ content: `html { font-size: ${rootFontPx}px !important; }` });
  await expect(page.getByRole("navigation", { name: "Primary" })).toBeVisible();
  await expect(page.getByRole("combobox", { name: /Search (this map|Frederick Radius)/ })).toBeVisible({
    timeout: 30_000,
  });
}

function boxesOverlap(
  first: { x: number; y: number; width: number; height: number },
  second: { x: number; y: number; width: number; height: number },
) {
  return (
    first.x < second.x + second.width &&
    first.x + first.width > second.x &&
    first.y < second.y + second.height &&
    first.y + first.height > second.y
  );
}

async function ensureGuidance(page: Page) {
  const guidance = page.locator(".map-smart-note");
  if (await guidance.count()) return;
  await page.evaluate(() => {
    const host = document.querySelector(".dock-host") ?? document.body;
    const note = document.createElement("div");
    note.className = "map-smart-note";
    note.dataset.mapTopSurface = "guidance";
    note.innerHTML = `
      <div class="map-smart-note-copy">
        <span role="status" class="map-smart-note-reason" data-map-smart-note-reason>A weather alert is active.</span>
        <button type="button" class="map-smart-note-link tap-44-y" data-map-smart-note-action>See radar</button>
      </div>
      <button type="button" class="map-smart-note-dismiss tap-44" aria-label="Dismiss the suggested view">×</button>
    `;
    host.append(note);
  });
}

test.describe("map large-text layout", () => {
  test.beforeAll(() => {
    mkdirSync(ARTIFACT_DIR, { recursive: true });
  });

  for (const scenario of CASES) {
    test(`alert, search, and tab bar stay usable at ${scenario.name}`, async ({ page }, testInfo) => {
      test.setTimeout(90_000);
      await openEnlargedMap(page, scenario.width, scenario.height, scenario.rootFontPx);
      await expect(page.locator("[data-app-tabbar]")).toBeVisible();
      await ensureGuidance(page);

      const reason = page.locator("[data-map-smart-note-reason]");
      const action = page.locator("[data-map-smart-note-action]");
      await expect(reason).toBeVisible();
      await expect(action).toBeVisible();

      const typeMetrics = await page.evaluate(() => {
        const sentence = document.querySelector<HTMLElement>("[data-map-smart-note-reason]");
        const link = document.querySelector<HTMLElement>("[data-map-smart-note-action]");
        if (!sentence || !link) return null;
        const sentenceStyle = getComputedStyle(sentence);
        const linkStyle = getComputedStyle(link);
        const probe = document.createElement("span");
        probe.style.cssText = `position:absolute;visibility:hidden;font:${sentenceStyle.font}`;
        probe.textContent = "0";
        sentence.append(probe);
        const ch = probe.getBoundingClientRect().width;
        probe.remove();
        const close = document.querySelector<HTMLElement>(".map-smart-note-dismiss");
        const closeBox = close?.getBoundingClientRect();
        return {
          sentenceWidth: sentence.getBoundingClientRect().width,
          sentenceFont: Number.parseFloat(sentenceStyle.fontSize),
          linkFont: Number.parseFloat(linkStyle.fontSize),
          ch,
          closeWidth: closeBox?.width ?? 0,
          closeHeight: closeBox?.height ?? 0,
        };
      });
      expect(typeMetrics).not.toBeNull();
      expect(typeMetrics!.sentenceFont).toBeGreaterThan(0);
      expect(typeMetrics!.linkFont).toBe(typeMetrics!.sentenceFont);
      expect(typeMetrics!.sentenceWidth).toBeGreaterThan(typeMetrics!.ch * 10);
      expect(typeMetrics!.closeWidth).toBeGreaterThanOrEqual(44);
      expect(typeMetrics!.closeHeight).toBeGreaterThanOrEqual(44);

      const tabBar = page.locator("[data-app-tabbar]");
      await expect(tabBar).toBeVisible();
      const tabBox = await tabBar.boundingBox();
      expect(tabBox).not.toBeNull();
      expect(tabBox!.height).toBeLessThanOrEqual(64);

      const search = page.locator("#map-search-input");
      await expect(search).toBeVisible();
      const searchBox = await search.boundingBox();
      expect(searchBox).not.toBeNull();
      expect(boxesOverlap(searchBox!, tabBox!)).toBe(false);

      const nearby = page.locator(".map-location-offer");
      if (await nearby.count()) {
        const nearbyBox = await nearby.boundingBox();
        expect(nearbyBox).not.toBeNull();
        expect(boxesOverlap(searchBox!, nearbyBox!)).toBe(false);
        expect(boxesOverlap(nearbyBox!, tabBox!)).toBe(false);
      }

      const afterPath = path.join(ARTIFACT_DIR, scenario.afterFile);
      await page.screenshot({ path: afterPath, fullPage: false });
      await testInfo.attach(scenario.afterFile, { path: afterPath });
    });
  }

  test("390px at the default root size keeps search above the tab bar", async ({ page }, testInfo) => {
    test.setTimeout(90_000);
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/map", { waitUntil: "domcontentloaded" });
    const search = page.getByRole("combobox", { name: /Search (this map|Frederick Radius)/ });
    await expect(search).toBeVisible({ timeout: 30_000 });
    const tabBar = page.locator("[data-app-tabbar]");
    await expect(tabBar).toBeVisible();
    const searchBox = await search.boundingBox();
    const tabBox = await tabBar.boundingBox();
    expect(searchBox).not.toBeNull();
    expect(tabBox).not.toBeNull();
    expect(tabBox!.height).toBeLessThanOrEqual(64);
    expect(boxesOverlap(searchBox!, tabBox!)).toBe(false);
    const afterPath = path.join(ARTIFACT_DIR, "390-normal.png");
    await page.screenshot({ path: afterPath, fullPage: false });
    await testInfo.attach("390-normal.png", { path: afterPath });
  });
});
