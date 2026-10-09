import { expect, test, type BrowserContext, type Page, type TestInfo } from "@playwright/test";
import type { EventWithMeta } from "../src/lib/loaders/events";
import { dismissReturnBridge, emptyReturnBridgeState, RETURN_BRIDGE_STORAGE_KEY } from "../src/lib/return-bridge";

const KEY = "fr:saved:v1";
test.use({ serviceWorkers: "block", viewport: { width: 390, height: 844 } });

type Catalog = {
  rows: Map<string, EventWithMeta>;
  fixtures: Set<string>;
};

async function isolate(context: BrowserContext, baseURL: string): Promise<Catalog> {
  const origin = new URL(baseURL);
  const catalog: Catalog = { rows: new Map(), fixtures: new Set() };
  await context.addCookies([{ name: "fr_onboarded", value: "1", domain: origin.hostname, path: "/" }]);
  await context.addInitScript(({ key, bridgeKey, bridge }) => {
    if (localStorage.getItem(key) === null) localStorage.setItem(key, "[]");
    localStorage.setItem(bridgeKey, JSON.stringify(bridge));
    localStorage.setItem("fr_map_location_intro_v1", "dismissed");
  }, { key: KEY, bridgeKey: RETURN_BRIDGE_STORAGE_KEY, bridge: dismissReturnBridge(emptyReturnBridgeState()) });
  await context.route("**/*", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    if (url.origin !== origin.origin || request.resourceType() === "image") return route.abort();
    if (url.pathname === "/api/auth/me") return route.fulfill({ json: { user: null } });
    if (request.method() === "GET" && url.pathname === "/api/events/browse" && catalog.fixtures.size > 0) {
      return route.fulfill({ json: { events: [...catalog.rows.values()], liveSlugs: [], generatedAt: new Date().toISOString(), sourceHealth: { degraded: false, unavailable: [], issues: [] } } });
    }
    const summary = /^\/api\/events\/([^/]+)\/summary$/.exec(url.pathname);
    if (request.method() === "GET" && summary && catalog.fixtures.has(decodeURIComponent(summary[1]!))) {
      return route.fulfill({ json: { event: catalog.rows.get(decodeURIComponent(summary[1]!)) } });
    }
    const savedRead = request.method() === "POST" && url.pathname === "/api/events/by-slugs";
    if (savedRead && catalog.fixtures.size > 0) {
      const body = request.postDataJSON() as { slugs: string[] };
      const events = body.slugs.map((slug) => catalog.rows.get(slug)).filter((row): row is EventWithMeta => Boolean(row));
      const resolvedSlugs = events.map((event) => event.slug);
      return route.fulfill({ json: { events, resolvedSlugs, unresolvedSlugs: body.slugs.filter((slug) => !resolvedSlugs.includes(slug)), missingSlugs: [], degraded: false } });
    }
    // Same boundary as event-save-persistence.spec.ts: only anonymous identity,
    // local event reads and the existing bounded Saved hydration POST. No
    // accounts, analytics, photos, external providers or mutation endpoints.
    const eventRead = request.method() === "GET" && (url.pathname === "/api/events/browse" || Boolean(summary));
    if (url.pathname.startsWith("/api/") && !eventRead && !savedRead) return route.abort();
    if (!["GET", "HEAD"].includes(request.method()) && !savedRead) return route.abort();
    return route.continue();
  });
  return catalog;
}

/** The local archive can advertise rows whose full source is unavailable.
 * In that case a controlled HTTP summary keeps the real board/sheet/save
 * consumers under test. This is explicitly fixture evidence, not proof that
 * an event provider resolved. No rendered control or Web Lock is substituted. */
function fixtureEvent(slug: string, index: number): EventWithMeta {
  const now = new Date();
  const starts = new Date(now.getTime() + 86_400_000);
  return {
    slug, title: `Save coordination fixture ${index}`, description: "This event is a local browser regression fixture.",
    starts_at: starts.toISOString(), ends_at: new Date(starts.getTime() + 3_600_000).toISOString(), timezone: "America/New_York",
    venue_name: "Regression fixture venue", address: "Frederick County, Maryland", geom: { lat: 39.414, lng: -77.41 },
    municipality: "frederick", municipality_name: "Frederick", category: "arts", category_name: "Arts & culture", audience: [], is_free: true,
    source: "manual", is_verified: false, source_id: `coordination-fixture:${slug}`, source_url: null, license: "Local test fixture", confidence: "curated",
    first_seen_at: now.toISOString(), last_verified_at: null, geo_confidence: "area",
  };
}

