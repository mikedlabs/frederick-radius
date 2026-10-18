import { resolve } from "node:path";
import { writeFile } from "node:fs/promises";
import { expect, test, type BrowserContext, type Locator, type Page, type TestInfo } from "@playwright/test";
import type { EventWithMeta } from "../src/lib/loaders/events";
import { eventCardVisual } from "../src/components/event/eventVisuals";
import { dismissReturnBridge, emptyReturnBridgeState, RETURN_BRIDGE_STORAGE_KEY } from "../src/lib/return-bridge";

/**
 * Two deliberately different proof modes share the real production components.
 * Default: declared fictional HTTP DTOs exercise narrow screens and device state
 * without credentials, provider calls, or an injected success detail document.
 * PW_VISUAL_DISCOVERY_LIVE=1: no event DTO is replaced. A currently published,
 * illustrated event must complete the actual detail / Saved / directions loop.
 * A local fixture pass is never evidence that the production catalog is current.
 */
const LIVE = process.env.PW_VISUAL_DISCOVERY_LIVE === "1";
const SAVED_KEY = "fr:saved:v1";
const FAIR_VENUE = "frederick-fairgrounds-home-of-the-great-frederick-fair-frederick";
const FAIR_IMAGE = "/images/fair/fairgrounds-night-mike-d-1920.jpg";
const MCCURDY_IMAGE = "/images/seasons/spring/aerial-view-baseball-field.jpg";
const TODAY_PATH = "/today?in=frederick";
const EVENTS_PATH = "/events?in=frederick&lens=today";

test.use({ isMobile: true, hasTouch: true, serviceWorkers: "block" });

type RuntimeEvidence = { errors: string[]; consoleErrors: string[]; failedRequests: Array<{ url: string; error: string | null }>; blocked: string[]; eventReads: string[]; savedReads: number; todayReads: number; todayScopes: Array<string | null>; localHttpCspAdjusted: boolean };
const runtimeByPage = new WeakMap<Page, RuntimeEvidence>();

test.afterEach(async ({ page }, info) => {
  const evidence = runtimeByPage.get(page);
  if (!evidence) return;
  const path = info.outputPath("browser-runtime.json");
  await writeFile(path, JSON.stringify(evidence, null, 2));
  await info.attach("browser-runtime", { path, contentType: "application/json" });
});

function offlineEvents(): EventWithMeta[] {
  const instant = Date.now();
  const firstSeen = new Date(instant - 86_400_000).toISOString();
  const verified = new Date(instant).toISOString();
  const event = (slug: string, title: string, venue: string, place: string, category: string, offset: number): EventWithMeta => ({
    slug, title, description: "Declared fictional mobile acceptance fixture. This is not a public event listing.",
    starts_at: new Date(instant - 15 * 60_000 + offset).toISOString(), ends_at: new Date(instant + 3 * 3_600_000 + offset).toISOString(),
    timezone: "America/New_York", venue_name: venue, venue_place_slug: place, address: "Fictional event at a real venue for component acceptance only",
    geom: { lat: 39.407, lng: -77.4 }, municipality: "frederick", municipality_name: "Frederick",
    category, category_name: category === "arts" ? "Arts & culture" : "Sports & recreation", audience: [], is_free: false,
    price_text: "$12 fixture admission", attendance_mode: "physical", geo_confidence: "venue_match", source: "manual",
    source_id: slug, source_url: `https://example.test/declared-offline-fixtures/${slug}`, confidence: "curated",
    license: "Fictional test facts only; existing owned photographs identify their real venues.", first_seen_at: firstSeen, last_verified_at: verified,
    is_verified: true, status: "scheduled",
  });
  return [
    event("offline-discovery-fairgrounds", "Offline layout fixture at the Fairgrounds", "Frederick Fairgrounds", FAIR_VENUE, "arts", 0),
    event("offline-discovery-mccurdy", "Offline layout fixture at McCurdy Field", "McCurdy Field", "mccurdy-field", "sports", 60_000),
    // Earlier low-quality venue evidence must not take the prime visual slot.
    { ...event("offline-discovery-generic", "Offline broad-location fixture", "Frederick County", "", "arts", -60_000), geom: { lat: 39.4, lng: -77.4 }, geo_confidence: "area" },
  ];
}

