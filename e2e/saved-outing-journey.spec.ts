import { resolve } from "node:path";
import { expect, test, type BrowserContext, type Locator, type Page, type TestInfo } from "@playwright/test";
import type { PlanSpec } from "../src/lib/plan/plan-token";
import { SAVED_OUTINGS_KEY } from "../src/lib/saved-outings";

test.use({ serviceWorkers: "allow" });

function observe(context: BrowserContext) {
  const errors: string[] = [];
  const consoleErrors: string[] = [];
  let askCalls = 0;
  context.on("request", (request) => { if (new URL(request.url()).pathname.startsWith("/api/ask")) askCalls++; });
  context.on("page", (page) => {
    page.on("pageerror", (error) => errors.push(error.message));
    page.on("console", (message) => { if (message.type() === "error") consoleErrors.push(message.text()); });
  });
  return { errors, consoleErrors, askCalls: () => askCalls };
}

async function readLegacy(page: Page) {
  return page.evaluate(() => Object.fromEntries([
    "fr:saved:v1", "fr.transit.saved-stops.v1", "fr.transit.saved-buses.v1",
  ].map((key) => [key, localStorage.getItem(key)])));
}

async function activate(control: Locator, touch: boolean) {
  if (touch) await control.tap();
  else await control.click();
}

async function settleFirstStop(page: Page) {
  await page.evaluate(() => document.fonts.ready);
  await expect.poll(() => page.locator("[data-plan-stop]").first().evaluate((element) =>
    {
      for (let current: Element | null = element; current; current = current.parentElement) {
        if (current.getAnimations().some((animation) => animation.effect?.getComputedTiming().iterations !== Infinity && animation.playState !== "finished")) return false;
      }
      return true;
    })).toBe(true);
}

type ChosenStart = { local: string; iso: string; dateStops: number };

async function buildOuting(page: Page, audience: PlanSpec["i"]["audience"] = "date", touch = false, chosenStart?: ChosenStart) {
  await page.goto("/plan", { waitUntil: "domcontentloaded" });
  await page.getByRole("combobox", { name: "Planning area", exact: true }).selectOption("brunswick");
  await page.getByRole("combobox", { name: "Start time", exact: true }).selectOption(chosenStart ? "custom" : "now");
  if (chosenStart) await page.getByLabel("Custom start date and time in Frederick", { exact: true }).fill(chosenStart.local);
  await activate(page.getByText("Fine-tune the outing", { exact: true }), touch);
  await page.getByRole("combobox", { name: "Who is going", exact: true }).selectOption(audience);
  await page.getByRole("combobox", { name: "What matters most", exact: true }).selectOption("easy");
  await page.getByRole("combobox", { name: "Time available", exact: true }).selectOption("3");
  await expect(page.getByRole("checkbox", { name: "Only include stops with confirmed hours", exact: true })).not.toBeChecked();
  const legacy = await readLegacy(page);
  const started = Date.now();
  await activate(page.getByRole("button", { name: "Build my plan", exact: true }), touch);
  const stops = page.getByRole("list", { name: "Plan stops, in order", exact: true });
  // Custom dayparts keep their exact fixture counts. A live start may have fewer
  // eligible stops; the token and Saved replay below must retain every actual choice.
  if (audience === "date" && chosenStart) await expect(stops.getByRole("heading")).toHaveCount(chosenStart.dateStops);
  else await expect(stops.getByRole("heading").first()).toBeVisible();
  await expect.poll(() => new URL(page.url()).searchParams.get("p")).toBeTruthy();
  const token = new URL(page.url()).searchParams.get("p")!;
  const spec = JSON.parse(Buffer.from(token, "base64url").toString("utf8")) as PlanSpec;
  expect(spec.i).toMatchObject({ audience, vibe: "easy", duration_hours: 3, municipality: "brunswick", require_verified_hours: false });
  if (chosenStart) expect(spec.i.start_at).toBe(chosenStart.iso);
  else {
    expect(Date.parse(spec.i.start_at!)).toBeGreaterThanOrEqual(started - 10_000);
    expect(Date.parse(spec.i.start_at!)).toBeLessThanOrEqual(Date.now() + 10_000);
  }
  const names = await stops.getByRole("heading").allTextContents();
  expect(names.length).toBeGreaterThan(0);
  expect(names.length).toBeLessThanOrEqual(8);
  expect(spec.s).toHaveLength(names.length);
  const title = await page.getByRole("heading", { level: 1 }).textContent();
  expect(title).toBeTruthy();
  await expect(page.getByRole("button", { name: "Save outing", exact: true })).toBeEnabled();
  await settleFirstStop(page);
  return { token, spec, names, title: title!, legacy };
}

