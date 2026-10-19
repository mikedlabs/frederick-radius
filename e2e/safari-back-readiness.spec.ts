import { readFileSync, readdirSync } from "node:fs";
import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { expect, test, type BrowserContext, type Locator, type Page } from "@playwright/test";
import { EVENTS } from "../src/data/events";
import type { EventWithMeta } from "../src/lib/loaders/events";
import { dismissReturnBridge, emptyReturnBridgeState, RETURN_BRIDGE_STORAGE_KEY } from "../src/lib/return-bridge";

/** Loopback-only presentation proxies make a real bundled historical detail
 * reachable from a scrolled Events view. Its actual summary/SSR/dates stay real.
 * This checks native continuity, not publisher facts or current recommendations. */
test.use({ isMobile: true, hasTouch: true, serviceWorkers: "block" });
const seed = EVENTS.find(event => event.slug === "snallyfest-2026-kickoff")!;
type Evidence = { boundary: string; errors: string[]; blocked: string[]; measurements: Record<string, unknown> };
const receipts = new WeakMap<Page, Evidence>();
test.afterEach(async ({ page }, info) => {
  const evidence = receipts.get(page); if (!evidence) return;
  evidence.measurements.final = await page.evaluate(() => ({ url: location.href, scrollY,
    active: document.activeElement?.outerHTML.slice(0, 1_000), readyState: document.readyState,
    ready: document.querySelector("[data-events-interaction-ready]")?.getAttribute("data-events-interaction-ready"),
    complete: document.querySelector("[data-events-interaction-ready]")?.getAttribute("data-events-complete") }))
    .catch(error => ({ unavailable: String(error) }));
  const path = info.outputPath("safari-back-readiness-receipt.json");
  await writeFile(path, JSON.stringify(evidence, null, 2));
  await info.attach("safari-back-readiness", { path, contentType: "application/json" });
});

function browseProxies(): EventWithMeta[] {
  const now = Date.now();
  return [...Array.from({ length: 8 }, (_, i) => ({ ...seed, slug: `declared-back-control-${i}`,
    title: `Acceptance control ${i}`, description: "Declared local continuity fixture; not a public event." })), seed]
    .map(event => ({ ...event, starts_at: new Date(now - 15 * 60_000).toISOString(),
      ends_at: new Date(now + 2 * 3_600_000).toISOString(), municipality_name: "Frederick",
      category_name: "Live music", is_verified: false } as EventWithMeta));
}

