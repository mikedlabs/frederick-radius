import { writeFile } from "node:fs/promises";
import { expect, test, type BrowserContext, type Locator, type Page, type TestInfo } from "@playwright/test";
import type { EventWithMeta } from "../src/lib/loaders/events";
import { eventCardVisual } from "../src/components/event/eventVisuals";
import { placeCardPhotoPlan } from "../src/lib/place-card-photo";
import { dismissReturnBridge, emptyReturnBridgeState, RETURN_BRIDGE_STORAGE_KEY } from "../src/lib/return-bridge";
import { EVENTS } from "../src/data/events";
import { BROWSE_FOCUS_RETURN_KEY } from "../src/lib/browse-focus-return";

/** Declared event DTOs travel through the existing browse/summary APIs and real
 * production components. Their photographs are the actual licensed local bytes.
 * They are not current event recommendations or a fabricated SSR detail page.
 * Nearby uses the actual catalog and its real public place detail document. */
const CREEK = "carroll-creek-linear-park-frederick";
const CREEK_NAME = "Carroll Creek Linear Park";
const CREEK_IMAGE = "/images/seasons/summer/SUMMER CARROL CREEK.jpg";
const SAVED_KEY = "fr:saved:v1";
const CREEK_FAILURE_SOURCES = placeCardPhotoPlan({ slug: CREEK }, 360).sources.map(({ src }) => decodeURIComponent(src));
const ONE_PIXEL = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jZ6kAAAAASUVORK5CYII=", "base64");
const VENUES = [
  { slug: "delaplaine-arts-center-frederick", name: "Delaplaine Arts Center", image: "/place-photos/delaplaine-exterior.jpg" },
  { slug: "weinberg-center-for-the-arts-frederick", name: "Weinberg Center for the Arts", image: "/place-photos/weinberg-exterior.jpg" },
  { slug: "c-burr-artz-public-library-frederick", name: "C. Burr Artz Public Library", image: "/place-photos/c-burr-artz-exterior.jpg" },
];

test.use({ isMobile: true, hasTouch: true, serviceWorkers: "block" });
type Evidence = {
  fixtureBoundary: string; automaticReturnOfferOptedOut: boolean; errors: string[]; blocked: string[]; eventReads: string[];
  targetPrefetches: Array<{ path: string; segment: string | null; observedAt: string }>;
  imageSignals: string[]; cspLocalHttpOnly: boolean; measurements: Record<string, unknown>;
};
const receipts = new WeakMap<Page, Evidence>();

test.afterEach(async ({ page }, info) => {
  const evidence = receipts.get(page);
  if (!evidence) return;
  evidence.measurements.finalDocument = await page.evaluate(() => ({
    url: location.href, width: innerWidth, height: innerHeight, scrollY,
    documentWidth: document.documentElement.scrollWidth, bodyWidth: document.body.scrollWidth,
    active: document.activeElement?.outerHTML.slice(0, 1200),
    returnBridgeProfile: localStorage.getItem("fr:return-bridge:v1"),
    automaticReturnOfferCount: document.querySelectorAll("aside[data-return-bridge]").length,
    images: Array.from(document.querySelectorAll<HTMLImageElement>("main article img")).map((image) => ({
      currentSrc: image.currentSrc, complete: image.complete, naturalWidth: image.naturalWidth, naturalHeight: image.naturalHeight,
      article: image.closest("article")?.getAttribute("data-place-card-has-photo"),
      style: image.getAttribute("style"), source: image.closest("[data-place-card-photo-source]")?.getAttribute("data-place-card-photo-source"),
    })),
  })).catch((error) => ({ unavailable: String(error) }));
  const path = info.outputPath("events-nearby-visual-receipt.json");
  await writeFile(path, JSON.stringify(evidence, null, 2));
  await info.attach("events-nearby-visual-receipt", { path, contentType: "application/json" });
});

function declaredEvents(): EventWithMeta[] {
  const now = Date.now();
  return VENUES.map((venue, index) => ({
    slug: `declared-visual-card-${index}`, title: `Declared visual fixture at ${venue.name}`,
    description: "Fictional acceptance event at a real named venue; not a public event listing.",
    starts_at: new Date(now - 15 * 60_000 + index * 60_000).toISOString(),
    ends_at: new Date(now + 2 * 3_600_000).toISOString(), timezone: "America/New_York",
    venue_name: venue.name, venue_place_slug: venue.slug, address: "Declared fictional event facts at the named real venue",
    geom: { lat: 39.414, lng: -77.41 }, municipality: "frederick", municipality_name: "Frederick",
    category: "arts", category_name: "Arts & culture", audience: [], is_free: true,
    attendance_mode: "physical", geo_confidence: "venue_match", source: "manual", source_id: `declared-visual-card-${index}`,
    source_url: `https://example.test/declared-visual-cards/${index}`, confidence: "curated",
    license: "Fictional event facts only; venue photographs retain their actual source and license.",
    first_seen_at: new Date(now - 86_400_000).toISOString(), last_verified_at: new Date(now).toISOString(),
    is_verified: true, status: "scheduled",
  }));
}

