import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { expect, test, type Page, type Route } from "@playwright/test";
import { APPEARANCE_KEY } from "../src/lib/appearance";

async function seedAppearance(page: Page, appearance: "light" | "dark") {
  // App appearance is an explicit saved choice, independent of OS emulation.
  await page.addInitScript(({ key, value }) => {
    localStorage.setItem(key, value);
  }, { key: APPEARANCE_KEY, value: appearance });
}

async function expectAppearance(page: Page, appearance: "light" | "dark") {
  await expect(page.locator("html")).toHaveAttribute("data-appearance", appearance);
  expect(await page.evaluate(() => getComputedStyle(document.documentElement).colorScheme)).toBe(appearance);
}


async function expectFirstStopClearOfNavigation(page: Page) {
  const heading = page.getByRole("list", { name: "Plan stops, in order", exact: true }).getByRole("heading").first();
  const fixedNav = await page.getByRole("navigation", { name: "Primary", exact: true }).boundingBox();
  const firstStop = await heading.boundingBox();
  expect(fixedNav).not.toBeNull();
  expect(firstStop).not.toBeNull();
  expect(firstStop!.y).toBeGreaterThanOrEqual(0);
  expect(firstStop!.y + firstStop!.height).toBeLessThanOrEqual(fixedNav!.y);
  expect(await heading.evaluate((element) => {
    const rect = element.getBoundingClientRect();
    return element.contains(document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2));
  })).toBe(true);
  return { firstStop, fixedNav };
}

for (const width of [320, 390, 430, 1440]) {
  test(`outing builder photography and editor work at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: width >= 800 ? 960 : 844 });
    await page.goto("/plan", { waitUntil: "domcontentloaded" });
    await expect(page.getByRole("heading", { name: "Plan an outing.", exact: true })).toBeVisible();
    const photo = page.getByRole("img", { name: "Carroll Creek in Frederick." });
    await expect.poll(() => photo.evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth > 1)).toBe(true);
    await expect(page.getByRole("combobox", { name: "Planning area" })).toHaveValue("county");
    const build = page.getByRole("button", { name: "Build my plan", exact: true });
    expect((await build.boundingBox())!.height).toBeGreaterThanOrEqual(44);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: `output/playwright/plan-builder-${width}.png`, fullPage: true });
  });
}

async function expectFirstStopFitsAtDocumentTop(page: Page) {
  const heading = page.getByRole("list", { name: "Plan stops, in order", exact: true }).getByRole("heading").first();
  const nav = await page.getByRole("navigation", { name: "Primary", exact: true }).elementHandle();
  expect(nav).not.toBeNull();
  const measured = await heading.evaluate((element, navigation) => {
    const stop = element.getBoundingClientRect();
    const fixed = navigation!.getBoundingClientRect();
    const target = document.elementFromPoint(stop.x + stop.width / 2, stop.y + stop.height / 2);
    return {
      scrollY,
      firstStop: { x: stop.x, y: stop.y, width: stop.width, height: stop.height, bottom: stop.bottom },
      fixedNav: { y: fixed.y, bottom: fixed.bottom },
      documentBottom: stop.bottom + scrollY,
      hit: element.contains(target),
    };
  }, nav!);
  expect(measured.firstStop.y).toBeGreaterThanOrEqual(0);
  expect(measured.firstStop.bottom).toBeLessThanOrEqual(measured.fixedNav.y);
  expect(measured.documentBottom).toBeLessThanOrEqual(measured.fixedNav.y);
  expect(measured.hit).toBe(true);
  return measured;
}

/** Controlled forecast presentation over the real plan/action response. Only
 * the optional note is supplied; canonical stops, token, times and actions stay
 * untouched. This is layout proof, not a claim about the current weather. */
async function withDeclaredRainNote(page: Page) {
  const note = "Rain is likely around 5 PM (68% chance), plan for cover between stops.";
  let injected = 0;
  await page.route((url) => url.pathname === "/plan", async (route) => {
    if (route.request().method() !== "POST" || !route.request().headers()["next-action"]) {
      await route.continue();
      return;
    }
    const response = await route.fetch();
    const body = await response.text();
    // Next's action transport sends JSON model rows among module references.
    // Require one actual Plan object; a changed protocol fails this fixture.
    const patch = (value: unknown): unknown => {
      if (!value || typeof value !== "object") return value;
      if (Array.isArray(value)) return value.map(patch);
      const object = value as Record<string, unknown>;
      if (typeof object.title === "string" && typeof object.summary === "string"
        && typeof object.share === "string" && Array.isArray(object.stops)) {
        injected++;
        return { ...object, weather_note: note };
      }
      return Object.fromEntries(Object.entries(object).map(([key, child]) => [key, patch(child)]));
    };
    const updated = body.split("\n").map((row) => {
      const start = row.indexOf(":");
      if (start < 0) return row;
      const json = row.slice(start + 1);
      if (!json.startsWith("{") && !json.startsWith("[")) return row;
      try { return `${row.slice(0, start + 1)}${JSON.stringify(patch(JSON.parse(json)))}`; }
      catch { return row; }
    }).join("\n");
    await route.fulfill({ response, body: updated });
  });
  return { note, injected: () => injected };
}

for (const [width, appearance, audience] of [[320, "light", "family"], [320, "dark", "date"], [390, "light", "visitor"]] as const) {
  test(`a declared rain warning preserves the real outing's first stop at ${width}px in ${appearance}`, async ({ page }, info) => {
    await page.setViewportSize({ width, height: 844 });
    await page.emulateMedia({ colorScheme: appearance, reducedMotion: "reduce" });
    await seedAppearance(page, appearance);
    const forecast = await withDeclaredRainNote(page);
    await page.goto("/plan", { waitUntil: "domcontentloaded" });
    await page.getByRole("combobox", { name: "Planning area", exact: true }).selectOption("brunswick");
    await page.getByRole("combobox", { name: "Start time", exact: true }).selectOption("now");
    await page.getByText("Fine-tune the outing", { exact: true }).click();
    await page.getByRole("combobox", { name: "Who is going", exact: true }).selectOption(audience);
    await page.getByRole("button", { name: "Build my plan", exact: true }).click();
    const stops = page.getByRole("list", { name: "Plan stops, in order", exact: true });
    await expect(stops.getByRole("heading").first()).toBeVisible();
    await expect(page.getByText(forecast.note, { exact: true })).toBeVisible();
    expect(forecast.injected()).toBe(1);
    await expect(page.getByText("Draft outing. These times are suggestions. Confirm each venue’s hours before setting out.", { exact: true })).toBeVisible();
    const geometry = await expectFirstStopFitsAtDocumentTop(page);
    const save = page.getByRole("button", { name: "Save outing", exact: true });
    const route = page.getByRole("link", { name: "Open full route", exact: true });
    for (const control of [save, route]) {
      await expect(control).toBeEnabled();
      const rect = await control.boundingBox();
      expect(rect!.height).toBeGreaterThanOrEqual(44);
      expect(rect!.width).toBeGreaterThanOrEqual(44);
    }
    await expectAppearance(page, appearance);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await info.attach("declared-forecast-layout-proof", { contentType: "application/json", body: JSON.stringify({ note: forecast.note, suppliedNotes: forecast.injected(), actualFirstStop: await stops.getByRole("heading").first().textContent(), ...geometry, proof: "Real app and deterministic plan with an explicitly supplied rain note; not proof of current weather." }) });
    await page.screenshot({ path: info.outputPath(`declared-rain-${width}-${appearance}.png`) });
  });
}