async function expectTarget(page: Page, name: string, role: "button" | "link") {
  const control = page.getByRole(role, { name, exact: true });
  const bounds = await control.boundingBox();
  expect(bounds, name).not.toBeNull();
  expect(bounds!.height, name).toBeGreaterThanOrEqual(44);
  expect(bounds!.width, name).toBeGreaterThanOrEqual(44);
  expect(await control.evaluate((element) => {
    const rect = element.getBoundingClientRect();
    return element.contains(document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2));
  }), `${name} must be the actual center hit target`).toBe(true);
}

async function geometry(page: Page, checkHit = true) {
  const heading = page.getByRole("list", { name: "Plan stops, in order", exact: true }).getByRole("heading").first();
  const nav = await page.getByRole("navigation", { name: "Primary", exact: true }).elementHandle();
  expect(nav).not.toBeNull();
  const value = await heading.evaluate((element, navigation) => {
    const rect = element.getBoundingClientRect();
    const fixed = navigation!.getBoundingClientRect();
    const body = element.closest("article")!.firstElementChild!;
    const bodyStyle = getComputedStyle(body);
    const contentWidth = body.clientWidth - parseFloat(bodyStyle.paddingLeft) - parseFloat(bodyStyle.paddingRight);
    return { headingWidth: rect.width, contentWidth, top: rect.top, bottom: rect.bottom, documentBottom: rect.bottom + scrollY, navTop: fixed.top, scrollY,
      hit: element.contains(document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2)) };
  }, nav!);
  expect(value.top).toBeGreaterThanOrEqual(0);
  expect(value.bottom).toBeLessThanOrEqual(value.navTop);
  expect(value.documentBottom).toBeLessThanOrEqual(value.navTop);
  if (checkHit) expect(value.hit).toBe(true);
  return value;
}

