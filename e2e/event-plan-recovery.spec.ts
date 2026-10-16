import { expect, test, type Route } from "@playwright/test";
import { resolve } from "node:path";
import { APPEARANCE_KEY } from "../src/lib/appearance";
// This exercises the real server's honest missing/archive-unavailable path.
// Successful current-event lifecycle cases use the actual resolver's injected
// archive adapter in unit/integration tests, not a production fixture bypass.
const spec = { v: 1, i: { audience: "friends", vibe: "easy", duration_hours: 3, start_at: "2035-10-06T23:00:00.000Z", event_anchor_slug: "unresolved-outing-fixture-2035-10-06" }, s: [{ e: "unresolved-outing-fixture-2035-10-06" }] };
const token = Buffer.from(JSON.stringify(spec)).toString("base64url");
for (const { width, appearance } of [
  { width: 390, appearance: "light" },
  { width: 1366, appearance: "light" },
  { width: 390, appearance: "dark" },
] as const) {
  test(`an unresolved event outing preserves choices and offers honest recovery at ${width}px in ${appearance}`, async ({ page }) => {
    await page.setViewportSize({ width, height: 844 });
    // An explicit saved app choice wins over the operating system preference.
    await page.emulateMedia({ colorScheme: "light" });
    await page.addInitScript(({ key, value }) => {
      localStorage.setItem(key, value);
    }, { key: APPEARANCE_KEY, value: appearance });
    await page.addInitScript(() => {
      Object.defineProperty(navigator, "share", { configurable: true, value: async (data: ShareData) => { sessionStorage.setItem("test:event-plan-share", JSON.stringify(data)); } });
    });
    const eventOrigin = "/events/unresolved-outing-fixture-2035-10-06?returnTo=%2Fevents%3Fin%3Dfrederick";
    await page.goto(`/plan?p=${token}&returnTo=${encodeURIComponent(eventOrigin)}`, { waitUntil: "domcontentloaded" });
    await expect(page.getByRole("heading", { name: "Review your saved choices", exact: true })).toBeVisible({ timeout: 30_000 });
    await expect(page.locator("html")).toHaveAttribute("data-appearance", appearance);
    expect(await page.evaluate(() => getComputedStyle(document.documentElement).colorScheme)).toBe(appearance);
    await expect(page.getByText("Its place in your plan is saved.", { exact: false })).toBeVisible();
    await expect(page.getByRole("link", { name: "Back to the event", exact: true })).toHaveAttribute("href", eventOrigin);
    await expect(page.getByRole("link", { name: "Open full route", exact: true })).toHaveCount(0);
    await expect(page.getByRole("link", { name: "Directions", exact: true })).toHaveCount(0);
    await page.getByRole("button", { name: "Check saved choices again", exact: true }).click();
    await expect(page.getByText("Your saved choices have been checked again.", { exact: true })).toBeVisible();
    expect(new URL(page.url()).searchParams.get("p")).toBe(token);
    await page.getByRole("button", { name: "Share this plan", exact: true }).click();
    const shared = await page.evaluate(() => JSON.parse(sessionStorage.getItem("test:event-plan-share")!));
    const sharedUrl = new URL(shared.url); expect([...sharedUrl.searchParams.keys()]).toEqual(["p"]); expect(sharedUrl.searchParams.get("p")).toBe(token);
    await page.goto(`/plan?p=${token}`, { waitUntil: "domcontentloaded" });
    await expect(page.getByRole("heading", { name: "Review your saved choices", exact: true })).toBeVisible({ timeout: 30_000 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    const retry = await page.getByRole("button", { name: "Check saved choices again", exact: true }).boundingBox(); expect(retry!.height).toBeGreaterThanOrEqual(44);
    if (appearance === "dark") {
      const updates = page.getByRole("region", { name: "Plan updates", exact: true });
      await expect(updates).toHaveAttribute("data-event-plan-controls-ready", "true");
      await expect(page.locator("html")).toHaveAttribute("data-appearance", "dark");
      await page.addScriptTag({ path: resolve("node_modules/axe-core/axe.min.js") });
      const violations = await updates.evaluate(async (region) => {
        const axe = (window as unknown as { axe: { run: (context: Element, options: object) => Promise<{ violations: unknown[] }> } }).axe;
        return (await axe.run(region, { runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"] }, resultTypes: ["violations"] })).violations;
      });
      expect(violations).toEqual([]);
    }
    await page.screenshot({ path: `output/playwright/event-plan-recovery-${width}-${appearance}.png`, fullPage: true });
    await page.getByRole("button", { name: "Remove saved reference", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Review your saved choices", exact: true })).toHaveCount(0);
    const edited = new URL(page.url()).searchParams.get("p")!; expect(JSON.parse(Buffer.from(edited, "base64url").toString()).s).toEqual([]);
  });
}


test("event recovery controls wait for hydration before accepting a tap", async ({ page }) => {
  const paused = new Set<Route>();
  let released = false;
  let actions = 0;
  await page.route("**/_next/static/chunks/*.js", (route) => {
    if (released) return route.continue();
    paused.add(route);
  });
  page.on("request", (request) => {
    if (request.method() === "POST" && new URL(request.url()).pathname === "/plan") actions++;
  });
  try {
    await page.goto(`/plan?p=${token}`, { waitUntil: "commit" });
    const updates = page.getByRole("region", { name: "Plan updates", exact: true });
    const retry = updates.getByRole("button", { name: "Check saved choices again", exact: true });
    await expect(retry).toBeDisabled();
    await expect(updates.getByRole("button", { name: "Remove saved reference", exact: true })).toBeDisabled();
    await expect(updates).toHaveAttribute("data-event-plan-controls-ready", "false");
    // A real pointer tap during the server preview cannot start a lost action.
    const target = await retry.boundingBox();
    expect(target).not.toBeNull();
    await page.mouse.click(target!.x + target!.width / 2, target!.y + target!.height / 2);
    expect(actions).toBe(0);

    released = true;
    const pending = [...paused];
    paused.clear();
    await Promise.all(pending.map((route) => route.continue()));
    await expect(updates).toHaveAttribute("data-event-plan-controls-ready", "true");
    await retry.click();
    await expect(page.getByText("Your saved choices have been checked again.", { exact: true })).toBeVisible();
    expect(actions).toBe(1);
    expect(new URL(page.url()).searchParams.get("p")).toBe(token);
  } finally {
    released = true;
    await Promise.allSettled([...paused].map((route) => route.continue()));
  }
});
