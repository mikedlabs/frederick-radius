import { expect, test, type BrowserContext, type Locator, type Page, type TestInfo } from "@playwright/test";
import { readFile, writeFile } from "node:fs/promises";
import catalog from "../src/data/places-client.json";
import { CREDITED_LOCAL_PLACE_PHOTOS } from "../src/data/credited-local-place-photos";
import { getOwnedPlacePhoto } from "../src/lib/owned-place-photos";
import { dismissReturnBridge, emptyReturnBridgeState, RETURN_BRIDGE_STORAGE_KEY } from "../src/lib/return-bridge";

/** Real compiled Today/Map components, local reviewed photograph bytes, and
 * declared HTTP browse DTOs. No fixture claims that a venue is currently open,
 * that these are live recommendations, or that a basemap has painted. */
test.use({ isMobile: true, hasTouch: true, serviceWorkers: "block" });

const creekSlug = "carroll-creek-linear-park-frederick";
const lockSlug = "co-canal-lock-30-brunswick";
const creek = catalog.find((place) => place.slug === creekSlug)!;
const lock = catalog.find((place) => place.slug === lockSlug)!;
const otherMapPlace = catalog.find((place) => place.slug === "baker-park-frederick")!;
const creekPhoto = getOwnedPlacePhoto(creekSlug)!;
const lockPhoto = CREDITED_LOCAL_PLACE_PHOTOS[lockSlug].image;
const failureSignal = Buffer.from("R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7", "base64");
const returnTo = "/search?q=Creek&in=frederick&kind=place";
const mapPath = `/map?${new URLSearchParams({ q: "Creek", in: "frederick", c: "-77.4100,39.4150,12.4", show: "transit", layers: "parks", returnTo })}`;

type SearchOutcome = "match" | "nonmatch" | "empty";
type SearchRead = { query: string | null; scope: string | null; origin: string | null; phase: number; completed?: SearchOutcome };
type HeldSearch = { phase: number; promise: Promise<void>; release: () => void; outcome: SearchOutcome };

type Evidence = {
  fixture: true;
  proofBoundary: string;
  errors: string[];
  blocked: string[];
  images: string[];
  failedImages: string[];
  measurements: Record<string, unknown>;
  wantScopes: Array<string | null>;
  metadataReads: string[];
  searchReads: SearchRead[];
  localHttpCspAdjusted: boolean;
};
const evidenceByPage = new WeakMap<Page, Evidence>();

test.afterEach(async ({ page }, info) => {
  const evidence = evidenceByPage.get(page);
  if (!evidence) return;
  const path = info.outputPath("declared-fixture-runtime.json");
  await writeFile(path, JSON.stringify(evidence, null, 2));
  await info.attach("declared-fixture-runtime", { path, contentType: "application/json" });
});

function imageSource(requestUrl: URL, origin: string) {
  return requestUrl.pathname === "/_next/image"
    ? new URL(requestUrl.searchParams.get("url") ?? "", origin)
    : requestUrl;
}