async function openEvent(page: Page, catalog: Catalog, exclude?: string) {
  await page.goto("/events?in=county", { waitUntil: "domcontentloaded" });
  await expect(page.locator("[data-events-interaction-ready]")).toHaveAttribute("data-events-interaction-ready", "true");
  const links = page.locator('main [data-decision-entity="event"] a[data-decision-action="open"]').filter({ visible: true });
  async function refreshFixtures() {
    await page.getByText("Why these results are partial", { exact: true }).click();
    const refreshed = page.waitForResponse((response) => new URL(response.url()).pathname === "/api/events/browse");
    await page.getByRole("button", { name: "Check again", exact: true }).click();
    await refreshed;
    for (const row of catalog.rows.values()) await expect(page.locator(`main [data-decision-entity="event"] a[data-decision-action="open"][href="/events/${row.slug}"]`).filter({ visible: true }).first()).toBeVisible();
  }
  if (catalog.fixtures.size > 0) await refreshFixtures();
  await expect(links.first()).toBeVisible();
  let hrefs = [...new Set(await links.evaluateAll((elements) => elements.map((element) => element.getAttribute("href")!)))];
  if (hrefs.length < 2 && catalog.fixtures.size === 0) {
    // The guarded preview currently supplies one curated row. Ask the real
    // board to refresh a complete, explicitly synthetic two-event response.
    for (const [index, slug] of ["coordination-fixture-first", "coordination-fixture-second"].entries()) {
      const event = fixtureEvent(slug, index + 1);
      catalog.rows.set(slug, event);
      catalog.fixtures.add(slug);
    }
    await refreshFixtures();
    hrefs = [...new Set(await links.evaluateAll((elements) => elements.map((element) => element.getAttribute("href")!)))];
  }
  const candidates = hrefs.map((href) => ({ href, slug: new URL(href, page.url()).pathname.replace("/events/", "") })).filter((candidate) => candidate.slug !== exclude).slice(0, 12);
  expect(candidates.length, "Two distinct rendered event IDs are needed for this regression").toBeGreaterThan(0);
  let selected: { href: string; slug: string; event: EventWithMeta } | undefined;
  for (const candidate of candidates) {
    const event = await page.evaluate(async (slug): Promise<EventWithMeta | null> => {
      const response = await fetch(`/api/events/${encodeURIComponent(slug)}/summary`);
      if (!response.ok) return null;
      const body = await response.json() as { event?: EventWithMeta };
      return body.event?.slug === slug ? body.event : null;
    }, candidate.slug);
    if (event) { selected = { ...candidate, event }; break; }
  }
  if (!selected) {
    const candidate = candidates[0]!;
    const event = fixtureEvent(candidate.slug, catalog.fixtures.size + 1);
    catalog.fixtures.add(event.slug);
    selected = { ...candidate, event };
  }
  catalog.rows.set(selected.slug, selected.event);
  const trigger = page.locator(`main [data-decision-entity="event"] a[data-decision-action="open"][href=${JSON.stringify(selected.href)}]`).filter({ visible: true }).first();
  await trigger.click();
  const dialog = page.getByRole("dialog", { name: selected.event.title, exact: true });
  await expect(dialog).toBeVisible();
  const button = dialog.locator(`[data-save-ref="event:${selected.slug}"]`).filter({ visible: true });
  await expect(button).toBeEnabled();
  await expect(button).toHaveAttribute("aria-pressed", "false");
  return { slug: selected.slug, title: selected.event.title, dialog, button };
}

async function record(info: TestInfo, catalog: Catalog, evidence: object) {
  await info.attach("saved-coordination-evidence", { contentType: "application/json", body: Buffer.from(JSON.stringify({ catalogEvidence: catalog.fixtures.size ? "controlled-local-http-fixture" : "real-local-archive", fixtureSlugs: [...catalog.fixtures], ...evidence }, null, 2)) });
}