async function prepare(context: BrowserContext, page: Page, baseURL: string | undefined) {
  const origin = new URL(baseURL ?? "http://localhost:3010");
  if (!["localhost", "127.0.0.1", "[::1]"].includes(origin.hostname)) throw new Error("Declared Back acceptance is loopback-only.");
  const evidence: Evidence = { boundary: "Synthetic current-window browse presentation only; unchanged actual bundled historical summary and full SSR. No clock/HTML replacement, providers or network writes. Optional install offer uses its supported dismissed preference.",
    errors: [], blocked: [], measurements: {} };
  receipts.set(page, evidence); page.on("pageerror", error => evidence.errors.push(error.message));
  const reads: Array<Record<string, unknown>> = []; evidence.measurements.readLifecycle = reads;
  const recordRead = (event: string, request: import("@playwright/test").Request, extra: Record<string, unknown> = {}) => {
    const url = new URL(request.url());
    if (url.origin !== origin.origin || !["/api/auth/me", "/api/pulse/status"].includes(url.pathname)) return;
    reads.push({ event, path: url.pathname, method: request.method(), at: new Date().toISOString(),
      phase: evidence.measurements.phase ?? "initial", framePath: new URL(request.frame().url(), origin).pathname, ...extra });
  };
  context.on("request", request => recordRead("request", request));
  context.on("requestfinished", request => recordRead("requestfinished", request));
  context.on("requestfailed", request => recordRead("requestfailed", request, { failure: request.failure()?.errorText }));
  context.on("response", response => recordRead("response", response.request(), { status: response.status() }));
  await context.addCookies([{ name: "fr_onboarded", value: "1", domain: origin.hostname, path: "/" }]);
  await context.addInitScript(({ appOrigin, key, value }) => {
    if (location.origin !== appOrigin) return;
    localStorage.setItem(key, JSON.stringify(value));
    localStorage.setItem("fr:appearance:v1", "light");
  }, { appOrigin: origin.origin, key: RETURN_BRIDGE_STORAGE_KEY, value: dismissReturnBridge(emptyReturnBridgeState()) });
  type DetailPrefetch = { href: string; segment: string | null; at: string; phase: unknown;
    referrerPath: string; nextUrl: string | null; resourceType: string; status?: number;
    finishedAt?: string; failure?: string };
  const detailPrefetches: DetailPrefetch[] = [];
  const prefetchByRequest = new WeakMap<import("@playwright/test").Request, DetailPrefetch>();
  const optionalMapCandidates: DetailPrefetch[] = [];
  const legitimateMapNavigations: Array<{ href: string; at: string }> = [];
  const legitimateDetailNavigations: Array<{ href: string; at: string }> = [];
  context.on("request", request => {
    const url = new URL(request.url()), headers = request.headers();
    const referrerPath = new URL(headers.referer ?? request.frame().url(), origin).pathname;
    if (referrerPath !== `/events/${seed.slug}` || url.origin !== origin.origin || request.method() !== "GET") return;
    url.searchParams.delete("_rsc"); url.searchParams.sort();
    const href = url.pathname + url.search;
    if (request.isNavigationRequest()) {
      const navigation = { href, at: new Date().toISOString() };
      legitimateDetailNavigations.push(navigation);
      if (url.pathname === "/map") legitimateMapNavigations.push(navigation);
      return;
    }
    if (headers["next-router-prefetch"] !== "1") return;
    // Observe every optional page prefetch from the real departing detail,
    // including searchless segment requests. No request/response is changed.
    const entry: DetailPrefetch = { href, segment: headers["next-router-segment-prefetch"] ?? null,
      at: new Date().toISOString(), phase: evidence.measurements.phase ?? "initial", referrerPath,
      nextUrl: headers["next-url"] ?? null, resourceType: request.resourceType() };
    detailPrefetches.push(entry); prefetchByRequest.set(request, entry);
    if (url.pathname === "/map") optionalMapCandidates.push(entry);
  });
  context.on("response", response => {
    const entry = prefetchByRequest.get(response.request()); if (entry) entry.status = response.status();
  });
  context.on("requestfinished", request => {
    const entry = prefetchByRequest.get(request); if (entry) entry.finishedAt = new Date().toISOString();
  });
  context.on("requestfailed", request => {
    const entry = prefetchByRequest.get(request); if (entry) entry.failure = request.failure()?.errorText;
  });
  evidence.measurements.canonicalDetailPrefetchRequests = detailPrefetches;
  evidence.measurements.legitimateCanonicalDetailNavigations = legitimateDetailNavigations;
  evidence.measurements.detailMapPrefetchCandidates = optionalMapCandidates;
  evidence.measurements.legitimateMapNavigations = legitimateMapNavigations;
  const proxies = browseProxies();
  await context.route("**/*", async route => {
    const request = route.request(), url = new URL(request.url());
    if (url.origin !== origin.origin) { evidence.blocked.push(`${request.method()} ${url.origin}${url.pathname}`); return route.abort("blockedbyclient"); }
    if (!["GET", "HEAD"].includes(request.method())) { evidence.blocked.push(`${request.method()} ${url.pathname}`); return route.abort("blockedbyclient"); }
    if (context.browser()?.browserType().name() === "webkit" && origin.protocol === "http:"
      && request.isNavigationRequest() && request.resourceType() === "document") {
      // Local HTTP only: keep actual document bytes and every policy except
      // upgrade-insecure-requests, which otherwise upgrades localhost assets.
      const response = await route.fetch(); const headers = response.headers();
      if (headers["content-security-policy"]) headers["content-security-policy"] = headers["content-security-policy"].split(";")
        .filter(part => part.trim().toLowerCase() !== "upgrade-insecure-requests").join(";");
      return route.fulfill({ response, headers });
    }
    if (request.resourceType() === "image") {
      const src = decodeURIComponent(url.pathname === "/_next/image" ? url.searchParams.get("url") ?? "" : url.pathname);
      if (!["/images/", "/place-photos/", "/history-photos/", "/brand/", "/icons/"].some(prefix => src.startsWith(prefix))) return route.abort("blockedbyclient");
    }
    if (url.pathname === "/api/auth/me") return route.fulfill({ json: { user: null } });
    if (url.pathname === "/api/events/browse") return route.fulfill({ json: { events: proxies,
      liveSlugs: proxies.map(event => event.slug), generatedAt: new Date().toISOString(), sourceHealth: { degraded: false, issues: [] } } });
    if (url.pathname === `/api/events/${seed.slug}/summary`) return route.continue();
    if (url.pathname.startsWith("/api/")) return route.fulfill({ status: 503, json: { error: "Declared unavailable ancillary read" } });
    return route.continue();
  });
  return { origin, evidence, optionalMapCandidates, detailPrefetches };
}

