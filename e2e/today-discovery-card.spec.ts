import { expect, test, type Locator, type Request } from "@playwright/test";
import { CREDITED_LOCAL_PLACE_PHOTOS } from "../src/data/credited-local-place-photos";
import { registerWebkitLoopbackDocumentSeam } from "./webkit-loopback-document";
import { dismissReturnBridge, emptyReturnBridgeState, RETURN_BRIDGE_STORAGE_KEY } from "../src/lib/return-bridge";

// Controlled transport fixtures exercise the real Today page and its consumer
// styles. They do not assert that this venue's hours or photo are current.
const slug = "beans-in-the-belfry-brunswick";
const resource = "places/today-fixture/photos/exact-photo";
const photo = `/api/place-photo?name=${encodeURIComponent(resource)}&w=800`;
const author = "Fixture photographer with a longer credit name";
const source = "https://www.google.com/maps/contrib/123/photo/456";
const scenicSlug = "co-canal-lock-30-brunswick";
const scenicPhoto = CREDITED_LOCAL_PLACE_PHOTOS[scenicSlug].image.src;
const primarySlug = "joseph-dill-baker-memorial-carillon-bell-tower";
const primaryPhoto = "/images/places/carillon-sunset.jpg";
const pixel = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAC0lEQVR4nGNgAAIAAAUAAXpeqz8AAAAASUVORK5CYII=", "base64");

test.use({ serviceWorkers: "block" });

async function expectPreviewActions(article: Locator, place: Locator, placeSlug: string, name: string, scope: string) {
  const origin = `/today?${new URLSearchParams({ in: scope })}`;
  await expect(place).toHaveAccessibleName(`View place: ${name}`);
  await expect(place).toHaveAttribute("href", `/places/${placeSlug}?${new URLSearchParams({ returnTo: origin })}`);
  const map = article.getByRole("link", { name: `Map: ${name}`, exact: true });
  await expect(map).toHaveAttribute("href", `/map?${new URLSearchParams({ place: placeSlug, in: scope, returnTo: origin })}`);
  await expect(place.locator("a")).toHaveCount(0);
  await expect(article.locator("a a")).toHaveCount(0);
}