async function prepare(context: BrowserContext, page: Page, baseURL: string | undefined,
  options: { events?: EventWithMeta[]; failImages?: readonly string[] } = {}) {
  const origin = new URL(baseURL ?? "http://localhost:3010");
  if (!["localhost", "127.0.0.1", "[::1]"].includes(origin.hostname)) {
    throw new Error("Declared Events/Nearby acceptance is loopback-only; public release proof must retain real event responses.");
  }
  const evidence: Evidence = {
    fixtureBoundary: options.events ? "Declared event HTTP DTOs; real compiled UI and licensed bytes; full event SSR not replaced or claimed" : "Actual place catalog, owned image bytes and real public place SSR; no replacement place DTO",
    automaticReturnOfferOptedOut: true,
    errors: [], blocked: [], eventReads: [], targetPrefetches: [], imageSignals: [], cspLocalHttpOnly: false, measurements: {},
  };
  // This anonymous profile already dismissed the optional Keep Radius offer.
  // Its supported preference isolates card/detail journeys from timed mobile
  // install invitations; installation/return-offer UX is not covered here.
  evidence.fixtureBoundary += "; automatic install/return invitation opted out through the supported dismissal state before startup";
  receipts.set(page, evidence);
  const nativeDetailPaths = new Set([`/places/${CREEK}`, ...(options.events ?? []).map((event) => `/events/${event.slug}`)]);
  context.on("request", (request) => {
    const url = new URL(request.url());
    if (url.origin === origin.origin && request.method() === "GET" && nativeDetailPaths.has(url.pathname)
      && request.headers()["next-router-prefetch"] === "1") {
      evidence.targetPrefetches.push({ path: url.pathname, segment: request.headers()["next-router-segment-prefetch"] ?? null,
        observedAt: new Date().toISOString() });
    }
  });
  page.on("pageerror", (error) => evidence.errors.push(error.message));
  await context.addCookies([{ name: "fr_onboarded", value: "1", domain: origin.hostname, path: "/" }]);
  await context.addInitScript(({ appOrigin, bridgeKey, bridgeState }) => {
    if (location.origin !== appOrigin) return;
    if (localStorage.getItem("fr:saved:v1") === null) localStorage.setItem("fr:saved:v1", "[]");
    localStorage.setItem("fr:appearance:v1", "light");
    localStorage.setItem(bridgeKey, JSON.stringify(bridgeState));
  }, { appOrigin: origin.origin, bridgeKey: RETURN_BRIDGE_STORAGE_KEY,
    bridgeState: dismissReturnBridge(emptyReturnBridgeState()) });
  const localWebKit = context.browser()?.browserType().name() === "webkit" && origin.protocol === "http:"
    && ["localhost", "127.0.0.1", "[::1]"].includes(origin.hostname);
  await context.route("**/*", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    if (url.origin !== origin.origin) {
      evidence.blocked.push(`${request.method()} ${url.origin}${url.pathname}`);
      return route.abort("blockedbyclient");
    }
    if (localWebKit && request.isNavigationRequest() && request.resourceType() === "document") {
      // Local HTTP WebKit upgrades linked assets despite bypassCSP. Keep the
      // real HTML and every other policy directive; no HTTPS response is changed.
      const response = await route.fetch();
      const headers = response.headers();
      if (headers["content-security-policy"]) {
        const before = headers["content-security-policy"];
        headers["content-security-policy"] = before.split(";")
          .filter((part) => part.trim().toLowerCase() !== "upgrade-insecure-requests").join(";");
        evidence.cspLocalHttpOnly ||= before !== headers["content-security-policy"];
      }
      return route.fulfill({ response, headers });
    }
    if (url.pathname === "/api/auth/me") return route.fulfill({ json: { user: null } });
    if (request.resourceType() === "image") {
      const image = decodeURIComponent(url.pathname === "/_next/image" ? url.searchParams.get("url") ?? "" : url.pathname);
      if (options.failImages?.includes(image)) {
        evidence.imageSignals.push(image);
        return route.fulfill({ status: 200, contentType: "image/png", headers: { "cache-control": "no-store" }, body: ONE_PIXEL });
      }
      if (!["/images/", "/place-photos/", "/history-photos/", "/brand/", "/icons/"].some((prefix) => image.startsWith(prefix))) {
        evidence.blocked.push(`IMAGE ${url.pathname}`);
        return route.abort("blockedbyclient");
      }
      return route.continue();
    }
    const events = options.events;
    if (events && request.method() === "GET" && url.pathname === "/api/events/browse") {
      evidence.eventReads.push("browse");
      return route.fulfill({ json: { events, liveSlugs: events.map((event) => event.slug), generatedAt: new Date().toISOString(), sourceHealth: { degraded: false, issues: [] } } });
    }
    const summary = /^\/api\/events\/([^/]+)\/summary$/.exec(url.pathname);
    if (events && request.method() === "GET" && summary) {
      evidence.eventReads.push(decodeURIComponent(summary[1]));
      return route.fulfill({ json: { event: events.find((event) => event.slug === decodeURIComponent(summary[1])) ?? null } });
    }
    if (events && request.method() === "POST" && url.pathname === "/api/events/by-slugs") {
      const slugs = (request.postDataJSON() as { slugs?: string[] }).slugs ?? [];
      const selected = events.filter((event) => slugs.includes(event.slug));
      return route.fulfill({ json: { events: selected, resolvedSlugs: selected.map((event) => event.slug), unresolvedSlugs: [], missingSlugs: slugs.filter((slug) => !selected.some((event) => event.slug === slug)), degraded: false } });
    }
    // These catalog reads supply the real full PlaceSheet. Enrichment, model,
    // Google bytes, analytics and all writes remain outside this fixture proof.
    if (request.method() === "GET" && (url.pathname === "/api/places/by-slugs" || url.pathname === `/api/places/map-card/${CREEK}`)) return route.continue();
    if (request.method() === "GET" && url.pathname.startsWith("/api/")) {
      return route.fulfill({ status: 503, json: { error: "Declared unavailable ancillary read in visual acceptance" } });
    }
    if (url.pathname.startsWith("/api/") || !["GET", "HEAD"].includes(request.method())) return route.abort("blockedbyclient");
    return route.continue();
  });
  return evidence;
}

async function noOverflow(page: Page) {
  const geometry = await page.evaluate(() => ({ width: innerWidth, document: document.documentElement.scrollWidth, body: document.body.scrollWidth }));
  expect(geometry.document).toBeLessThanOrEqual(geometry.width + 1);
  expect(geometry.body).toBeLessThanOrEqual(geometry.width + 1);
  return geometry;
}