async function prepare(context: BrowserContext, page: Page, baseURL: string | undefined, options: { map?: boolean; failCreek?: boolean; holdMetadata?: boolean; holdScopedSearch?: boolean } = {}) {
  if (!baseURL || !["localhost", "127.0.0.1"].includes(new URL(baseURL).hostname)) {
    throw new Error("Declared visual-depth acceptance may run only against the owned loopback compiled server.");
  }
  const origin = new URL(baseURL).origin;
  const evidence: Evidence = {
    fixture: true,
    proofBoundary: "Real compiled UI and exact bundled venue photographs; fictional browse availability. External providers, model calls, writes and rendered-basemap claims are excluded.",
    errors: [], blocked: [], images: [], failedImages: [], measurements: {}, wantScopes: [], metadataReads: [], searchReads: [], localHttpCspAdjusted: false,
  };
  evidenceByPage.set(page, evidence);
  page.on("pageerror", (error) => evidence.errors.push(error.message));
  let lockFails = false;
  let releaseMetadata!: () => void;
  const metadataGate = new Promise<void>((resolve) => { releaseMetadata = resolve; });
  if (!options.holdMetadata) releaseMetadata();
  const heldSearches: HeldSearch[] = [];
  const holdSearch = () => {
    let release!: () => void;
    const promise = new Promise<void>((resolve) => { release = resolve; });
    const gate: HeldSearch = { phase: heldSearches.length, promise, release, outcome: "match" };
    heldSearches.push(gate);
    return gate;
  };
  let activeSearch = options.holdScopedSearch ? holdSearch() : null;
  await context.addCookies([{ name: "fr_onboarded", value: "1", domain: new URL(origin).hostname, path: "/" }]);
  await context.addInitScript(({ key, bridge, map }) => {
    localStorage.setItem("fr:scope:v1", "county");
    localStorage.setItem("fr:appearance:v1", "light");
    localStorage.setItem("fr_map_location_intro_v1", "dismissed");
    localStorage.setItem(key, JSON.stringify(bridge));
    document.cookie = "fr_scope=county; path=/";
    if (map) {
      // Exercise the actual useful outage surface, not an unpainted map that
      // happens to expose a search field before its renderer fails.
      const original = HTMLCanvasElement.prototype.getContext;
      HTMLCanvasElement.prototype.getContext = function (this: HTMLCanvasElement, kind: string, ...args: unknown[]) {
        if (/webgl/.test(kind)) return null;
        return original.call(this, kind as "2d", ...args);
      } as typeof original;
    }
  }, { key: RETURN_BRIDGE_STORAGE_KEY, bridge: dismissReturnBridge(emptyReturnBridgeState()), map: Boolean(options.map) });

  await context.route("**/*", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    if (url.origin !== origin || !["GET", "HEAD"].includes(request.method())) {
      evidence.blocked.push(`${request.method()} ${url.origin}${url.pathname}`);
      return route.abort("blockedbyclient");
    }
    if (context.browser()?.browserType().name() === "webkit" && request.isNavigationRequest() && request.resourceType() === "document" && url.protocol === "http:") {
      // Existing WebKit loopback transport allowance only. Keep real HTML and
      // all other CSP directives; this spec never exercises public HTTPS.
      const response = await route.fetch();
      const headers = response.headers();
      if (headers["content-security-policy"]) {
        const original = headers["content-security-policy"].split(";");
        const directives = original.filter((directive) => directive.trim().toLowerCase() !== "upgrade-insecure-requests");
        evidence.localHttpCspAdjusted ||= original.length !== directives.length;
        headers["content-security-policy"] = directives.join(";");
      }
      return route.fulfill({ response, headers });
    }
    if (url.pathname === "/api/auth/me") return route.fulfill({ json: { user: null } });
    if (url.pathname === "/api/want") {
      const scope = url.searchParams.get("scope");
      evidence.wantScopes.push(scope);
      const isBrunswick = scope?.includes("brunswick") ?? false;
      const place = isBrunswick ? lock : creek;
      return route.fulfill({ json: {
        hero: { slug: place.slug, name: place.name, photo: null, where: isBrunswick ? "Brunswick" : "Frederick", fact: "Hours not confirmed", confidence: "unconfirmed" },
        also: [], soon: null, later: [], notable: [], contextSource: isBrunswick ? "town" : "county",
        contextLabel: isBrunswick ? "Brunswick" : "Frederick County", browseHref: `/places?in=${isBrunswick ? "brunswick" : "county"}`,
      } });
    }
    if (url.pathname === "/api/today/events") return route.fulfill({ json: { events: [], partial: false } });
    if (url.pathname === "/api/map/places") return route.fulfill({ json: { generatedAt: new Date().toISOString(),
      places: (options.holdScopedSearch ? [creek, otherMapPlace] : [creek]).map((place) => ({
        slug: place.slug, name: place.name, category: place.category, geom: place.geom, municipality: place.municipality,
        source: place.source, is_verified: place.is_verified, field_notes: place.field_notes,
        short_blurb: place.short_blurb, primary_type: place.primary_type, open_status: { state: "unknown" },
      })),
    } });
    if (url.pathname === "/api/search") {
      const gate = activeSearch;
      const read: SearchRead = { query: url.searchParams.get("q"), scope: url.searchParams.get("in"),
        origin: url.searchParams.get("origin"), phase: gate?.phase ?? -1 };
      evidence.searchReads.push(read);
      if (options.holdScopedSearch) {
        // Delay ONLY the real scoped canonical-search transport. The live map
        // records, selected-card source plan, filters and URL stay untouched.
        expect(read.query).toBe(creek.name);
        expect(read.scope).toBe("frederick");
        expect(read.origin).toBe("map");
        if (!gate) throw new Error("The scoped-search fixture must declare its response phase.");
        await gate.promise;
      }
      const outcome = gate?.outcome ?? "match";
      const place = outcome === "nonmatch" ? otherMapPlace : creek;
      await route.fulfill({ json: { results: outcome === "empty" ? [] : [{ type: "place", id: `place:${place.slug}`, title: place.name,
        subtitle: place.municipality, href: `/places/${place.slug}`, lng: place.geom.lng, lat: place.geom.lat }] } });
      read.completed = outcome;
      return;
    }
    if (url.pathname.startsWith("/api/places/map-card/")) {
      evidence.metadataReads.push(decodeURIComponent(url.pathname.split("/").at(-1)!));
      await metadataGate;
      return route.fulfill({ status: 503, json: { error: "Declared unavailable metadata; reviewed free image identity remains real" } });
    }
    if (request.resourceType() === "image") {
      const source = imageSource(url, origin);
      const imagePath = decodeURIComponent(source.pathname);
      if (source.origin !== origin || !["/images/", "/history-photos/", "/place-photos/", "/brand/", "/icons/"].some((prefix) => imagePath.startsWith(prefix))) {
        evidence.blocked.push(`IMAGE ${source.origin}${source.pathname}`);
        return route.abort("blockedbyclient");
      }
      evidence.images.push(imagePath);
      if ((options.failCreek && imagePath === creekPhoto.src) || (lockFails && imagePath === lockPhoto.src)) {
        evidence.failedImages.push(imagePath);
        return route.fulfill({ headers: { "Cache-Control": "no-store" }, contentType: "image/gif", body: failureSignal });
      }
      if (imagePath === creekPhoto.src || imagePath === lockPhoto.src) {
        return route.fulfill({ headers: { "Cache-Control": "no-store" }, contentType: "image/jpeg", body: await readFile(`public${imagePath}`) });
      }
      return route.continue();
    }
    if (url.pathname.startsWith("/api/")) return route.fulfill({ status: 503, json: { error: "Optional read unavailable in the declared visual-depth fixture" } });
    return route.continue();
  });
  return { evidence, releaseMetadata, failLock: () => { lockFails = true; },
    holdScopedSearch: () => { activeSearch = holdSearch(); return activeSearch.phase; },
    releaseScopedSearch: (outcome: SearchOutcome) => {
      if (!activeSearch) throw new Error("No declared scoped search is held.");
      activeSearch.outcome = outcome;
      activeSearch.release();
    },
    releaseAllSearch: () => { for (const gate of heldSearches) gate.release(); },
  };
}