async function prepare(context: BrowserContext, page: Page, baseURL: string | undefined, fixtures?: EventWithMeta[], imageFailure = false) {
  const origin = new URL(process.env.PW_VISUAL_DISCOVERY_ORIGIN ?? baseURL ?? "http://localhost:3010");
  const evidence: RuntimeEvidence = { errors: [], consoleErrors: [], failedRequests: [], blocked: [], eventReads: [], savedReads: 0, todayReads: 0, todayScopes: [], localHttpCspAdjusted: false };
  const localWebKit = !LIVE && context.browser()?.browserType().name() === "webkit"
    && origin.protocol === "http:" && ["localhost", "127.0.0.1", "[::1]"].includes(origin.hostname);
  runtimeByPage.set(page, evidence);
  const observe = (opened: Page) => {
    opened.on("pageerror", (error) => evidence.errors.push(error.message));
    opened.on("console", (message) => { if (message.type() === "error") evidence.consoleErrors.push(message.text()); });
  };
  context.on("page", observe);
  observe(page);
  context.on("requestfailed", (request) => { const url = new URL(request.url()); evidence.failedRequests.push({ url: `${url.origin}${url.pathname}`, error: request.failure()?.errorText ?? null }); });
  await context.addCookies([{ name: "fr_onboarded", value: "1", domain: origin.hostname, path: "/" }]);
  await context.addInitScript(({ key, bridge }) => {
    if (localStorage.getItem("fr:saved:v1") === null) localStorage.setItem("fr:saved:v1", "[]");
    localStorage.setItem("fr_map_location_intro_v1", "dismissed");
    localStorage.setItem(key, JSON.stringify(bridge));
  }, { key: RETURN_BRIDGE_STORAGE_KEY, bridge: dismissReturnBridge(emptyReturnBridgeState()) });
  await context.route("**/*", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    if (url.origin !== origin.origin) { evidence.blocked.push(`${request.method()} ${url.origin}${url.pathname}`); return route.abort(); }
    if (localWebKit && request.isNavigationRequest() && request.resourceType() === "document") {
      // WebKit upgrades local HTTP scripts to unavailable HTTPS even with
      // bypassCSP. The startup trace establishes this transport-only failure.
      // Retain the real HTML and every other directive. Live HTTPS tests never
      // enter this branch, and production security configuration is unchanged.
      const response = await route.fetch();
      const headers = response.headers();
      if (headers["content-security-policy"]) {
        const directives = headers["content-security-policy"].split(";");
        headers["content-security-policy"] = directives.filter((directive) => directive.trim().toLowerCase() !== "upgrade-insecure-requests").join(";");
        evidence.localHttpCspAdjusted ||= directives.length !== headers["content-security-policy"].split(";").length;
      }
      return route.fulfill({ response, headers });
    }
    if (url.pathname === "/api/auth/me") return route.fulfill({ status: 200, json: { user: null } });
    if (request.resourceType() === "image") {
      const imagePath = url.pathname === "/_next/image" ? url.searchParams.get("url") ?? "" : url.pathname;
      if (imageFailure && [FAIR_IMAGE, MCCURDY_IMAGE].includes(imagePath)) return route.abort();
      // Only bundled bytes decode in fixture mode. No Google/Mapbox photo proxy
      // or external source is requested simply to verify a layout.
      if (!["/images/", "/place-photos/", "/history-photos/", "/brand/", "/icons/"].some((prefix) => imagePath.startsWith(prefix))) return route.abort();
      return route.continue();
    }
    const summary = /^\/api\/events\/([^/]+)\/summary$/.exec(url.pathname);
    if (request.method() === "GET" && summary) {
      evidence.eventReads.push(decodeURIComponent(summary[1]));
      if (fixtures) return route.fulfill({ status: 200, json: { event: fixtures.find((event) => event.slug === decodeURIComponent(summary[1])) ?? null } });
      return route.continue();
    }
    if (request.method() === "GET" && url.pathname === "/api/events/browse") {
      if (fixtures) return route.fulfill({ status: 200, json: { events: fixtures, liveSlugs: fixtures.map((event) => event.slug), generatedAt: new Date().toISOString(), sourceHealth: { degraded: false, issues: [] } } });
      return route.continue();
    }
    if (request.method() === "GET" && url.pathname === "/api/today/events") {
      evidence.todayReads += 1;
      evidence.todayScopes.push(url.searchParams.get("in"));
      if (fixtures) return route.fulfill({ status: 200, json: { partial: false, events: fixtures.slice(0, 2).map((event) => ({
        slug: event.slug, title: event.title, venue: event.venue_name, municipality: event.municipality,
        time: new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", hour: "numeric", minute: "2-digit" }).format(new Date(event.starts_at)),
        endTime: new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", hour: "numeric", minute: "2-digit" }).format(new Date(event.ends_at)),
        price: event.price_text, moment: "Now", image: null, free: false,
        visual: eventCardVisual(event, { venuePhotos: "free-reviewed" }),
      })) } });
      return route.continue();
    }
    const savedRead = request.method() === "POST" && url.pathname === "/api/events/by-slugs";
    if (savedRead) {
      evidence.savedReads += 1;
      if (fixtures) {
        const slugs = (request.postDataJSON() as { slugs?: string[] }).slugs ?? [];
        const events = fixtures.filter((event) => slugs.includes(event.slug));
        return route.fulfill({ status: 200, json: { events, resolvedSlugs: events.map((event) => event.slug), unresolvedSlugs: [], missingSlugs: slugs.filter((slug) => !events.some((event) => event.slug === slug)), degraded: false } });
      }
      return route.continue();
    }
    // A read-only unavailable response exercises the app's honest failure
    // state. WebKit can surface an aborted same-origin fetch as a page-level
    // access-control exception even when the application catches rejection.
    if (!LIVE && url.pathname.startsWith("/api/") && request.method() === "GET") {
      return route.fulfill({ status: 503, json: { error: "Declared unavailable read in mobile acceptance" } });
    }
    if (url.pathname.startsWith("/api/") || !["GET", "HEAD"].includes(request.method())) return route.abort();
    return route.continue();
  });
  return { evidence, origin, goto: (path: string) => page.goto(new URL(path, origin).href, { waitUntil: "domcontentloaded" }) };
}

