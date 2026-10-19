import { expect, test, type BrowserContext, type Locator, type Page, type TestInfo } from "@playwright/test";
import { writeFile } from "node:fs/promises";
import type { EventWithMeta } from "../src/lib/loaders/events";
import { dismissReturnBridge, emptyReturnBridgeState, RETURN_BRIDGE_STORAGE_KEY } from "../src/lib/return-bridge";

test.use({
  viewport: { width: 390, height: 844 },
  isMobile: true,
  hasTouch: true,
});

async function prepareOriginalFlow(page: Page, context: BrowserContext, baseURL: string | undefined, browserName: string) {
  const origin = new URL(baseURL ?? "http://localhost:3010");
  await context.addCookies([{ name: "fr_onboarded", value: "1", domain: origin.hostname, path: "/" }]);
  await page.addInitScript(({ key, bridge }) => {
    localStorage.setItem("fr:saved:v1", "[]");
    localStorage.setItem("fr_map_location_intro_v1", "dismissed");
    localStorage.setItem(key, JSON.stringify(bridge));
  }, { key: RETURN_BRIDGE_STORAGE_KEY, bridge: dismissReturnBridge(emptyReturnBridgeState()) });
  await page.route("**/*", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    if (url.origin !== origin.origin) return route.abort("blockedbyclient");
    if (browserName === "webkit" && origin.protocol === "http:"
      && ["localhost", "127.0.0.1", "[::1]"].includes(origin.hostname)
      && request.isNavigationRequest() && request.resourceType() === "document") {
      const response = await route.fetch();
      const headers = response.headers();
      if (headers["content-security-policy"]) headers["content-security-policy"] = headers["content-security-policy"].split(";")
        .filter((directive) => directive.trim().toLowerCase() !== "upgrade-insecure-requests").join(";");
      return route.fulfill({ response, headers });
    }
    if (url.pathname === "/api/auth/me") return route.fulfill({ status: 200, json: { user: null } });
    if (request.resourceType() === "image") {
      const source = url.pathname === "/_next/image" ? url.searchParams.get("url") ?? "" : url.pathname;
      if (!["/images/", "/place-photos/", "/history-photos/", "/brand/", "/icons/"].some((prefix) => source.startsWith(prefix))) {
        return route.fulfill({ status: 503, body: "Photo transport unavailable in native acceptance" });
      }
    }
    const localCatalogRead = request.method() === "GET" && ["/api/map/places", "/api/search", "/api/places/by-slugs", "/api/events/browse"].includes(url.pathname);
    if (localCatalogRead) return route.continue();
    if (request.method() === "GET" && url.pathname.startsWith("/api/")) return route.fulfill({ status: 503, json: { error: "Unrelated read unavailable in native acceptance" } });
    if (!["GET", "HEAD"].includes(request.method())) return route.abort("blockedbyclient");
    return route.continue();
  });
}

async function expectRouteAndScroll(
  page: Page,
  expectedUrl: string,
  expectedScrollY: number,
) {
  await expect(page).toHaveURL(expectedUrl);
  await expect
    .poll(async () =>
      Math.abs((await page.evaluate(() => window.scrollY)) - expectedScrollY),
    )
    .toBeLessThanOrEqual(2);
}

test("Find is reversible through Close, Escape, and browser Back", async ({
  page, context, baseURL, browserName,
}) => {
  await prepareOriginalFlow(page, context, baseURL, browserName);
  await page.goto("/today", { waitUntil: "domcontentloaded" });
  await expect(page.getByRole("heading", { level: 1 })).toBeAttached();
  // Today hydrates live rails below the fold. Let that first layout settle so
  // this test measures the modal's scroll contract rather than a feed card
  // arriving while the overlay happens to be open.
  await page.waitForLoadState("networkidle");
  const trigger = page.getByRole("link", {
    name: "Find a place, service, event, or answer", exact: true,
  });
  await expect(trigger).toHaveAttribute("data-find-interaction-ready", "true");
  // The current request doorway is in the page. Put it visibly below the
  // persistent header before recording the real, nonzero launch position.
  const headerBottom = await page.locator("header").first().evaluate((node) => node.getBoundingClientRect().bottom);
  await trigger.evaluate((node, inset) => window.scrollTo(0, Math.max(1, scrollY + node.getBoundingClientRect().top - inset - 24)), headerBottom);
  const scrollY = await page.evaluate(() => window.scrollY);
  expect(scrollY).toBeGreaterThan(0);
  const url = page.url();

  const openFind = async () => {
    await trigger.click();
    await expect(
      page.getByRole("dialog", { name: "What do you need?" }),
    ).toBeVisible();
    await expect
      .poll(() =>
        page.evaluate(
          () =>
            typeof history.state?.__frederickRadiusLayer === "string",
        ),
      )
      .toBe(true);
  };

  await openFind();
  await page.getByRole("button", { name: "Close Find" }).click();
  await expect(page.locator("#radius-find-dialog")).toHaveCount(0);
  await expect(trigger).toBeFocused();
  await expectRouteAndScroll(page, url, scrollY);

  await openFind();
  await page.keyboard.press("Escape");
  await expect(page.locator("#radius-find-dialog")).toHaveCount(0);
  await expect(trigger).toBeFocused();
  await expectRouteAndScroll(page, url, scrollY);

  await openFind();
  await page.goBack();
  await expect(page.locator("#radius-find-dialog")).toHaveCount(0);
  await expect(trigger).toBeFocused();
  await expectRouteAndScroll(page, url, scrollY);
});