test("two real rendered saves queue behind one native cross-tab lock and both survive reload", async ({ page, context, baseURL }, info) => {
  test.setTimeout(120_000);
  const catalog = await isolate(context, baseURL!);
  const first = await openEvent(page, catalog);
  const other = await context.newPage();
  const second = await openEvent(other, catalog, first.slug);
  expect(first.slug).not.toBe(second.slug);
  const holder = await context.newPage();
  await holder.goto("/events?in=county", { waitUntil: "domcontentloaded" });
  await holder.evaluate(async (key) => {
    const state = window as Window & { releaseSavedLock?: () => void; savedLockFinished?: Promise<void> };
    let entered!: () => void;
    const ready = new Promise<void>((resolve) => { entered = resolve; });
    // lib.dom models the callback's Promise as T; normalize its awaited
    // completion without changing the native lock request or held interval.
    state.savedLockFinished = Promise.resolve(navigator.locks.request(key, async () => {
      entered();
      await new Promise<void>((resolve) => { state.releaseSavedLock = resolve; });
    }));
    await ready;
  }, KEY);
  try {
    await Promise.all([first.button.click(), second.button.click()]);
    for (const event of [first, second]) {
      await expect(event.button).toHaveAttribute("aria-busy", "true");
      await expect(event.button).toHaveAttribute("aria-pressed", "false");
      await expect(event.button).toBeDisabled();
    }
    expect(await page.evaluate((key) => localStorage.getItem(key), KEY)).toBe("[]");
    await expect(page.getByText(`Saved · ${first.title}`, { exact: true })).toHaveCount(0);
    await expect(other.getByText(`Saved · ${second.title}`, { exact: true })).toHaveCount(0);
    await expect.poll(async () => holder.evaluate(async (key) => (await navigator.locks.query()).pending?.filter((lock) => lock.name === key).length, KEY)).toBe(2);
    const locked = await holder.evaluate(() => navigator.locks.query());
    expect(locked.held?.filter((lock) => lock.name === KEY)).toHaveLength(1);
    await holder.evaluate(async () => {
      const state = window as Window & { releaseSavedLock?: () => void; savedLockFinished?: Promise<void> };
      state.releaseSavedLock!();
      await state.savedLockFinished;
    });
    for (const event of [first, second]) {
      await expect(event.button).toHaveAttribute("aria-pressed", "true");
      await expect(event.button).toBeEnabled();
    }
    const committed = await page.evaluate((key) => localStorage.getItem(key), KEY);
    const rows = JSON.parse(committed!) as Array<{ type: string; id: string; saved_at: string }>;
    expect(rows).toHaveLength(2);
    expect(rows.map((row) => row.id).sort()).toEqual([first.slug, second.slug].sort());
    expect(rows.every((row) => row.type === "event" && Number.isFinite(Date.parse(row.saved_at)))).toBe(true);
    for (const tab of [page, other]) {
      await tab.keyboard.press("Escape");
      await expect(tab.getByRole("dialog")).toHaveCount(0);
      await tab.getByRole("link", { name: "Saved", exact: true }).filter({ visible: true }).first().click();
      await expect(tab).toHaveURL(/\/my-radius/);
      await tab.reload({ waitUntil: "domcontentloaded" });
      for (const slug of [first.slug, second.slug]) await expect(tab.locator(`[id="swe-slot-${slug}"]`)).toBeVisible();
      expect(await tab.evaluate((key) => localStorage.getItem(key), KEY)).toBe(committed);
    }
    await record(info, catalog, { nativeLocks: true, locked, queuedControls: 2, savedAfterReload: rows, reloadedTabs: 2 });
  } finally {
    await holder.close();
  }
});

test("unsupported coordination keeps readable saves and reports a refused new change", async ({ page, context, baseURL }, info) => {
  test.setTimeout(120_000);
  const catalog = await isolate(context, baseURL!);
  const first = await openEvent(page, catalog);
  await first.button.click();
  await expect(first.button).toHaveAttribute("aria-pressed", "true");
  const before = await page.evaluate((key) => localStorage.getItem(key), KEY);
  await page.keyboard.press("Escape");
  const second = await openEvent(page, catalog, first.slug);
  await page.evaluate(() => Object.defineProperty(navigator, "locks", { configurable: true, value: undefined }));
  await second.button.click();
  await expect(second.button).toHaveAttribute("aria-pressed", "false");
  await expect(second.button).toBeEnabled();
  await expect(page.getByText("Could not save this event", { exact: true })).toBeVisible();
  await expect(page.getByText("This browser cannot safely coordinate Saved changes. Try a current browser.", { exact: true })).toBeVisible();
  await expect(page.getByText(`Saved · ${second.title}`, { exact: true })).toHaveCount(0);
  expect(await page.evaluate((key) => localStorage.getItem(key), KEY)).toBe(before);
  await page.keyboard.press("Escape");
  await page.getByRole("link", { name: "Saved", exact: true }).filter({ visible: true }).first().click();
  await expect(page.locator(`[id="swe-slot-${first.slug}"]`)).toBeVisible();
  await page.reload({ waitUntil: "domcontentloaded" });
  await expect(page.locator(`[id="swe-slot-${first.slug}"]`)).toBeVisible();
  expect(await page.evaluate((key) => localStorage.getItem(key), KEY)).toBe(before);
  await record(info, catalog, { unsupportedCoordination: true, originalSaveAfterReload: JSON.parse(before!), noNewSave: second.slug });
});
