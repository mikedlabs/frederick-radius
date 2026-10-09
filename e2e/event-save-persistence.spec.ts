import { expect, test, type Page } from "@playwright/test";
import { dismissReturnBridge, emptyReturnBridgeState, RETURN_BRIDGE_STORAGE_KEY } from "../src/lib/return-bridge";

const KEY = "fr:saved:v1";
test.use({ serviceWorkers: "block" });

test.beforeEach(async ({ page, context, baseURL }) => {
  const origin = new URL(baseURL ?? "http://localhost:3010");
  await context.addCookies([{ name: "fr_onboarded", value: "1", domain: origin.hostname, path: "/" }]);
  await page.addInitScript(({ key, state }) => {
    if (localStorage.getItem("fr:saved:v1") === null) localStorage.setItem("fr:saved:v1", "[]");
    localStorage.setItem(key, JSON.stringify(state));
    localStorage.setItem("fr_map_location_intro_v1", "dismissed");
  }, { key: RETURN_BRIDGE_STORAGE_KEY, state: dismissReturnBridge(emptyReturnBridgeState()) });
  await page.route("**/*", (route) => {
    const request = route.request();
    const url = new URL(request.url());
    if (url.origin !== origin.origin || request.resourceType() === "image") return route.abort();
    // Only event catalog/summary reads and the existing bounded Saved hydration
    // POST can run. Anonymous identity is controlled; accounts, paid photos,
    // unrelated live feeds, analytics, and mutations stay outside this test.
    if (url.pathname === "/api/auth/me") return route.fulfill({ status: 200, contentType: "application/json", body: '{"user":null}' });
    const eventRead = request.method() === "GET" && (url.pathname === "/api/events/browse" || /^\/api\/events\/[^/]+\/summary$/.test(url.pathname));
    const savedRead = request.method() === "POST" && url.pathname === "/api/events/by-slugs";
    if (url.pathname.startsWith("/api/") && !eventRead && !savedRead) return route.abort();
    if (!["GET", "HEAD"].includes(request.method()) && !savedRead) return route.abort();
    return route.continue();
  });
});

async function openRealEvent(page: Page) {
  await page.goto("/events?in=county", { waitUntil: "domcontentloaded" });
  await expect(page.locator("[data-events-interaction-ready]")).toHaveAttribute("data-events-interaction-ready", "true");
  const links = page.locator('main [data-decision-entity="event"] a[data-decision-action="open"]').filter({ visible: true });
  await expect(links.first()).toBeVisible();
  const hrefs = await links.evaluateAll((elements) => elements.map((element) => element.getAttribute("href")!));
  // A no-key application build can expose archived feed links whose full rows
  // are unavailable. Select a real resolvable visible row, never fabricate it.
  for (const href of [...new Set(hrefs)].slice(0, 12)) {
    const slug = new URL(href, page.url()).pathname.replace("/events/", "");
    const summary = await page.evaluate(async (path) => {
      const response = await fetch(path);
      if (!response.ok) return null;
      const result = await response.json();
      return result.event ? { slug: String(result.event.slug), title: String(result.event.title) } : null;
    }, `/api/events/${encodeURIComponent(slug)}/summary`);
    if (!summary || summary.slug !== slug) continue;
    const trigger = page.locator(`main [data-decision-entity="event"] a[data-decision-action="open"][href=${JSON.stringify(href)}]`).filter({ visible: true }).first();
    await expect(trigger).toBeVisible();
    await trigger.click();
    const dialog = page.getByRole("dialog", { name: summary.title, exact: true });
    await expect(dialog).toBeVisible();
    const button = dialog.locator(`[data-save-ref="event:${slug}"]`);
    await expect(button).toBeEnabled();
    await expect(button).toHaveAttribute("aria-pressed", "false");
    return { ...summary, dialog, button };
  }
  throw new Error("No visible event resolves in this no-key catalog. Record unavailable-source coverage before using a controlled HTTP fixture.");
}

for (const width of [390, 1366]) {
  test(`a real event detail save stays in Saved after delayed reload at ${width}px`, async ({ page }) => {
    test.setTimeout(90_000);
    await page.setViewportSize({ width, height: 844 });
    const event = await openRealEvent(page);
    await event.button.click();
    await expect(event.button).toHaveAttribute("aria-pressed", "true");
    await expect(event.button).toHaveAccessibleName(`Remove ${event.title} from Saved`);
    await expect(page.getByText(`Saved · ${event.title}`, { exact: true })).toBeVisible();
    const committed = await page.evaluate((key) => localStorage.getItem(key), KEY);
    expect(JSON.parse(committed!)).toEqual([{ type: "event", id: event.slug, saved_at: expect.any(String) }]);
    // The reported bug reverted a few seconds after acknowledgement.
    await page.waitForTimeout(6_000);
    await expect(event.button).toHaveAttribute("aria-pressed", "true");
    await page.keyboard.press("Escape");
    await expect(event.dialog).toHaveCount(0);
    await page.getByRole("link", { name: "Saved", exact: true }).filter({ visible: true }).first().click();
    await expect(page).toHaveURL(/\/my-radius/);
    const savedCard = page.locator(`[id="swe-slot-${event.slug}"]`);
    await expect(savedCard).toBeVisible();
    await page.reload({ waitUntil: "domcontentloaded" });
    await expect(savedCard).toBeVisible();
    expect(await page.evaluate((key) => localStorage.getItem(key), KEY)).toBe(committed);
    await savedCard.locator('a[href^="/events/"]').first().click();
    await expect(page.locator(`[data-save-ref="event:${event.slug}"]`).filter({ visible: true }).first()).toHaveAttribute("aria-pressed", "true");
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  });
}

test("a rejected real event save never selects the button or reports success", async ({ page }) => {
  test.setTimeout(90_000);
  await page.setViewportSize({ width: 390, height: 844 });
  const event = await openRealEvent(page);
  await page.evaluate((key) => {
    const set = Storage.prototype.setItem;
    Storage.prototype.setItem = function (name, value) {
      if (name === key) throw new DOMException("Device storage full", "QuotaExceededError");
      set.call(this, name, value);
    };
  }, KEY);
  await event.button.click();
  await expect(event.button).toHaveAttribute("aria-pressed", "false");
  await expect(page.getByText("Could not save this event", { exact: true })).toBeVisible();
  await expect(page.getByText(`Saved · ${event.title}`, { exact: true })).toHaveCount(0);
  expect(await page.evaluate((key) => localStorage.getItem(key), KEY)).toBe("[]");
});