async function decoded(image: Locator, expected: string) {
  await expect(image).toHaveCount(1);
  await expect.poll(() => image.evaluate((node) => {
    const photo = node as HTMLImageElement;
    return photo.complete && photo.naturalWidth > 1 && photo.naturalHeight > 1;
  })).toBe(true);
  const source = await image.evaluate((node) => {
    const photo = node as HTMLImageElement;
    const url = new URL(photo.currentSrc || photo.src, document.baseURI);
    return decodeURIComponent(url.searchParams.get("url") ?? url.pathname);
  });
  expect(source).toBe(expected);
}

async function assertWidth(page: Page) {
  const widths = await page.evaluate(() => ({ viewport: innerWidth, document: document.documentElement.scrollWidth, body: document.body.scrollWidth }));
  expect(widths.document).toBeLessThanOrEqual(widths.viewport + 1);
  expect(widths.body).toBeLessThanOrEqual(widths.viewport + 1);
  return widths;
}

async function target44(control: Locator) {
  // Geometry-only ownership check. Native scrolling budgets below do not use
  // this helper, scripted focus, or target scrolling to manufacture arrival.
  await control.evaluate((node) => node.scrollIntoView({ block: "center", inline: "nearest", behavior: "instant" }));
  let receipt: unknown;
  await expect.poll(async () => {
    const result = await control.evaluate((node) => {
      const r = node.getBoundingClientRect();
      const x = r.x + r.width / 2, y = r.y + r.height / 2;
      const points = [[x, y], [x - 21, y], [x + 21, y], [x, y - 21], [x, y + 21]];
      return { width: r.width, height: r.height, x: r.x, y: r.y,
        hits: points.map(([px, py]) => px >= 0 && py >= 0 && px < innerWidth && py < innerHeight && node.contains(document.elementFromPoint(px, py))) };
    });
    receipt = result;
    return Math.round(result.width * 100) / 100 >= 44 && Math.round(result.height * 100) / 100 >= 44 && result.hits.every(Boolean);
  }, { message: "The actual 44px control must own its center and four interior edge probes" }).toBe(true);
  return receipt;
}

async function attach(info: TestInfo, name: string, receipt: unknown) {
  const path = info.outputPath(`${name}.json`);
  await writeFile(path, JSON.stringify(receipt, null, 2));
  await info.attach(name, { contentType: "application/json", path });
}

async function todayReady(page: Page, path = "/today?in=county") {
  await page.goto(path, { waitUntil: "domcontentloaded" });
  await expect(page.getByRole("combobox", { name: "Choose your area", exact: true })).toBeEnabled();
  await expect(page.locator("[data-today-weather] [data-weather-state]")).toHaveAttribute("data-weather-state", /^(available|safety-only|unavailable)$/);
  await page.evaluate(() => document.fonts.ready);
}

test("Today shows a real photograph on arrival while weather and Find lead at 390px", async ({ context, page, baseURL }, info) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  const { evidence } = await prepare(context, page, baseURL);
  await todayReady(page);
  const doorway = page.locator("[data-today-geographic-doorway]");
  await expect(doorway).toHaveAttribute("data-photo-state", "loaded");
  await decoded(doorway.locator("img"), creekPhoto.src);
  const geometry = await page.evaluate(() => {
    const box = (selector: string) => { const r = document.querySelector(selector)!.getBoundingClientRect(); return { top: r.top, bottom: r.bottom, width: r.width, height: r.height }; };
    const weather = box("[data-today-weather]"), find = box('[data-surface-row="find"]'), entry = box("[data-today-entry-controls]");
    const photo = box("[data-today-photo-lead]"), quick = box('[role="group"][aria-label="Quick needs"]');
    const events = box('[role="group"][aria-label="Follow the day"]'), places = box('[aria-label="Places for your area"]');
    const news = box('section[aria-label="Local news"]'), explore = box('section[aria-labelledby="today-explore-heading"]');
    const nav = box('[data-bottom-nav-shell] nav[aria-label="Primary"]');
    return { scrollY, weather, find, entry, photo, events, places, news, explore, quick, nav, visiblePhoto: Math.max(0, Math.min(photo.bottom, nav.top) - Math.max(photo.top, weather.top)) };
  });
  evidence.measurements.arrival = geometry;
  expect(geometry.scrollY).toBe(0);
  expect(geometry.weather.bottom).toBeLessThanOrEqual(geometry.find.top);
  expect(geometry.find.bottom).toBeLessThanOrEqual(geometry.photo.top);
  expect(geometry.weather.top).toBeGreaterThanOrEqual(0);
  expect(geometry.find.bottom).toBeLessThanOrEqual(geometry.nav.top);
  expect(geometry.visiblePhoto, "a substantial decoded image is visible before the fixed tabs without scrolling").toBeGreaterThanOrEqual(120);
  expect(geometry.entry.height, "Find+scope do not grow into another full card before photography").toBeLessThanOrEqual(160);
  expect(geometry.photo.bottom).toBeLessThanOrEqual(geometry.events.top);
  expect(geometry.events.bottom).toBeLessThanOrEqual(geometry.places.top);
  expect(geometry.places.bottom).toBeLessThanOrEqual(geometry.news.top);
  expect(geometry.news.bottom).toBeLessThanOrEqual(geometry.explore.top);
  expect(geometry.quick.top).toBeGreaterThanOrEqual(geometry.explore.top);
  const quick = page.getByRole("group", { name: "Quick needs", exact: true });
  await expect(quick).toHaveCount(1);
  await expect(page.getByRole("region", { name: "More ways to explore", exact: true }).getByRole("group", { name: "Quick needs", exact: true })).toHaveCount(1);
  await expect(quick.getByRole("link")).toHaveCount(4);
  const targets = [];
  for (const control of [page.getByRole("link", { name: "Find a place, service, event, or answer", exact: true }), page.getByRole("combobox", { name: "Choose your area", exact: true }), ...await quick.getByRole("link").all()]) targets.push(await target44(control));
  await attach(info, "arrival-photo-and-controls", { geometry, targets, widths: await assertWidth(page), proofBoundary: evidence.proofBoundary });
  expect(evidence.errors).toEqual([]);
  // Capture the arrival only after measured proof; resetting here cannot make
  // an offscreen image pass the no-scroll geometry assertion above.
  await page.evaluate(() => scrollTo(0, 0));
  await page.screenshot({ path: info.outputPath("today390-arrival-fixture.png") });
});