for (const width of [320, 375, 390, 430, 1366]) {
  test(`Today preserves readable town context while unreviewed business photos stay held at ${width}px`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width, height: width === 1366 ? 900 : 844 });
    await page.emulateMedia({ reducedMotion: "reduce" });
    let metadataRequests = 0;
    const photoRequests: string[] = [];
    await page.route("**/api/want?**", (route) => route.fulfill({ json: {
      hero: { slug, name: "Beans in the Belfry", photo, where: "Brunswick", distance: "6 min walk", fact: "Hours not confirmed", confidence: "unconfirmed" },
      also: [], soon: null, later: [], notable: [], contextSource: "town", contextLabel: "Brunswick", browseHref: "/places?in=brunswick",
    } }));
    await page.route("**/api/places/map-card/**", (route) => {
      metadataRequests += 1;
      return route.fulfill({ json: { place: { slug, google_photo_url: photo, google_photo_attribution: {
        photo_name: resource, google_maps_uri: source,
        authors: [{ display_name: author, uri: "https://www.google.com/maps/contrib/123" }],
      } } } });
    });
    await page.route("**/api/place-photo?**", (route) => {
      photoRequests.push(route.request().url());
      return route.abort("blockedbyclient");
    });
    await page.goto("/today?in=brunswick", { waitUntil: "domcontentloaded" });
    const place = page.locator(`[data-today-place-lead][data-decision-id="${slug}"]`);
    const article = page.locator("article[data-today-place-preview]").filter({ has: place });
    await expect(article).toHaveCount(1);
    await expectPreviewActions(article, place, slug, "Beans in the Belfry", "brunswick");
    await article.scrollIntoViewIfNeeded();
    await expect(article.locator("img")).toHaveCount(0);
    await expect(article).toHaveAttribute("data-has-photo", "false");
    await expect(article.locator(".place-card-photo-credit")).toHaveCount(0);
    const category = page.locator(`[data-today-geographic-place="${scenicSlug}"]`);
    await expect(category).toHaveAttribute("data-photo-state", "loaded");
    await expect.poll(() => category.locator("img").evaluate((image: HTMLImageElement, expected) => {
      const url = new URL(image.currentSrc || image.src, document.baseURI);
      return image.complete && image.naturalWidth > 1 && image.naturalHeight > 1
        && decodeURIComponent(url.searchParams.get("url") ?? url.pathname) === expected;
    }, scenicPhoto)).toBe(true);
    await expect(page.locator("[data-today-geographic-place]")).toHaveCount(1);
    await expect(page.locator("[data-today-local-discovery]")).not.toContainText(/Zoe|Sabor|Find pizza/);
    const taskLinks = page.locator('[data-today-discovery-tasks] a');
    await expect(taskLinks).toHaveCount(2);
    for (const [index, kind] of ["food", "outside"].entries()) {
      const target = new URL((await taskLinks.nth(index).getAttribute("href"))!, page.url());
      expect(target.pathname).toBe("/nearby"); expect(target.searchParams.get("c")).toBe(kind);
      expect(target.searchParams.get("in")).toBe("brunswick"); expect(target.searchParams.get("facet")).toBeNull();
      expect(target.searchParams.get("returnTo")).toBe("/today?in=brunswick");
    }
    await expect(article.locator("[data-today-pick-fact]")).toHaveText("Hours not confirmed");
    await expect(article.locator("[data-today-pick-location]")).toHaveText("Brunswick · 6 min walk");
    await page.evaluate(() => document.fonts.ready);
    const places = page.locator('[aria-label="Places for your area"]');
    const articleBox = (await article.boundingBox())!;
    const placesBox = (await places.boundingBox())!;
    expect(articleBox.width).toBeGreaterThanOrEqual(placesBox.width - 2);
    for (const selector of ["[data-today-pick-fact]", "[data-today-pick-location]"]) {
      expect(await article.locator(selector).evaluate((element) => parseFloat(getComputedStyle(element).fontSize))).toBeGreaterThanOrEqual(14);
    }
    expect(await article.locator("[data-today-pick-name]").evaluate((element) => parseFloat(getComputedStyle(element).fontSize))).toBeGreaterThanOrEqual(17);
    expect(await article.evaluate((element) => element.scrollWidth - element.clientWidth)).toBeLessThanOrEqual(1);
    expect(metadataRequests).toBe(0);
    expect(photoRequests).toEqual([]);
    await expect(article.getByRole("link", { name: "Google Maps", exact: true })).toHaveCount(0);
    await expect(place.locator("a")).toHaveCount(0);
    const probes = [];
    for (const link of [place, article.getByRole("link", { name: "Map: Beans in the Belfry", exact: true }), category]) {
      await link.evaluate((element) => element.scrollIntoView({ block: "center" }));
      const probe = await link.evaluate((element) => {
        const rect = element.getBoundingClientRect(), x = rect.x + rect.width / 2, y = rect.y + rect.height / 2;
        return { width: rect.width, height: rect.height,
          hits: [[x, y], [x - 21.5, y], [x + 21.5, y], [x, y - 21.5], [x, y + 21.5]]
            .map(([px, py]) => px >= 0 && py >= 0 && px < innerWidth && py < innerHeight && element.contains(document.elementFromPoint(px, py))) };
      });
      expect(probe.width).toBeGreaterThanOrEqual(44);
      expect(probe.height).toBeGreaterThanOrEqual(44);
      expect(probe.hits).toEqual([true, true, true, true, true]);
      probes.push(probe);
    }
    await expect(page.getByRole("link", { name: "Find a place, service, event, or answer", exact: true })).toContainText("Find what you need");
    const order = await page.locator("[data-today-weather]").evaluate((weather) => Boolean(weather.compareDocumentPosition(document.querySelector('[data-surface-row="find"]')!) & Node.DOCUMENT_POSITION_FOLLOWING));
    expect(order).toBe(true);
    expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1);
    await testInfo.attach("local-fixture-proof", { contentType: "application/json", body: JSON.stringify({ width, metadataRequests, photoRequests, probes, fixture: "Declared venue facts and valid photo-credit metadata cannot authorize current appearance. No merchant photo or metadata read; the separate exact local landmark image decodes without authorizing an unreviewed merchant appearance." }) });
    await article.scrollIntoViewIfNeeded();
    await page.screenshot({ path: testInfo.outputPath(`today-card-local-fixture-${width}.png`), fullPage: true });
    await article.screenshot({ path: testInfo.outputPath(`today-card-local-fixture-detail-${width}.png`) });
  });
}