async function target(control: Locator, minimum = 44) {
  // Verify the declared profile preference, rather than hiding an offer,
  // clicking through it, or depending on the scenario finishing in ten seconds.
  expect(await control.page().evaluate((key) => JSON.parse(localStorage.getItem(key) ?? "null")?.autoDisabled,
    RETURN_BRIDGE_STORAGE_KEY)).toBe(true);
  await expect(control.page().locator("aside[data-return-bridge]"), "Optional return offer stays absent for the opted-out card-test profile").toHaveCount(0);
  // Nearest scrolling can leave a previously measured card behind the sticky
  // event toolbar. Center the real control before testing all five hit points.
  await control.evaluate((node) => node.scrollIntoView({ block: "center", inline: "nearest", behavior: "instant" }));
  await expect(control).toBeVisible();
  let last: unknown;
  await expect.poll(async () => {
    const sample = await control.evaluate((node, min) => {
      const box = node.getBoundingClientRect();
      const pseudo = getComputedStyle(node, "::after");
      const extender = pseudo.content !== "none" && pseudo.pointerEvents !== "none" && pseudo.position === "absolute";
      const effectiveWidth = Math.max(box.width, extender ? parseFloat(pseudo.width) || 0 : 0);
      const effectiveHeight = Math.max(box.height, extender ? parseFloat(pseudo.height) || 0 : 0);
      const x = box.x + box.width / 2, y = box.y + box.height / 2;
      const hits = [[x, y], [x - 21, y], [x + 21, y], [x, y - 21], [x, y + 21]].map(([px, py]) => {
        const hit = document.elementFromPoint(px, py);
        return px >= 0 && py >= 0 && px < innerWidth && py < innerHeight && Boolean(hit && node.contains(hit));
      });
      return { x: box.x, y: box.y, width: box.width, height: box.height, effectiveWidth, effectiveHeight, hits,
        name: node.getAttribute("aria-label"), href: node.getAttribute("href"), scrollY,
        owners: [[x, y], [x - 21, y], [x + 21, y], [x, y - 21], [x, y + 21]].map(([px, py]) => {
          const hit = document.elementFromPoint(px, py);
          return hit ? { tag: hit.tagName, class: hit.getAttribute("class"), label: hit.getAttribute("aria-label") } : null;
        }),
        okay: effectiveWidth >= min - 0.05 && effectiveHeight >= min - 0.05
          && (min !== 48 || (box.width >= 47.95 && box.height >= 47.95)) && hits.every(Boolean) };
    }, minimum);
    last = sample;
    receipts.get(control.page())!.measurements.lastTouchProbe = sample;
    return sample.okay;
  }, { message: `Real ${minimum}px action must own its five interior touch points` }).toBe(true);
  return last;
}

async function exactImage(card: Locator, expected: string, ratio: number) {
  const image = card.locator("img").filter({ visible: true }).first();
  await image.scrollIntoViewIfNeeded();
  await expect.poll(() => image.evaluate(async (node) => {
    const photo = node as HTMLImageElement;
    await photo.decode().catch(() => undefined);
    return photo.complete && photo.naturalWidth > 1 && photo.naturalHeight > 1;
  })).toBe(true);
  const measurement = await image.evaluate((node) => {
    const photo = node as HTMLImageElement;
    const url = new URL(photo.currentSrc || photo.src, document.baseURI);
    const frame = photo.getBoundingClientRect();
    const article = photo.closest("article")!.getBoundingClientRect();
    const heading = photo.closest("article")!.querySelector("h3")!.getBoundingClientRect();
    return { source: decodeURIComponent(url.searchParams.get("url") ?? url.pathname), naturalWidth: photo.naturalWidth,
      naturalHeight: photo.naturalHeight, frame: { top: frame.top, bottom: frame.bottom, width: frame.width, height: frame.height },
      articleWidth: article.width, headingTop: heading.top, fit: getComputedStyle(photo).objectFit };
  });
  receipts.get(card.page())!.measurements[`image:${expected}`] = measurement;
  expect(measurement.source, "The actual decoded photograph must identify this exact venue or place").toBe(expected);
  expect(measurement.frame.width).toBeGreaterThanOrEqual(measurement.articleWidth * 0.94);
  expect(measurement.frame.width / measurement.frame.height).toBeCloseTo(ratio, 1);
  expect(measurement.frame.bottom).toBeLessThanOrEqual(measurement.headingTop + 1);
  expect(measurement.fit).toBe("cover");
  return image;
}