async function owned44(control: Locator) {
  await control.evaluate(node => node.scrollIntoView({ block: "center", inline: "nearest", behavior: "instant" }));
  await expect.poll(() => control.evaluate(node => {
    const b = node.getBoundingClientRect(), x = b.x + b.width / 2, y = b.y + b.height / 2;
    return b.width >= 43.95 && b.height >= 43.95 && [[0, 0], [-21, 0], [21, 0], [0, -21], [0, 21]].every(([dx, dy]) => {
      const px = x + dx, py = y + dy, hit = document.elementFromPoint(px, py);
      return px >= 0 && py >= 0 && px < innerWidth && py < innerHeight && !!hit && node.contains(hit);
    });
  })).toBe(true);
}

// Pending-preview measurement never scrolls. Off-viewport rows retain real
// anchor/raw44px semantics; component stories prove physical hit ownership.
async function raw44(control: Locator) {
  const bounds = await control.evaluate(node => { const b = node.getBoundingClientRect();
    return { width: b.width, height: b.height, top: b.top, bottom: b.bottom, tag: node.tagName,
      pointerEvents: getComputedStyle(node).pointerEvents }; });
  expect(bounds.tag).toBe("A"); expect(bounds.width).toBeGreaterThanOrEqual(43.95);
  expect(bounds.height).toBeGreaterThanOrEqual(43.95); expect(bounds.pointerEvents).not.toBe("none");
}

async function geometry(open: Locator) {
  return open.evaluate(node => {
    const box = node.getBoundingClientRect();
    return { url: location.href, timeOrigin: performance.timeOrigin,
      navigationType: (performance.getEntriesByType("navigation")[0] as PerformanceNavigationTiming)?.type,
      scrollY, top: box.top, left: box.left, width: box.width, height: box.height,
      focused: document.activeElement === node };
  });
}

type OpenerPointerDown = { trusted: boolean; pointerType: string; scrollY: number;
  top: number; left: number; width: number; height: number };

async function observeOpenerActivation(open: Locator) {
  await open.evaluate(node => {
    const target = window as unknown as { __frBackOpenerPointerDown?: OpenerPointerDown };
    delete target.__frBackOpenerPointerDown;
    node.addEventListener("pointerdown", event => {
      const box = node.getBoundingClientRect(), pointer = event as PointerEvent;
      target.__frBackOpenerPointerDown = { trusted: event.isTrusted, pointerType: pointer.pointerType,
        scrollY, top: box.top, left: box.left, width: box.width, height: box.height };
    }, { once: true, passive: true, capture: true });
  });
}

function explorerChunkPath() {
  const directory = join(process.cwd(), ".next/static/chunks");
  const files = readdirSync(directory).filter(name => name.endsWith(".js") && (() => {
    const text = readFileSync(join(directory, name), "utf8");
    return text.includes("data-events-personalized-view") && text.includes("data-events-interaction-ready");
  })());
  expect(files, "The tested compiled build must contain one actual EventsExplorer bundle").toHaveLength(1);
  return `/_next/static/chunks/${files[0]}`;
}