for (const failure of ["pixel", "error"] as const) {
  test(`Today retains useful place context and scoped action after the exact scenic photo ${failure}`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.route("**/api/want?**", (route) => route.fulfill({ json: {
      hero: { slug, name: "Beans in the Belfry", photo, where: "Brunswick", distance: "6 min walk", fact: "Hours not confirmed", confidence: "unconfirmed" },
      also: [], soon: null, later: [], notable: [], contextSource: "town", contextLabel: "Brunswick",
    } }));
    let metadataRequests = 0, providerRequests = 0, loads = 0;
    await page.route("**/api/places/map-card/**", (route) => {
      metadataRequests += 1;
      return route.fulfill({ json: { place: { slug, google_photo_url: photo, google_photo_attribution: {
        photo_name: resource, google_maps_uri: source, authors: [{ display_name: author }],
      } } } });
    });
    await page.route("**/api/place-photo?**", (route) => { providerRequests += 1; return route.abort("blockedbyclient"); });
    await page.route(url => (url.pathname === "/_next/image" ? url.searchParams.get("url") : url.pathname) === scenicPhoto, route => {
      loads += 1;
      return failure === "pixel" ? route.fulfill({ status: 200, contentType: "image/png", body: pixel }) : route.abort("failed");
    });
    await page.goto("/today?in=brunswick", { waitUntil: "domcontentloaded" });
    const place = page.locator(`[data-today-place-lead][data-decision-id="${slug}"]`);
    const article = page.locator("article[data-today-place-preview]").filter({ has: place });
    await expect(article).toHaveCount(1);
    await expectPreviewActions(article, place, slug, "Beans in the Belfry", "brunswick");
    await article.scrollIntoViewIfNeeded();
    await expect.poll(() => loads).toBeGreaterThan(0);
    const category = page.locator(`[data-today-geographic-place="${scenicSlug}"]`);
    await expect(category).toHaveAttribute("data-photo-state", "failed");
    await expect(category.locator("img")).toHaveCount(0);
    await expect(category).toHaveAttribute("href", `/places/${scenicSlug}?${new URLSearchParams({ in: "brunswick", returnTo: "/today?in=brunswick" })}`);
    await expect(category).toContainText("Brunswick");
    const categoryBox = (await category.boundingBox())!;
    expect(categoryBox.width).toBeGreaterThanOrEqual(44); expect(categoryBox.height).toBeGreaterThanOrEqual(44);
    await expect(page.locator("[data-today-geographic-place]")).toHaveCount(1);
    await expect(page.locator('[data-today-discovery-action="food"]')).toHaveAttribute("href", `/nearby?${new URLSearchParams({ c: "food", in: "brunswick", returnTo: "/today?in=brunswick" })}`);
    await expect(page.locator('[data-today-discovery-action="outside"]')).toHaveAttribute("href", `/nearby?${new URLSearchParams({ c: "outside", in: "brunswick", returnTo: "/today?in=brunswick" })}`);
    expect(metadataRequests).toBe(0); expect(providerRequests).toBe(0);
    await expect(article.locator("img")).toHaveCount(0);
    await expect(article).toContainText("Beans in the Belfry");
    await expect(article).toContainText("Hours not confirmed");
    await expect(article).toContainText("Brunswick · 6 min walk");
    await expect(article).toHaveAttribute("data-has-photo", "false");
    await expect(article.getByRole("link", { name: "Google Maps", exact: true })).toHaveCount(0);
    await expect(article.locator(".place-card-photo-credit")).toHaveCount(0);
    await place.scrollIntoViewIfNeeded();
    await page.screenshot({ path: testInfo.outputPath(`today-card-${failure}-fallback.png`) });
  });
}