async function assertPageWidth(page: Page) {
  const widths = await page.evaluate(() => ({ viewport: innerWidth, body: document.body.scrollWidth, document: document.documentElement.scrollWidth }));
  expect(widths.body, "body must not horizontally overflow").toBeLessThanOrEqual(widths.viewport + 1);
  expect(widths.document, "document must not horizontally overflow").toBeLessThanOrEqual(widths.viewport + 1);
  return widths;
}

async function nativeTarget(control: Locator) {
  await control.scrollIntoViewIfNeeded();
  let lastProbe: unknown;
  try {
  await expect.poll(async () => {
    const probe = await control.evaluate((node) => {
    const rect = node.getBoundingClientRect();
    const x = rect.x + rect.width / 2, y = rect.y + rect.height / 2;
    const hit = document.elementFromPoint(x, y);
    // .tap-44 may extend a 36px icon face. Check its real pseudo-element size,
    // then test physical ownership one pixel inside the 44px target. A half-
    // pixel sample at x=311.5 was rounded into the adjacent control at x=312
    // even though Agenda's measured target was exactly 44px (x=268..312).
    const after = getComputedStyle(node, "::after");
    const extendsTarget = after.content !== "none" && after.pointerEvents !== "none" && after.position === "absolute";
    const effectiveWidth = Math.max(rect.width, extendsTarget ? parseFloat(after.width) || 0 : 0);
    const effectiveHeight = Math.max(rect.height, extendsTarget ? parseFloat(after.height) || 0 : 0);
    const largeEnough = Math.round(effectiveWidth * 100) / 100 >= 44 && Math.round(effectiveHeight * 100) / 100 >= 44;
    const points = [[x, y], [x - 21, y], [x + 21, y], [x, y - 21], [x, y + 21]];
    const hits = points.map(([px, py]) => {
      const owner = document.elementFromPoint(px, py);
      return px >= 0 && py >= 0 && px < innerWidth && py < innerHeight && owner !== null && node.contains(owner);
    });
    return { name: node.getAttribute("aria-label"), bounds: { x: rect.x, y: rect.y, width: rect.width, height: rect.height }, effectiveWidth, effectiveHeight, viewport: { width: innerWidth, height: innerHeight }, hits,
      hitOwners: points.map(([px, py]) => { const owner = document.elementFromPoint(px, py); return owner ? { tag: owner.tagName, class: owner.getAttribute("class"), label: owner.getAttribute("aria-label") } : null; }), ready: largeEnough && Boolean(hit && node.contains(hit)) && hits.every(Boolean) };
    });
    lastProbe = probe;
    return probe.ready;
  }, { message: "The real 44px target must be unobscured by the sticky header, another card, or fixed tabs" }).toBe(true);
  } catch (error) {
    await writeFile(test.info().outputPath("unreachable-target-probe.json"), JSON.stringify(lastProbe, null, 2));
    await test.info().attach("unreachable-target-probe", { contentType: "application/json", body: JSON.stringify(lastProbe, null, 2) });
    await control.page().screenshot({ path: test.info().outputPath("unreachable-target.png"), fullPage: false });
    throw error;
  }
}