test("a place sheet closes in place and Save acknowledges before auth resolves", async ({
  page, context, baseURL, browserName,
}, info) => {
  await prepareOriginalFlow(page, context, baseURL, browserName);
  let releaseAuth: (() => void) | undefined;
  const authGate = new Promise<void>((resolve) => {
    releaseAuth = resolve;
  });
  await page.route("**/api/auth/me", async (route) => {
    await authGate;
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ user: null }),
    });
  });

  await page.goto(
    "/map?c=-77.4100,39.4150,12.4&show=transit&layers=parks&q=Gravel",
    { waitUntil: "domcontentloaded" },
  );
  const search = page.getByRole("combobox", { name: "Search this map" });
  const fallback = page.getByRole("region", { name: "Available results without the map", exact: true });
  // The product allows its deferred renderer up to 15 seconds to become
  // usable or expose recovery. Require an actionable control within that
  // same bound; a loading scene or error alone is never success.
  await expect.poll(async () => await search.isVisible() || await fallback.isVisible(), {
    timeout: 15_000,
    message: "the map exposes search or its actionable results recovery",
  }).toBe(true);
  const rendererAvailable = await search.isVisible();
  if (rendererAvailable) {
    await search.fill("Gravel and Grind");
    await page.locator('[data-map-search-result="place:gravel-and-grind-frederick"]').click();
    await expect.poll(() => new URL(page.url()).searchParams.get("c")).toMatch(/,15(?:\.0+)?$/);
  } else {
    await fallback.getByRole("button", { name: /^Gravel & Grind/ }).click();
    info.annotations.push({ type: "coverage", description: "Local renderer is unconfigured: real query/result/sheet/Back coverage; camera and rendered-map coverage remain separate." });
    expect(new URL(page.url()).searchParams.get("q")).toBe("Gravel");
  }
  await expect.poll(() => new URL(page.url()).searchParams.get("place")).toBe("gravel-and-grind-frederick");
  expect(new URL(page.url()).searchParams.get("show")).toBe("transit");
  expect(new URL(page.url()).searchParams.get("layers")).toBe("parks");
  const mapUrl = page.url();
  const details = page.getByRole("button", { name: "Details", exact: true });

  const openPlace = async () => {
    await details.click();
    await expect(
      page.getByRole("dialog", { name: "Gravel & Grind" }),
    ).toBeVisible();
  };

  await openPlace();
  const save = page
    .getByRole("dialog", { name: "Gravel & Grind" })
    .locator(
    '[data-save-ref="place:gravel-and-grind-frederick"]',
    );
  await expect(save).toHaveAttribute("aria-pressed", "false");
  await save.click();
  await expect(save).toHaveAttribute("aria-busy", "true", { timeout: 300 });
  await expect(save).toHaveAttribute("aria-pressed", "false");
  await expect(save).toHaveAccessibleName("Saving Gravel & Grind");
  releaseAuth?.();
  await expect(save).toHaveAttribute("aria-pressed", "true");
  await expect(save).toHaveAccessibleName(
    "Remove Gravel & Grind from Saved",
  );
  await expect(
    page.getByText(/Your saved list starts here|Saved · Gravel & Grind/),
  ).toBeVisible();
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem("fr:saved:v1") ?? "[]"))).toEqual([
    { type: "place", id: "gravel-and-grind-frederick", saved_at: expect.any(String) },
  ]);

  await page
    .getByRole("button", { name: "Close place details" })
    .click();
  await expect(page.getByRole("dialog", { name: "Gravel & Grind" })).toHaveCount(0);
  await expect(details).toBeFocused();
  await expect(page).toHaveURL(mapUrl);

  await openPlace();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog", { name: "Gravel & Grind" })).toHaveCount(0);
  await expect(details).toBeFocused();
  await expect(page).toHaveURL(mapUrl);

  await openPlace();
  await page.goBack();
  await expect(page.getByRole("dialog", { name: "Gravel & Grind" })).toHaveCount(0);
  await expect(details).toBeFocused();
  await expect(page).toHaveURL(mapUrl);
});

test("the place-page Save CTA names its pending action immediately", async ({
  page, context, baseURL, browserName,
}) => {
  await prepareOriginalFlow(page, context, baseURL, browserName);
  let releaseAuth: (() => void) | undefined;
  const authGate = new Promise<void>((resolve) => {
    releaseAuth = resolve;
  });
  await page.route("**/api/auth/me", async (route) => {
    await authGate;
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ user: null }),
    });
  });

  await page.goto("/places/gravel-and-grind-frederick", {
    waitUntil: "domcontentloaded",
  });
  const save = page.locator(
    '[data-place-save="gravel-and-grind-frederick"]',
  );
  await expect(save).toHaveAttribute("aria-pressed", "false");
  await save.click();
  await expect(save).toHaveAttribute("aria-busy", "true", { timeout: 300 });
  await expect(save).toHaveAttribute("aria-pressed", "false");
  await expect(save).toHaveAccessibleName("Saving Gravel & Grind");
  await expect(save).toContainText("Saving");

  releaseAuth?.();
  await expect(save).toHaveAttribute("aria-pressed", "true");
  await expect(save).toHaveAccessibleName(
    "Saved. Tap to remove Gravel & Grind",
  );
  await expect(save).toContainText("Saved");
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem("fr:saved:v1") ?? "[]"))).toEqual([
    { type: "place", id: "gravel-and-grind-frederick", saved_at: expect.any(String) },
  ]);
});

test("declared fixture: an event sheet keeps its route and restores the event trigger", async ({
  page, context, baseURL, browserName,
}) => {
  await prepareOriginalFlow(page, context, baseURL, browserName);
  const instant = Date.now();
  const event: EventWithMeta = {
    slug: "interaction-contract-event", title: "Interaction contract event",
    description: "Declared fictional HTTP event used only to protect sheet behavior.",
    starts_at: new Date(instant - 15 * 60_000).toISOString(), ends_at: new Date(instant + 2 * 3_600_000).toISOString(),
    timezone: "America/New_York", venue_name: "Carroll Creek", address: "Fictional fixture at a real venue",
    geom: { lng: -77.4105, lat: 39.4142 }, municipality: "frederick", category: "music", audience: [], is_free: true,
    source: "manual", source_url: "https://example.test/native-sheet-fixture", is_verified: true,
    last_verified_at: new Date(instant).toISOString(), source_id: "test:interaction-contract-event",
    license: "Fictional test facts only", confidence: "curated", first_seen_at: new Date(instant).toISOString(),
    geo_confidence: "exact_address", category_name: "Music", municipality_name: "Frederick", attendance_mode: "physical", status: "scheduled",
  };
  await page.route("**/api/events/browse*", (route) => route.fulfill({ status: 200, json: {
    events: [event], liveSlugs: [event.slug], generatedAt: new Date().toISOString(), sourceHealth: { degraded: false, issues: [] },
  } }));
  await page.route(`**/api/events/${event.slug}/summary*`, (route) => route.fulfill({ status: 200, json: { event } }));

  await page.goto("/events", { waitUntil: "domcontentloaded" });
  const trigger = page.locator('article a[href^="/events/"]').first();
  await expect(trigger).toBeVisible();
  await trigger.scrollIntoViewIfNeeded();
  const scrollY = await page.evaluate(() => window.scrollY);
  const url = page.url();

  const openEvent = async () => {
    await trigger.focus();
    await trigger.click();
    await expect(
      page.getByRole("dialog", { name: "Interaction contract event" }),
    ).toBeVisible();
  };
  const close = page
    .getByRole("button", { name: "Close", exact: true })
    .filter({ hasText: "Close" });

  await openEvent();
  await close.click();
  await expect(
    page.getByRole("dialog", { name: "Interaction contract event" }),
  ).toHaveCount(0);
  await expect(trigger).toBeFocused();
  await expectRouteAndScroll(page, url, scrollY);

  await openEvent();
  await page.keyboard.press("Escape");
  await expect(
    page.getByRole("dialog", { name: "Interaction contract event" }),
  ).toHaveCount(0);
  await expect(trigger).toBeFocused();
  await expectRouteAndScroll(page, url, scrollY);

  await openEvent();
  await page.goBack();
  await expect(
    page.getByRole("dialog", { name: "Interaction contract event" }),
  ).toHaveCount(0);
  await expect(trigger).toBeFocused();
  await expectRouteAndScroll(page, url, scrollY);
});