async function axeAA(page: Page, info: TestInfo, phase: string) {
  const find = page.getByRole("button", { name: "Ask or find across Frederick County", exact: true });
  await expect(find).toHaveAttribute("data-find-interaction-ready", "true");
  await expect(find).toBeEnabled();
  await expect.poll(() => find.evaluate((element) => getComputedStyle(element).opacity)).toBe("1");
  await page.addScriptTag({ path: resolve("node_modules/axe-core/axe.min.js") });
  const violations = await page.evaluate(async () => (await (window as unknown as {
    axe: { run: (context: Document, options: object) => Promise<{ violations: unknown[] }> };
  }).axe.run(document, { runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"] }, resultTypes: ["violations"] })).violations);
  await info.attach(`${phase}-axe-aa`, { contentType: "application/json", body: Buffer.from(JSON.stringify(violations)) });
  expect(violations).toEqual([]);
}

// Choose real custom times through the editor. A live "now" test alone changes
// its heading at noon and can miss an extra line on the Saved return journey.
const daypartStarts = {
  morning: { local: "2026-10-12T09:00", iso: "2026-10-12T13:00:00.000Z", dateStops: 3, dateTitle: "A morning date", familyTitle: "A family morning" },
  afternoon: { local: "2026-10-12T14:00", iso: "2026-10-12T18:00:00.000Z", dateStops: 3, dateTitle: "An afternoon date", familyTitle: "A family afternoon" },
  // The real evening meal and museum consume 158 minutes; a third stop does not fit.
  evening: { local: "2026-10-12T18:00", iso: "2026-10-12T22:00:00.000Z", dateStops: 2, dateTitle: "Date night", familyTitle: "A family evening" },
} as const;
type SavedJourneyCase = {
  width: number;
  colorScheme: "light" | "dark";
  audience: PlanSpec["i"]["audience"];
  daypart?: keyof typeof daypartStarts;
};
const savedJourneyCases: SavedJourneyCase[] = [
  ...([[320, "light", "family"], [320, "dark", "date"], [390, "light", "visitor"], [1440, "dark", "solo"]] as const)
    .map(([width, colorScheme, audience]) => ({ width, colorScheme, audience })),
  ...(["family", "date"] as const).flatMap((audience) =>
    (["morning", "afternoon", "evening"] as const).map((daypart) => ({ width: 320, colorScheme: audience === "date" ? "dark" as const : "light" as const, audience, daypart }))),
];

for (const { width, colorScheme, audience, daypart } of savedJourneyCases) {
  test(`saved outing retains its actual dated choices through Saved reload and reopen at ${width}px ${colorScheme} for ${audience}${daypart ? ` with a fixed ${daypart} start` : ""}`, async ({ context }, info) => {
    test.setTimeout(90_000);
    const runtime = observe(context);
    const page = await context.newPage();
    await page.setViewportSize({ width, height: width >= 800 ? 960 : 844 });
    await page.emulateMedia({ colorScheme, reducedMotion: width >= 800 ? "reduce" : "no-preference" });
    const touch = Boolean(info.project.use.hasTouch);
    const chosenStart = daypart ? daypartStarts[daypart] : undefined;
    const outing = await buildOuting(page, audience, touch, chosenStart);
    if (chosenStart) expect(outing.title).toBe(audience === "date" ? chosenStart.dateTitle : chosenStart.familyTitle);
    const before = width < 800 ? await geometry(page) : null;
    await expectTarget(page, "Save outing", "button");
    await expectTarget(page, "Open full route", "link");
    await expect(page.getByRole("link", { name: "Open full route", exact: true })).toContainText("Route");
    const save = page.getByRole("button", { name: "Save outing", exact: true });
    if (width >= 800) { await save.focus(); await page.keyboard.press("Enter"); }
    else await activate(save, touch);
    await expect(page.getByRole("button", { name: "Remove outing from Saved", exact: true })).toHaveAttribute("aria-pressed", "true");
    const confirmation = page.locator("[data-sonner-toast]").filter({ hasText: "Saved on this device. Open this outing from Saved." });
    await expect(confirmation).toBeVisible();
    const confirmedGeometry = width < 800 ? await geometry(page, false) : null;
    if (before && confirmedGeometry) {
      expect(confirmedGeometry.documentBottom).toBe(before.documentBottom);
      expect(confirmedGeometry.navTop).toBe(before.navTop);
    }
    // The existing transient toast is a deliberate overlay, not a layout row.
    // After it exits, the unchanged heading must still be the actual hit target.
    await expect(confirmation).toHaveCount(0, { timeout: 6_000 });
    if (width < 800) await geometry(page);
    const raw = await page.evaluate((key) => localStorage.getItem(key), SAVED_OUTINGS_KEY);
    expect(JSON.parse(raw!)).toEqual([{ token: outing.token, title: outing.title, saved_at: expect.any(String) }]);
    expect(await readLegacy(page)).toEqual(outing.legacy);
    await activate(page.getByRole("link", { name: "Saved", exact: true }).filter({ visible: true }).first(), touch);
    await expect(page).toHaveURL(/\/my-radius/);
    await page.reload({ waitUntil: "domcontentloaded" });
    const section = page.getByRole("region", { name: "Saved outings", exact: true });
    await expect(section.getByRole("heading", { name: outing.title, exact: true })).toBeVisible();
    await expect(page.locator("[data-saved-empty-state]")).toHaveCount(0);
    await expect(page.getByText("1 outing on this device", { exact: true })).toBeVisible();
    await expect(section).toContainText("Draft outing · Brunswick");
    await expect(section).toContainText(`${outing.names.length} saved ${outing.names.length === 1 ? "stop" : "stops"}`);
    await expect(section).toContainText("Review current sources and venue hours before visiting.");
    const open = section.getByRole("link", { name: `Open outing: ${outing.title}`, exact: true });
    const reopen = new URL((await open.getAttribute("href"))!, page.url());
    expect(reopen.searchParams.get("p")).toBe(outing.token);
    expect(reopen.searchParams.get("returnTo")).toBe("/my-radius");
    await expectTarget(page, `Open outing: ${outing.title}`, "link");
    await expectTarget(page, `Remove outing: ${outing.title}`, "button");
    expect(await readLegacy(page)).toEqual(outing.legacy);
    await axeAA(page, info, "saved");
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: info.outputPath("saved-outing-card.png"), fullPage: true });
    await activate(open, touch);
    await expect.poll(() => new URL(page.url()).searchParams.get("p")).toBe(outing.token);
    const stops = page.getByRole("list", { name: "Plan stops, in order", exact: true });
    await expect(stops.getByRole("heading")).toHaveText(outing.names);
    await settleFirstStop(page);
    const after = width < 800 ? await geometry(page) : null;
    await expect(page.getByRole("link", { name: "Back to saved", exact: true })).toBeVisible();
    await expect(page.getByRole("link", { name: "Back to saved", exact: true })).toHaveAttribute("href", "/my-radius");
    await expectTarget(page, "Adjust", "button");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(outing.title);
    await expect(page.getByRole("button", { name: "Remove outing from Saved", exact: true })).toHaveAttribute("aria-pressed", "true");
    expect(JSON.parse(Buffer.from(new URL(page.url()).searchParams.get("p")!, "base64url").toString("utf8"))).toEqual(outing.spec);
    await axeAA(page, info, "reopened");
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: info.outputPath("saved-outing-reopened.png"), fullPage: true });
    await activate(page.getByRole("button", { name: "Adjust", exact: true }), touch);
    const editor = page.getByRole("dialog", { name: "Adjust the plan", exact: true });
    await activate(editor.getByText("Fine-tune the outing", { exact: true }), touch);
    await expect(editor.getByRole("combobox", { name: "Planning area", exact: true })).toHaveValue("brunswick");
    await expect(editor.getByRole("combobox", { name: "Who is going", exact: true })).toHaveValue(audience);
    await expect(editor.getByRole("combobox", { name: "What matters most", exact: true })).toHaveValue("easy");
    await expect(editor.getByRole("combobox", { name: "Time available", exact: true })).toHaveValue("3");
    await expect(editor.getByRole("combobox", { name: "Start time", exact: true })).toHaveValue("custom");
    if (chosenStart) await expect(editor.getByLabel("Custom start date and time in Frederick", { exact: true })).toHaveValue(chosenStart.local);
    expect(runtime.askCalls()).toBe(0);
    expect(runtime.errors).toEqual([]);
    await info.attach("saved-outing-exact-return", { contentType: "application/json", body: Buffer.from(JSON.stringify({ ...outing, before, confirmedGeometry, after, runtimeErrors: runtime.errors, consoleErrors: runtime.consoleErrors, askCalls: runtime.askCalls(), touchActions: touch, photoHealth: "not tested" }, null, 2)) });
  });
}