async function decodedOwnedPhoto(shortlist: Locator, src: string) {
  const images = shortlist.locator("img").filter({ visible: true });
  const indexOfSource = () => images.evaluateAll((nodes, expected) => nodes.findIndex((node) => {
    const photo = node as HTMLImageElement;
    const url = new URL(photo.currentSrc || photo.src, document.baseURI);
    return decodeURIComponent(url.searchParams.get("url") ?? url.pathname) === expected;
  }), src);
  await expect.poll(indexOfSource, { message: `The real discovery surface must contain the expected matched image: ${src}` }).toBeGreaterThanOrEqual(0);
  const image = images.nth(await indexOfSource());
  await expect(image).toBeVisible();
  // The photograph intentionally pans slowly. Scroll its stable card rather
  // than waiting for the decorative image transform to stop animating.
  await image.locator("xpath=ancestor::article[1]").scrollIntoViewIfNeeded();
  await expect.poll(() => image.evaluate(async (node) => {
    const photo = node as HTMLImageElement;
    await photo.decode().catch(() => undefined);
    return photo.isConnected && photo.complete && photo.naturalWidth > 1 && photo.naturalHeight > 1;
  })).toBe(true);
  const actual = await image.evaluate((node) => {
    const photo = node as HTMLImageElement;
    const url = new URL(photo.currentSrc || photo.src, document.baseURI);
    return decodeURIComponent(url.searchParams.get("url") ?? url.pathname);
  });
  expect(actual).toBe(src);
  return image;
}