test("Today keeps exact scenic discovery separate from a real merchant answer without current appearance review", async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  const pickSlug = "ibiza-cafe";
  const unavailableResource = "places/today-credit-failure/photos/declared-photo";
  const unavailablePhoto = `/api/place-photo?name=${encodeURIComponent(unavailableResource)}&w=800`;
  let metadataRequests = 0;
  let uncreditedPhotoRequests = 0;
  await page.route("**/api/want?**", (route) => route.fulfill({ json: {
    hero: { slug: pickSlug, name: "Ibiza Cafe", photo: unavailablePhoto, where: "Frederick", fact: "Hours not confirmed", confidence: "unconfirmed" },
    also: [], soon: null, later: [], notable: [], contextSource: "county", contextLabel: "Frederick County",
  } }));
  await page.route("**/api/places/map-card/**", (route) => {
    if (new URL(route.request().url()).pathname.endsWith(`/${pickSlug}`)) metadataRequests += 1;
    return route.fulfill({ status: 503, json: { place: null } });
  });
  await page.route("**/api/place-photo?**", (route) => {
    if (new URL(route.request().url()).searchParams.get("name") === unavailableResource) uncreditedPhotoRequests += 1;
    return route.abort("blockedbyclient");
  });
  await page.goto("/today?in=county", { waitUntil: "domcontentloaded" });
  const place = page.locator(`[data-today-place-lead][data-decision-id="${pickSlug}"]`);
  const article = page.locator("article[data-today-place-preview]").filter({ has: place });
  await expect(article).toHaveCount(1);
  await expectPreviewActions(article, place, pickSlug, "Ibiza Cafe", "county");
  await expect(article.locator("[data-today-pick-name]")).toHaveText("Ibiza Cafe");
  await expect(article.locator("[data-today-pick-fact]")).toHaveText("Hours not confirmed");
  expect(metadataRequests).toBe(0);
  await expect(article.locator("img")).toHaveCount(0);
  await expect(article).not.toContainText("Carroll Creek");
  await expect(article).toHaveAttribute("data-has-photo", "false");
  await expect(article.locator(".place-card-photo-credit")).toHaveCount(0);
  const category = page.locator(`[data-today-geographic-place="${primarySlug}"]`);
  const categoryHref = new URL((await category.getAttribute("href"))!, "https://radius.test");
  expect(categoryHref.pathname).toBe(`/places/${primarySlug}`); expect(categoryHref.searchParams.get("in")).toBe("county");
  await expect(category).toHaveAttribute("data-photo-state", "loaded");
  await expect.poll(() => category.locator("img").evaluate((image: HTMLImageElement, expected) => {
    const url = new URL(image.currentSrc || image.src, document.baseURI);
    return image.complete && image.naturalWidth > 1 && image.naturalHeight > 1
      && decodeURIComponent(url.searchParams.get("url") ?? url.pathname) === expected;
  }, primaryPhoto)).toBe(true);
  await expect(category).toContainText("Baker Park Carillon");
  await expect(category).not.toContainText("Ibiza");
  await expect(page.locator("[data-today-geographic-place]")).toHaveCount(2);
  await expect(page.locator('[data-today-discovery-action="food"]')).toHaveAttribute("href", `/nearby?${new URLSearchParams({ c: "food", in: "county", returnTo: "/today?in=county" })}`);
  await expect(page.getByRole("combobox", { name: "Choose your area", exact: true })).toHaveValue("county");
  const quickNeeds = page.getByRole("group", { name: "Quick needs", exact: true });
  const hierarchy = await article.evaluate((element) => {
    const quick = document.querySelector('[aria-label="Quick needs"]')!;
    const events = document.querySelector("[data-today-events]")!;
    const scene = document.querySelector("[data-today-local-discovery]")!;
    const answerRegion = document.querySelector('[aria-label="Places for your area"]')!;
    const news = document.querySelector('section[aria-label="Local news"]')!;
    const explore = document.querySelector('section[aria-labelledby="today-explore-heading"]')!;
    const sceneBox = scene.getBoundingClientRect(), quickBox = quick.getBoundingClientRect();
    const eventsBox = events.getBoundingClientRect(), answerBox = element.getBoundingClientRect();
    const newsBox = news.getBoundingClientRect();
    return {
      ownedSceneBeforeQuickNeeds: Boolean(scene.compareDocumentPosition(quick) & Node.DOCUMENT_POSITION_FOLLOWING),
      ownedSceneBeforeEvents: Boolean(scene.compareDocumentPosition(events) & Node.DOCUMENT_POSITION_FOLLOWING),
      eventsBeforeAreaAnswer: Boolean(events.compareDocumentPosition(element) & Node.DOCUMENT_POSITION_FOLLOWING),
      areaAnswerBeforeNews: Boolean(element.compareDocumentPosition(news) & Node.DOCUMENT_POSITION_FOLLOWING),
      newsBeforeQuickNeeds: Boolean(news.compareDocumentPosition(quick) & Node.DOCUMENT_POSITION_FOLLOWING),
      quickNeedsInExplore: explore.contains(quick),
      ownedSceneOutsideAreaAnswer: !answerRegion.contains(scene),
      verticalOrder: sceneBox.bottom <= eventsBox.top && eventsBox.bottom <= answerBox.top
        && answerBox.bottom <= newsBox.top && newsBox.bottom <= quickBox.top,
    };
  });
  expect(hierarchy).toEqual({ ownedSceneBeforeQuickNeeds: true, ownedSceneBeforeEvents: true,
    eventsBeforeAreaAnswer: true, areaAnswerBeforeNews: true, newsBeforeQuickNeeds: true,
    quickNeedsInExplore: true, ownedSceneOutsideAreaAnswer: true, verticalOrder: true });
  await expect(quickNeeds).toHaveCount(1);
  await expect(quickNeeds.getByRole("link")).toHaveCount(4);
  expect(uncreditedPhotoRequests).toBe(0);
  await testInfo.attach("separate-owned-place-and-uncredited-answer", { contentType: "application/json", body: JSON.stringify({ metadataRequests, uncreditedPhotoRequests, hierarchy, proof: "Real Today composition and independently accepted exact local landmark photography; unreviewed merchant appearance prevents metadata and image hydration while venue facts remain usable." }) });
  await page.screenshot({ path: testInfo.outputPath("today-county-no-attributable-photo.png"), fullPage: true });
});