test("Today retains the photo and 44px controls within one native scroll at 320px and 200% root text", async ({ context, page, baseURL }, info) => {
  test.setTimeout(60_000);
  await page.setViewportSize({ width: 320, height: 844 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  const { evidence } = await prepare(context, page, baseURL);
  await todayReady(page);
  const image = page.locator("[data-today-photo-lead] img");
  await decoded(image, creekPhoto.src);
  const textProbes = [
    { name: "Find words", control: page.getByRole("link", { name: "Find a place, service, event, or answer", exact: true }).getByText("Find what you need", { exact: true }) },
    { name: "Area picker", control: page.getByRole("combobox", { name: "Choose your area", exact: true }) },
    { name: "Quick action words", control: page.getByRole("group", { name: "Quick needs", exact: true }).getByRole("link").first().locator("span") },
  ];
  const text = async () => Promise.all(textProbes.map(async ({ name, control }) => ({
    name, px: await control.evaluate((node) => parseFloat(getComputedStyle(node).fontSize)),
  })));
  const rootText = () => page.evaluate(() => ({
    px: parseFloat(getComputedStyle(document.documentElement).fontSize),
    declared: document.documentElement.style.fontSize,
  }));
  const baselineSamples: unknown[] = [];
  const growthSamples: unknown[] = [];
  const readiness = { baselineSamples, growthSamples };
  evidence.measurements.textReadiness = readiness;
  // The root must be the original16px before recording the actual control
  // baseline. Two real paints also settle WebKit's container-relative labels.
  let normal = await text();
  let previousBaseline = "";
  let stableBaseline = 0;
  await expect.poll(async () => {
    await page.evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
    const root = await rootText();
    normal = await text();
    baselineSamples.push({ root, controls: normal });
    const key = JSON.stringify({ root, normal });
    stableBaseline = key === previousBaseline ? stableBaseline + 1 : 0;
    previousBaseline = key;
    return root.px === 16 && stableBaseline >= 1;
  }, { message: "The actual16px root and control text settle before recording a100% baseline" }).toBe(true);
  expect(normal.map(({ px }) => px), "normal fixed release labels are measured at100%, never an already-enlarged baseline").toEqual([16, 16, 14]);
  await page.evaluate(() => { document.documentElement.style.fontSize = "200%"; });
  await page.evaluate(() => document.fonts.ready);
  let enlarged = await text();
  try {
    // fonts.ready does not establish container-query/layout readiness. Require
    // the actual computed root and all three actual label sizes before any
    // enlarged geometry is accepted; do not override those label sizes.
    await expect.poll(async () => {
      const root = await rootText();
      enlarged = await text();
      growthSamples.push({ root, controls: enlarged });
      return root.px === 32 && normal.every((before, index) => Math.abs(enlarged[index].px / before.px - 2) < 0.005);
    }, { message: "The real32px root and every control's actual2x reading size must render" }).toBe(true);
    normal.forEach((before, index) => expect(enlarged[index].px / before.px, before.name).toBeCloseTo(2, 2));
  } finally {
    await attach(info, "text-growth-readiness", readiness);
  }
  const samples: Array<{ scrollY: number; distance: number; visiblePhoto: number; top: number; bottom: number }> = [];
  const startY = await page.evaluate(() => scrollY);
  expect(startY).toBe(0);
  expect(await page.evaluate(() => document.activeElement === document.body || document.activeElement === document.documentElement)).toBe(true);
  const read = () => page.evaluate((start) => {
    const photo = document.querySelector("[data-today-photo-lead]")!.getBoundingClientRect();
    const nav = document.querySelector('[data-bottom-nav-shell] nav[aria-label="Primary"]')!.getBoundingClientRect();
    const header = document.querySelector("header")!.getBoundingClientRect();
    return { scrollY, distance: scrollY - start, top: photo.top, bottom: photo.bottom,
      visiblePhoto: Math.max(0, Math.min(photo.bottom, nav.top) - Math.max(photo.top, header.bottom)) };
  }, startY);
  let current = await read();
  samples.push(current);
  let keyPresses = 0;
  const settleSamples: Array<{ key: number; scrollY: number }> = [];
  const receipt = { normal, enlarged,
    mechanism: "Declared200% root text; actual computed Find/picker/quick text doubles. Each native ArrowDown settles before the next; no geometry override or browser zoom.",
    nativeInput: "ArrowDown", targetFocusOrScrollUsedForPhotoBudget: false,
    maxKeyPresses: 32, scrollBudget: 844, samples, settleSamples,
    keyPresses: 0, targets: [] as unknown[],
  };
  evidence.measurements.enlarged = receipt;
  try {
  while (current.visiblePhoto < 120 && keyPresses < 32) {
    await page.keyboard.press("ArrowDown", { delay: 30 });
    keyPresses += 1;
    // WebKit's native keyboard scroll can still be easing after two paints:
    // the preserved first trace sampled only377px from32 interrupted steps.
    // Observe real scroll position settling before sending the next key. Keep
    // the original32-key,844px and120px proof limits unchanged.
    let previousY = await page.evaluate(() => scrollY);
    let stableSamples = 0;
    await expect.poll(async () => {
      const y = await page.evaluate(() => scrollY);
      settleSamples.push({ key: keyPresses, scrollY: y });
      stableSamples = Math.abs(y - previousY) < 0.5 ? stableSamples + 1 : 0;
      previousY = y;
      return stableSamples >= 3;
    }, { timeout: 1_000, intervals: [50], message: "The actual native ArrowDown scroll settles before the next key" }).toBe(true);
    current = await read();
    samples.push(current);
    receipt.keyPresses = keyPresses;
    expect(current.distance).toBeGreaterThanOrEqual(0);
    expect(current.distance).toBeLessThanOrEqual(844);
  }
  expect(current.visiblePhoto, "the actual photograph clears header and tabs after ordinary bounded scrolling").toBeGreaterThanOrEqual(120);
  await page.screenshot({ path: info.outputPath("today320-enlarged-native-scroll-fixture.png") });
  const targets = receipt.targets;
  const quick = page.getByRole("group", { name: "Quick needs", exact: true });
  await expect(quick.getByRole("link")).toHaveCount(4);
  for (const control of [page.getByRole("link", { name: "Find a place, service, event, or answer", exact: true }), page.getByRole("combobox", { name: "Choose your area", exact: true }), ...await quick.getByRole("link").all()]) targets.push(await target44(control));
  await assertWidth(page);
  expect(evidence.errors).toEqual([]);
  } finally {
    receipt.keyPresses = keyPresses;
    await attach(info, "enlarged-reading-and-native-scroll", receipt);
  }
});

test("Today keeps exact Brunswick imagery through a scope round trip and a fresh failed-image leg", async ({ browser, context, page, baseURL }, info) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  const healthy = await prepare(context, page, baseURL);
  await todayReady(page);
  await decoded(page.locator("[data-today-geographic-doorway] img"), creekPhoto.src);
  const picker = page.getByRole("combobox", { name: "Choose your area", exact: true });
  const cardForLock = (targetPage: Page) => targetPage.locator("article[data-today-place-preview]")
    .filter({ has: targetPage.locator(`[data-today-place-lead][data-decision-id="${lockSlug}"]`) });
  const lockCard = cardForLock(page);
  await picker.selectOption("town:brunswick");
  await expect(page.getByTestId("today-scope-status")).toContainText("Brunswick picks · Countywide weather");
  await expect(page.locator("[data-today-geographic-doorway]")).toHaveCount(0);
  await expect(lockCard).toHaveCount(1);
  await decoded(lockCard.locator("img"), lockPhoto.src);
  await expect(lockCard).toContainText(lock.name);
  await expect(lockCard.getByRole("link", { name: "Wikimedia Commons", exact: true })).toHaveAttribute("href", lockPhoto.source_url);
  await expect(lockCard.getByRole("link", { name: lockPhoto.license.label, exact: true })).toHaveAttribute("href", lockPhoto.license.url);
  await expect(lockCard).not.toContainText("Carroll Creek");
  await picker.selectOption("county");
  await expect(lockCard).toHaveCount(0);
  await expect(page.locator("[data-today-geographic-doorway]")).toHaveAttribute("data-photo-state", "loaded");
  await attach(info, "healthy-exact-town-roundtrip", { source: lockPhoto.src, slug: lockSlug,
    credit: lockPhoto.creator, sequence: ["county", "brunswick", "county"],
    wantScopes: healthy.evidence.wantScopes, widths: await assertWidth(page) });
  expect(healthy.evidence.errors).toEqual([]);

  // WebKit demonstrably reuses a previously decoded exact image without a
  // second request, even with routing and no-store. Preserve that healthy
  // roundtrip proof above. A fresh isolated context makes this failure leg's
  // FIRST exact Lock30 transport actually receive the declared1x1 signal.
  // Do not alter image URLs, clear a cache, or mutate component DOM/source.
  const environment = await page.evaluate(() => ({ userAgent: navigator.userAgent, deviceScaleFactor: devicePixelRatio }));
  const fresh = await browser.newContext({ baseURL, viewport: { width: 390, height: 844 },
    ...environment, isMobile: true, hasTouch: true, reducedMotion: "reduce", colorScheme: "light",
    bypassCSP: true, serviceWorkers: "block" });
  const failurePage = await fresh.newPage();
  const failure = await prepare(fresh, failurePage, baseURL);
  failure.failLock();
  try {
    await todayReady(failurePage);
    await decoded(failurePage.locator("[data-today-geographic-doorway] img"), creekPhoto.src);
    await failurePage.getByRole("combobox", { name: "Choose your area", exact: true }).selectOption("town:brunswick");
    await expect(failurePage.getByTestId("today-scope-status")).toContainText("Brunswick picks · Countywide weather");
    const failedCard = cardForLock(failurePage);
    await expect(failedCard).toHaveCount(1);
    await expect.poll(() => failure.evidence.failedImages.filter((path) => path === lockPhoto.src).length,
      { message: "The declared1x1 failure must actually be served; decoded-cache reuse is not failure coverage" }).toBe(1);
    await expect(failedCard).toHaveAttribute("data-has-photo", "false");
    await expect(failedCard.locator("img")).toHaveCount(0);
    await expect(failedCard.locator(".place-card-photo-credit")).toHaveCount(0);
    await expect(failedCard).toContainText("Hours not confirmed");
    await expect(failedCard).toContainText("Brunswick");
    await expect(failedCard).not.toContainText("Carroll Creek");
    await expect(failurePage.locator("[data-today-geographic-doorway]")).toHaveCount(0);
    await expect(failedCard.getByRole("link", { name: `Map: ${lock.name}`, exact: true })).toHaveAttribute("href", new RegExp(`place=${lockSlug}.*in=brunswick`));
    await assertWidth(failurePage);
    expect(failure.evidence.errors).toEqual([]);
  } finally {
    await attach(info, "fresh-exact-town-failure-leg", { ...failure.evidence,
      sequence: ["county", "brunswick"], freshIsolatedContext: true,
      sameDecodedImageRefreshClaim: false, actualFailedSource: lockPhoto.src });
    await fresh.close();
  }
});

test("Today keeps a named place doorway after its owned photograph fails", async ({ context, page, baseURL }, info) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const { evidence } = await prepare(context, page, baseURL, { failCreek: true });
  await todayReady(page);
  const doorway = page.locator("[data-today-geographic-doorway]");
  await expect(doorway).toHaveAttribute("data-photo-state", "failed");
  await expect(doorway.locator("figure, img")).toHaveCount(0);
  await expect(doorway).toHaveAccessibleName("View Carroll Creek Linear Park in Frederick");
  await expect(doorway).toHaveAttribute("href", `/places/${creekSlug}`);
  await expect(doorway).toContainText("Carroll Creek");
  await expect(doorway).not.toContainText(/open now|safe now|current conditions/i);
  const target = await target44(doorway);
  await attach(info, "honest-owned-photo-failure", { target, failedSource: creekPhoto.src, widths: await assertWidth(page) });
  expect(evidence.errors).toEqual([]);
});