async function rebuildCurrentAnchoredPlan(page: Page) {
  await page.goto("/plan?place=beans-in-the-belfry-brunswick&in=brunswick", { waitUntil: "domcontentloaded" });
  const stops = page.getByRole("list", { name: "Plan stops, in order", exact: true });
  await expect(stops.getByRole("heading", { name: "Beans in the Belfry", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Pinned", exact: true })).toHaveAttribute("aria-pressed", "true");
  await page.getByRole("button", { name: "Adjust", exact: true }).click();
  const editor = page.getByRole("dialog", { name: "Adjust the plan", exact: true });
  await editor.getByRole("combobox", { name: "Start time", exact: true }).selectOption("now");
  const before = Date.now();
  await editor.getByRole("button", { name: "Update this plan", exact: true }).click();
  await expect(editor).toHaveCount(0);
  await expect.poll(() => new URL(page.url()).searchParams.get("p")).toBeTruthy();
  const token = new URL(page.url()).searchParams.get("p")!;
  const spec = JSON.parse(Buffer.from(token, "base64url").toString("utf8")) as {
    i: { start_at: string; require_verified_hours: boolean }; s: Array<{ p?: string }>;
  };
  expect(spec.s[0].p).toBe("beans-in-the-belfry-brunswick");
  expect(spec.i.require_verified_hours).toBe(false);
  expect(Date.parse(spec.i.start_at)).toBeGreaterThanOrEqual(before - 10_000);
  expect(Date.parse(spec.i.start_at)).toBeLessThanOrEqual(Date.now() + 10_000);
  return { stops, token };
}

for (const colorScheme of ["light", "dark"] as const) {
  test(`anchored current-date result keeps its first stop above navigation at 320px in ${colorScheme}`, async ({ page }, info) => {
    await page.setViewportSize({ width: 320, height: 844 });
    await page.emulateMedia({ colorScheme, reducedMotion: "no-preference" });
    await seedAppearance(page, colorScheme);
    const { stops, token } = await rebuildCurrentAnchoredPlan(page);
    const measurements = [];
    for (const phase of ["built", "reloaded"] as const) {
      if (phase === "reloaded") {
        await page.reload({ waitUntil: "domcontentloaded" });
        await expect(stops).toBeVisible();
        expect(new URL(page.url()).searchParams.get("p")).toBe(token);
      }
      await expectAppearance(page, colorScheme);
      // Measure viewport and document coordinates in one frame. Native result
      // focus may scroll, but the first stop must also fit at document top.
      measurements.push({ phase, ...await expectFirstStopFitsAtDocumentTop(page) });
      await expect(page.getByText("Beans in the Belfry is your first stop. Add saved places below or adjust the plan.", { exact: true })).toHaveCount(0);
      await expect(stops.getByRole("heading", { name: "Beans in the Belfry", exact: true })).toBeVisible();
      await expect(page.getByRole("button", { name: "Pinned", exact: true })).toHaveAttribute("aria-pressed", "true");
      await expect(stops.getByRole("button", { name: "Change", exact: true })).toBeEnabled();
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      await page.screenshot({ path: info.outputPath(`anchored-320-${colorScheme}-${phase}.png`) });
    }
    await info.attach("anchored-current-date-heading-geometry", { contentType: "application/json", body: Buffer.from(JSON.stringify(measurements)) });
  });
}

test("desktop dark anchored current-date result passes WCAG AA after rebuild and reload", async ({ page }, info) => {
  await page.setViewportSize({ width: 1440, height: 960 });
  await page.emulateMedia({ colorScheme: "dark", reducedMotion: "no-preference" });
  await seedAppearance(page, "dark");
  const { stops, token } = await rebuildCurrentAnchoredPlan(page);
  for (const phase of ["built", "reloaded"] as const) {
    if (phase === "reloaded") {
      await page.reload({ waitUntil: "domcontentloaded" });
      await expect(stops).toBeVisible();
      expect(new URL(page.url()).searchParams.get("p")).toBe(token);
    }
    await expectAppearance(page, "dark");
    const find = page.getByRole("button", { name: "Ask or find across Frederick County", exact: true });
    await expect(find).toHaveAttribute("data-find-interaction-ready", "true");
    await expect(find).toBeEnabled();
    await expect.poll(() => find.evaluate((element) => getComputedStyle(element).opacity)).toBe("1");
    await page.addScriptTag({ path: resolve("node_modules/axe-core/axe.min.js") });
    const violations = await page.evaluate(async () => {
      const axe = (window as unknown as { axe: { run: (context: Document, options: object) => Promise<{ violations: unknown[] }> } }).axe;
      return (await axe.run(document, { runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"] }, resultTypes: ["violations"] })).violations;
    });
    await info.attach(`desktop-dark-${phase}-axe`, { contentType: "application/json", body: Buffer.from(JSON.stringify(violations)) });
    expect(violations, `Actual dark ${phase} document must meet WCAG A/AA`).toEqual([]);
    await page.screenshot({ path: info.outputPath(`anchored-desktop-dark-${phase}.png`) });
  }
});

test("a visual outing keeps choices through a pre-trip check and map fallback", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/plan?place=beans-in-the-belfry-brunswick&in=brunswick", { waitUntil: "domcontentloaded" });
  const stops = page.getByRole("list", { name: "Plan stops, in order" });
  await expect(stops.getByRole("heading", { name: "Beans in the Belfry", exact: true })).toBeVisible();
  await expect(page.getByRole("img", { name: "Carroll Creek in Frederick." })).toBeVisible();
  await expectFirstStopClearOfNavigation(page);
  const before = new URL(page.url()).searchParams.get("p");
  await page.getByRole("button", { name: "Check this plan", exact: true }).click();
  await expect(page.getByText("These records do not confirm live venue availability.", { exact: false })).toBeVisible();
  await expect(stops.getByRole("heading", { name: "Beans in the Belfry", exact: true })).toBeVisible();
  expect(new URL(page.url()).searchParams.get("p")).toBe(before);
  await expect(page.getByRole("link", { name: "National Weather Service", exact: true })).toBeVisible();
  await page.screenshot({ path: "output/playwright/plan-itinerary-mobile.png", fullPage: true });
  await page.getByRole("button", { name: "Show stops on map", exact: true }).click();
  await expect(page.getByRole("region", { name: "Stops on the map", exact: true })).toBeVisible();
  await expect(page.getByText("Loading your stops map…", { exact: true })).toHaveCount(0, { timeout: 30_000 });
  const mapView = page.getByRole("region", { name: "Map of planned stop locations", exact: true });
  await expect.poll(async () => await mapView.locator("canvas").first().isVisible()
    || await mapView.getByRole("heading", { name: /^(Map view unavailable|This browser cannot draw the map|The map is temporarily unavailable)$/ }).isVisible()
    || await mapView.getByText("The map could not load. Your stops and their detail links are still here.", { exact: true }).isVisible(), { timeout: 30_000 }).toBe(true);
  await expect(page.getByRole("list", { name: "Stops shown on the map", exact: true }).getByRole("link", { name: /Beans in the Belfry/ })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: "output/playwright/plan-result-mobile.png", fullPage: true });
  await page.setViewportSize({ width: 1440, height: 960 });
  await page.getByRole("button", { name: "Hide stops map", exact: true }).click();
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({ path: "output/playwright/plan-result-desktop.png", fullPage: true });
});


test("planner motion finishes quickly and reduced motion shows the same choices", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await page.goto("/plan?place=beans-in-the-belfry-brunswick&in=brunswick", { waitUntil: "domcontentloaded" });
  const stop = page.locator("[data-plan-stop]").first();
  await expect(stop.getByRole("heading", { name: "Beans in the Belfry", exact: true })).toBeVisible();
  const normal = await stop.evaluate((element) => ({ duration: getComputedStyle(element).animationDuration, name: getComputedStyle(element).animationName }));
  expect(normal.name).not.toBe("none");
  expect(Number.parseFloat(normal.duration)).toBeLessThanOrEqual(.42);
  await expect.poll(() => stop.evaluate((element) => element.getAnimations().every((animation) => animation.playState === "finished"))).toBe(true);
  await page.emulateMedia({ reducedMotion: "reduce" });
  expect(await stop.evaluate((element) => getComputedStyle(element).animationName)).toBe("none");
  await expect(stop.getByRole("button", { name: /^(Pin|Pinned)$/ })).toBeEnabled();
  expect(await page.getByRole("img", { name: "Carroll Creek in Frederick." }).evaluate((element) => getComputedStyle(element).animationName)).toBe("none");
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});


// These journeys use the promoted place catalog and real planner server action.
// A deliberately far-future Frederick midday makes the real catalog's hours
// stale for this fixture window, even if current hours are refreshed later.
test("ordinary builder creates an honest real-catalog draft and preserves its hours choice", async ({ page }) => {
  test.setTimeout(90_000);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/plan", { waitUntil: "domcontentloaded" });
  await page.getByText("Fine-tune the outing", { exact: true }).click();
  const confirmedHours = page.getByRole("checkbox", { name: "Only include stops with confirmed hours", exact: true });
  await expect(confirmedHours).not.toBeChecked();
  expect(await confirmedHours.evaluate((input: HTMLInputElement) => input.type)).toBe("checkbox");
  await page.getByRole("combobox", { name: "Start time", exact: true }).selectOption("custom");
  await page.getByLabel("Custom start date and time in Frederick", { exact: true }).fill("2099-10-12T12:00");
  await page.getByRole("button", { name: "Build my plan", exact: true }).click();

  const stops = page.getByRole("list", { name: "Plan stops, in order", exact: true });
  await expect(stops).toBeVisible({ timeout: 30_000 });
  await expect(stops.getByText("Hours unconfirmed", { exact: true }).first()).toBeVisible();
  const route = page.getByRole("link", { name: "Open full route", exact: true });
  await expect(route).toBeVisible();
  const overview = page.locator("article").filter({ has: route });
  const draft = overview.getByText("Draft outing. These times are suggestions. Confirm each venue’s hours before setting out.", { exact: true });
  await expect(draft).toBeVisible();
  expect(await draft.evaluate((element, routeElement) => Boolean(element.compareDocumentPosition(routeElement!) & Node.DOCUMENT_POSITION_FOLLOWING), await route.elementHandle())).toBe(true);
  await expect.poll(() => new URL(page.url()).searchParams.get("p")).toBeTruthy();
  const token = new URL(page.url()).searchParams.get("p")!;
  const spec = JSON.parse(Buffer.from(token, "base64url").toString("utf8")) as { i: { require_verified_hours: boolean; start_at: string }; s: Array<{ p: string }> };
  expect(spec.i.require_verified_hours).toBe(false);
  expect(spec.i.start_at).toBe("2099-10-12T16:00:00.000Z");
  expect(spec.s.length).toBeGreaterThan(0);
  const detailHrefs = await stops.getByRole("link", { name: "Details", exact: true }).evaluateAll((links: HTMLAnchorElement[]) => links.map((link) => new URL(link.href).pathname));
  expect(detailHrefs).toEqual(spec.s.map((ref) => `/places/${ref.p}`));
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.evaluate(() => window.scrollTo(0, 0));
  await expectFirstStopClearOfNavigation(page);
  await page.screenshot({ path: "output/playwright/plan-ordinary-draft-mobile.png", fullPage: true });

  await page.reload({ waitUntil: "domcontentloaded" });
  await expect(stops).toBeVisible({ timeout: 30_000 });
  await expect(draft).toBeVisible();
  expect(new URL(page.url()).searchParams.get("p")).toBe(token);
  await page.evaluate(() => window.scrollTo(0, 0));
  await expectFirstStopClearOfNavigation(page);
  await page.getByRole("button", { name: "Adjust", exact: true }).click();
  const adjust = page.getByRole("dialog", { name: "Adjust the plan", exact: true });
  await adjust.getByText("Fine-tune the outing", { exact: true }).click();
  await expect(adjust.getByRole("checkbox", { name: "Only include stops with confirmed hours", exact: true })).not.toBeChecked();
});

test("confirmed-hours opt-in stays strict and Adjust can recover a real-catalog draft", async ({ page }) => {
  test.setTimeout(90_000);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/plan", { waitUntil: "domcontentloaded" });
  await page.getByRole("combobox", { name: "Start time", exact: true }).selectOption("custom");
  await page.getByLabel("Custom start date and time in Frederick", { exact: true }).fill("2099-10-12T12:00");
  await page.getByText("Fine-tune the outing", { exact: true }).click();
  await page.getByRole("checkbox", { name: "Only include stops with confirmed hours", exact: true }).check();
  await page.getByRole("button", { name: "Build my plan", exact: true }).click();

  await expect(page.getByRole("heading", { name: "Nothing reliable fits yet.", exact: true })).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText("Radius could not confirm venue hours for this outing. Choose Adjust, open Fine-tune the outing, and turn off confirmed hours only to build a draft. Check venue hours before setting out.", { exact: true })).toBeVisible();
  await expect(page.getByRole("list", { name: "Plan stops, in order", exact: true })).toHaveCount(0);
  await expect(page.getByRole("link", { name: "Open full route", exact: true })).toHaveCount(0);
  await expect.poll(() => new URL(page.url()).searchParams.get("p")).toBeTruthy();
  const strictToken = new URL(page.url()).searchParams.get("p")!;
  const strictSpec = JSON.parse(Buffer.from(strictToken, "base64url").toString("utf8")) as { i: { require_verified_hours: boolean }; s: unknown[] };
  expect(strictSpec.i.require_verified_hours).toBe(true);
  expect(strictSpec.s).toEqual([]);
  await page.screenshot({ path: "output/playwright/plan-confirmed-hours-empty-mobile.png", fullPage: true });

  await page.getByRole("button", { name: "Adjust", exact: true }).click();
  const adjust = page.getByRole("dialog", { name: "Adjust the plan", exact: true });
  await adjust.getByText("Fine-tune the outing", { exact: true }).click();
  const confirmedHours = adjust.getByRole("checkbox", { name: "Only include stops with confirmed hours", exact: true });
  await expect(confirmedHours).toBeChecked();
  await confirmedHours.uncheck();
  await adjust.getByRole("button", { name: "Update this plan", exact: true }).click();
  await expect(adjust).toHaveCount(0, { timeout: 30_000 });
  const stops = page.getByRole("list", { name: "Plan stops, in order", exact: true });
  await expect(stops).toBeVisible();
  await expect(stops.getByText("Hours unconfirmed", { exact: true }).first()).toBeVisible();
  await expect(page.getByText("Draft outing. These times are suggestions. Confirm each venue’s hours before setting out.", { exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: "Open full route", exact: true })).toBeVisible();
  await expect.poll(() => new URL(page.url()).searchParams.get("p")).not.toBe(strictToken);
  const draftToken = new URL(page.url()).searchParams.get("p")!;
  const draftSpec = JSON.parse(Buffer.from(draftToken, "base64url").toString("utf8")) as { i: { require_verified_hours: boolean }; s: unknown[] };
  expect(draftSpec.i.require_verified_hours).toBe(false);
  expect(draftSpec.s.length).toBeGreaterThan(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({ path: "output/playwright/plan-adjusted-draft-mobile.png", fullPage: true });
});

for (const outcome of ["loaded", "unavailable"] as const) {
  test(`Controlled local photo transport keeps the first stop reachable with delayed metadata and a ${outcome} source`, async ({ page, baseURL }, info) => {
    test.setTimeout(60_000);
    if (!baseURL || !["localhost", "127.0.0.1"].includes(new URL(baseURL).hostname)) {
      throw new Error("Controlled photo transport requires a loopback-only test app.");
    }
    await page.setViewportSize({ width: 390, height: 844 });
    const ownedPhoto = await readFile("public/images/seasons/summer/SUMMER CARROL CREEK.jpg");
    const failureSignal = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAC0lEQVR4nGNgAAIAAAUAAXpeqz8AAAAASUVORK5CYII=", "base64");
    type Metadata = { place: { slug: string; google_photo_url: string; google_photo_attribution: {
      photo_name: string; google_maps_uri: string; authors: Array<{ display_name: string }>;
    } } };
    let metadata: Metadata | undefined;
    let requestedPhotoName: string | null = null;
    let releaseMetadata!: () => void;
    let markMetadataRequested!: () => void;
    let releaseImage!: () => void;
    let markImageRequested!: () => void;
    const metadataGate = new Promise<void>((resolve) => { releaseMetadata = resolve; });
    const metadataRequested = new Promise<void>((resolve) => { markMetadataRequested = resolve; });
    const imageGate = new Promise<void>((resolve) => { releaseImage = resolve; });
    const imageRequested = new Promise<void>((resolve) => { markImageRequested = resolve; });
    await page.route("**/api/places/map-card/beans-in-the-belfry-brunswick", async (route) => {
      // Retain the real reviewed snapshot's exact photo reference and credit.
      // Delay only this bounded local read, never fabricate public attribution.
      const response = await route.fetch();
      metadata = await response.json() as Metadata;
      markMetadataRequested();
      await metadataGate;
      await route.fulfill({ response, json: metadata });
    });
    await page.route("**/api/place-photo?**", async (route) => {
      // Controlled transport evidence: use Radius-owned image bytes or the
      // existing one-pixel failure signal. No paid photo provider is called.
      requestedPhotoName = new URL(route.request().url()).searchParams.get("name");
      markImageRequested();
      await imageGate;
      await route.fulfill({ status: 200,
        contentType: outcome === "loaded" ? "image/jpeg" : "image/png",
        body: outcome === "loaded" ? ownedPhoto : failureSignal,
        headers: { "Cache-Control": "no-store", ...(outcome === "unavailable" ? { "X-Photo-Fallback": "controlled-upstream-unavailable" } : {}) },
      });
    });
    try {
      await page.goto("/plan?place=beans-in-the-belfry-brunswick&in=brunswick", { waitUntil: "domcontentloaded" });
      const stop = page.locator("[data-plan-stop]").first();
      const heading = stop.getByRole("heading", { name: "Beans in the Belfry", exact: true });
      await expect(heading).toBeVisible();
      await metadataRequested;
      await page.evaluate(() => document.fonts.ready);
      await expect.poll(() => stop.evaluate((element) => element.getAnimations().every((animation) => animation.playState === "finished"))).toBe(true);
      await page.evaluate(() => window.scrollTo(0, 0));
      expect(metadata?.place.slug).toBe("beans-in-the-belfry-brunswick");
      const credit = metadata!.place.google_photo_attribution;
      expect(new URL(metadata!.place.google_photo_url, page.url()).searchParams.get("name")).toBe(credit.photo_name);
      expect(credit.authors.length).toBeGreaterThan(0);
      expect(new URL(credit.google_maps_uri).hostname).toMatch(/(^|\.)google\.com$/);
      await expect(stop.locator("[data-plan-stop-photo]")).toHaveCount(0);
      const beforeMetadata = await expectFirstStopClearOfNavigation(page);
      releaseMetadata();
      await imageRequested;
      const photo = stop.locator("[data-plan-stop-photo] img");
      await expect(photo).toBeVisible();
      expect(requestedPhotoName).toBe(credit.photo_name);
      expect(await photo.evaluate((image: HTMLImageElement) => image.complete)).toBe(false);
      await expect(stop.getByRole("link", { name: "Google Maps", exact: true })).toHaveAttribute("href", credit.google_maps_uri);
      const duringImage = await expectFirstStopClearOfNavigation(page);
      expect(await heading.evaluate((element, image) => Boolean(element.compareDocumentPosition(image!) & Node.DOCUMENT_POSITION_FOLLOWING), await photo.elementHandle())).toBe(true);
      releaseImage();
      if (outcome === "loaded") {
        await expect.poll(() => photo.evaluate((image: HTMLImageElement) => image.complete && image.naturalWidth > 1 && image.naturalHeight > 1)).toBe(true);
        const photoRect = await photo.boundingBox();
        expect(photoRect!.width).toBeGreaterThan(150);
        expect(photoRect!.height).toBeGreaterThan(80);
        await expect(stop.getByRole("link", { name: "Google Maps", exact: true })).toHaveAttribute("href", credit.google_maps_uri);
        const sourceCredit = stop.locator("[data-inline-prose]").filter({ has: page.getByRole("link", { name: "Google Maps", exact: true }) });
        await expect(sourceCredit).toContainText("Photo by");
        await expect(sourceCredit).toContainText(credit.authors[0]!.display_name);
      } else {
        await expect(stop.locator("[data-plan-stop-photo]")).toHaveCount(0);
        await expect(stop.getByRole("link", { name: "Google Maps", exact: true })).toHaveCount(0);
      }
      const afterImage = await expectFirstStopClearOfNavigation(page);
      expect(await page.evaluate(() => scrollY)).toBe(0);
      await info.attach("first-stop-photo-lifecycle", { contentType: "application/json", body: JSON.stringify({
        evidence: "controlled-local-photo-transport-with-real-reviewed-metadata", outcome, providerRequests: 0,
        loadedImageSource: outcome === "loaded" ? "Radius-owned Carroll Creek test image" : "Existing transparent source-failure signal",
        upstreamPhotoIdentityNotVerified: true, requestedPhotoName, beforeMetadata, duringImage, afterImage,
      }, null, 2) });
      await page.screenshot({ path: info.outputPath(`first-stop-photo-${outcome}.png`), fullPage: true });
    } finally {
      releaseMetadata();
      releaseImage();
    }
  });
}


// Hold actual client chunks so the browser receives the real static preview.
// The test changes transport timing only on loopback; catalog and actions stay real.
for (const view of ["editor", "saved outing"] as const) {
  test(`Controlled local hydration protects the planner ${view} before handlers attach`, async ({ page, baseURL }, info) => {
    const hostname = new URL(baseURL!).hostname;
    if (hostname !== "localhost" && hostname !== "127.0.0.1") {
      throw new Error("The controlled hydration transport runs only on loopback.");
    }
    await page.setViewportSize({ width: 390, height: 844 });
    await page.addInitScript(() => {
      const runtime = window as Window & { planNativeTransitions?: number; planNativeTransitionAvailable?: boolean };
      runtime.planNativeTransitions = 0;
      runtime.planNativeTransitionAvailable = typeof document.startViewTransition === "function";
      const original = document.startViewTransition?.bind(document);
      if (original) document.startViewTransition = (...args: Parameters<Document["startViewTransition"]>) => {
        runtime.planNativeTransitions!++;
        return original(...args);
      };
    });
    const held = new Set<Route>();
    const heldUrls: string[] = [];
    let released = false;
    let actionRequests = 0;
    const runtimeErrors: string[] = [];
    page.on("pageerror", (error) => runtimeErrors.push(error.message));
    page.on("console", (message) => {
      if (message.type() === "error" && /hydration|server rendered|Minified React error/i.test(message.text())) runtimeErrors.push(message.text());
    });
    page.on("request", (request) => {
      if (request.method() === "POST" && new URL(request.url()).pathname === "/plan") actionRequests++;
    });
    await page.route("**/_next/static/chunks/*.js", (route) => {
      if (released) return route.continue();
      held.add(route);
      heldUrls.push(route.request().url());
    });
    const release = async () => {
      released = true;
      const pending = [...held];
      held.clear();
      await Promise.all(pending.map((route) => route.continue()));
    };
    try {
      await page.goto(view === "editor" ? "/plan" : "/plan?place=beans-in-the-belfry-brunswick&in=brunswick", { waitUntil: "commit" });
      const planner = page.locator("[data-plan-controls-ready]");
      await expect(planner).toHaveAttribute("data-plan-controls-ready", "false");
      await expect.poll(() => held.size).toBeGreaterThan(0);
      expect(await planner.locator("button, select, input").evaluateAll((controls) => controls.every((control) => control.matches(":disabled")))).toBe(true);
      if (view === "editor") {
        const start = planner.getByRole("combobox", { name: "Start time", exact: true });
        await expect(start).toBeDisabled();
        await expect(start).toHaveValue("now");
        const rect = await start.boundingBox();
        expect(rect).not.toBeNull();
        await page.mouse.click(rect!.x + rect!.width / 2, rect!.y + rect!.height / 2);
        await page.keyboard.press("ArrowDown");
        await page.keyboard.press("Enter");
        await expect(start).toHaveValue("now");
        await expect(planner.getByLabel("Custom start date and time in Frederick", { exact: true })).toHaveCount(0);
        const build = planner.getByRole("button", { name: "Build my plan", exact: true });
        await build.scrollIntoViewIfNeeded();
        const buildRect = await build.boundingBox();
        expect(buildRect).not.toBeNull();
        await page.mouse.click(buildRect!.x + buildRect!.width / 2, buildRect!.y + buildRect!.height / 2);
        expect(actionRequests).toBe(0);

        await release();
        await expect(start).toBeEnabled();
        await planner.getByRole("combobox", { name: "Planning area", exact: true }).selectOption("brunswick");
        await start.selectOption("custom");
        const custom = planner.getByLabel("Custom start date and time in Frederick", { exact: true });
        await expect(custom).toBeVisible();
        await custom.fill("2099-10-12T12:00");
        // Hold the real CSS entrance phase to prove controls remain usable
        // during motion. This loopback timing fixture does not change data.
        const pausedMotion = await page.addStyleTag({ content: "[data-plan-stop] { animation-play-state: paused !important; }" });
        await build.click();
        await expect(planner.getByRole("list", { name: "Plan stops, in order", exact: true })).toBeVisible();
        const token = new URL(page.url()).searchParams.get("p");
        expect(token).not.toBeNull();
        const spec = JSON.parse(Buffer.from(token!, "base64url").toString("utf8")) as { i: { start_at: string; municipality: string; require_verified_hours: boolean } };
        expect(spec.i).toMatchObject({ start_at: "2099-10-12T16:00:00.000Z", municipality: "brunswick", require_verified_hours: false });
        expect(actionRequests).toBe(1);
        const native = await page.evaluate(() => {
          const runtime = window as Window & { planNativeTransitions?: number; planNativeTransitionAvailable?: boolean };
          return { available: runtime.planNativeTransitionAvailable, captures: runtime.planNativeTransitions };
        });
        expect(native).toEqual({ available: true, captures: 0 });
        const firstStop = planner.locator("[data-plan-stop]").first();
        expect(await firstStop.evaluate((element) => element.getAnimations().some((animation) => animation.playState === "paused"))).toBe(true);
        await page.evaluate(() => window.scrollTo(0, 0));
        await expectFirstStopClearOfNavigation(page);
        const pin = firstStop.getByRole("button", { name: "Pin", exact: true });
        await pin.click();
        await expect(firstStop.getByRole("button", { name: "Pinned", exact: true })).toHaveAttribute("aria-pressed", "true");
        expect(actionRequests).toBe(1);
        await pausedMotion.evaluate((element) => element.parentNode?.removeChild(element));
      } else {
        const before = new URL(page.url()).searchParams.get("p");
        const pin = planner.getByRole("button", { name: "Pinned", exact: true });
        await expect(pin).toBeDisabled();
        await expect(planner.getByRole("button", { name: "Share this plan", exact: true })).toBeDisabled();
        await expect(planner.getByRole("button", { name: "Show stops on map", exact: true })).toBeDisabled();
        // A fixed navigation bar can cover an element that is inside the
        // viewport. Center the disabled SSR control, then prove this click
        // tests that control rather than an unrelated navigation tab.
        await pin.evaluate((element) => element.scrollIntoView({ block: "center", inline: "nearest" }));
        const rect = await pin.boundingBox();
        expect(rect).not.toBeNull();
        expect(await pin.evaluate((element) => {
          const bounds = element.getBoundingClientRect();
          return element.contains(document.elementFromPoint(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2));
        }), "the disabled outing button owns the actual click target").toBe(true);
        await page.mouse.click(rect!.x + rect!.width / 2, rect!.y + rect!.height / 2);
        expect(actionRequests).toBe(0);
        await expect(planner.getByRole("link", { name: "Open full route", exact: true })).toHaveAttribute("href", /google.com\/maps/);
        await release();
        await expect(pin).toBeEnabled();
        await pin.click();
        await expect(planner.getByRole("button", { name: "Pin", exact: true })).toHaveAttribute("aria-pressed", "false");
        expect(new URL(page.url()).searchParams.get("p")).toBe(before);
        expect(actionRequests).toBe(0);
      }
      await expect(planner).toHaveAttribute("data-plan-controls-ready", "true");
      expect(runtimeErrors).toEqual([]);
      await info.attach("planner-hydration-evidence", { contentType: "application/json", body: Buffer.from(JSON.stringify({ view, heldClientChunks: heldUrls.length, actionRequests, runtimeErrors }, null, 2)) });
    } finally {
      released = true;
      await Promise.allSettled([...held].map((route) => route.continue()));
    }
  });
}