for (const holdExplorer of [false, true]) {
  test(`Safari native full Event Back ${holdExplorer ? "keeps a usable server preview while Explorer JS is held" : "is ready without a settled-detail workaround"}`, async ({ page, context, baseURL }, info) => {
    test.setTimeout(90_000);
    await page.setViewportSize({ width: 390, height: 844 }); await page.emulateMedia({ reducedMotion: "reduce" });
    const { origin, evidence, optionalMapCandidates, detailPrefetches } = await prepare(context, page, baseURL);
    let returning = false;
    let holdStarted: (() => void) | undefined;
    const started = new Promise<void>(resolve => { holdStarted = resolve; });
    const criticalPath = holdExplorer ? explorerChunkPath() : null;
    if (criticalPath) await context.route(url => url.origin === origin.origin && url.pathname === criticalPath, async route => {
      if (!returning) return route.continue();
      const response = await route.fetch(); expect(response.status()).toBe(200);
      evidence.measurements.chunkHold = { path: criticalPath, beganAt: new Date().toISOString(), delayMs: 6_000,
        boundary: "Declared adversarial delay of actual unchanged bytes; not a claim about natural public5s latency." };
      holdStarted!();
      await new Promise(resolve => setTimeout(resolve, 6_000));
      await route.fulfill({ response });
      (evidence.measurements.chunkHold as Record<string, unknown>).releasedAt = new Date().toISOString();
    });
    const response = await page.goto("/events?in=frederick&lens=today&sort=az", { waitUntil: "domcontentloaded" });
    expect(response?.status()).toBe(200);
    const board = page.locator("[data-events-interaction-ready]");
    await expect(board).toHaveAttribute("data-events-interaction-ready", "true");
    await expect(board).toHaveAttribute("data-events-complete", "true"); await expect(board).toHaveAttribute("aria-busy", "false");
    const open = page.locator(`main a[href="/events/${seed.slug}"]`).filter({ visible: true }).first();
    // The real actionability check finishes any source-card entrance before
    // measuring the return origin. It never activates the link or forces input.
    await open.tap({ trial: true });
    await owned44(open); const before = await geometry(open); evidence.measurements.before = before;
    expect(before.scrollY, "The return contract must preserve a meaningful scrolled listing").toBeGreaterThan(100);
    await observeOpenerActivation(open);
    evidence.measurements.phase = "sheet-open";
    await open.tap();
    const activation = await page.evaluate(() => (window as unknown as {
      __frBackOpenerPointerDown?: OpenerPointerDown }).__frBackOpenerPointerDown);
    evidence.measurements.openerPointerDown = activation;
    expect(activation, "The actual trusted activation must retain the captured source geometry").toBeDefined();
    expect(activation!.trusted).toBe(true); expect(activation!.pointerType).toBe("touch");
    for (const key of ["scrollY", "top", "left", "width", "height"] as const) {
      expect(Math.abs(activation![key] - before[key]), `Captured ${key} must match the actual opener pointerdown within1CSSpx`).toBeLessThanOrEqual(1);
    }
    const dialog = page.getByRole("dialog", { name: seed.title, exact: true }); await expect(dialog).toBeVisible();
    evidence.measurements.phase = "full-document-open";
    await dialog.getByRole("link", { name: "See full page", exact: true }).tap();
    await expect(page.getByRole("heading", { level: 1, name: seed.title, exact: true })).toBeVisible();
    await expect(page.getByText("This event has already happened.", { exact: true })).toBeVisible();
    const breadcrumbs = page.getByRole("navigation", { name: "Breadcrumb", exact: true });
    await expect(breadcrumbs.getByRole("link", { name: "Events", exact: true })).toHaveAttribute("href", "/events");
    const townLink = breadcrumbs.locator(`a[href="/m/${seed.municipality}"]`);
    await expect(townLink).toBeVisible(); await expect(townLink).not.toBeEmpty();
    evidence.measurements.canonicalBreadcrumbs = await breadcrumbs.locator("a").evaluateAll(links => links.map(link => ({
      href: link.getAttribute("href"), text: link.textContent?.trim() })));
    const locator = page.getByRole("link", { name: `Open the map centered on ${seed.venue_name}`, exact: true });
    await expect(locator).toBeVisible();
    const actualMap = new URL((await locator.getAttribute("href"))!, page.url());
    expect(actualMap.origin).toBe(origin.origin); expect(actualMap.pathname).toBe("/map");
    expect(actualMap.searchParams.get("c")).toBeTruthy(); actualMap.searchParams.sort();
    const actualMapHref = actualMap.pathname + actualMap.search;
    evidence.measurements.canonicalVenueMap = { href: actualMapHref, label: await locator.getAttribute("aria-label"),
      boundary: "Real canonical locator anchor retained; no Map navigation or painted-basemap claim in this Back flow." };
    evidence.measurements.canonicalDetail = { slug: seed.slug, startsAt: seed.starts_at, endsAt: seed.ends_at };
    returning = true; const backAt = Date.now(); evidence.measurements.phase = "immediate-native-back";
    if (holdExplorer) {
      // Observe the real pending return before load-complete. No readiness is
      // claimed while the known critical JS is deliberately unavailable.
      await page.goBack({ waitUntil: "commit" }); await started;
      const preview = page.locator("[data-events-restore-preview]");
      await expect(preview.getByRole("heading", { name: "County calendar preview", exact: true })).toBeVisible();
      await expect(preview).toContainText("countywide listings may be outside your selected view");
      await expect(board).toHaveAttribute("data-events-interaction-ready", "false");
      await expect(page.locator("[data-events-personalized-view]")).toBeHidden();
      const links = preview.locator("a[data-events-preview-link]"); const count = await links.count();
      expect(count).toBeLessThanOrEqual(3);
      if (count) {
        for (const link of await links.all()) {
          await expect(link).toHaveAttribute("href", /^\/events\/[^/?#]+$/); await raw44(link);
          await expect(link.locator("time")).toHaveAttribute("datetime", /T/);
          await expect(link.locator("[data-events-preview-time]")).not.toBeEmpty();
          await expect(link.locator("[data-events-preview-location]")).not.toBeEmpty();
        }
      } else {
        await expect(preview).toContainText("Preview listings are unavailable");
        for (const [name, href] of [["County calendar", "https://www.frederickcountymd.gov/calendar.aspx"],
          ["Celebrate Frederick calendar", "https://www.celebratefrederick.com/events/"]]) {
          const fallback = preview.getByRole("link", { name, exact: true });
          await expect(fallback).toHaveAttribute("href", href); await expect(fallback).toHaveAttribute("target", "_blank");
          await expect(fallback).toHaveAttribute("rel", /noopener/); await raw44(fallback);
        }
      }
      evidence.measurements.pendingPreviewBoundary = "Untouched native Back during held JS; read-only anchor semantics/raw44px geometry, not off-viewport hit ownership. No scroll/focus input during hold.";
      evidence.measurements.pendingPreview = await preview.evaluate(node => ({ text: node.textContent,
        links: [...node.querySelectorAll<HTMLAnchorElement>("a")].map(a => ({ href: a.href,
          height: a.getBoundingClientRect().height, width: a.getBoundingClientRect().width })),
        ready: document.querySelector("[data-events-interaction-ready]")?.getAttribute("data-events-interaction-ready") }));
      const path = info.outputPath("pending-county-preview.png"); await page.screenshot({ path });
      await info.attach("pending-county-preview", { path, contentType: "image/png" });
      await page.waitForLoadState("load");
    } else await page.goBack();
    evidence.measurements.backLoadMs = Date.now() - backAt;
    // Same original public gate. Held-case load includes the declared6s delay;
    // neither normal hydration nor the5s readiness deadline is stretched.
    await expect(board).toHaveAttribute("data-events-interaction-ready", "true", { timeout: 5_000 });
    evidence.measurements.interactionReadyMs = Date.now() - backAt;
    await expect(board).toHaveAttribute("data-events-complete", "true"); await expect(board).toHaveAttribute("aria-busy", "false");
    evidence.measurements.completeReadyMs = Date.now() - backAt;
    await expect(page).toHaveURL(before.url); await expect(page.getByRole("dialog")).toHaveCount(0); await expect(open).toBeFocused();
    await expect.poll(async () => Math.abs(await page.evaluate(() => scrollY) - before.scrollY)).toBeLessThan(80);
    evidence.measurements.focusReadyMs = Date.now() - backAt;
    evidence.measurements.after = await geometry(open);
    expect((evidence.measurements.after as { timeOrigin: number }).timeOrigin).not.toBe(before.timeOrigin);
    const unusedMapPrefetches = optionalMapCandidates.filter(request => request.href === actualMapHref
      || (request.href === "/map" && request.segment === "/_tree"));
    evidence.measurements.unusedCanonicalMapPrefetches = unusedMapPrefetches;
    expect(unusedMapPrefetches, "The exercised canonical locator must not speculate Map requests across native departure").toEqual([]);
    expect(detailPrefetches, "Canonical detail navigation remains available on intent without optional page speculation across Back").toEqual([]);
    expect(evidence.errors, "Every runtime error remains fatal, including immediate departure errors").toEqual([]);
  });
}