test("Today keeps real county fallback honest through URL-only town navigation", async ({ page, context, baseURL }, info) => {
  test.setTimeout(60_000);
  if (!baseURL) throw new Error("The scope transport fixture requires the owned loopback production server.");
  const origin = new URL(baseURL);
  if (!["http:", "https:"].includes(origin.protocol) || !["localhost", "127.0.0.1"].includes(origin.hostname)) {
    throw new Error("The scope transport fixture must never run against a public deployment.");
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.addInitScript(({ key, bridge }) => {
    localStorage.setItem(key, JSON.stringify(bridge));
    localStorage.setItem("fr:scope:v1", "town:brunswick");
    document.cookie = "fr_scope=town:brunswick; path=/";
    document.cookie = "fr_onboarded=1; path=/";
  }, { key: RETURN_BRIDGE_STORAGE_KEY, bridge: dismissReturnBridge(emptyReturnBridgeState()) });

  // Only transport changes: the real county SSR HTML and its card facts are
  // untouched. No replacement place, successful scoped answer, clock or
  // geolocation is supplied. The initial town answer is held, then fails503.
  const entries = ["brunswick", "thurmont", "brunswick"] as const;
  let entry = 0;
  let releaseInitial!: () => void;
  const initialGate = new Promise<void>(resolve => { releaseInitial = resolve; });
  const requests: Array<{ entry: number; scope: string | null; category: string | null; delivered: boolean }> = [];
  let initialWantRequest: Request | undefined;
  const blocked: Record<string, number> = {};
  const deliveryErrors: string[] = [], pageErrors: string[] = [];
  page.on("pageerror", error => pageErrors.push(error.message));
  await context.routeWebSocket("**/*", socket => { blocked.websocket = (blocked.websocket ?? 0) + 1; socket.close(); });
  await page.route("**/*", async route => {
    const request = route.request(), url = new URL(request.url());
    const deny = (reason: string) => { blocked[reason] = (blocked[reason] ?? 0) + 1; return route.abort("blockedbyclient"); };
    if (url.origin !== origin.origin) return deny("external");
    if (request.method() !== "GET") return deny("write");
    if (url.pathname === "/api/want") {
      const observed = { entry, scope: url.searchParams.get("scope"), category: url.searchParams.get("c"), delivered: false };
      requests.push(observed);
      if (observed.entry === 0) {
        initialWantRequest ??= request;
        await initialGate;
      }
      try {
        await route.fulfill({ status: 503, json: { error: "Declared local scoped-answer transport unavailable" } });
        observed.delivered = true;
      } catch (error) { deliveryErrors.push(String(error)); }
      return;
    }
    if (url.pathname.startsWith("/api/")) return deny("auxiliary-api");
    if (request.resourceType() === "image" || url.pathname === "/_next/image") return deny("image-or-provider-proxy");
    // Preserve the existing WebKit helper's narrow real-document CSP seam.
    if (url.pathname === "/today" && request.isNavigationRequest() && request.resourceType() === "document") return route.fallback();
    if (url.pathname === "/today" || url.pathname.startsWith("/_next/static/")
      || /^\/(?:brand\/)?fonts\//.test(url.pathname)) return route.continue();
    return deny("auxiliary-or-telemetry");
  });

  const brief = page.locator('[data-today-decision-density="brief"]');
  const contextLine = brief.locator('header[data-today-section-heading] p');
  const browse = brief.getByRole("link", { name: /^Browse places:/ });
  const countyBrowse = async () => {
    await expect(browse).toHaveCount(1);
    const url = new URL((await browse.getAttribute("href"))!, origin);
    expect(url.origin).toBe(origin.origin); expect(url.searchParams.get("in")).toBe("county");
    expect(url.searchParams.get("town")).toBeNull();
    return url.pathname + url.search;
  };
  const assertOneRequestPerEnteredCategory = (phase: number) => {
    const actual = requests.filter(request => request.entry === phase);
    expect(actual.length).toBeGreaterThan(0);
    const keys = actual.map(request => `${request.scope}|${request.category}`);
    expect(new Set(keys).size).toBe(keys.length);
    for (const request of actual) {
      expect(request.scope).toBe(entries[phase]);
      expect(request.category).toMatch(/^cat:.+/);
    }
  };
  const afterNativePaints = () => page.evaluate(() => new Promise<void>(resolve =>
    requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
  const phases: Array<Record<string, unknown>> = [];
  try {
    const response = await page.goto("/today?in=brunswick", { waitUntil: "domcontentloaded" });
    expect(response?.status()).toBe(200);
    const ssrHtml = await response!.text();
    // Read the already received original HTML in a detached document only;
    // these identities are not inserted into or substituted for the live DOM.
    const ssrIds = await page.evaluate(html => Array.from(new DOMParser().parseFromString(html, "text/html")
      .querySelectorAll('[data-today-decision-density="brief"] [data-today-place-lead], [data-today-decision-density="brief"] [data-today-opening-soon]'))
      .map(node => node.getAttribute("data-decision-id")).filter((slug): slug is string => Boolean(slug)), ssrHtml);
    expect(ssrIds.length, "The actual server HTML must contain a real county briefing card").toBeGreaterThan(0);
    // Scope behavior begins on the actual enhanced surface, after the
    // internal server-fallback handoff. This is not a cold-first-input proof.
    await expect.poll(() => page.locator('[data-find-interaction-ready="true"]').evaluateAll(controls => controls.some(control => {
      const box = control.getBoundingClientRect();
      return box.width > 0 && box.height > 0 && getComputedStyle(control).visibility === "visible"
        && !control.closest('[hidden], [inert], [aria-hidden="true"]');
    }))).toBe(true);
    await expect.poll(() => requests.filter(request => request.entry === 0).length).toBe(1);
    await expect(contextLine).toHaveText("Countywide picks · Checking Brunswick");
    await expect(brief).toBeVisible(); await brief.scrollIntoViewIfNeeded();
    const firstVisibleId = await brief.locator('[data-today-place-lead], [data-today-opening-soon]').getAttribute("data-decision-id");
    expect(ssrIds).toContain(firstVisibleId);
    assertOneRequestPerEnteredCategory(0);
    phases.push({ scope: "brunswick", status: "pending", label: await contextLine.innerText(), browse: await countyBrowse(), ssrIds });
    const initialTimeOrigin = await page.evaluate(() => performance.timeOrigin);

    // The store ALREADY equals the destination. Only Next's real patched
    // native-history adapter/useSearchParams can announce this URL change;
    // no setScope, custom event, synthetic popstate or scripted focus occurs.
    entry = 1;
    expect(await page.evaluate(() => {
      localStorage.setItem("fr:scope:v1", "town:thurmont");
      const stored = localStorage.getItem("fr:scope:v1");
      window.history.pushState(null, "", "/today?in=thurmont");
      return stored;
    })).toBe("town:thurmont");
    await expect(page).toHaveURL(url => url.pathname === "/today" && url.searchParams.get("in") === "thurmont");
    await expect(contextLine).toHaveText("Countywide picks · Thurmont results unavailable");
    assertOneRequestPerEnteredCategory(1);
    phases.push({ scope: "thurmont", status: "failed503", label: await contextLine.innerText(), browse: await countyBrowse() });

    const heldRequest = initialWantRequest;
    const heldObservation = requests.find(request => request.entry === 0)!;
    expect(heldRequest).toBeDefined();
    const oldFailure = page.waitForResponse(response => response.request() === heldRequest && response.status() === 503);
    releaseInitial();
    const oldResponse = await oldFailure;
    expect(oldResponse.request()).toBe(heldRequest); expect(oldResponse.status()).toBe(503);
    // The real consumer rejects/cancels non-OK bodies. Header observation and
    // this exact fixture's fulfilment are the relevant delivery boundary.
    await expect.poll(() => heldObservation.delivered).toBe(true);
    await afterNativePaints();
    await expect(contextLine).toHaveText("Countywide picks · Thurmont results unavailable");
    expect(requests.filter(request => request.entry === 0)).toHaveLength(1);
    phases.push({ lateBrunswick503Ignored: true, currentLabel: await contextLine.innerText(), browse: await countyBrowse() });

    entry = 2;
    expect(await page.evaluate(() => {
      localStorage.setItem("fr:scope:v1", "town:brunswick");
      return localStorage.getItem("fr:scope:v1");
    })).toBe("town:brunswick");
    await page.goBack({ waitUntil: "domcontentloaded" });
    await expect(page).toHaveURL(url => url.pathname === "/today" && url.searchParams.get("in") === "brunswick");
    await expect(contextLine).toHaveText("Countywide picks · Brunswick results unavailable");
    await afterNativePaints();
    assertOneRequestPerEnteredCategory(2);
    expect(await page.evaluate(() => performance.timeOrigin)).toBe(initialTimeOrigin);
    phases.push({ scope: "brunswick", status: "nativeBack-failed503", label: await contextLine.innerText(), browse: await countyBrowse() });
    expect(deliveryErrors).toEqual([]); expect(pageErrors).toEqual([]);
  } finally {
    releaseInitial();
    await info.attach("real-county-url-only-scope-transport", { contentType: "application/json", body: JSON.stringify({
      fixtureBoundary: "Owned loopback real Today SSR/cards. Only /api/want is held/failed503; auxiliary/external/provider/telemetry/write/WS transport blocked. No fabricated places, successful scoped facts, clock, geolocation, scope event or focus. URL-only push and real native Back share one document. Counts are per entered scope/category; returning after a rejected request is a new entry, not a permitted duplicate within one entry.",
      entries, requests, blocked, deliveryErrors, pageErrors, phases,
    }) });
  }
});

registerWebkitLoopbackDocumentSeam();