test("another real tab observes saving and removing the exact outing without refresh", async ({ context }, info) => {
  test.setTimeout(90_000);
  const runtime = observe(context);
  const planner = await context.newPage();
  const saved = await context.newPage();
  await planner.setViewportSize({ width: 390, height: 844 });
  await saved.setViewportSize({ width: 390, height: 844 });
  const outing = await buildOuting(planner);
  await saved.goto("/my-radius", { waitUntil: "domcontentloaded" });
  await expect(saved.locator("[data-saved-empty-state]")).toBeVisible();
  await expect(saved.getByRole("link", { name: "Plan an outing", exact: true })).toHaveAttribute("href", "/plan?returnTo=%2Fmy-radius");
  await planner.getByRole("button", { name: "Save outing", exact: true }).click();
  const open = saved.getByRole("link", { name: `Open outing: ${outing.title}`, exact: true });
  await expect(open).toBeVisible();
  expect(new URL((await open.getAttribute("href"))!, saved.url()).searchParams.get("p")).toBe(outing.token);
  const remove = saved.getByRole("button", { name: `Remove outing: ${outing.title}`, exact: true });
  await remove.focus();
  await saved.keyboard.press("Enter");
  await expect(saved.locator("[data-saved-empty-state]")).toBeVisible();
  await expect(saved.locator("#saved-page-heading")).toBeFocused();
  await expect(planner.getByRole("button", { name: "Save outing", exact: true })).toBeEnabled();
  await expect(planner.getByRole("status").filter({ hasText: "Saved on this device. Open this outing from Saved." })).toHaveCount(0);
  await expect(open).toHaveCount(0);
  expect(await planner.evaluate((key) => localStorage.getItem(key), SAVED_OUTINGS_KEY)).toBe("[]");
  expect(await readLegacy(planner)).toEqual(outing.legacy);
  expect(runtime.askCalls()).toBe(0);
  expect(runtime.errors).toEqual([]);
  await info.attach("saved-outing-native-cross-tab", { contentType: "application/json", body: Buffer.from(JSON.stringify({ token: outing.token, orderedStops: outing.names, nativeStorageEvents: true, runtimeErrors: runtime.errors, consoleErrors: runtime.consoleErrors, askCalls: runtime.askCalls() }, null, 2)) });
});