test("Map makes the exact owned image prominent before metadata and keeps real Details Back focus at 320px", async ({ context, page, baseURL }, info) => {
  await page.setViewportSize({ width: 320, height: 568 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  const boundary = await prepare(context, page, baseURL, { map: true, holdMetadata: true });
  try {
    await page.goto(mapPath, { waitUntil: "domcontentloaded" });
    const list = page.getByRole("region", { name: "Available results without the map", exact: true });
    await expect(list).toBeVisible({ timeout: 15_000 });
    const row = list.locator(`[data-map-list-place="${creekSlug}"]`);
    await expect(row).toBeVisible();
    await row.click();
    const card = page.locator(".map-peek[data-map-result-surface]");
    await expect(card.locator("[data-map-place-slug]")).toHaveAttribute("data-map-place-slug", creekSlug);
    const image = card.locator('img[data-map-peek-photo-source="owned"]');
    await decoded(image, creekPhoto.src);
    await expect(image).toHaveAttribute("data-map-peek-photo-state", "ready");
    // The metadata response remains held until the owned source is decoded.
    await expect.poll(() => boundary.evidence.metadataReads).toEqual([creekSlug]);
    await expect.poll(() => card.evaluate((node) => {
      const transform = getComputedStyle(node).transform;
      return transform === "none" || new DOMMatrix(transform).isIdentity;
    })).toBe(true);
    const geometry = await card.evaluate((element) => {
      const box = (node: Element) => { const r = node.getBoundingClientRect(); return { top: r.top, bottom: r.bottom, width: r.width, height: r.height, left: r.left, right: r.right }; };
      return { card: box(element), body: box(element.querySelector("[data-map-place-slug]")!), photo: box(element.querySelector(".map-peek-visual")!), viewport: { width: innerWidth, height: innerHeight }, scrollHeight: element.scrollHeight, clientHeight: element.clientHeight };
    });
    boundary.evidence.measurements.map = geometry;
    expect(geometry.photo.width).toBeGreaterThanOrEqual(geometry.body.width * 0.9);
    expect(geometry.photo.height).toBeGreaterThanOrEqual(104);
    expect(geometry.photo.height).toBeLessThanOrEqual(160);
    expect(geometry.card.height).toBeLessThanOrEqual(Math.min(568 * 0.62, 480) + 1);
    expect(geometry.card.left).toBeGreaterThanOrEqual(0);
    expect(geometry.card.right).toBeLessThanOrEqual(320);
    const share = card.getByRole("button", { name: `Share ${creek.name}`, exact: true });
    const shareFace = share.locator(":scope > [data-press-face]");
    await expect(shareFace, "the narrow-phone Share control must paint its actual content, not an empty hit box").toBeVisible();
    await expect(shareFace.locator("svg")).toBeVisible();
    await expect(shareFace.getByText("Share", { exact: true })).toBeVisible();
    await page.screenshot({ path: info.outputPath("map320-owned-photo-metadata-pending-fixture.png") });
    const targets = [];
    for (const control of [card.getByRole("button", { name: `Close ${creek.name}`, exact: true }), card.getByRole("button", { name: `Open details for ${creek.name}`, exact: true }), card.locator(".map-peek-title-button"), card.getByRole("button", { name: "Details", exact: true }), card.getByRole("link", { name: "Directions", exact: true }), card.getByRole("button", { name: "Save", exact: true }), card.getByRole("button", { name: `Share ${creek.name}`, exact: true })]) targets.push(await target44(control));
    boundary.releaseMetadata();
    const selectedUrl = page.url();
    const details = card.getByRole("button", { name: "Details", exact: true });
    for (const method of ["Close", "Escape", "Back"] as const) {
      // Do not pre-focus this opener. Safari must capture the real pointer
      // trigger; Close/Escape/Back must restore that actual same control.
      await details.click();
      const dialog = page.getByRole("dialog", { name: creek.name, exact: true });
      await expect(dialog).toBeVisible();
      if (method === "Close") await dialog.getByRole("button", { name: "Close place details", exact: true }).click();
      else if (method === "Escape") await page.keyboard.press("Escape");
      else await page.goBack();
      await expect(dialog).toHaveCount(0);
      await expect(page).toHaveURL(selectedUrl);
      await expect(details).toBeFocused();
      await decoded(image, creekPhoto.src);
    }
    await page.goBack();
    await expect(card).toHaveCount(0);
    await expect(row).toBeFocused();
    await expect(page).toHaveURL(new URL(mapPath, baseURL).href);
    await expect(page.getByRole("link", { name: "Back to search results", exact: true })).toHaveAttribute("href", returnTo);
    await attach(info, "map-owned-photo-and-native-history", { geometry, targets, widths: await assertWidth(page), selectedUrl, preserved: ["q", "in", "c", "show", "layers", "returnTo"], mapProof: "Actual useful WebGL-unavailable fallback only. Camera URL continuity is not painted-basemap/camera evidence.", scriptedOpenerFocus: false });
    expect(boundary.evidence.errors).toEqual([]);
  } finally {
    boundary.releaseMetadata();
  }
});


const coldSelectedMapPath = `/map?${new URLSearchParams({ in: "frederick", q: creek.name,
  place: creekSlug, c: "-77.4100,39.4150,12.4", layers: "parks", show: "transit" })}`;

async function reloadContinuityState(page: Page) {
  return page.evaluate(() => ({
    url: location.href,
    selectedSlugs: [...document.querySelectorAll(".map-peek [data-map-place-slug]")].map((node) => node.getAttribute("data-map-place-slug")),
    saved: JSON.parse(localStorage.getItem("fr:saved:v1") ?? "[]"),
    mapError: document.querySelector(".dock-host")?.getAttribute("data-map-error") ?? null,
    activeElement: document.activeElement?.outerHTML.slice(0, 500),
  }));
}

async function selectedWhileSearchHeld(page: Page, boundary: Awaited<ReturnType<typeof prepare>>, baseURL: string | undefined, phase: number) {
  await expect(page.getByRole("region", { name: "Available results without the map", exact: true })).toBeVisible({ timeout: 15_000 });
  await expect.poll(() => boundary.evidence.searchReads.filter((read) => read.phase === phase).length,
    { message: "The actual scoped canonical search must reach its declared held response" }).toBeGreaterThan(0);
  expect(boundary.evidence.searchReads.filter((read) => read.phase === phase).every((read) => read.completed === undefined)).toBe(true);
  const card = page.locator(".map-peek[data-map-result-surface]");
  await expect(card.locator("[data-map-place-slug]"), "a pending scoped search cannot erase the valid URL-selected place")
    .toHaveAttribute("data-map-place-slug", creekSlug);
  const image = card.locator('img[data-map-peek-photo-source="owned"]');
  await decoded(image, creekPhoto.src);
  // Observe the actual selection for more than500ms while canonical search
  // is still held. Record any loss permanently instead of accepting a later
  // reappearance. No selected DOM, focus, filter, or photo is injected.
  const heldAt = Date.now();
  const samples: Array<{ elapsedMs: number; url: string; selected: boolean }> = [];
  boundary.evidence.measurements[`heldScopedSearch${phase}`] = samples;
  let selectionLost = false;
  await expect.poll(async () => {
    const url = page.url();
    const selected = await card.locator(`[data-map-place-slug="${creekSlug}"]`).count() === 1;
    const elapsedMs = Date.now() - heldAt;
    samples.push({ elapsedMs, url, selected });
    selectionLost ||= !selected || url !== new URL(coldSelectedMapPath, baseURL).href;
    return elapsedMs >= 600 && !selectionLost;
  }, { timeout: 2_000, intervals: [100], message: "The actual URL and selected place remain stable for over500ms of held scoped search" }).toBe(true);
  return { card, image };
}

test("Map preserves a cold scoped URL selection and anonymous Save across held canonical search and reload", async ({ context, page, baseURL }, info) => {
  test.setTimeout(45_000);
  await page.setViewportSize({ width: 320, height: 568 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  const boundary = await prepare(context, page, baseURL, { map: true, holdScopedSearch: true });
  const phases: unknown[] = [];
  boundary.evidence.measurements.reloadContinuity = phases;
  try {
    await page.goto(coldSelectedMapPath, { waitUntil: "domcontentloaded" });
    const first = await selectedWhileSearchHeld(page, boundary, baseURL, 0);
    phases.push({ name: "cold selected URL while scoped search is held", state: await reloadContinuityState(page) });
    boundary.releaseScopedSearch("match");
    await expect.poll(() => boundary.evidence.searchReads.some((read) => read.phase === 0 && read.completed === "match")).toBe(true);
    await expect(first.card).toBeVisible();
    await expect(page).toHaveURL(new URL(coldSelectedMapPath, baseURL).href);
    await decoded(first.image, creekPhoto.src);
    const save = first.card.getByRole("button", { name: "Save", exact: true });
    await save.click();
    await expect(first.card.getByRole("button", { name: "Saved", exact: true })).toHaveAttribute("aria-pressed", "true");
    expect((await reloadContinuityState(page)).saved).toEqual([{ type: "place", id: creekSlug, saved_at: expect.any(String) }]);
    phases.push({ name: "actual anonymous Save before reload", state: await reloadContinuityState(page) });
    const reloadPhase = boundary.holdScopedSearch();
    await page.reload({ waitUntil: "domcontentloaded" });
    const restored = await selectedWhileSearchHeld(page, boundary, baseURL, reloadPhase);
    await expect(restored.card.getByRole("button", { name: "Saved", exact: true })).toHaveAttribute("aria-pressed", "true");
    expect((await reloadContinuityState(page)).saved).toEqual([{ type: "place", id: creekSlug, saved_at: expect.any(String) }]);
    phases.push({ name: "reload selection, exact photo and Saved while search remains held", state: await reloadContinuityState(page) });
    boundary.releaseScopedSearch("match");
    await expect.poll(() => boundary.evidence.searchReads.some((read) => read.phase === reloadPhase && read.completed === "match")).toBe(true);
    await expect(page).toHaveURL(new URL(coldSelectedMapPath, baseURL).href);
    await expect(restored.card.getByRole("button", { name: "Saved", exact: true })).toHaveAttribute("aria-pressed", "true");
    await decoded(restored.image, creekPhoto.src);
    await assertWidth(page);
    expect(boundary.evidence.errors).toEqual([]);
  } finally {
    phases.push({ name: "final actual state", state: await reloadContinuityState(page) });
    await attach(info, "map-scoped-search-save-reload", { phases, searchReads: boundary.evidence.searchReads,
      proofBoundary: "Declared canonical-search timing through real HTTP seams and actual compiled UI. Forced WebGL-unavailable fallback; no painted-map, live recommendation or provider claim." });
    boundary.releaseAllSearch();
  }
});

for (const outcome of ["nonmatch"] as const) {
  test(`Map dismisses the URL-selected place after scoped canonical search settles ${outcome}`, async ({ context, page, baseURL }, info) => {
    await page.setViewportSize({ width: 320, height: 568 });
    await page.emulateMedia({ reducedMotion: "reduce" });
    const boundary = await prepare(context, page, baseURL, { map: true, holdScopedSearch: true });
    const phases: unknown[] = [];
    boundary.evidence.measurements.settledSearchControl = phases;
    try {
      await page.goto(coldSelectedMapPath, { waitUntil: "domcontentloaded" });
      const { card } = await selectedWhileSearchHeld(page, boundary, baseURL, 0);
      phases.push({ name: "valid selected place while canonical search is pending", state: await reloadContinuityState(page) });
      boundary.releaseScopedSearch(outcome);
      await expect.poll(() => boundary.evidence.searchReads.some((read) => read.phase === 0 && read.completed === outcome)).toBe(true);
      await expect(card, "a genuinely settled result set still removes a place it excludes").toHaveCount(0);
      const dismissed = new URL(coldSelectedMapPath, baseURL);
      dismissed.searchParams.delete("place");
      await expect(page).toHaveURL(dismissed.href);
      const current = new URL(page.url());
      for (const key of ["in", "q", "c", "layers", "show"]) expect(current.searchParams.get(key)).toBe(new URL(coldSelectedMapPath, baseURL).searchParams.get(key));
      if (outcome === "nonmatch") {
        await expect(page.getByRole("region", { name: "Available results without the map", exact: true })
          .locator(`[data-map-list-place="${otherMapPlace.slug}"]`)).toBeVisible();
      }
      expect(boundary.evidence.errors).toEqual([]);
    } finally {
      phases.push({ name: "final actual state", state: await reloadContinuityState(page) });
      await attach(info, `map-settled-scoped-search-${outcome}`, { phases, searchReads: boundary.evidence.searchReads, outcome });
      boundary.releaseAllSearch();
    }
  });
}