async function aa(shortlist: Locator, page: Page) {
  await page.addScriptTag({ path: resolve("node_modules/axe-core/axe.min.js") });
  const violations = await shortlist.evaluate(async (node) => {
    const axe = (window as unknown as { axe: { run: (context: Element, options: object) => Promise<{ violations: unknown[] }> } }).axe;
    return (await axe.run(node, { runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"] }, resultTypes: ["violations"] })).violations;
  });
  expect(violations).toEqual([]);
}

async function screen(page: Page, info: TestInfo, name: string) {
  const path = info.outputPath(`${name}.png`);
  await page.screenshot({ path, fullPage: false });
  await info.attach(name, { path, contentType: "image/png" });
}

async function eventDisplay(page: Page, name: "Agenda" | "List") {
  const control = page.getByRole("button", { name: `${name} view`, exact: true }).filter({ visible: true });
  if (await control.count() === 0) await page.locator('summary[aria-label^="Change event display."]').tap();
  const visible = page.getByRole("button", { name: `${name} view`, exact: true }).filter({ visible: true });
  await nativeTarget(visible);
  await visible.tap();
  await expect(page.getByRole("dialog", { name: "Event filters", exact: true })).toHaveCount(0);
}

if (!LIVE) {
  for (const width of [390, 320]) {
    test(`declared fixture: Today photo choices save and return without losing scope at ${width}px${width === 320 ? " and 200% text" : ""}`, async ({ page, context, baseURL }, info) => {
      test.setTimeout(90_000);
      await page.setViewportSize({ width, height: 844 });
      const events = offlineEvents();
      const { evidence, goto } = await prepare(context, page, baseURL, events);
      await goto(TODAY_PATH);
      const shortlist = page.locator("[data-today-event-shortlist]");
      await expect(shortlist).toContainText(events[0].title);
      expect(evidence.todayReads, "The synthetic event comes through the actual scoped recovery API, not replacement HTML").toBeGreaterThan(0);
      expect(evidence.todayScopes).toContain("frederick");
      await decodedOwnedPhoto(shortlist, FAIR_IMAGE);
      const trigger = shortlist.locator(`a[href="/events/${events[0].slug}"]`).first();
      const normalText = await trigger.evaluate((node) => parseFloat(getComputedStyle(node.querySelector("h3") ?? node).fontSize));
      if (width === 320) {
        await page.addStyleTag({ content: "html { font-size: 200% !important; }" });
        expect(await trigger.evaluate((node) => parseFloat(getComputedStyle(node.querySelector("h3") ?? node).fontSize)) / normalText).toBeCloseTo(2, 2);
      }
      await assertPageWidth(page);
      await nativeTarget(trigger);
      const origin = new URL(page.url());
      const before = await page.evaluate(() => scrollY);
      await screen(page, info, "today-visual-shortlist");
      await trigger.tap();
      const dialog = page.getByRole("dialog", { name: events[0].title, exact: true });
      await expect(dialog).toBeVisible();
      await expect(page.getByRole("dialog")).toHaveCount(1);
      await page.goBack();
      await expect(dialog).toHaveCount(0);
      await expect(trigger).toBeFocused();
      expect(new URL(page.url()).search).toBe(origin.search);
      await expect.poll(() => page.evaluate((position) => Math.abs(scrollY - position), before)).toBeLessThan(80);
      await trigger.tap();
      const save = dialog.locator(`[data-save-ref="event:${events[0].slug}"]`);
      await expect(save).toBeEnabled();
      await nativeTarget(save);
      await save.tap();
      await expect(save).toHaveAttribute("aria-pressed", "true");
      const committed = await page.evaluate((key) => localStorage.getItem(key), SAVED_KEY);
      expect(JSON.parse(committed!)).toEqual([{ type: "event", id: events[0].slug, saved_at: expect.any(String) }]);
      const full = dialog.getByRole("link", { name: "See full page", exact: true });
      const fullHref = new URL((await full.getAttribute("href"))!, page.url());
      expect(fullHref.pathname).toBe(`/events/${events[0].slug}`);
      expect(fullHref.searchParams.get("returnTo")).toBe(`${origin.pathname}${origin.search}`);
      // Fictional DTOs cannot resolve the real server's detail loader. Preserve
      // this honest boundary: live mode below must navigate the actual page.
      await page.goBack();
      await expect(dialog).toHaveCount(0);
      await page.getByRole("navigation", { name: "Primary", exact: true }).filter({ visible: true }).getByRole("link", { name: "Saved", exact: true }).tap();
      await expect(page).toHaveURL(/\/my-radius/);
      const saved = page.locator(`[id="swe-slot-${events[0].slug}"]`);
      await expect(saved).toContainText(events[0].title);
      expect(evidence.savedReads).toBeGreaterThan(0);
      await page.reload({ waitUntil: "domcontentloaded" });
      await expect(saved).toContainText(events[0].title);
      expect(await page.evaluate((key) => localStorage.getItem(key), SAVED_KEY)).toBe(committed);
      const savedHref = new URL((await saved.locator('a[href^="/events/"]').first().getAttribute("href"))!, page.url());
      expect(savedHref.pathname).toBe(`/events/${events[0].slug}`);
      expect(savedHref.searchParams.get("returnTo")).toBe("/my-radius");
      await assertPageWidth(page);
      await screen(page, info, "saved-exact-event");
      expect(evidence.errors).toEqual([]);
      await info.attach("declared-fixture-proof-boundary", { contentType: "application/json", body: JSON.stringify({ fixture: true, fullPageSSRExercised: false, browserProviderCallsAllowed: false, serverProviderBehavior: "Not established by the browser network guard", width, enlarged: width === 320, savedSlug: events[0].slug, returnTo: fullHref.searchParams.get("returnTo"), ...evidence }) });
    });
  }

  test("declared fixture: Recommended retains the same town and time through Agenda and back", async ({ page, context, baseURL }, info) => {
    test.setTimeout(90_000);
    await page.setViewportSize({ width: 390, height: 844 });
    const events = offlineEvents();
    const { evidence, goto } = await prepare(context, page, baseURL, events);
    await goto(EVENTS_PATH);
    await expect(page.locator("[data-events-interaction-ready]")).toHaveAttribute("data-events-interaction-ready", "true");
    const shortlist = page.locator("[data-events-visual-shortlist]");
    const discovery = page.locator("[data-events-personalized-view]");
    await expect(shortlist).toContainText(events[0].title);
    await expect(discovery).toContainText(events[1].title);
    await expect(shortlist).not.toContainText(events[2].title);
    await decodedOwnedPhoto(discovery, FAIR_IMAGE);
    await decodedOwnedPhoto(discovery, MCCURDY_IMAGE);
    const recommended = await discovery.locator('a[href^="/events/"]').evaluateAll((nodes) => nodes.map((node) => node.getAttribute("href")));
    expect(new Set(recommended).size).toBe(recommended.length);
    const paramsBefore = new URL(page.url()).searchParams;
    expect(paramsBefore.get("in")).toBe("frederick");
    expect(paramsBefore.get("lens")).toBe("today");
    await aa(shortlist, page);
    await screen(page, info, "events-visual-recommendations");
    await eventDisplay(page, "Agenda");
    await expect(shortlist).toHaveCount(0);
    await expect(page.locator(`main a[href="/events/${events[0].slug}"]`).first()).toBeVisible();
    expect(new URL(page.url()).searchParams.get("in")).toBe("frederick");
    expect(new URL(page.url()).searchParams.get("lens")).toBe("today");
    await eventDisplay(page, "List");
    await expect(shortlist).toContainText(events[0].title);
    expect(await discovery.locator('a[href^="/events/"]').evaluateAll((nodes) => nodes.map((node) => node.getAttribute("href")))).toEqual(recommended);
    expect(new URL(page.url()).searchParams.get("in")).toBe("frederick");
    expect(new URL(page.url()).searchParams.get("lens")).toBe("today");
    const beforeCalendar = new URL(page.url()).pathname + new URL(page.url()).search;
    await expect(page.locator("[data-pulse-indicator]")).toHaveAttribute("data-pulse-state", "unavailable");
    // This narrow direct-document check must not cancel unrelated Next
    // prefetches in WebKit. UI readiness above still uses real DOM assertions.
    await page.waitForLoadState("networkidle", { timeout: 10_000 });
    // This is direct navigation to the monthly route, not proof of a visible
    // calendar entry point. Its real page and browser Back must retain the
    // prior Recommendations state without a fabricated calendar document.
    await goto("/events/calendar");
    await expect(page.getByRole("heading", { name: "Events calendar", exact: true })).toBeVisible();
    // The unavailable status is a real 503 fixture state. Wait for this
    // document's hydration before leaving, rather than aborting an unrelated
    // intercepted status fetch in WebKit during the direct Back check.
    await expect(page.locator("[data-pulse-indicator]")).toHaveAttribute("data-pulse-state", "unavailable");
    await page.waitForLoadState("networkidle", { timeout: 10_000 });
    await page.goBack();
    await expect(page.locator("[data-events-interaction-ready]")).toHaveAttribute("data-events-interaction-ready", "true");
    expect(new URL(page.url()).pathname + new URL(page.url()).search).toBe(beforeCalendar);
    await expect(shortlist).toContainText(events[0].title);
    expect(await discovery.locator('a[href^="/events/"]').evaluateAll((nodes) => nodes.map((node) => node.getAttribute("href")))).toEqual(recommended);
    await assertPageWidth(page);
    expect(evidence.errors).toEqual([]);
    await info.attach("recommendations-roundtrip", { contentType: "application/json", body: JSON.stringify({ fixture: true, recommended, query: new URL(page.url()).search, ...evidence }) });
  });

  test("declared fixture: failed venue images keep useful facts, event details and Save at 320px with 200% text", async ({ page, context, baseURL }, info) => {
    test.setTimeout(90_000);
    await page.setViewportSize({ width: 320, height: 844 });
    const events = offlineEvents();
    const { evidence, goto } = await prepare(context, page, baseURL, events, true);
    await goto(TODAY_PATH);
    const shortlist = page.locator("[data-today-event-shortlist]");
    await expect(shortlist).toContainText(events[0].title);
    await expect(shortlist.locator("img")).toHaveCount(0);
    await page.addStyleTag({ content: "html { font-size: 200% !important; }" });
    await expect(shortlist).toContainText("Frederick Fairgrounds");
    const trigger = shortlist.locator(`a[href="/events/${events[0].slug}"]`).first();
    await nativeTarget(trigger);
    await assertPageWidth(page);
    await trigger.tap();
    const dialog = page.getByRole("dialog", { name: events[0].title, exact: true });
    await expect(dialog).toBeVisible();
    await expect(page.getByRole("dialog")).toHaveCount(1);
    const save = dialog.locator(`[data-save-ref="event:${events[0].slug}"]`);
    await expect(save).toBeEnabled();
    await nativeTarget(save);
    await save.tap();
    await expect(save).toHaveAttribute("aria-pressed", "true");
    await assertPageWidth(page);
    await screen(page, info, "image-failure-enlarged-event");
    expect(evidence.errors).toEqual([]);
  });
} else {
  test("live release: a currently published illustrated Today event completes detail, Save, Saved, directions and Back on a phone", async ({ page, context, baseURL }, info) => {
    test.setTimeout(180_000);
    await page.setViewportSize({ width: 390, height: 844 });
    const { evidence, goto, origin } = await prepare(context, page, baseURL);
    const response = await goto(TODAY_PATH);
    expect(response?.status()).toBe(200);
    const shortlist = page.locator("[data-today-event-shortlist]");
    await expect(shortlist.locator("img").filter({ visible: true }).first()).toBeVisible();
    const image = shortlist.locator("img").filter({ visible: true }).first();
    await image.locator("xpath=ancestor::article[1]").scrollIntoViewIfNeeded();
    await expect.poll(() => image.evaluate(async (node) => { const photo = node as HTMLImageElement; await photo.decode().catch(() => undefined); return photo.complete && photo.naturalWidth > 1; })).toBe(true);
    const trigger = image.locator('xpath=ancestor::a[starts-with(@href,"/events/")][1]');
    const href = (await trigger.getAttribute("href"))!;
    const slug = new URL(href, origin).pathname.replace("/events/", "");
    const displayedTitle = (await trigger.getByRole("heading").first().innerText()).trim();
    const record = await page.evaluate(async (id) => {
      const result = await fetch(`/api/events/${encodeURIComponent(id)}/summary?v=attendance-2`);
      return result.ok ? (await result.json()).event as EventWithMeta | null : null;
    }, slug);
    expect(record?.slug).toBe(slug);
    expect(Date.parse(record!.ends_at), "The chosen event must currently be attendable").toBeGreaterThan(Date.now());
    expect(["venue_match", "exact_address"]).toContain(record!.geo_confidence);
    await nativeTarget(trigger);
    const before = await page.evaluate(() => scrollY);
    await screen(page, info, "live-today-visual-shortlist");
    await trigger.tap();
    const dialog = page.getByRole("dialog", { name: record!.title, exact: true });
    await expect(dialog).toBeVisible();
    const full = dialog.getByRole("link", { name: "See full page", exact: true });
    await full.tap();
    await expect(page).toHaveURL(new RegExp(`/events/${slug}\\?`));
    expect(new URL(page.url()).searchParams.get("returnTo")).toBe(TODAY_PATH);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(displayedTitle);
    const save = page.locator(`[data-save-ref="event:${slug}"]`).filter({ visible: true });
    await expect(save).toHaveCount(1);
    await expect(save).toBeEnabled();
    await nativeTarget(save);
    await save.tap();
    await expect(save).toHaveAttribute("aria-pressed", "true");
    await page.getByRole("link", { name: "Back to Today", exact: true }).tap();
    expect(new URL(page.url()).search).toBe("?in=frederick");
    await expect.poll(() => page.evaluate((position) => Math.abs(scrollY - position), before)).toBeLessThan(80);
    await page.getByRole("navigation", { name: "Primary", exact: true }).filter({ visible: true }).getByRole("link", { name: "Saved", exact: true }).tap();
    const saved = page.locator(`[id="swe-slot-${slug}"]`);
    await expect(saved).toContainText(record!.title);
    await page.reload({ waitUntil: "domcontentloaded" });
    await expect(saved).toContainText(record!.title);
    await saved.locator('a[href^="/events/"]').first().tap();
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(displayedTitle);
    expect(new URL(page.url()).searchParams.get("returnTo")).toBe("/my-radius");
    await expect(page.locator(`[data-save-ref="event:${slug}"]`).filter({ visible: true })).toHaveAttribute("aria-pressed", "true");
    const directions = page.getByRole("link", { name: /^Directions/ }).filter({ visible: true }).first();
    const directionHref = (await directions.getAttribute("href"))!;
    const directionUrl = new URL(directionHref);
    expect(directionUrl.hostname).toMatch(/(^|\.)(google\.com|maps\.apple\.com)$/);
    expect(directionHref).toContain(String(record!.geom.lat));
    expect(directionHref).toContain(String(record!.geom.lng));
    await nativeTarget(directions);
    await directions.tap();
    await expect.poll(() => evidence.blocked.some((url) => url.includes(directionUrl.hostname))).toBe(true);
    await page.getByRole("link", { name: "Back to saved", exact: true }).tap();
    await expect(saved).toContainText(record!.title);
    await assertPageWidth(page);
    expect(evidence.errors).toEqual([]);
    await info.attach("live-exact-event-journey", { contentType: "application/json", body: JSON.stringify({ fixture: false, fullPageSSRExercised: true, source: origin.origin, slug, title: record!.title, startsAt: record!.starts_at, endsAt: record!.ends_at, directionHref, ...evidence }) });
  });
}