async function reducedPress(page: Page, control: Locator) {
  const face = control.locator(":scope > [data-press-face]");
  await expect(face).toHaveCount(1);
  await target(control);
  const before = await control.evaluate((node) => {
    const b = node.getBoundingClientRect();
    return { x: b.x, y: b.y, width: b.width, height: b.height, shadow: getComputedStyle(node).boxShadow };
  });
  const box = (await control.boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  try {
    await expect.poll(() => control.evaluate((node) => node.matches(":active"))).toBe(true);
    const frames = await control.evaluate((node) => new Promise<Array<{ x: number; y: number; width: number; height: number; transform: string; faceTransform: string; faceScale: string; shadow: string }>>((resolve) => {
      const samples: Array<{ x: number; y: number; width: number; height: number; transform: string; faceTransform: string; faceScale: string; shadow: string }> = [];
      const sample = () => {
        const rect = node.getBoundingClientRect(), style = getComputedStyle(node);
        const inner = getComputedStyle(node.querySelector(":scope > [data-press-face]")!);
        samples.push({ x: rect.x, y: rect.y, width: rect.width, height: rect.height, transform: style.transform,
          faceTransform: inner.transform, faceScale: inner.scale, shadow: style.boxShadow });
        if (samples.length < 8) requestAnimationFrame(sample); else resolve(samples);
      };
      requestAnimationFrame(sample);
    }));
    receipts.get(page)!.measurements.reducedPress = { before, frames };
    for (const sample of frames) {
      for (const key of ["x", "y", "width", "height"] as const) expect(sample[key]).toBeCloseTo(before[key], 1);
      for (const matrix of [sample.transform, sample.faceTransform]) expect(["none", "matrix(1, 0, 0, 1, 0, 0)"]).toContain(matrix);
      expect(["none", "1"]).toContain(sample.faceScale);
      expect(sample.shadow, "Reduced motion still acknowledges the actual press without movement").not.toBe(before.shadow);
    }
    await page.mouse.move(1, 1);
  } finally { await page.mouse.up(); }
  await expect(page.getByRole("dialog")).toHaveCount(0);
}

async function screenshot(page: Page, info: TestInfo, name: string) {
  const path = info.outputPath(`${name}.png`);
  await page.screenshot({ path, fullPage: false });
  await info.attach(name, { path, contentType: "image/png" });
}

async function eventFilters(page: Page) {
  const trigger = page.getByRole("button", { name: /^Filters/ }).filter({ visible: true }).first();
  await target(trigger);
  await trigger.tap();
  const filters = page.getByRole("dialog", { name: "Event filters", exact: true });
  await expect(filters).toBeVisible();
  await expect(page.getByRole("dialog")).toHaveCount(1);
  await filters.getByRole("tab", { name: "What", exact: true }).tap();
  await filters.getByRole("button", { name: "Free", exact: true }).tap();
  await expect(filters.getByRole("button", { name: "Free", exact: true })).toHaveAttribute("aria-pressed", "true");
  await target(filters.getByRole("button", { name: "Done", exact: true }));
  await filters.getByRole("button", { name: "Done", exact: true }).tap();
  await expect(filters).toHaveCount(0);
  await expect(trigger).toBeFocused();
  await expect.poll(() => new URL(page.url()).searchParams.get("free")).toBe("true");
}

for (const width of [390, 320]) {
  test(`declared Events discovery uses exact licensed photos and preserves filter, Back and Save at ${width}px${width === 320 ? " with reduced motion" : ""}`, async ({ page, context, baseURL }, info) => {
    test.setTimeout(90_000);
    await page.setViewportSize({ width, height: 844 });
    await page.emulateMedia({ reducedMotion: width === 320 ? "reduce" : "no-preference" });
    const events = declaredEvents();
    const evidence = await prepare(context, page, baseURL, { events });
    await page.goto("/events?in=frederick&lens=today", { waitUntil: "domcontentloaded" });
    await expect(page.locator("[data-events-interaction-ready]")).toHaveAttribute("data-events-interaction-ready", "true");
    await eventFilters(page);
    const cards = page.locator('[data-events-discovery-grid] article[data-event-card-layout="discovery"]');
    await expect(cards).toHaveCount(2);
    for (const card of await cards.all()) {
      const slug = await card.getAttribute("data-decision-id");
      const event = events.find((candidate) => candidate.slug === slug)!;
      expect(event, "Every visible declared event retains its own exact identity").toBeTruthy();
      const venue = VENUES.find((candidate) => candidate.slug === event.venue_place_slug)!;
      expect(eventCardVisual(event, { venuePhotos: "free-reviewed" })?.src).toBe(venue.image);
      await expect(card).toHaveAttribute("data-event-media", "photo");
      await exactImage(card, venue.image, 16 / 10);
      await expect(card.getByRole("heading", { name: event.title, exact: true })).toBeVisible();
      await expect(card.locator("[data-event-card-time]")).not.toBeEmpty();
      await expect(card.locator("[data-event-card-venue]")).toContainText(venue.name);
      await expect(card).toContainText("Free");
      const link = card.locator('a[data-decision-action="open"]');
      await expect(link).toHaveAttribute("href", `/events/${event.slug}`);
      expect(await link.locator("a,button,[data-save-ref],[data-event-photo-credit]").count()).toBe(0);
      const credit = card.locator("[data-event-licensed-credit]");
      await expect(credit).toBeVisible();
      await expect(credit.getByRole("link", { name: "Wikimedia Commons", exact: true })).toHaveAttribute("href", /commons\.wikimedia\.org\/wiki\/File:/);
      await target(link, 48);
    }
    const card = cards.first();
    const slug = (await card.getAttribute("data-decision-id"))!;
    const event = events.find((candidate) => candidate.slug === slug)!;
    const link = card.locator('a[data-decision-action="open"]');
    const appOrigin = new URL(baseURL!).origin;
    const expectedMap = new URL(`/map?open=${encodeURIComponent(event.venue_place_slug!)}&intent=eat-drink`, appOrigin);
    const mapEvidence = {
      venue: event.venue_place_slug!, expectedHref: expectedMap.pathname + expectedMap.search,
      phases: [] as Array<{ phase: string; observedAt: string }>,
      prefetches: [] as Array<{ url: string; phase: string; segment: string | null; observedAt: string }>,
      exposure: {} as Record<string, unknown>,
      document: null as { url: string; status: number } | null,
    };
    evidence.measurements.eventMapCTA = mapEvidence;
    let mapPhase: string | null = null;
    const markMapPhase = (phase: string) => {
      mapPhase = phase;
      mapEvidence.phases.push({ phase, observedAt: new Date().toISOString() });
    };
    const isMapDestination = (url: URL) => url.origin === appOrigin && url.pathname === "/map"
      && url.searchParams.get("open") === event.venue_place_slug && url.searchParams.get("intent") === "eat-drink";
    context.on("request", (request) => {
      const url = new URL(request.url()), headers = request.headers();
      const segment = headers["next-router-segment-prefetch"] ?? null;
      // Next can prefetch a queried link's searchless /_tree as well. Attribute
      // that request only while the actual EventSheet Map CTA is exercised.
      const searchlessTree = url.pathname === "/map" && !url.searchParams.has("open")
        && !url.searchParams.has("intent") && segment === "/_tree";
      if (mapPhase && request.method() === "GET" && url.origin === appOrigin
        && headers["next-router-prefetch"] === "1" && (isMapDestination(url) || searchlessTree)) {
        mapEvidence.prefetches.push({ url: url.href, phase: mapPhase, segment, observedAt: new Date().toISOString() });
      }
    });
    context.on("response", (response) => {
      const request = response.request();
      if (request.method() === "GET" && request.isNavigationRequest() && request.resourceType() === "document"
        && isMapDestination(new URL(response.url()))) {
        mapEvidence.document = { url: response.url(), status: response.status() };
        mapPhase = null; // The real Map document's unrelated links are outside this sheet's scope.
      }
    });
    if (width === 320) {
      expect(await page.evaluate(() => matchMedia("(prefers-reduced-motion: reduce)").matches)).toBe(true);
      await reducedPress(page, link);
    }
    await target(link, 48);
    const before = { url: page.url(), scrollY: await page.evaluate(() => scrollY) };
    evidence.measurements.beforeEvent = before;
    await screenshot(page, info, `events-${width}-discovery`);
    markMapPhase("initial-sheet-open");
    await link.tap();
    const dialog = page.getByRole("dialog", { name: event.title, exact: true });
    await expect(dialog).toBeVisible();
    await expect(page.getByRole("dialog")).toHaveCount(1);
    const save = dialog.locator(`[data-save-ref="event:${slug}"]`);
    await expect(save).toBeEnabled();
    await target(save);
    await save.tap();
    await expect(save).toHaveAttribute("aria-pressed", "true");
    const saved = await page.evaluate((key) => localStorage.getItem(key), SAVED_KEY);
    expect(JSON.parse(saved!)).toEqual([{ type: "event", id: slug, saved_at: expect.any(String) }]);
    const mapLink = dialog.getByRole("link", { name: "Eat & drink nearby", exact: true });
    await expect(mapLink).toHaveAttribute("href", mapEvidence.expectedHref);
    markMapPhase("around-venue-cta-exposed");
    mapEvidence.exposure.mapCTA = await target(mapLink);
    const fullLink = dialog.getByRole("link", { name: "See full page", exact: true });
    mapEvidence.exposure.fullPageFooter = await target(fullLink);
    // Observe actual paints with the Around-the-venue/footer region exposed;
    // absence is tested against real Next scheduling, not a source-attribute mock.
    await page.evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
    const full = new URL((await fullLink.getAttribute("href"))!, page.url());
    expect(full.pathname).toBe(`/events/${slug}`);
    expect(full.searchParams.get("returnTo")).toBe(new URL(before.url).pathname + new URL(before.url).search);
    // The declared fixture has no real SSR archive row. Do not replace HTML or
    // claim a fake full-page pass; public release proof chooses a current row.
    markMapPhase("sheet-native-back");
    await page.goBack();
    await expect(dialog).toHaveCount(0);
    await expect(page).toHaveURL(before.url);
    await expect(link).toBeFocused();
    await expect.poll(async () => Math.abs(await page.evaluate(() => scrollY) - before.scrollY)).toBeLessThan(80);
    await link.tap();
    await expect(dialog.locator(`[data-save-ref="event:${slug}"]`)).toHaveAttribute("aria-pressed", "true");
    await page.goBack();
    await expect(dialog).toHaveCount(0);
    evidence.measurements.width = await noOverflow(page);
    // Positive control: this same unchanged CTA still performs its real native
    // document navigation. The basemap transport remains blocked by the guard,
    // so this does not claim a rendered map or camera interaction.
    markMapPhase("map-cta-native-activation");
    await link.tap();
    await expect(dialog).toBeVisible();
    mapEvidence.exposure.activation = await target(mapLink);
    const destination = page.waitForResponse((response) => {
      const request = response.request();
      return request.method() === "GET" && request.isNavigationRequest() && request.resourceType() === "document"
        && isMapDestination(new URL(response.url()));
    });
    await mapLink.tap();
    expect((await destination).status()).toBe(200);
    expect(mapEvidence.document).toEqual({ url: expect.any(String), status: 200 });
    expect(mapEvidence.prefetches, "Native-owned Around-the-venue CTA must not launch unused queried or searchless Map prefetches").toEqual([]);
    expect(evidence.eventReads).toContain("browse");
    expect(evidence.eventReads).toContain(slug);
    expect(evidence.targetPrefetches, "Native-owned detail transitions must not launch unused Next prefetches").toEqual([]);
    expect(evidence.errors).toEqual([]);
  });
}

async function creekCard(page: Page) {
  const card = page.locator('article[data-place-card-variant="discovery"]').filter({ has: page.getByRole("heading", { name: CREEK_NAME, exact: true }) });
  await expect(card).toHaveCount(1);
  return { card, open: card.getByRole("button", { name: /^View Carroll Creek Linear Park .*details$/ }),
    save: card.locator(`[data-save-ref="place:${CREEK}"]`), directions: card.getByRole("link", { name: /^Directions to Carroll Creek Linear Park / }) };
}

async function nearbyFilters(page: Page) {
  const trigger = page.getByRole("main").getByRole("button", { name: "Filters & sort", exact: true });
  await trigger.tap();
  const dialog = page.getByRole("dialog", { name: "Filters & sort", exact: true });
  await expect(dialog).toBeVisible();
  await dialog.getByRole("button", { name: "Parks", exact: true }).tap();
  await dialog.getByRole("button", { name: "Top rated", exact: true }).tap();
  await expect(dialog.getByRole("button", { name: "Parks", exact: true })).toHaveAttribute("aria-pressed", "true");
  await expect(dialog.getByRole("button", { name: "Top rated", exact: true })).toHaveAttribute("aria-pressed", "true");
  await target(dialog.getByRole("button", { name: "Done", exact: true }));
  await dialog.getByRole("button", { name: "Done", exact: true }).tap();
  await expect(dialog).toHaveCount(0);
  await expect(trigger).toBeFocused();
  await expect.poll(() => {
    const params = new URL(page.url()).searchParams;
    return { facet: params.get("facet"), sort: params.get("sort"), scope: params.get("in") };
  }).toEqual({ facet: "park", sort: "rated", scope: "frederick" });
  return trigger;
}

for (const width of [390, 320]) {
  test(`Nearby actual photo and sticky filters retain detail, full page and Saved continuity at ${width}px${width === 320 ? " with reduced motion" : ""}`, async ({ page, context, baseURL }, info) => {
    test.setTimeout(90_000);
    await page.setViewportSize({ width, height: 844 });
    await page.emulateMedia({ reducedMotion: width === 320 ? "reduce" : "no-preference" });
    const evidence = await prepare(context, page, baseURL);
    const response = await page.goto("/nearby?c=outside&in=frederick", { waitUntil: "domcontentloaded" });
    expect(response?.status()).toBe(200);
    await expect(page.locator('[data-nearby-interaction-ready="true"]')).toBeVisible();
    const filters = await nearbyFilters(page);
    const { card, open, save, directions } = await creekCard(page);
    const image = await exactImage(card, CREEK_IMAGE, 16 / 9);
    await expect(card).toHaveAttribute("data-place-card-has-photo", "true");
    await expect(card.locator(".place-card-photo-credit")).toHaveCount(0);
    // Creek is the first Top rated park and can fit without any implicit
    // scrolling. Exercise real document scroll before claiming sticky proof.
    if (context.browser()?.browserType().name() === "webkit") {
      // Mobile WebKit does not implement Playwright mouse.wheel. Use real
      // native key scrolling and observe its actual smooth-scroll completion.
      const travel: number[] = [];
      for (let key = 0; key < 4; key += 1) {
        await page.keyboard.press("ArrowDown");
        const deadline = Date.now() + 1500;
        let prior = await page.evaluate(() => scrollY), stable = 0;
        while (stable < 3 && Date.now() < deadline) {
          await page.waitForTimeout(50);
          const current = await page.evaluate(() => scrollY);
          stable = Math.abs(current - prior) < 0.5 ? stable + 1 : 0;
          prior = current;
        }
        travel.push(prior);
      }
      evidence.measurements.nativeArrowDownScroll = travel;
    } else {
      await page.mouse.move(width / 2, 600);
      await page.mouse.wheel(0, 240);
    }
    await expect.poll(() => page.evaluate(() => scrollY)).toBeGreaterThan(80);
    const sticky = await filters.evaluate((node) => {
      const box = node.getBoundingClientRect();
      const owner = node.parentElement!;
      const style = getComputedStyle(owner);
      const x = box.x + box.width / 2, y = box.y + box.height / 2;
      const hit = document.elementFromPoint(x, y);
      return { position: style.position, top: box.top, bottom: box.bottom, viewport: innerHeight, ownsCenter: Boolean(hit && node.contains(hit)), scrollY };
    });
    evidence.measurements.stickyFilters = sticky;
    expect(sticky.scrollY).toBeGreaterThan(0);
    expect(sticky.position).toBe("sticky");
    expect(sticky.top).toBeGreaterThanOrEqual(0);
    expect(sticky.bottom).toBeLessThan(sticky.viewport - 44);
    expect(sticky.ownsCenter).toBe(true);
    for (const action of [save, directions]) await target(action, 48);
    const destination = new URL((await directions.getAttribute("href"))!, page.url());
    expect(destination.hostname).toMatch(/^(www\.)?google\.com$|^maps\.apple\.com$/);
    const actual = destination.searchParams.get("destination") ?? destination.searchParams.get("daddr");
    const [lat, lng] = actual!.split(",").map(Number);
    expect(lat).toBeCloseTo(39.4127865, 7); expect(lng).toBeCloseTo(-77.4083747, 7);
    expect(await open.locator("a,button,[data-save-ref]").count()).toBe(0);
    if (width === 320) await reducedPress(page, open);
    await target(save, 48);
    await save.tap();
    await expect(save).toHaveAttribute("aria-pressed", "true");
    const persisted = await page.evaluate((key) => localStorage.getItem(key), SAVED_KEY);
    expect(JSON.parse(persisted!)).toEqual([{ type: "place", id: CREEK, saved_at: expect.any(String) }]);
    await target(open);
    const before = { url: page.url(), scrollY: await page.evaluate(() => scrollY) };
    evidence.measurements.beforePlace = before;
    await screenshot(page, info, `nearby-${width}-discovery`);
    await open.tap();
    const dialog = page.getByRole("dialog");
    await expect(dialog).toHaveCount(1);
    await expect(dialog.getByRole("heading", { name: CREEK_NAME, exact: true })).toBeVisible();
    await page.goBack();
    await expect(dialog).toHaveCount(0);
    await expect(open).toBeFocused();
    await expect(page).toHaveURL(before.url);
    await expect.poll(async () => Math.abs(await page.evaluate(() => scrollY) - before.scrollY)).toBeLessThan(80);
    await open.tap();
    const full = dialog.getByRole("link", { name: "See full page", exact: true });
    await expect(full).toBeVisible();
    const fullURL = new URL((await full.getAttribute("href"))!, page.url());
    expect(fullURL.pathname).toBe(`/places/${CREEK}`);
    expect(fullURL.searchParams.get("returnTo")).toBe(new URL(before.url).pathname + new URL(before.url).search);
    await full.tap();
    await expect(page).toHaveURL(fullURL.href);
    await expect(page.getByRole("heading", { level: 1, name: CREEK_NAME, exact: true })).toBeVisible();
    await expect(page.getByRole("dialog")).toHaveCount(0);
    const back = page.getByRole("link", { name: "Back to Nearby", exact: true });
    await expect(back).toHaveAttribute("href", new URL(before.url).pathname + new URL(before.url).search);
    await back.tap();
    await expect(page).toHaveURL(before.url);
    await expect(page.locator('[data-nearby-interaction-ready="true"]')).toBeVisible();
    await expect(save).toHaveAttribute("aria-pressed", "true");
    await expect.poll(async () => Math.abs(await page.evaluate(() => scrollY) - before.scrollY)).toBeLessThan(80);
    await exactImage(card, CREEK_IMAGE, 16 / 9);
    if (context.browser()?.browserType().name() === "webkit") await page.waitForLoadState("networkidle", { timeout: 10_000 });
    await page.reload({ waitUntil: "domcontentloaded" });
    await expect(page.locator('[data-nearby-interaction-ready="true"]')).toBeVisible();
    await expect(page).toHaveURL(before.url);
    await expect(save).toHaveAttribute("aria-pressed", "true");
    expect(await page.evaluate((key) => localStorage.getItem(key), SAVED_KEY)).toBe(persisted);
    await exactImage(card, CREEK_IMAGE, 16 / 9);
    evidence.measurements.width = await noOverflow(page);
    evidence.measurements.photoAlt = await image.getAttribute("alt");
    expect(evidence.targetPrefetches, "Native-owned detail transitions must not launch unused Next prefetches").toEqual([]);
    expect(evidence.errors).toEqual([]);
  });
}

test("declared Events image failure keeps the real card facts and actions at 320px", async ({ page, context, baseURL }, info) => {
  await page.setViewportSize({ width: 320, height: 844 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  const events = declaredEvents();
  const evidence = await prepare(context, page, baseURL, { events, failImages: VENUES.map((venue) => venue.image) });
  await page.goto("/events?in=frederick&lens=today", { waitUntil: "domcontentloaded" });
  await expect(page.locator("[data-events-interaction-ready]")).toHaveAttribute("data-events-interaction-ready", "true");
  const card = page.locator('[data-events-discovery-grid] article[data-event-card-layout="discovery"]').first();
  await card.scrollIntoViewIfNeeded();
  await expect(card).toHaveAttribute("data-event-media", "none");
  const slug = (await card.getAttribute("data-decision-id"))!;
  const event = events.find((item) => item.slug === slug)!;
  await expect(card.getByRole("heading", { name: event.title, exact: true })).toBeVisible();
  await expect(card.locator("[data-event-card-time]")).not.toBeEmpty();
  await expect(card.locator("[data-event-card-venue]")).toContainText(event.venue_name!);
  await expect(card.locator("img,[data-event-photo-credit]")).toHaveCount(0);
  const open = card.locator('a[data-decision-action="open"]');
  await target(open, 48);
  await screenshot(page, info, "events-320-image-fallback");
  await open.tap();
  const dialog = page.getByRole("dialog", { name: event.title, exact: true });
  await expect(dialog).toBeVisible();
  const save = dialog.locator(`[data-save-ref="event:${slug}"]`);
  await expect(save).toBeEnabled();
  await target(save);
  await save.tap();
  await expect(save).toHaveAttribute("aria-pressed", "true");
  await page.goBack();
  await expect(dialog).toHaveCount(0);
  await expect(open).toBeFocused();
  expect(evidence.imageSignals.length).toBeGreaterThan(0);
  await noOverflow(page);
  expect(evidence.targetPrefetches, "Native-owned detail transitions must not launch unused Next prefetches").toEqual([]);
    expect(evidence.errors).toEqual([]);
});

test("Nearby exhausted photo transport keeps exact place, directions and Save at 320px", async ({ page, context, baseURL }, info) => {
  await page.setViewportSize({ width: 320, height: 844 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  // Fail each exact source in the real resolver plan with native decoded
  // one-pixel responses. An Inspector-aborted WebKit request does not prove
  // native image failure; no external source bytes or UI are substituted.
  const evidence = await prepare(context, page, baseURL, { failImages: CREEK_FAILURE_SOURCES });
  evidence.measurements.declaredFailedPhotoPlan = CREEK_FAILURE_SOURCES;
  await page.goto("/nearby?c=outside&in=frederick", { waitUntil: "domcontentloaded" });
  await expect(page.locator('[data-nearby-interaction-ready="true"]')).toBeVisible();
  const { card, open, save, directions } = await creekCard(page);
  await card.scrollIntoViewIfNeeded();
  await expect.poll(() => evidence.imageSignals.includes(CREEK_IMAGE)).toBe(true);
  await expect(card).toHaveAttribute("data-place-card-has-photo", "false");
  for (const source of CREEK_FAILURE_SOURCES) expect(evidence.imageSignals).toContain(source);
  await expect(card.locator("[data-place-card-photo],.place-card-photo-credit")).toHaveCount(0);
  await expect(card.getByRole("heading", { name: CREEK_NAME, exact: true })).toBeVisible();
  await expect(card).toContainText("Frederick");
  await target(directions, 48);
  await expect(directions).toHaveAttribute("href", /destination=|daddr=/);
  await target(save, 48);
  await save.tap();
  await expect(save).toHaveAttribute("aria-pressed", "true");
  await target(open);
  await screenshot(page, info, "nearby-320-image-fallback");
  await open.tap();
  await expect(page.getByRole("dialog").getByRole("heading", { name: CREEK_NAME, exact: true })).toBeVisible();
  await page.goBack();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(open).toBeFocused();
  await expect(save).toHaveAttribute("aria-pressed", "true");
  await noOverflow(page);
  expect(evidence.targetPrefetches, "Native-owned detail transitions must not launch unused Next prefetches").toEqual([]);
    expect(evidence.errors).toEqual([]);
});


// A canonical SSR heading can paint before that document starts auth hydration.
// Await its already-issued fixture read before deliberately leaving this local
// HTTP document. This covers settled-detail Back, not a fast cancellation race.
// No additional request is issued; the existing declared auth fixture and
// strict runtime-error assertions remain unchanged.
function detailAuthRead(page: Page, appOrigin: string) {
  return page.waitForResponse(response => {
    const url = new URL(response.url());
    return url.origin === appOrigin && url.pathname === "/api/auth/me"
      && response.request().method() === "GET" && response.status() === 200;
  });
}

async function settleLocalWebKitDetail(page: Page, context: BrowserContext, appOrigin: string) {
  const origin = new URL(appOrigin);
  const localHttpWebKit = context.browser()?.browserType().name() === "webkit" && origin.protocol === "http:"
    && ["localhost", "127.0.0.1", "[::1]"].includes(origin.hostname);
  // WebKit's local Inspector reports canceled startup/prefetch reads as CORS
  // diagnostics. Cover a settled detail return, with every error still fatal.
  if (localHttpWebKit) await page.waitForLoadState("networkidle", { timeout: 10_000 });
  return { localHttpWebKitIdle: localHttpWebKit, idleTimeoutMs: localHttpWebKit ? 10_000 : null,
    authBodyCompleted: true, boundary: "Settled-detail Back; immediate cancellation stress is not covered." };
}

async function documentReturnGeometry(open: Locator) {
  return open.evaluate((node) => {
    const box = node.getBoundingClientRect();
    const navigation = performance.getEntriesByType("navigation")[0] as PerformanceNavigationTiming | undefined;
    return { url: location.href, scrollY, timeOrigin: performance.timeOrigin, navigationType: navigation?.type,
      top: box.top, bottom: box.bottom, width: box.width, height: box.height,
      documentHeight: document.documentElement.scrollHeight, focused: document.activeElement === node,
      active: document.activeElement?.outerHTML.slice(0, 1_000) };
  });
}

test("native Event full-document Back restores its actual opener after a BFCache miss", async ({ page, context, baseURL }, info) => {
  test.setTimeout(90_000);
  await page.setViewportSize({ width: 390, height: 844 });
  const evidence = await prepare(context, page, baseURL);
  const seed = EVENTS.find((event) => event.slug === "snallyfest-2026-kickoff")!;
  expect(seed).toBeDefined();
  evidence.fixtureBoundary = "Loopback-only declared Today transport fixture exposes an unchanged historical bundled event solely for native return acceptance; actual summary and full SSR are NOT replaced, no dates or source verification shifted. It is not a current recommendation proof. Supported automatic-return opt-out remains active.";
  evidence.measurements.unchangedHistoricalRecord = { slug: seed.slug, title: seed.title,
    startsAt: seed.starts_at, endsAt: seed.ends_at, lastVerifiedAt: seed.last_verified_at };
  await context.route("**/api/today/events?*", async route => {
    expect(route.request().method()).toBe("GET");
    const time = new Intl.DateTimeFormat("en-US", { timeZone: seed.timezone, month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
    await route.fulfill({ json: { partial: false, events: [{ slug: seed.slug, title: seed.title,
      venue: seed.venue_name, municipality: seed.municipality, time: time.format(new Date(seed.starts_at)),
      endTime: time.format(new Date(seed.ends_at)), moment: "Later", image: null, free: seed.is_free,
      ...(seed.price_text ? { price: seed.price_text } : {}) }] } });
  });
  // This exact free seed resolver stays real; neither its DTO nor the actual
  // blocking canonical document is replaced by the declared presentation seam.
  const appOrigin = new URL(baseURL ?? "http://localhost:3010").origin;
  await context.route(url => url.origin === appOrigin && url.pathname === `/api/events/${seed.slug}/summary`, route => {
    expect(route.request().method()).toBe("GET");
    return route.continue();
  });
  const response = await page.goto("/today?in=frederick", { waitUntil: "domcontentloaded" });
  expect(response?.status()).toBe(200);
  const open = page.locator(`[data-today-event-shortlist] a[href="/events/${seed.slug}"]`);
  await expect(open).toHaveCount(1); await target(open);
  const before = await documentReturnGeometry(open); evidence.measurements.beforeHistoricalEventDocument = before;
  const summaryRead = page.waitForResponse(response => new URL(response.url()).pathname === `/api/events/${seed.slug}/summary`);
  await open.tap();
  const dialog = page.getByRole("dialog"); await expect(dialog.getByRole("heading", { name: seed.title, exact: true })).toBeVisible();
  const summaryResponse = await summaryRead; expect(summaryResponse.status()).toBe(200);
  const summary = (await summaryResponse.json() as { event: { slug: string; title: string; starts_at: string; ends_at: string } }).event;
  expect({ slug: summary.slug, title: summary.title, starts: summary.starts_at, ends: summary.ends_at })
    .toEqual({ slug: seed.slug, title: seed.title, starts: seed.starts_at, ends: seed.ends_at });
  const authRead = detailAuthRead(page, appOrigin);
  const full = dialog.getByRole("link", { name: "See full page", exact: true }); await full.tap();
  await expect.poll(() => new URL(page.url()).pathname).toBe(`/events/${seed.slug}`);
  await expect(page.getByRole("heading", { level: 1, name: seed.title, exact: true })).toBeVisible();
  await expect(page.getByText("This event has already happened.", { exact: true })).toBeVisible();
  const authResponse = await authRead; await authResponse.finished(); expect((await authResponse.json()).user).toBeNull();
  evidence.measurements.eventDetailAuthSettled = { status: authResponse.status(), boundary: "Existing anonymous fixture response completed before native Back; no extra fetch. Fast cancellation not claimed." };
  const stored = await page.evaluate(key => JSON.parse(sessionStorage.getItem(key) ?? "null"), BROWSE_FOCUS_RETURN_KEY);
  evidence.measurements.eventDocumentDepartureIntent = stored;
  expect(stored.source).toBe(new URL(before.url).pathname + new URL(before.url).search);
  expect(stored.opener.href).toBe(`/events/${seed.slug}`);
  expect(Object.keys(stored.opener).sort()).toEqual(["ariaLabel", "href", "id", "tagName"]);
  const structured = await page.locator('script[type="application/ld+json"]').allTextContents();
  const eventData = structured.map(text => JSON.parse(text) as { "@type"?: string; startDate?: string; endDate?: string }).find(data => data["@type"] === "Event");
  expect(new Date(eventData!.startDate!).toISOString()).toBe(new Date(seed.starts_at).toISOString());
  expect(new Date(eventData!.endDate!).toISOString()).toBe(new Date(seed.ends_at).toISOString());
  evidence.measurements.settledDetailBoundary = await settleLocalWebKitDetail(page, context, appOrigin);
  await page.goBack({ waitUntil: "domcontentloaded" });
  await expect(page).toHaveURL(before.url); await expect(dialog).toHaveCount(0); await expect(open).toHaveCount(1);
  evidence.measurements.afterHistoricalEventDocument = await documentReturnGeometry(open);
  await expect(open, "A new document restores the actual Event link without scripted focus").toBeFocused();
  const after = await documentReturnGeometry(open); evidence.measurements.afterHistoricalEventDocument = after;
  expect(after.navigationType).toBe("back_forward");
  expect(after.timeOrigin, "This deliberately covers a fresh document, not retained BFCache refs").not.toBe(before.timeOrigin);
  await expect.poll(async () => Math.abs(await page.evaluate(() => scrollY) - before.scrollY)).toBeLessThan(80);
  expect(await page.evaluate(key => sessionStorage.getItem(key), BROWSE_FOCUS_RETURN_KEY)).toBeNull();
  evidence.measurements.width = await noOverflow(page); await screenshot(page, info, "event-native-document-return-focus");
  expect(evidence.errors).toEqual([]);
});

test("native Nearby full-document Back restores its exact place opener after a BFCache miss", async ({ page, context, baseURL }, info) => {
  test.setTimeout(90_000);
  await page.setViewportSize({ width: 320, height: 568 }); await page.emulateMedia({ reducedMotion: "reduce" });
  const evidence = await prepare(context, page, baseURL);
  const appOrigin = new URL(baseURL ?? "http://localhost:3010").origin;
  const response = await page.goto("/nearby?c=outside&facet=park&sort=rated&in=frederick", { waitUntil: "domcontentloaded" });
  expect(response?.status()).toBe(200); await expect(page.locator('[data-nearby-interaction-ready="true"]')).toBeVisible();
  const { card, open } = await creekCard(page); await exactImage(card, CREEK_IMAGE, 16 / 9); await target(open);
  const before = await documentReturnGeometry(open); evidence.measurements.beforeNearbyDocument = before;
  await open.tap(); const dialog = page.getByRole("dialog"); await expect(dialog.getByRole("heading", { name: CREEK_NAME, exact: true })).toBeVisible();
  const authRead = detailAuthRead(page, appOrigin);
  await dialog.getByRole("link", { name: "See full page", exact: true }).tap();
  await expect(page.getByRole("heading", { level: 1, name: CREEK_NAME, exact: true })).toBeVisible();
  const authResponse = await authRead; await authResponse.finished(); expect((await authResponse.json()).user).toBeNull();
  evidence.measurements.nearbyDetailAuthSettled = { status: authResponse.status(), boundary: "Existing anonymous fixture response completed before native Back; no extra fetch. Fast cancellation not claimed." };
  const stored = await page.evaluate(key => JSON.parse(sessionStorage.getItem(key) ?? "null"), BROWSE_FOCUS_RETURN_KEY);
  evidence.measurements.nearbyDocumentDepartureIntent = stored;
  expect(stored.source).toBe(new URL(before.url).pathname + new URL(before.url).search);
  expect(stored.opener.ariaLabel).toMatch(/^View Carroll Creek Linear Park .*details$/);
  evidence.measurements.settledDetailBoundary = await settleLocalWebKitDetail(page, context, appOrigin);
  await page.goBack({ waitUntil: "domcontentloaded" });
  await expect(page).toHaveURL(before.url); await expect(dialog).toHaveCount(0);
  await expect(page.locator('[data-nearby-interaction-ready="true"]')).toBeVisible();
  evidence.measurements.afterNearbyDocument = await documentReturnGeometry(open);
  await expect(open, "The actual address-specific place button receives focus without pre-focus").toBeFocused();
  const after = await documentReturnGeometry(open); evidence.measurements.afterNearbyDocument = after;
  expect(after.navigationType).toBe("back_forward");
  expect(after.timeOrigin, "This deliberately covers a fresh document, not retained BFCache refs").not.toBe(before.timeOrigin);
  await expect.poll(async () => Math.abs(await page.evaluate(() => scrollY) - before.scrollY)).toBeLessThan(80);
  await exactImage(card, CREEK_IMAGE, 16 / 9);
  expect(await page.evaluate(key => sessionStorage.getItem(key), BROWSE_FOCUS_RETURN_KEY)).toBeNull();
  evidence.measurements.width = await noOverflow(page); await screenshot(page, info, "nearby-native-document-return-focus");
  expect(evidence.targetPrefetches).toEqual([]); expect(evidence.errors).toEqual([]);
});