test("event filters acknowledge taps and the map retains requested layer intent during recovery", async ({
  page, context, baseURL, browserName,
}, info) => {
  await prepareOriginalFlow(page, context, baseURL, browserName);
  await page.goto("/events", { waitUntil: "domcontentloaded" });
  const when = page.getByRole("group", { name: "When" });
  const weekend = when.getByRole("button", { name: "This weekend" });
  await expect(weekend).toHaveAttribute("aria-pressed", "false");
  await weekend.click();
  await expect(weekend).toHaveAttribute("aria-pressed", "true", {
    timeout: 300,
  });

  await page.waitForLoadState("networkidle", { timeout: 10_000 });
  await page.goto("/map?layers=parks", { waitUntil: "domcontentloaded" });
  const filters = page.getByRole("button", { name: "Filters: choose what to see on this map" });
  const fallback = page.getByRole("region", { name: "Available results without the map", exact: true });
  await expect.poll(async () => await filters.isVisible() || await fallback.isVisible()).toBe(true);
  if (!(await filters.isVisible())) {
    await expect(fallback.getByRole("button").first()).toBeVisible();
    expect(new URL(page.url()).searchParams.get("layers")).toBe("parks");
    info.annotations.push({ type: "coverage", description: "Unconfigured local map retains the requested parks layer and actionable results. Actual layer-toggle acknowledgment requires a configured renderer and is not claimed by this branch." });
    return;
  }
  await filters.click();
  await page
    .getByRole("region", { name: "Choose what to see" })
    .getByRole("button", {
      name: /^Get around/,
    })
    .click();
  const transit = page
    .getByRole("region", { name: "Get around" })
    .getByRole("button", { name: /Transit routes/ });
  await expect(transit).toHaveAttribute("aria-pressed", "false");
  await transit.click();
  await expect(page.getByRole("region", { name: "Get around" })).toBeVisible({
    timeout: 300,
  });
  await expect(
    page
      .getByRole("region", { name: "Get around" })
      .getByRole("button", { name: /Transit routes/ }),
  ).toHaveAttribute("aria-pressed", "true");
});

/** These checks use real production controls and real browser input. Only a
 * clearly fictional event's HTTP DTO is controlled; place and town records,
 * layout, CSS, routing, sheet providers and keyboard behavior remain real.
 * They do not establish current production catalog or provider availability. */
test.describe("stable native press surfaces", () => {
  test.use({ serviceWorkers: "block" });

  const eventSlug = "declared-native-interaction-fixture";
  const eventTitle = "Declared native interaction fixture";
  const placeName = "Curious Iguana";
  const placeSlug = "the-curious-iguana-frederick";
  const runtime = new WeakMap<Page, { errors: string[]; blocked: string[]; localHttpCspAdjusted: boolean }>();

  test.beforeEach(async ({ page, context, baseURL, browserName }) => {
    const origin = new URL(baseURL ?? "http://localhost:3010");
    const evidence = { errors: [] as string[], blocked: [] as string[], localHttpCspAdjusted: false };
    runtime.set(page, evidence);
    page.on("pageerror", (error) => evidence.errors.push(error.message));
    await context.addCookies([{ name: "fr_onboarded", value: "1", domain: origin.hostname, path: "/" }]);
    await page.addInitScript(({ key, bridge }) => {
      localStorage.setItem("fr:appearance:v1", "light");
      localStorage.setItem("fr:saved:v1", "[]");
      localStorage.setItem("fr_map_location_intro_v1", "dismissed");
      localStorage.setItem(key, JSON.stringify(bridge));
    }, { key: RETURN_BRIDGE_STORAGE_KEY, bridge: dismissReturnBridge(emptyReturnBridgeState()) });
    const instant = Date.now();
    const event: EventWithMeta = {
      slug: eventSlug, title: eventTitle,
      description: "Fictional HTTP fixture for native interaction acceptance. This is not a public event listing.",
      starts_at: new Date(instant - 15 * 60_000).toISOString(), ends_at: new Date(instant + 2 * 3_600_000).toISOString(),
      timezone: "America/New_York", venue_name: "Schifferstadt Architectural Museum",
      venue_place_slug: "schifferstadt-architectural-museum-frederick", address: "Fictional event at a real venue for component acceptance only",
      geom: { lat: 39.4142, lng: -77.4105 }, municipality: "frederick", municipality_name: "Frederick",
      category: "music", category_name: "Music", audience: [], is_free: true, attendance_mode: "physical",
      geo_confidence: "exact_address", source: "manual", source_id: eventSlug,
      source_url: "https://example.test/declared-native-interaction-fixture", confidence: "curated",
      license: "Fictional test facts only", first_seen_at: new Date(instant).toISOString(),
      last_verified_at: new Date(instant).toISOString(), is_verified: true, status: "scheduled",
    };
    await context.route("**/*", async (route) => {
      const request = route.request();
      const url = new URL(request.url());
      if (url.origin !== origin.origin) {
        evidence.blocked.push(`${request.method()} ${url.origin}${url.pathname}`);
        return route.abort("blockedbyclient");
      }
      if (browserName === "webkit" && origin.protocol === "http:"
        && ["localhost", "127.0.0.1", "[::1]"].includes(origin.hostname)
        && request.isNavigationRequest() && request.resourceType() === "document") {
        // The established local WebKit transport workaround retains real HTML
        // and all other CSP directives. Production HTTPS is never changed.
        const response = await route.fetch();
        const headers = response.headers();
        if (headers["content-security-policy"]) {
          const before = headers["content-security-policy"];
          headers["content-security-policy"] = before.split(";")
            .filter((directive) => directive.trim().toLowerCase() !== "upgrade-insecure-requests").join(";");
          evidence.localHttpCspAdjusted ||= before !== headers["content-security-policy"];
        }
        return route.fulfill({ response, headers });
      }
      if (url.pathname === "/api/auth/me") return route.fulfill({ status: 200, json: { user: null } });
      if (request.method() === "GET" && url.pathname === "/api/events/browse") {
        return route.fulfill({ status: 200, json: {
          events: [event], liveSlugs: [eventSlug], generatedAt: new Date().toISOString(), sourceHealth: { degraded: false, issues: [] },
        } });
      }
      if (request.method() === "GET" && url.pathname === `/api/events/${eventSlug}/summary`) {
        return route.fulfill({ status: 200, json: { event } });
      }
      if (request.method() === "GET" && (url.pathname === "/api/places/by-slugs" || url.pathname === "/api/map/places"
        || /^\/api\/places\/[^/]+\/summary$/.test(url.pathname))) return route.continue();
      if (request.method() === "GET" && url.pathname === "/api/place-photo") {
        evidence.blocked.push(`${request.method()} ${url.pathname}`);
        return route.fulfill({ status: 503, json: { error: "Paid photo transport disabled in native interaction acceptance" } });
      }
      if (request.resourceType() === "image") {
        const source = url.pathname === "/_next/image" ? url.searchParams.get("url") ?? "" : url.pathname;
        if (!["/images/", "/place-photos/", "/history-photos/", "/brand/", "/icons/"].some((prefix) => source.startsWith(prefix))) {
          evidence.blocked.push(`${request.method()} ${url.pathname}`);
          return route.abort("blockedbyclient");
        }
      }
      if (request.method() === "GET" && url.pathname.startsWith("/api/")) {
        return route.fulfill({ status: 503, json: { error: "Declared unavailable unrelated read in native interaction acceptance" } });
      }
      if (!["GET", "HEAD"].includes(request.method()) || url.pathname.startsWith("/api/")) return route.abort("blockedbyclient");
      return route.continue();
    });
  });

  test.afterEach(async ({ page }, info) => {
    const evidence = runtime.get(page);
    if (evidence) await attach(info, "native-runtime", evidence);
  });

  async function snapshot(target: Locator) {
    return target.evaluate((node) => {
      const box = (element: Element) => {
        const { x, y, width, height } = element.getBoundingClientRect();
        return { x, y, width, height };
      };
      const style = (element: Element) => {
        const css = getComputedStyle(element);
        const matrix = new DOMMatrixReadOnly(css.transform === "none" ? undefined : css.transform);
        return { transform: css.transform, scale: css.scale, matrixScale: Math.hypot(matrix.a, matrix.b),
          matrixIdentity: matrix.isIdentity, matrix: [matrix.a, matrix.b, matrix.c, matrix.d, matrix.e, matrix.f],
          outline: css.outlineStyle, outlineWidth: css.outlineWidth, shadow: css.boxShadow,
          borderColor: css.borderColor, color: css.color, background: css.backgroundColor };
      };
      const faces = node.querySelectorAll(":scope > [data-press-face]");
      const face = faces[0];
      const article = node.closest("article");
      const rect = node.getBoundingClientRect();
      const pseudo = getComputedStyle(node, "::after");
      const extender = pseudo.content !== "none" && pseudo.pointerEvents !== "none" && pseudo.position === "absolute";
      const centerX = rect.x + rect.width / 2, centerY = rect.y + rect.height / 2;
      const hitOwners: Array<{ tag: string; name: string | null } | null> = [];
      const hits = [[centerX, centerY], [centerX - 21, centerY], [centerX + 21, centerY], [centerX, centerY - 21], [centerX, centerY + 21]]
        .map(([x, y]) => {
          const hit = document.elementFromPoint(x, y);
          hitOwners.push(hit ? { tag: hit.tagName, name: hit.getAttribute("aria-label") ?? hit.textContent?.trim().slice(0, 100) ?? null } : null);
          return x >= 0 && x < innerWidth && y >= 0 && y < innerHeight && Boolean(hit && (hit === node || node.contains(hit)));
        });
      const clipAncestors: Array<{ tag: string; className: string; box: ReturnType<typeof box>; overflowX: string; overflowY: string; paddingTop: string; paddingBottom: string }> = [];
      for (let ancestor = node.parentElement, depth = 0; ancestor && depth < 8; ancestor = ancestor.parentElement, depth += 1) {
        const css = getComputedStyle(ancestor);
        if (css.overflowX !== "visible" || css.overflowY !== "visible") clipAncestors.push({
          tag: ancestor.tagName, className: ancestor.className.slice(0, 200), box: box(ancestor),
          overflowX: css.overflowX, overflowY: css.overflowY, paddingTop: css.paddingTop, paddingBottom: css.paddingBottom,
        });
      }
      const siblings = article ? [...article.querySelectorAll("[data-save-ref], a[target='_blank']")]
        .filter((element) => !node.contains(element)).map((element) => ({ name: element.getAttribute("aria-label") ?? element.textContent?.trim(), box: box(element), ...style(element) })) : [];
      return {
        tag: node.tagName, kind: node.getAttribute("data-press-target"), box: box(node), ...style(node),
        active: node.matches(":active"), faceCount: faces.length,
        effectiveWidth: Math.max(rect.width, extender ? parseFloat(pseudo.width) || 0 : 0),
        effectiveHeight: Math.max(rect.height, extender ? parseFloat(pseudo.height) || 0 : 0), hits, hitOwners, clipAncestors,
        face: face ? { box: box(face), ...style(face), opacity: getComputedStyle(face).opacity } : null,
        article: article ? { box: box(article), ...style(article) } : null,
        siblings,
      };
    });
  }

  type PressSnapshot = Awaited<ReturnType<typeof snapshot>>;

  function sameBounds(before: PressSnapshot["box"], after: PressSnapshot["box"]) {
    for (const key of ["x", "y", "width", "height"] as const) {
      expect(Math.abs(after[key] - before[key]), `${key} of the physical tap target stays fixed`).toBeLessThanOrEqual(0.5);
    }
  }

  function fixedOuter(before: PressSnapshot, during: PressSnapshot) {
    sameBounds(before.box, during.box);
    // The CSS compiler may lower none + scale:1 to a computed identity
    // matrix. Require its exact physical meaning, including no translation,
    // skew or rotation, rather than a particular serialized CSS spelling.
    expect(during.matrixIdentity).toBe(true);
    expect(during.matrix).toEqual([1, 0, 0, 1, 0, 0]);
    expect(["1", "none"]).toContain(during.scale);
    expect(during.faceCount).toBe(1);
    if (before.article && during.article) {
      sameBounds(before.article.box, during.article.box);
      expect(during.article.matrixScale).toBe(1);
    }
    expect(during.siblings.map(({ name }) => name)).toEqual(before.siblings.map(({ name }) => name));
    before.siblings.forEach((sibling, index) => {
      sameBounds(sibling.box, during.siblings[index].box);
      expect(during.siblings[index].transform).toBe(sibling.transform);
      expect(during.siblings[index].scale).toBe(sibling.scale);
    });
  }

  async function pressAndDragOut(page: Page, target: Locator, reduce: boolean) {
    // A target can be inside the viewport yet covered by persistent mobile
    // navigation. The nearest-edge helper leaves it there. Center the real
    // control with native scrolling before measuring its unchanged hit box.
    await target.evaluate((node) => node.scrollIntoView({ block: "center", inline: "nearest", behavior: "instant" }));
    await expect(target).toBeVisible();
    // Wait for real entrance/layout work before taking the physical baseline.
    await expect.poll(async () => {
      const a = await target.boundingBox();
      await page.evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
      const b = await target.boundingBox();
      return Boolean(a && b && ["x", "y", "width", "height"].every((key) => Math.abs(a[key as keyof typeof a] - b[key as keyof typeof b]) < 0.1));
    }).toBe(true);
    const before = await snapshot(target);
    expect(["A", "BUTTON"]).toContain(before.tag);
    expect(before.faceCount).toBe(1);
    expect(before.face?.matrixScale).toBe(1);
    expect(Math.round(before.effectiveWidth * 100) / 100).toBeGreaterThanOrEqual(44);
    expect(Math.round(before.effectiveHeight * 100) / 100).toBeGreaterThanOrEqual(44);
    if (before.hits.some((owned) => !owned)) await attach(test.info(), "blocked-native-hit-target", before);
    expect(before.hits, "the physical 44px interior remains owned by the native control").toEqual([true, true, true, true, true]);
    await page.mouse.move(before.box.x + before.box.width / 2, before.box.y + before.box.height / 2);
    await page.mouse.down();
    let during: PressSnapshot;
    try {
      await expect.poll(async () => (await snapshot(target)).active).toBe(true);
      if (reduce) await expect.poll(async () => (await snapshot(target)).face?.matrixScale).toBe(1);
      else await expect.poll(async () => (await snapshot(target)).face!.matrixScale).toBeLessThan(0.9999);
      await expect.poll(async () => (await snapshot(target)).face?.opacity).toBe("1");
      during = await snapshot(target);
      fixedOuter(before, during);
      if (reduce) {
        expect(during.face?.matrixIdentity).toBe(true);
        expect(during.face?.matrix).toEqual([1, 0, 0, 1, 0, 0]);
        expect(["1", "none"]).toContain(during.face?.scale);
        expect(during.shadow, "reduced motion retains a static, visible press acknowledgment").not.toBe("none");
        expect(during.shadow).not.toBe(before.shadow);
      } else {
        expect(during.face!.matrixScale).toBeGreaterThanOrEqual(0.97);
      }
      // A physical drag out and release must leave this action unactivated.
      await page.mouse.move(2, 2);
    } finally {
      await page.mouse.up();
    }
    await expect.poll(async () => (await snapshot(target)).face?.matrixScale).toBe(1);
    const after = await snapshot(target);
    fixedOuter(before, after);
    expect(after.active).toBe(false);
    return { before, during: during!, after };
  }

  async function reachByKeyboard(page: Page, target: Locator) {
    // macOS WebKit's native default Tab policy skips links. Option+Tab is its
    // real all-controls traversal; neither engine gets scripted element focus.
    const traversal = page.context().browser()?.browserType().name() === "webkit" ? "Alt+Tab" : "Tab";
    for (let step = 0; step < 100; step += 1) {
      await page.keyboard.press(traversal);
      if (await target.evaluate((node) => node === document.activeElement)) {
        await expect(target).toBeFocused();
        const focus = await snapshot(target);
        expect(focus.outline).not.toBe("none");
        expect(parseFloat(focus.outlineWidth)).toBeGreaterThanOrEqual(2);
        return { steps: step + 1, traversal };
      }
    }
    throw new Error(`The real ${traversal} sequence did not reach the production press target in 100 steps.`);
  }

  async function replaceDocument(page: Page, path: string) {
    // Keep the established WebKit-only boundary for canceled RSC prefetch
    // diagnostics. Chromium readiness belongs to the destination's real
    // interaction assertions, not unrelated background network quiescence.
    if (page.context().browser()?.browserType().name() === "webkit" && page.url() !== "about:blank") {
      await page.waitForLoadState("networkidle", { timeout: 10_000 });
    }
    return page.goto(path, { waitUntil: "domcontentloaded" });
  }

  async function events(page: Page) {
    await replaceDocument(page, "/events?in=frederick&lens=today");
    await expect(page.locator("[data-events-interaction-ready]")).toHaveAttribute("data-events-interaction-ready", "true");
    // Recommended can promote the sole result to the separate poster
    // component. Select the real alphabetical list to exercise EventGlance's
    // own interaction owner, rather than pretending a poster has that API.
    const display = page.locator('summary[aria-label^="Change event display."]');
    await display.click();
    await page.getByRole("button", { name: "Order: Recommended", exact: true }).filter({ visible: true }).click();
    await page.getByRole("group", { name: "Order", exact: true }).getByRole("button", { name: /^A→Z/ }).click();
    await expect(display).toHaveAttribute("aria-label", /A→Z order/);
    const trigger = page.locator(`main a[data-press-target="card"][href="/events/${eventSlug}"]`).first();
    await expect(trigger).toContainText(eventTitle);
    return trigger;
  }

  async function noOverflow(page: Page) {
    const dimensions = await page.evaluate(() => ({ viewport: innerWidth, document: document.documentElement.scrollWidth, body: document.body.scrollWidth }));
    expect(dimensions.document).toBeLessThanOrEqual(dimensions.viewport + 1);
    expect(dimensions.body).toBeLessThanOrEqual(dimensions.viewport + 1);
    return dimensions;
  }

  async function doubleReadingText(page: Page, target: Locator) {
    const normal = await target.evaluate((node) => parseFloat(getComputedStyle(node).fontSize));
    await page.addStyleTag({ content: "html { font-size: 200% !important; }" });
    // These two shared primitives currently size labels in px. Declare an
    // exact 200% reading-size fixture on the real control, without changing
    // any box, hit extender, transform, padding, or browser zoom. A root-only
    // declaration would leave the labels unchanged and falsely claim coverage.
    await target.evaluate((node, size) => (node as HTMLElement).style.setProperty("font-size", `${size}px`, "important"), normal * 2);
    const enlarged = await target.evaluate((node) => parseFloat(getComputedStyle(node).fontSize));
    expect(enlarged / normal, "the actual control text doubles, not just the root declaration").toBeCloseTo(2, 2);
    const faceText = await target.locator(":scope > [data-press-face]").evaluate((node) => parseFloat(getComputedStyle(node).fontSize));
    expect(faceText).toBe(enlarged);
    return { normal, enlarged, faceText, ratio: enlarged / normal, width: (await page.viewportSize())?.width,
      mechanism: "Declared root 200% plus exact doubled computed control text for fixed-px labels; no geometry override or browser zoom" };
  }

  async function books(page: Page) {
    await replaceDocument(page, "/nearby?c=shops&facet=book-store&sort=rated&in=frederick");
    await expect(page.locator('[data-nearby-interaction-ready="true"]')).toBeVisible();
    const card = page.locator('article[data-place-card-variant="discovery"]').filter({ has: page.getByRole("heading", { name: placeName, exact: true }) });
    await expect(card).toHaveCount(1);
    const trigger = card.getByRole("button", { name: /^View Curious Iguana .*details$/ });
    await expect(trigger).toHaveAttribute("data-press-target", "card");
    expect(await trigger.locator("[data-save-ref], a, button").count(), "independent actions never become nested in the detail control").toBe(0);
    await expect(card.locator(`[data-save-ref="place:${placeSlug}"]`)).toBeVisible();
    await expect(card.getByRole("link", { name: /Directions/ })).toBeVisible();
    return { trigger, card };
  }

  async function attach(info: TestInfo, name: string, receipt: unknown) {
    const path = info.outputPath(`${name}.json`);
    await writeFile(path, JSON.stringify(receipt, null, 2));
    await info.attach(name, { contentType: "application/json", path });
  }

  async function stationaryPhotograph(page: Page, image: Locator, sibling: Locator) {
    await sibling.scrollIntoViewIfNeeded();
    await page.mouse.move(2, 2);
    await expect.poll(() => image.evaluate(async (node) => {
      const photo = node as HTMLImageElement;
      await photo.decode().catch(() => undefined);
      return photo.complete && photo.naturalWidth > 1;
    })).toBe(true);
    const sampleFrames = () => image.evaluate((node) => new Promise<Array<{
      x: number; y: number; width: number; height: number; transform: string; scale: string;
    }>>((resolve) => {
      const samples: Array<{ x: number; y: number; width: number; height: number; transform: string; scale: string }> = [];
      const sample = () => {
        const { x, y, width, height } = node.getBoundingClientRect();
        const css = getComputedStyle(node);
        samples.push({ x, y, width, height, transform: css.transform, scale: css.scale });
        if (samples.length < 12) requestAnimationFrame(sample);
        else resolve(samples);
      };
      requestAnimationFrame(sample);
    }));
    const baseline = (await sampleFrames()).at(-1)!;
    await sibling.hover();
    const hovered = await sampleFrames();
    await page.mouse.down();
    let pressed: Awaited<ReturnType<typeof sampleFrames>>;
    try {
      pressed = await sampleFrames();
      await page.mouse.move(2, 2);
    } finally {
      await page.mouse.up();
    }
    const released = await sampleFrames();
    for (const sample of [...hovered, ...pressed!, ...released]) {
      sameBounds(baseline, sample);
      expect(sample.transform, "a sibling action never zooms the photograph").toBe(baseline.transform);
      expect(sample.scale).toBe(baseline.scale);
    }
    return { baseline, hovered, pressed: pressed!, released };
  }

  test("Chromium fixture document changes remain usable with a declared active background read", async ({ page, browserName }, info) => {
    test.skip(browserName !== "chromium", "WebKit retains its separate RSC-settling boundary and strict error checks.");
    await page.emulateMedia({ reducedMotion: "reduce" });
    const backgroundPath = "/__declared-native-background-read.svg";
    let heldRead = false;
    let released = false;
    let release!: () => void;
    const gate = new Promise<void>((resolve) => { release = resolve; });
    await page.route((url) => url.pathname === backgroundPath, async (route) => {
      heldRead = true;
      await gate;
      return route.fulfill({ status: 200, contentType: "image/svg+xml", body: '<svg xmlns="http://www.w3.org/2000/svg" width="1" height="1" />' });
    });
    await page.addInitScript((path) => {
      if (location.pathname !== "/events") return;
      // An unattached image starts a real, held same-origin HTTP read before
      // this document can reach networkidle. It never changes product layout.
      const image = new Image();
      image.src = path;
      (window as Window & { declaredNativeBackgroundRead?: HTMLImageElement }).declaredNativeBackgroundRead = image;
    }, backgroundPath);
    try {
      const trigger = await events(page);
      await expect.poll(() => heldRead).toBe(true);
      await trigger.click();
      const sheet = page.getByRole("dialog", { name: eventTitle, exact: true });
      await expect(sheet).toBeVisible();
      await page.keyboard.press("Escape");
      await expect(sheet).toHaveCount(0);
      await expect(trigger).toBeFocused();
      // The actual event UI has worked while this declared read is pending.
      // Prove the old global gate would block rather than silently assuming it.
      await expect(page.waitForLoadState("networkidle", { timeout: 600 })).rejects.toThrow(/Timeout 600ms exceeded/);
      expect(released).toBe(false);
      const townDocumentStarts = page.waitForRequest((request) => request.isNavigationRequest()
        && new URL(request.url()).pathname === "/m/frederick").then(() => {
        released = true;
        release();
      });
      const [response] = await Promise.all([replaceDocument(page, "/m/frederick"), townDocumentStarts]);
      expect(response?.status()).toBe(200);
      await expect(page).toHaveURL(/\/m\/frederick$/);
      const town = page.getByRole("navigation", { name: "Switch town", exact: true }).getByRole("link", { name: "Brunswick", exact: true });
      await expect(town).toHaveAttribute("data-press-target", "control");
      const townGeometry = await pressAndDragOut(page, town, true);
      expect(runtime.get(page)?.errors).toEqual([]);
      await attach(info, "background-read-document-transition", { backgroundPath, heldRead,
        networkIdleWasBlocked: true, eventSheetOpenedAndClosedWhileReadHeld: true,
        releasedOnlyWhenTownDocumentStarted: released, townGeometry });
    } finally {
      // Also release on an assertion failure: a failed proof must not leave
      // a route handler or read pending after its isolated browser context.
      release();
    }
  });

  for (const reducedMotion of ["no-preference", "reduce"] as const) {
    test(`real Button and town Pill retain their hit rectangles with ${reducedMotion} motion${reducedMotion === "reduce" ? " at 320px and 200% text" : ""}`, async ({ page }, info) => {
      await page.emulateMedia({ reducedMotion });
      if (reducedMotion === "reduce") await page.setViewportSize({ width: 320, height: 844 });
      const response = await replaceDocument(page, "/events/declared-missing-native-interaction-event");
      expect(response?.status()).toBe(404);
      const recovery = page.getByRole("link", { name: "See what's on", exact: true });
      await expect(recovery).toHaveAttribute("data-press-target", "control");
      const recoveryText = reducedMotion === "reduce" ? await doubleReadingText(page, recovery) : null;
      let recoveryEdgeStart: PressSnapshot | null = null;
      if (reducedMotion === "reduce") {
        // Reproduce the viewport-edge position that nearest-only scrolling
        // misses at different system-font metrics: the whole control is in
        // the viewport, where fixed navigation may still cover its center.
        await recovery.evaluate((node) => {
          const rect = node.getBoundingClientRect();
          window.scrollTo({ top: Math.max(0, scrollY + rect.top - (innerHeight - rect.height - 12)), behavior: "instant" });
        });
        recoveryEdgeStart = await snapshot(recovery);
        expect(recoveryEdgeStart.box.y).toBeGreaterThanOrEqual(0);
        expect(recoveryEdgeStart.box.y + recoveryEdgeStart.box.height).toBeLessThanOrEqual((await page.viewportSize())!.height);
        await attach(info, "native-control-edge-start", recoveryEdgeStart);
      }
      const button = await pressAndDragOut(page, recovery, reducedMotion === "reduce");
      const recoveryWidth = await noOverflow(page);
      expect(new URL(page.url()).pathname).toBe("/events/declared-missing-native-interaction-event");
      const tabsToRecovery = await reachByKeyboard(page, recovery);
      await page.keyboard.press("Enter");
      await expect(page.locator("[data-events-interaction-ready]")).toHaveAttribute("data-events-interaction-ready", "true");
      await expect(page).toHaveURL(/\/events$/);

      await replaceDocument(page, "/m/frederick");
      const town = page.getByRole("navigation", { name: "Switch town", exact: true }).getByRole("link", { name: "Brunswick", exact: true });
      await expect(town).toHaveAttribute("data-press-target", "control");
      const townText = reducedMotion === "reduce" ? await doubleReadingText(page, town) : null;
      const pill = await pressAndDragOut(page, town, reducedMotion === "reduce");
      const townWidth = await noOverflow(page);
      expect(new URL(page.url()).pathname).toBe("/m/frederick");
      const tabsToTown = await reachByKeyboard(page, town);
      await page.keyboard.press("Enter");
      await expect(page).toHaveURL(/\/m\/brunswick(?:[?#]|$)/);
      await expect(page.getByRole("navigation", { name: "Switch town", exact: true }).getByRole("link", { name: "Brunswick", exact: true })).toHaveAttribute("aria-current", "page");
      expect(await page.evaluate(() => matchMedia("(prefers-reduced-motion: reduce)").matches)).toBe(reducedMotion === "reduce");
      expect(runtime.get(page)?.errors).toEqual([]);
      await attach(info, "native-control-geometry", { reducedMotion, button, pill, tabsToRecovery, tabsToTown, actualKeyboardRecovery: true, actualKeyboardTownNavigation: true, recoveryEdgeStart, recoveryText, townText, recoveryWidth, townWidth });
    });

    test(`real event and place cards move only their direct face with ${reducedMotion} motion`, async ({ page }, info) => {
      test.setTimeout(60_000);
      await page.emulateMedia({ reducedMotion });
      const event = await events(page);
      const eventPress = await pressAndDragOut(page, event, reducedMotion === "reduce");
      await expect(page.getByRole("dialog")).toHaveCount(0);
      const tabsToEvent = await reachByKeyboard(page, event);
      await page.keyboard.press("Enter");
      const eventSheet = page.getByRole("dialog", { name: eventTitle, exact: true });
      await expect(eventSheet).toBeVisible();
      await page.keyboard.press("Escape");
      await expect(eventSheet).toHaveCount(0);
      await expect(event).toBeFocused();

      const { trigger, card } = await books(page);
      const placePress = await pressAndDragOut(page, trigger, reducedMotion === "reduce");
      expect(placePress.before.siblings.length, "Save and directions are independently owned sibling actions").toBeGreaterThanOrEqual(2);
      await expect(page.getByRole("dialog")).toHaveCount(0);
      const tabsToPlace = await reachByKeyboard(page, trigger);
      await page.keyboard.press("Space");
      const placeSheet = page.getByRole("dialog", { name: placeName, exact: true });
      await expect(placeSheet.getByRole("heading", { name: placeName, exact: true })).toBeVisible();
      await page.keyboard.press("Escape");
      await expect(placeSheet).toHaveCount(0);
      await expect(trigger).toBeFocused();
      await expect(card.locator(`[data-save-ref="place:${placeSlug}"]`)).toHaveAttribute("aria-pressed", "false");
      const tab = page.locator("[data-bottom-nav-shell]").getByRole("link", { name: "Map", exact: true });
      const tabPress = await pressAndDragOut(page, tab, reducedMotion === "reduce");
      await expect(tab).toHaveAttribute("data-pending", "false");
      const dimensions = await noOverflow(page);
      expect(runtime.get(page)?.errors).toEqual([]);
      await attach(info, "native-card-geometry", { reducedMotion, eventPress, placePress, tabPress, tabsToEvent, tabsToPlace, keyboardEnterAndSpace: true, dimensions });
    });
  }

  test("BottomNav shows a visible provisional destination, retains current selection, then commits the actual route", async ({ page }, info) => {
    await page.emulateMedia({ reducedMotion: "no-preference" });
    await events(page);
    const nav = page.locator("[data-bottom-nav-shell]").getByRole("navigation", { name: "Primary", exact: true });
    const current = nav.getByRole("link", { name: "Events", exact: true });
    const destination = nav.getByRole("link", { name: "Map", exact: true });
    await expect(current).toHaveAttribute("aria-current", "page");
    await expect(current).toHaveAttribute("data-selected", "true");
    const style = () => destination.evaluate((node) => {
      const css = getComputedStyle(node);
      return { color: css.color, background: css.backgroundColor, shadow: css.boxShadow };
    });
    const before = await style();
    const geometry = await pressAndDragOut(page, destination, false);
    await expect(destination).toHaveAttribute("data-pending", "false");
    await expect(nav).toHaveAttribute("aria-busy", "false");
    await expect(current).toHaveAttribute("aria-current", "page");
    expect(new URL(page.url()).pathname).toBe("/events");

    let release!: () => void;
    const gate = new Promise<void>((resolve) => { release = resolve; });
    let held = 0;
    await page.route((url) => url.pathname === "/map", async (route) => {
      if (route.request().headers()["rsc"] === "1" || route.request().isNavigationRequest()) {
        held += 1;
        await gate;
      }
      return route.continue();
    });
    let pending: Awaited<ReturnType<typeof style>> | undefined;
    // Keep the real click alive while its actual route response is held.
    // Releasing that response, below, is what completes the navigation.
    const activation = destination.click();
    try {
      await expect.poll(() => held, { message: "the actual map navigation is held at its HTTP response" }).toBeGreaterThan(0);
      await expect(destination).toHaveAttribute("data-pending", "true");
      await expect(nav).toHaveAttribute("aria-busy", "true");
      await expect(current).toHaveAttribute("aria-current", "page");
      await expect(current).toHaveAttribute("data-selected", "true");
      await expect(destination).not.toHaveAttribute("aria-current", "page");
      await expect(destination).toHaveAttribute("data-selected", "false");
      await expect(nav.locator('[aria-current="page"]')).toHaveCount(1);
      pending = await style();
      expect(pending.shadow).not.toBe("none");
      expect(pending).not.toEqual(before);
      expect(await destination.evaluate((node) => node.getAnimations({ subtree: true }).some((animation) => animation.effect?.getTiming().iterations === Infinity)), "pending feedback is a static mark, without an indefinite progress animation").toBe(false);
      await page.screenshot({ path: info.outputPath("provisional-map-destination.png") });
    } finally {
      release();
      await activation;
    }
    await expect(page.getByRole("heading", { name: "Frederick County map", exact: true })).toBeAttached();
    const mapSearch = page.getByRole("combobox", { name: "Search this map", exact: true });
    const mapFallback = page.getByRole("region", { name: "Available results without the map", exact: true });
    await expect.poll(async () => await mapSearch.isVisible() || await mapFallback.isVisible()).toBe(true);
    const rendererAvailable = await mapSearch.isVisible();
    if (!rendererAvailable) {
      await expect(mapFallback.getByRole("button").first()).toBeVisible();
      info.annotations.push({ type: "coverage", description: "Pending navigation commits the actual Map route and its usable local fallback. A configured map renderer is not claimed by this fixture build." });
    }
    await expect(destination).toHaveAttribute("aria-current", "page");
    await expect(destination).toHaveAttribute("data-selected", "true");
    await expect(destination).toHaveAttribute("data-pending", "false");
    await expect(current).toHaveAttribute("data-selected", "false");
    await expect(nav).toHaveAttribute("aria-busy", "false");
    expect(new URL(page.url()).pathname).toBe("/map");
    expect(runtime.get(page)?.errors).toEqual([]);
    await attach(info, "provisional-navigation-contract", { geometry, before, pending, heldResponses: held, actualMapRouteCommitted: true, rendererAvailable });
  });

  test.describe("independent card actions with a fine pointer", () => {
    // A phone-width desktop pointer also exercises hover CSS that a touch-only
    // device cannot expose. This is not presented as a native touch gesture.
    test.use({ isMobile: false, hasTouch: false });

    for (const reducedMotion of ["no-preference", "reduce"] as const) {
      test(`Save and photo credit leave actual event/place photographs still with ${reducedMotion} motion`, async ({ page }, info) => {
        test.setTimeout(60_000);
        await page.emulateMedia({ reducedMotion });
        const event = await events(page);
        const eventCard = event.locator("xpath=ancestor::article[1]");
        const eventImage = eventCard.locator("img");
        await expect(eventImage).toHaveCount(1);
        const eventCredit = eventCard.getByRole("link", { name: "Wikimedia Commons", exact: true });
        await expect(eventCredit).toBeVisible();
        const eventPhoto = await stationaryPhotograph(page, eventImage, eventCredit);
        await expect(page.getByRole("dialog")).toHaveCount(0);
        expect(new URL(page.url()).pathname).toBe("/events");

        // Nearby uses the real shared PlaceCard. Saved now uses its own wallet
        // component, so a Saved row cannot establish PlaceCard press ownership.
        // This page's canonical catalog and reviewed image are not replaced.
        const museumSlug = "schifferstadt-architectural-museum-frederick";
        await replaceDocument(page, "/nearby?c=art&facet=museum&sort=rated&in=frederick");
        await expect(page.locator('[data-nearby-interaction-ready="true"]')).toBeVisible();
        const card = page.locator('main article[data-place-card-variant="discovery"]').filter({ has: page.getByRole("heading", { name: "Schifferstadt Architectural Museum", exact: true }) });
        await expect(card).toHaveCount(1);
        const image = card.locator("img");
        await expect(image).toHaveCount(1);
        const save = card.locator(`[data-save-ref="place:${museumSlug}"]`);
        await expect(save).toHaveAttribute("aria-pressed", "false");
        const savePhoto = await stationaryPhotograph(page, image, save);
        await expect(save).toHaveAttribute("aria-pressed", "false");
        const credit = card.getByRole("link", { name: "Wikimedia Commons", exact: true });
        await expect(credit).toBeVisible();
        const creditPhoto = await stationaryPhotograph(page, image, credit);
        await expect(page.getByRole("dialog")).toHaveCount(0);
        const primary = card.getByRole("button", { name: /^View Schifferstadt Architectural Museum .*details$/ });
        const primaryPress = await pressAndDragOut(page, primary, reducedMotion === "reduce");
        expect(runtime.get(page)?.errors).toEqual([]);
        await attach(info, "independent-photo-actions", { reducedMotion, actualCatalog: true, eventPhoto, savePhoto, creditPhoto, primaryPress });
      });
    }
  });

  test("Chromium native touch cancellation clears provisional navigation without moving its target", async ({ page, context, browserName }, info) => {
    test.skip(browserName !== "chromium", "Native touchCancel requires Chromium's browser input protocol; other engines still run real pointer and keyboard coverage.");
    await page.emulateMedia({ reducedMotion: "no-preference" });
    await events(page);
    const nav = page.locator("[data-bottom-nav-shell]").getByRole("navigation", { name: "Primary", exact: true });
    const current = nav.getByRole("link", { name: "Events", exact: true });
    const destination = nav.getByRole("link", { name: "Map", exact: true });
    const before = await snapshot(destination);
    const protocol = await (context as BrowserContext).newCDPSession(page);
    await destination.evaluate((node) => {
      node.addEventListener("pointerdown", (event) => {
        (window as Window & { __nativeDown?: { trusted: boolean; type: string } }).__nativeDown = { trusted: event.isTrusted, type: (event as PointerEvent).pointerType };
      }, { once: true });
      node.addEventListener("pointercancel", (event) => {
        (window as Window & { __nativeCancel?: { trusted: boolean; type: string } }).__nativeCancel = { trusted: event.isTrusted, type: (event as PointerEvent).pointerType };
      }, { once: true });
    });
    let during: PressSnapshot | undefined;
    let touchStarted = false;
    try {
      await protocol.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x: before.box.x + before.box.width / 2, y: before.box.y + before.box.height / 2 }] });
      touchStarted = true;
      await expect(destination).toHaveAttribute("data-pending", "true");
      await expect(current).toHaveAttribute("aria-current", "page");
      const input = await page.evaluate(() => (window as Window & { __nativeDown?: { trusted: boolean; type: string } }).__nativeDown);
      expect(input).toEqual({ trusted: true, type: "touch" });
      const nativeHeldSamples: PressSnapshot[] = [];
      for (let paint = 0; paint < 12; paint += 1) {
        await page.evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => resolve())));
        nativeHeldSamples.push(await snapshot(destination));
      }
      const heldActive = nativeHeldSamples.some((sample) => sample.active);
      if (heldActive) {
        await expect.poll(async () => (await snapshot(destination)).face!.matrixScale).toBeLessThan(0.9999);
      } else {
        info.annotations.push({ type: "coverage", description: "Trusted Chromium touchStart sets provisional intent but does not hold CSS :active in this input protocol. Real pointer press motion is established by the separate mouse down/up cases; native cancellation and static feedback are verified here." });
      }
      during = await snapshot(destination);
      fixedOuter(before, during);
      expect(during.shadow, "the actual touched destination has a static provisional mark").not.toBe("none");
      await protocol.send("Input.dispatchTouchEvent", { type: "touchCancel", touchPoints: [] });
      touchStarted = false;
      await expect(destination).toHaveAttribute("data-pending", "false");
      await expect(nav).toHaveAttribute("aria-busy", "false");
      await expect(current).toHaveAttribute("aria-current", "page");
      await expect.poll(async () => (await snapshot(destination)).face?.matrixScale).toBe(1);
      const after = await snapshot(destination);
      fixedOuter(before, after);
      expect(new URL(page.url()).pathname).toBe("/events");
      const cancellation = await page.evaluate(() => (window as Window & { __nativeCancel?: { trusted: boolean; type: string } }).__nativeCancel);
      expect(cancellation).toEqual({ trusted: true, type: "touch" });
      expect(runtime.get(page)?.errors).toEqual([]);
      await attach(info, "native-touch-cancel", { before, during, after, input, nativeHeldSamples, heldActive, cancellation, documentNavigation: false });
    } finally {
      try {
        if (touchStarted) await protocol.send("Input.dispatchTouchEvent", { type: "touchCancel", touchPoints: [] });
      } finally {
        await protocol.detach();
      }
    }
  });
});
