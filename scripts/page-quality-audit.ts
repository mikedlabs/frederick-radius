/**
 * Site-wide page-quality audit.
 *
 * Assumes Frederick Radius is already running. Examples:
 *   npm run dev
 *   npm run audit:pages
 *   BASE_URL=https://frederickradius.app npm run audit:pages
 *   ROUTE_FILTER=today,place-detail npm run audit:pages
 *
 * Artifacts are written to output/page-quality/<timestamp>/ and are local
 * review evidence, not source files.
 */

import { chromium, type BrowserContext, type Page } from "@playwright/test";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { sweepMarkedHorizontalRails } from "./lib/page-quality-horizontal-rails";

type RouteGroup = "core" | "guide" | "template" | "support";

type AuditRoute = {
  id: string;
  path: string;
  group: RouteGroup;
  description: string;
};

type ViewportDefinition = {
  id: "compact" | "mobile" | "desktop";
  width: number;
  height: number;
  deviceScaleFactor: number;
  isMobile: boolean;
  hasTouch: boolean;
};

type NamedCount = {
  normalized: string;
  examples: string[];
  count: number;
};

type Heading = {
  level: number;
  text: string;
  selector: string;
  top: number;
};

type TargetFinding = {
  label: string;
  selector: string;
  width: number;
  height: number;
  top: number;
};

type ImageFinding = {
  src: string;
  alt: string;
  selector: string;
};

type OverflowFinding = {
  selector: string;
  left: number;
  right: number;
  width: number;
};

type ParagraphFinding = {
  words: number;
  text: string;
  selector: string;
};

type UsefulAction = {
  label: string;
  selector: string;
  top: number;
  viewportFraction: number;
  inFirstViewport: boolean;
} | null;

type DomMetrics = {
  title: string;
  pageHeight: number;
  documentWidth: number;
  viewportWidth: number;
  horizontalOverflowPx: number;
  overflowElements: OverflowFinding[];
  headings: Heading[];
  headingCounts: Record<string, number>;
  headingOrderIssues: string[];
  duplicateHeadings: NamedCount[];
  duplicateLabels: NamedCount[];
  interactiveCount: number;
  undersizedTouchTargets: TargetFinding[];
  brokenImages: ImageFinding[];
  unresolvedImages: ImageFinding[];
  imageCount: number;
  paragraphs: ParagraphFinding[];
  paragraphCount: number;
  paragraphWordCount: number;
  longestParagraphWords: number;
  firstUsefulAction: UsefulAction;
};

type ExpandedAudit = {
  nativeDetailsAttempted: number;
  nativeDetailsOpened: number;
  buttonsAttempted: number;
  buttonsRevealed: number;
  buttonsOpened: number;
  controlLabels: string[];
  metrics: DomMetrics;
  screenshot: string | null;
};

type AuditResult = {
  route: AuditRoute;
  viewport: ViewportDefinition;
  requestedUrl: string;
  finalUrl: string;
  httpStatus: number | null;
  durationMs: number;
  screenshot: string | null;
  navigationError: string | null;
  pageErrors: string[];
  imageRequestErrors: string[];
  metrics: DomMetrics | null;
  expanded: ExpandedAudit | null;
  status: "pass" | "warning" | "error";
};

type AuditReport = {
  generatedAt: string;
  baseUrl: string;
  routeFilter: string | null;
  outputDirectory: string;
  routes: AuditRoute[];
  viewports: ViewportDefinition[];
  totals: {
    checks: number;
    passed: number;
    warnings: number;
    errors: number;
    pageErrors: number;
    imageRequestErrors: number;
    brokenImages: number;
    unresolvedImages: number;
    undersizedTouchTargets: number;
    horizontalOverflowChecks: number;
    reviewSignalChecks: number;
  };
  results: AuditResult[];
};

/**
 * This manifest intentionally covers product jobs and shared renderers. It is
 * not meant to enumerate every generated place/event page; a template defect
 * should be caught by a stable representative route.
 */
const ROUTES: AuditRoute[] = [
  { id: "today", path: "/today", group: "core", description: "Daily decision surface" },
  { id: "ask", path: "/ask", group: "core", description: "Local decision workspace" },
  { id: "plan", path: "/plan", group: "core", description: "Trip and outing planner" },
  { id: "saved", path: "/my-radius", group: "core", description: "Saved places and events" },
  { id: "search-coffee", path: "/search?q=coffee", group: "core", description: "Ranked search results" },
  { id: "search-civic-vote", path: "/search?q=how%20do%20I%20register%20to%20vote", group: "core", description: "Authoritative civic task answer" },
  { id: "search-civic-food-permit", path: "/search?q=food%20permit", group: "core", description: "Direct civic permit action precedence" },
  { id: "search-mixed-local", path: "/search?q=dog%20friendly%20restaurant", group: "core", description: "Local results despite weak civic term overlap" },
  { id: "nearby-coffee-urbana", path: "/nearby?c=coffee&in=urbana", group: "core", description: "Location-aware answer list" },
  { id: "open-now", path: "/open-now", group: "core", description: "Verified-hours discovery" },
  { id: "events", path: "/events", group: "core", description: "Event discovery" },
  { id: "map", path: "/map", group: "core", description: "Map discovery" },
  { id: "map-unincorporated-area", path: "/map?at=39.36356,-77.30072", group: "core", description: "Coordinate-centered unincorporated area map" },
  { id: "pulse", path: "/pulse", group: "core", description: "Live local status" },
  { id: "compass", path: "/compass", group: "core", description: "Intent-led discovery" },
  { id: "signals", path: "/signals", group: "core", description: "Public civic-data findings" },
  { id: "history", path: "/history", group: "guide", description: "Local history guide" },
  { id: "check-a-date", path: "/check-a-date", group: "guide", description: "Date-aware planning tool" },
  { id: "rhythm", path: "/rhythm", group: "guide", description: "Stored schedule patterns" },
  { id: "contacts", path: "/contacts", group: "guide", description: "Local contacts directory" },
  { id: "communication-access", path: "/access", group: "guide", description: "Communication access and Deaf-community resources" },
  { id: "collections", path: "/collections", group: "guide", description: "Editorial guide index" },
  { id: "nonprofits", path: "/nonprofits", group: "guide", description: "Local nonprofit browser" },
  { id: "sports", path: "/sports", group: "guide", description: "Local sports guide" },
  { id: "beer", path: "/beer", group: "guide", description: "Beer field guide" },
  { id: "brunch", path: "/brunch", group: "guide", description: "Brunch guide" },
  { id: "deals", path: "/deals", group: "guide", description: "Daily specials guide" },
  { id: "happy-hour", path: "/happy-hour", group: "guide", description: "Time-sensitive guide" },
  { id: "live-music", path: "/live-music", group: "guide", description: "Live music guide" },
  { id: "weekend", path: "/weekend", group: "guide", description: "Weekend planner" },
  { id: "parking", path: "/parking", group: "guide", description: "Practical utility guide" },
  { id: "food-trucks", path: "/food-trucks", group: "guide", description: "Mobile food guide" },
  { id: "amenities", path: "/amenities", group: "guide", description: "Mapped public amenities" },
  { id: "shipping", path: "/shipping", group: "guide", description: "Shipping and mailing guide" },
  { id: "rivers", path: "/rivers", group: "guide", description: "Live water conditions" },
  { id: "transit", path: "/transit", group: "guide", description: "Transit utility guide" },
  { id: "trails", path: "/trails", group: "guide", description: "Outdoor guide" },
  { id: "place-detail", path: "/places/cafe-nola", group: "template", description: "Place detail template" },
  { id: "place-detail-unincorporated", path: "/places/whiskey-creek-golf-club-ijamsville", group: "template", description: "Unincorporated place detail and coordinate-based area link" },
  { id: "event-detail", path: "/events/__current__", group: "template", description: "Current event detail template" },
  { id: "category", path: "/category/coffee", group: "template", description: "Category template" },
  { id: "town", path: "/m/frederick", group: "template", description: "Municipality template" },
  { id: "collection", path: "/collections/frederick-without-a-plan", group: "template", description: "Editorial collection template" },
  { id: "nonprofit-detail", path: "/nonprofits/520591612", group: "template", description: "Nonprofit detail template" },
  { id: "places-index", path: "/places", group: "support", description: "Browse entry point" },
  { id: "towns", path: "/towns", group: "support", description: "Town directory" },
  { id: "about", path: "/about", group: "support", description: "Product context" },
  { id: "trust", path: "/trust", group: "support", description: "Trust and source policy" },
  { id: "emergency-vet", path: "/emergency-vet", group: "support", description: "Urgent utility page" },
  { id: "emergency", path: "/emergency", group: "support", description: "Emergency contacts" },
  { id: "scanner", path: "/scanner", group: "support", description: "Public-safety scanner guide" },
  { id: "numbers", path: "/numbers", group: "support", description: "Useful phone numbers" },
  { id: "reserve", path: "/reserve", group: "support", description: "Reservation links" },
  { id: "markers", path: "/markers", group: "support", description: "Historic marker browser" },
  { id: "settings", path: "/settings", group: "support", description: "Preferences" },
  { id: "notification-settings", path: "/settings/notifications", group: "support", description: "Notification preferences" },
  { id: "shared-radius", path: "/radius/shared?p=cafe-nola,gravel-and-grind-frederick", group: "support", description: "Recipient-facing shared list" },
  { id: "dear-frederick", path: "/dear-frederick", group: "support", description: "Community notes" },
  { id: "submit-event", path: "/submit/event", group: "support", description: "Event submission" },
  { id: "submit-place", path: "/submit/place", group: "support", description: "Place submission" },
  { id: "food-truck-console", path: "/food-trucks/out", group: "support", description: "Food-truck operator recovery state" },
  { id: "from-above-preview", path: "/from-above/preview", group: "support", description: "Aerial preview tool" },
  { id: "from-above-time-machine", path: "/from-above/time-machine", group: "support", description: "Aerial time-machine tool" },
  { id: "report", path: "/report", group: "support", description: "Public map reporting tool" },
  { id: "collect", path: "/collect", group: "support", description: "Field collection map tool" },
];

const VIEWPORTS: ViewportDefinition[] = [
  { id: "compact", width: 320, height: 568, deviceScaleFactor: 2, isMobile: true, hasTouch: true },
  { id: "mobile", width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true },
  { id: "desktop", width: 1440, height: 900, deviceScaleFactor: 1, isMobile: false, hasTouch: false },
];

const BASE_URL = normalizeBaseUrl(process.env.BASE_URL ?? "http://127.0.0.1:3000");
const ROUTE_FILTER = cliValue("--route") ?? cliValue("--filter") ?? process.env.ROUTE_FILTER ?? null;
const NAVIGATION_TIMEOUT_MS = positiveNumber(process.env.AUDIT_TIMEOUT_MS, 45_000);
const SETTLE_MS = positiveNumber(process.env.AUDIT_SETTLE_MS, 800);
const IMAGE_LOAD_TIMEOUT_MS = positiveNumber(process.env.AUDIT_IMAGE_TIMEOUT_MS, 6_000);
const TOUCH_TARGET_MIN_PX = positiveNumber(process.env.TOUCH_TARGET_MIN_PX, 44);
const HORIZONTAL_RAIL_SELECTOR = "[data-page-quality-horizontal-rail]";
const HORIZONTAL_RAIL_SETTLE_MS = 70;
const HORIZONTAL_RAIL_STEP_FRACTION = 0.8;
const HORIZONTAL_RAIL_MAX_STEPS = 120;

async function resolveRuntimeRoutes(routes: AuditRoute[]): Promise<AuditRoute[]> {
  if (!routes.some((route) => route.id === "event-detail")) return routes;

  const configuredPath = process.env.EVENT_AUDIT_PATH?.trim();
  if (configuredPath?.startsWith("/events/")) {
    return routes.map((route) => (
      route.id === "event-detail" ? { ...route, path: configuredPath } : route
    ));
  }

  const endpoint = new URL("/api/events/browse?limit=24", `${BASE_URL}/`);
  const response = await fetch(endpoint, {
    headers: { accept: "application/json" },
    signal: AbortSignal.timeout(NAVIGATION_TIMEOUT_MS),
  });
  if (!response.ok) {
    throw new Error(`Could not select a current event-detail audit route: ${endpoint} returned HTTP ${response.status}.`);
  }

  const payload = await response.json() as { events?: Array<{ slug?: unknown }> };
  const slugValue = payload.events?.find((event) => (
    typeof event.slug === "string" && event.slug.trim().length > 0
  ))?.slug;
  if (typeof slugValue !== "string" || slugValue.trim().length === 0) {
    throw new Error(`Could not select a current event-detail audit route: ${endpoint} returned no usable event slug.`);
  }
  const slug = slugValue.trim();

  return routes.map((route) => (
    route.id === "event-detail"
      ? { ...route, path: `/events/${encodeURIComponent(slug)}` }
      : route
  ));
}
const INTERACTIVE_REVIEW_THRESHOLD = 80;
const PAGE_HEIGHT_REVIEW_SCREENS = 6;
const RUN_ID = new Date().toISOString().replace(/[:.]/g, "-");
const OUTPUT_ROOT = resolve(process.cwd(), "output", "page-quality");
const OUTPUT_DIRECTORY = resolve(OUTPUT_ROOT, RUN_ID);

function normalizeBaseUrl(value: string): string {
  const parsed = new URL(value);
  parsed.pathname = parsed.pathname.replace(/\/$/, "");
  parsed.search = "";
  parsed.hash = "";
  return parsed.toString().replace(/\/$/, "");
}

function positiveNumber(raw: string | undefined, fallback: number): number {
  if (!raw) return fallback;
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function cliValue(flag: string): string | null {
  const exactIndex = process.argv.indexOf(flag);
  if (exactIndex >= 0) return process.argv[exactIndex + 1] ?? null;
  const prefix = `${flag}=`;
  return process.argv.find((value) => value.startsWith(prefix))?.slice(prefix.length) ?? null;
}

function selectedRoutes(filter: string | null): AuditRoute[] {
  if (!filter) return ROUTES;
  const terms = filter
    .split(",")
    .map((term) => term.trim().toLowerCase())
    .filter(Boolean);
  return ROUTES.filter((route) => {
    const haystack = `${route.id} ${route.path} ${route.group} ${route.description}`.toLowerCase();
    return terms.some((term) => haystack.includes(term));
  });
}

function fileSafe(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

function oneLine(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function unique(values: string[]): string[] {
  return [...new Set(values.map(oneLine).filter(Boolean))];
}

function uniqueBy<T>(values: T[], keyFor: (value: T) => string): T[] {
  const seen = new Set<string>();
  return values.filter((value) => {
    const key = keyFor(value);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function markdownCell(value: string | number | null): string {
  if (value === null) return "—";
  return String(value).replace(/\|/g, "\\|").replace(/\r?\n/g, " ");
}

function parseCookie(raw: string | undefined): { name: string; value: string } | null {
  if (!raw || raw.toLowerCase() === "none") return null;
  const separator = raw.indexOf("=");
  if (separator < 1) {
    throw new Error("ONBOARDING_COOKIE must be in name=value form or set to 'none'.");
  }
  return { name: raw.slice(0, separator).trim(), value: raw.slice(separator + 1).trim() };
}

async function prepareContext(context: BrowserContext): Promise<void> {
  // tsx/esbuild can decorate nested functions in a callback with its `__name`
  // helper. Playwright serializes the callback but not that module-level helper,
  // so expose the harmless helper only inside this disposable audit context.
  await context.addInitScript("globalThis.__name = (target) => target;");

  const onboardingCookie = parseCookie(process.env.ONBOARDING_COOKIE ?? "fr_onboarded=1");
  if (onboardingCookie) {
    await context.addCookies([{ ...onboardingCookie, url: BASE_URL }]);
  }

  const extraCookies = (process.env.AUDIT_COOKIES ?? "")
    .split(";")
    .map((raw) => parseCookie(raw.trim()))
    .filter((cookie): cookie is { name: string; value: string } => Boolean(cookie));
  if (extraCookies.length > 0) {
    await context.addCookies(extraCookies.map((cookie) => ({ ...cookie, url: BASE_URL })));
  }

  await context.addInitScript(() => {
    try {
      localStorage.setItem("fr:beta-intro-dismissed:v10", "true");
      localStorage.setItem("fr:beta-intro-dismissed:v8", "true");
    } catch {
      // Storage can be unavailable on opaque origins; the cookie still skips onboarding.
    }
  });
}

async function revealLazyContent(page: Page): Promise<void> {
  // A vertical document sweep cannot intersect images that are several cards
  // away inside an overflow-x rail. Exercise only rails that explicitly opt in
  // to the audit gesture, then restore their positions before collecting DOM
  // metrics. Production lazy-loading behavior remains untouched.
  await page.evaluate(sweepMarkedHorizontalRails, {
    selector: HORIZONTAL_RAIL_SELECTOR,
    settleMs: HORIZONTAL_RAIL_SETTLE_MS,
    stepFraction: HORIZONTAL_RAIL_STEP_FRACTION,
    maxStepsPerRail: HORIZONTAL_RAIL_MAX_STEPS,
  });

  await page.evaluate(async ({ imageLoadTimeoutMs }) => {
    const sleep = (ms: number) => new Promise((resolve) => window.setTimeout(resolve, ms));
    const viewportStep = Math.max(Math.round(window.innerHeight * 0.8), 500);
    let previousHeight = 0;
    let stablePasses = 0;

    for (let pass = 0; pass < 120; pass += 1) {
      const height = Math.max(document.body.scrollHeight, document.documentElement.scrollHeight);
      window.scrollTo({ top: Math.min(window.scrollY + viewportStep, height), behavior: "instant" });
      await sleep(70);

      const atBottom = window.scrollY + window.innerHeight >= height - 2;
      if (atBottom && height === previousHeight) stablePasses += 1;
      else stablePasses = 0;

      previousHeight = height;
      if (stablePasses >= 2) break;
    }

    // Native lazy loading is intentionally conservative and can leave images
    // far from the final scroll position pending even after a fast synthetic
    // pass. In this disposable audit context only, promote those images to
    // eager so every declared source is actually requested before we classify
    // it as unresolved. This does not change production page behavior.
    const pendingImages = [...document.images].filter((image) => !image.complete);
    for (const image of pendingImages) image.loading = "eager";
    await sleep(0);
    await Promise.allSettled(pendingImages.map((image) => new Promise<void>((resolve) => {
      if (image.complete) {
        resolve();
        return;
      }
      image.addEventListener("load", () => resolve(), { once: true });
      image.addEventListener("error", () => resolve(), { once: true });
      window.setTimeout(resolve, imageLoadTimeoutMs);
    })));
    await document.fonts?.ready;
    window.scrollTo({ top: 0, behavior: "instant" });
    await sleep(120);
  }, { imageLoadTimeoutMs: IMAGE_LOAD_TIMEOUT_MS });
}

async function expandDisclosureContent(page: Page): Promise<{
  nativeDetailsAttempted: number;
  nativeDetailsOpened: number;
  buttonsAttempted: number;
  buttonsRevealed: number;
  buttonsOpened: number;
  controlLabels: string[];
}> {
  const nativeDetails = await page.evaluate(() => {
    const root = document.querySelector("main,[role='main']") ?? document.body;
    const closed = [...root.querySelectorAll<HTMLDetailsElement>("details:not([open])")]
      .filter((disclosure) => !disclosure.closest("form,header,footer,nav,[role='navigation']"));
    let opened = 0;
    for (const disclosure of closed) {
      disclosure.dataset.pageQualityNativeAttempted = "true";
      disclosure.open = true;
      // Named <details> groups intentionally close the previous sibling when
      // the next one opens. Verify each disclosure at the moment it is opened
      // instead of misclassifying a healthy accordion because only its final
      // member remains open in the captured state.
      if (disclosure.open) opened += 1;
    }
    return { attempted: closed.length, opened };
  });

  const attemptedControls: Array<{ auditId: string; label: string; targetId: string }> = [];
  let buttonsRevealed = 0;
  // Re-query after every click because React disclosures update aria-expanded
  // and visibility asynchronously. The target must be an inline main-content
  // panel rather than navigation, a form action, or a popup/dialog launcher.
  for (let index = 0; index < 80; index += 1) {
    const candidate = await page.evaluate(() => {
      const root = document.querySelector("main,[role='main']") ?? document.body;
      const danger = /\b(delete|remove|clear|reset|discard|dismiss|sign out|log out|submit|send|purchase|checkout|unsubscribe|unfollow|revoke|withdraw|cancel reservation|close account)\b/i;
      const buttons = [...root.querySelectorAll<HTMLButtonElement>('button[aria-expanded="false"][aria-controls]')];
      const button = buttons.find((element) => {
        if (element.dataset.pageQualityExpandAttempted === "true") return false;
        if (
          element.disabled
          || element.type !== "button"
          || element.hasAttribute("aria-haspopup")
          || element.closest("form,header,footer,nav,[role='navigation']")
        ) return false;
        const style = getComputedStyle(element);
        const rect = element.getBoundingClientRect();
        if (style.display === "none" || style.visibility === "hidden" || rect.width <= 0 || rect.height <= 0) return false;
        const label = (element.getAttribute("aria-label") ?? element.innerText ?? "").replace(/\s+/g, " ").trim();
        if (danger.test(label)) return false;
        const targetId = element.getAttribute("aria-controls")?.trim().split(/\s+/)[0];
        const target = targetId ? document.getElementById(targetId) : null;
        if (!target || !root.contains(target) || target.closest("form,header,footer,nav,[role='navigation']")) return false;
        const targetStyle = getComputedStyle(target);
        const targetRect = target.getBoundingClientRect();
        return target.hidden
          || target.getAttribute("aria-hidden") === "true"
          || targetStyle.display === "none"
          || targetRect.height === 0;
      });
      if (!button) return null;
      button.dataset.pageQualityExpandAttempted = "true";
      const auditId = `expand-${Date.now()}-${Math.random().toString(36).slice(2)}`;
      button.dataset.pageQualityExpandId = auditId;
      return {
        auditId,
        targetId: button.getAttribute("aria-controls")!.trim().split(/\s+/)[0],
        label: (button.getAttribute("aria-label") ?? button.innerText ?? "Disclosure").replace(/\s+/g, " ").trim(),
      };
    });
    if (!candidate) break;
    attemptedControls.push(candidate);

    const control = page.locator(`[data-page-quality-expand-id="${candidate.auditId}"]`);
    try {
      await control.click({ timeout: Math.min(NAVIGATION_TIMEOUT_MS, 5_000) });
      await page.waitForTimeout(80);
      const revealed = await page.evaluate(({ auditId, targetId }) => {
        const trigger = document.querySelector<HTMLElement>(`[data-page-quality-expand-id="${CSS.escape(auditId)}"]`);
        const target = document.getElementById(targetId);
        if (!trigger || !target || trigger.getAttribute("aria-expanded") !== "true") return false;
        const style = getComputedStyle(target);
        const rect = target.getBoundingClientRect();
        return !target.hidden
          && target.getAttribute("aria-hidden") !== "true"
          && style.display !== "none"
          && style.visibility !== "hidden"
          && Number(style.opacity) !== 0
          && rect.width > 0
          && rect.height > 0;
      }, candidate);
      if (revealed) buttonsRevealed += 1;
    } catch {
      // A disclosure may disappear when another panel opens. It remains marked
      // as attempted so the audit can continue with the rest of the page.
    }
  }

  await page.waitForTimeout(150);
  const controlLabels = await page.evaluate((controls) => controls
    .filter(({ auditId, targetId }) => {
      const trigger = document.querySelector<HTMLElement>(`[data-page-quality-expand-id="${CSS.escape(auditId)}"]`);
      const target = document.getElementById(targetId);
      if (!target) return false;
      const style = getComputedStyle(target);
      const rect = target.getBoundingClientRect();
      const visible = !target.hidden
        && target.getAttribute("aria-hidden") !== "true"
        && style.display !== "none"
        && style.visibility !== "hidden"
        && Number(style.opacity) !== 0
        && rect.width > 0
        && rect.height > 0;
      if (!visible) return false;
      if (!trigger) return true;
      const triggerStyle = getComputedStyle(trigger);
      const triggerRect = trigger.getBoundingClientRect();
      const triggerVisible = triggerStyle.display !== "none"
        && triggerStyle.visibility !== "hidden"
        && Number(triggerStyle.opacity) !== 0
        && triggerRect.width > 0
        && triggerRect.height > 0;
      return !triggerVisible || trigger.getAttribute("aria-expanded") === "true";
    })
    .map(({ label }) => label || "Disclosure"), attemptedControls);
  return {
    nativeDetailsAttempted: nativeDetails.attempted,
    nativeDetailsOpened: nativeDetails.opened,
    buttonsAttempted: attemptedControls.length,
    buttonsRevealed,
    buttonsOpened: controlLabels.length,
    controlLabels,
  };
}

async function collectDomMetrics(page: Page, viewport: ViewportDefinition): Promise<DomMetrics> {
  return page.evaluate(({ minimumTarget, viewportHeight }) => {
    const INTERACTIVE_SELECTOR = [
      "a[href]",
      "button",
      "input:not([type='hidden'])",
      "select",
      "textarea",
      "summary",
      "[role='button']",
      "[role='link']",
      "[tabindex]:not([tabindex='-1'])",
    ].join(",");

    const compact = (value: string | null | undefined): string => (value ?? "").replace(/\s+/g, " ").trim();
    const normalize = (value: string): string => compact(value)
      .toLocaleLowerCase()
      .replace(/[→›»⌄⌃]/g, "")
      .replace(/[^\p{L}\p{N}$%&+]+/gu, " ")
      .trim();

    const visible = (element: Element): element is HTMLElement => {
      if (!(element instanceof HTMLElement)) return false;
      // Chromium can still return a box and computed display values for
      // descendants of a closed <details>. Those controls are not painted or
      // reachable until the disclosure opens, so counting them in the resting
      // state creates false touch-target failures.
      const closedDetails = element.closest("details:not([open])");
      if (closedDetails) {
        const visibleSummary = closedDetails.querySelector(":scope > summary");
        if (!visibleSummary?.contains(element)) return false;
      }
      // An aria-hidden ancestor can still own a measurable off-screen box
      // (the submission forms' anti-spam field is one example), but it is not
      // an available interface target.
      if (element.closest("[hidden],[inert],[aria-hidden='true']")) return false;
      const style = getComputedStyle(element);
      const rect = element.getBoundingClientRect();
      return style.display !== "none"
        && style.visibility !== "hidden"
        && Number(style.opacity) !== 0
        && rect.width > 0
        && rect.height > 0;
    };

    const selectorFor = (element: Element): string => {
      if (element.id) return `#${CSS.escape(element.id)}`;
      const segments: string[] = [];
      let current: Element | null = element;
      for (let depth = 0; current && depth < 7; depth += 1) {
        if (current.id) {
          segments.unshift(`#${CSS.escape(current.id)}`);
          break;
        }
        const testId = current.getAttribute("data-testid");
        if (testId) {
          segments.unshift(`[data-testid="${testId.replace(/"/g, "\\\"")}"]`);
          break;
        }
        const tag = current.tagName.toLowerCase();
        const classes = [...current.classList]
          .filter((className) => !className.includes(":"))
          .slice(0, 2)
          .map((className) => `.${CSS.escape(className)}`)
          .join("");
        const currentTag = current.tagName;
        const parent: Element | null = current.parentElement;
        const sameTagSiblings = parent
          ? [...parent.children].filter((sibling) => sibling.tagName === currentTag)
          : [];
        const ordinal = sameTagSiblings.length > 1
          ? `:nth-of-type(${sameTagSiblings.indexOf(current) + 1})`
          : "";
        segments.unshift(`${tag}${classes}${ordinal}`);
        current = parent;
      }
      return segments.join(" > ");
    };

    const hasUnlinkedProse = (link: HTMLAnchorElement): boolean => {
      // Sentence links inside ordinary list copy receive the WCAG inline-link
      // exception too. Keep card/list actions honest: a link inside an article
      // is an action even when the article itself happens to sit in an <li>.
      const prose = link.closest("p,figcaption,blockquote,dd,dt")
        ?? link.closest("[data-inline-prose]")
        ?? (!link.closest("article") ? link.closest("li") : null);
      if (!prose) return false;
      const walker = document.createTreeWalker(prose, NodeFilter.SHOW_TEXT);
      let node = walker.nextNode();
      while (node) {
        const parent = node.parentElement;
        if (/[\p{L}\p{N}]/u.test(compact(node.textContent)) && !parent?.closest("a")) return true;
        node = walker.nextNode();
      }
      return false;
    };

    type Box = { left: number; top: number; right: number; bottom: number };
    const clippedSize = (
      box: Box,
      element: Element,
      includeElement = false,
    ): { width: number; height: number } => {
      let { left, top, right, bottom } = box;
      let ancestor: Element | null = includeElement ? element : element.parentElement;
      while (ancestor) {
        const style = getComputedStyle(ancestor);
        const rect = ancestor.getBoundingClientRect();
        if (/^(clip|hidden)$/.test(style.overflowX)) {
          left = Math.max(left, rect.left);
          right = Math.min(right, rect.right);
        }
        if (/^(clip|hidden)$/.test(style.overflowY)) {
          top = Math.max(top, rect.top);
          bottom = Math.min(bottom, rect.bottom);
        }
        ancestor = ancestor.parentElement;
      }
      return {
        width: Math.max(0, right - left),
        height: Math.max(0, bottom - top),
      };
    };

    const pseudoTargetSize = (element: HTMLElement): { width: number; height: number } | null => {
      const bothAxes = element.classList.contains("tap-44");
      const verticalOnly = !bothAxes && element.classList.contains("tap-44-y");
      if (!bothAxes && !verticalOnly) return null;
      const pseudo = getComputedStyle(element, "::after");
      if (
        pseudo.content === "none"
        || pseudo.content === "normal"
        || pseudo.display === "none"
        || pseudo.visibility === "hidden"
        || pseudo.pointerEvents === "none"
        || !/^(absolute|fixed)$/.test(pseudo.position)
      ) return null;
      const rect = element.getBoundingClientRect();
      const parsedWidth = Number.parseFloat(pseudo.width);
      const parsedHeight = Number.parseFloat(pseudo.height);
      const horizontallyAnchored = pseudo.left !== "auto" && pseudo.right !== "auto";
      const width = Number.isFinite(parsedWidth) && parsedWidth > 0
        ? parsedWidth
        : bothAxes
          ? Math.max(rect.width, minimumTarget)
          : horizontallyAnchored
            ? rect.width
            : 0;
      // Chromium can preserve CSS max() as the computed string for pseudo
      // elements, so parseFloat("max(100%, 44px)") is NaN even though the
      // actual hit extender is valid. Fall back to the helper's documented
      // minimum instead of reporting every tap-44-y link as a 16px target.
      const height = Number.isFinite(parsedHeight) && parsedHeight > 0
        ? parsedHeight
        : Math.max(rect.height, minimumTarget);
      if (width <= 0 || height <= 0) return null;
      const left = bothAxes ? rect.left + (rect.width - width) / 2 : rect.left;
      const top = rect.top + (rect.height - height) / 2;
      return clippedSize({ left, top, right: left + width, bottom: top + height }, element, true);
    };

    const labelFor = (element: Element): string => {
      const explicit = element.getAttribute("aria-label")
        ?? element.getAttribute("title")
        ?? element.getAttribute("placeholder")
        ?? element.getAttribute("alt");
      if (explicit) return compact(explicit);
      if (element instanceof HTMLInputElement || element instanceof HTMLSelectElement || element instanceof HTMLTextAreaElement) {
        const label = element.labels?.[0]?.innerText;
        if (label) return compact(label);
        if (element instanceof HTMLInputElement && element.value) return compact(element.value);
      }
      return compact((element as HTMLElement).innerText ?? element.textContent).slice(0, 160);
    };

    const duplicateCounts = (values: string[]): NamedCount[] => {
      const groups = new Map<string, string[]>();
      for (const value of values) {
        const normalized = normalize(value);
        if (normalized.length < 2) continue;
        const examples = groups.get(normalized) ?? [];
        examples.push(compact(value));
        groups.set(normalized, examples);
      }
      return [...groups.entries()]
        .filter(([, examples]) => examples.length > 1)
        .map(([normalized, examples]) => ({
          normalized,
          examples: [...new Set(examples)].slice(0, 3),
          count: examples.length,
        }))
        .sort((a, b) => b.count - a.count || a.normalized.localeCompare(b.normalized));
    };

    const headingElements = [...document.querySelectorAll("h1,h2,h3,h4,h5,h6")].filter(visible);
    const headings: Heading[] = headingElements.map((element) => {
      const rect = element.getBoundingClientRect();
      return {
        level: Number(element.tagName.slice(1)),
        text: compact(element.textContent),
        selector: selectorFor(element),
        top: Math.round(rect.top + window.scrollY),
      };
    });
    const headingCounts = Object.fromEntries(
      [1, 2, 3, 4, 5, 6].map((level) => [`h${level}`, headings.filter((heading) => heading.level === level).length]),
    );
    const headingOrderIssues: string[] = [];
    if (headingCounts.h1 === 0) headingOrderIssues.push("No visible H1");
    if (headingCounts.h1 > 1) headingOrderIssues.push(`${headingCounts.h1} visible H1 elements`);
    for (let index = 1; index < headings.length; index += 1) {
      const previous = headings[index - 1];
      const current = headings[index];
      if (current.level > previous.level + 1) {
        headingOrderIssues.push(
          `Heading level skips H${previous.level} to H${current.level}: “${current.text.slice(0, 70)}”`,
        );
      }
    }

    const interactiveElements = [...new Set([...document.querySelectorAll(INTERACTIVE_SELECTOR)])]
      .filter(visible)
      .filter((element) => !element.hasAttribute("disabled") && element.getAttribute("aria-disabled") !== "true");
    const undersizedTouchTargets = interactiveElements
      .map((element): TargetFinding | null => {
        // Skip links are intentionally clipped until keyboard focus; they are
        // not visible touch controls in the page's resting state.
        if (element.classList.contains("sr-only")) return null;
        // WCAG treats links embedded in prose as a target-size exception. A
        // standalone inline anchor is still an action and must not disappear
        // from this check merely because its CSS display happens to be inline.
        if (
          element instanceof HTMLAnchorElement
          && (
            getComputedStyle(element).display === "inline"
            || element.closest("[data-inline-prose]")
          )
          && hasUnlinkedProse(element)
        ) return null;
        // Mapbox owns its required attribution/logo control and its compact
        // vendor styling. It is not an app action and is reviewed separately.
        if (element.closest(".mapboxgl-ctrl")) return null;
        const rect = element.getBoundingClientRect();
        // An input nested in a label inherits the label's complete click/tap
        // area: clicking anywhere in that label focuses or toggles the input.
        // Measure that semantic target instead of only the input's text line.
        const wrappingLabel = element instanceof HTMLInputElement
          ? element.closest("label")
          : null;
        const labelRect = wrappingLabel && visible(wrappingLabel)
          ? wrappingLabel.getBoundingClientRect()
          : null;
        // Card links often include a full-cover absolute child so the real hit
        // area is the card, even though the anchor's text box is much shorter.
        const fullCover = element.querySelector<HTMLElement>(":scope > [aria-hidden].absolute.inset-0");
        const coverStyle = fullCover ? getComputedStyle(fullCover) : null;
        const coverRect = fullCover?.getBoundingClientRect();
        const coverSize = fullCover && coverStyle && coverRect
          && /^(absolute|fixed)$/.test(coverStyle.position)
          && coverStyle.display !== "none"
          && coverStyle.visibility !== "hidden"
          && coverStyle.pointerEvents !== "none"
          && coverRect.width > 0
          && coverRect.height > 0
          ? clippedSize(
            { left: coverRect.left, top: coverRect.top, right: coverRect.right, bottom: coverRect.bottom },
            fullCover,
          )
          : null;
        const pseudoSize = pseudoTargetSize(element);
        const targetWidth = labelRect?.width ?? rect.width;
        const targetHeight = labelRect?.height ?? rect.height;
        const effectiveWidth = Math.max(targetWidth, coverSize?.width ?? 0, pseudoSize?.width ?? 0);
        const effectiveHeight = Math.max(targetHeight, coverSize?.height ?? 0, pseudoSize?.height ?? 0);
        if (effectiveWidth >= minimumTarget && effectiveHeight >= minimumTarget) return null;
        return {
          label: labelFor(element) || "Unlabeled control",
          selector: selectorFor(element),
          width: Math.round(rect.width * 10) / 10,
          height: Math.round(rect.height * 10) / 10,
          top: Math.round(rect.top + window.scrollY),
        };
      })
      .filter((finding): finding is TargetFinding => finding !== null)
      .slice(0, 100);

    const documentWidth = Math.max(
      document.documentElement.scrollWidth,
      document.body.scrollWidth,
      document.documentElement.offsetWidth,
      document.body.offsetWidth,
    );
    const horizontalOverflowPx = Math.max(0, Math.round(documentWidth - window.innerWidth));
    const overflowElements = horizontalOverflowPx === 0
      ? []
      : [...document.body.querySelectorAll("*")]
        .filter(visible)
        .map((element): OverflowFinding | null => {
          const rect = element.getBoundingClientRect();
          if (rect.left >= -1 && rect.right <= window.innerWidth + 1) return null;
          const style = getComputedStyle(element);
          if (style.position === "fixed" && rect.width <= window.innerWidth + 2) return null;
          return {
            selector: selectorFor(element),
            left: Math.round(rect.left),
            right: Math.round(rect.right),
            width: Math.round(rect.width),
          };
        })
        .filter((finding): finding is OverflowFinding => finding !== null)
        .sort((a, b) => b.width - a.width)
        .slice(0, 30);

    const images = [...document.images];
    const brokenImages = images
      .filter((image) => image.complete && image.naturalWidth === 0)
      .map((image) => ({
        src: image.currentSrc || image.src,
        alt: image.alt,
        selector: selectorFor(image),
      }));
    const unresolvedImages = images
      .filter((image) => !image.complete)
      .map((image) => ({
        src: image.currentSrc || image.src,
        alt: image.alt,
        selector: selectorFor(image),
      }));

    const paragraphs = [...document.querySelectorAll("p")]
      .filter(visible)
      .map((paragraph) => {
        const text = compact(paragraph.textContent);
        const words = text ? text.split(/\s+/).length : 0;
        return { words, text: text.slice(0, 240), selector: selectorFor(paragraph) };
      })
      .filter((paragraph) => paragraph.words > 0);

    const main = document.querySelector("main,[role='main']") ?? document.body;
    const usefulActionElement = [...main.querySelectorAll(INTERACTIVE_SELECTOR)]
      .filter(visible)
      .filter((element) => !element.hasAttribute("disabled") && element.getAttribute("aria-disabled") !== "true")
      .filter((element) => !element.closest("footer,nav[aria-label='Primary'],nav[aria-label='Secondary']"))
      .find((element) => {
        const href = element instanceof HTMLAnchorElement ? element.getAttribute("href") ?? "" : "";
        return href !== "#" && !/^\/(privacy|terms|about|trust)\/?$/i.test(href);
      });
    const firstUsefulAction: UsefulAction = usefulActionElement
      ? (() => {
        const rect = usefulActionElement.getBoundingClientRect();
        const top = Math.round(rect.top + window.scrollY);
        return {
          label: labelFor(usefulActionElement) || "Unlabeled control",
          selector: selectorFor(usefulActionElement),
          top,
          viewportFraction: Math.round((top / viewportHeight) * 100) / 100,
          inFirstViewport: top < viewportHeight,
        };
      })()
      : null;

    const pageHeight = Math.max(
      document.documentElement.scrollHeight,
      document.body.scrollHeight,
      document.documentElement.offsetHeight,
      document.body.offsetHeight,
    );

    return {
      title: document.title,
      pageHeight,
      documentWidth,
      viewportWidth: window.innerWidth,
      horizontalOverflowPx,
      overflowElements,
      headings,
      headingCounts,
      headingOrderIssues,
      duplicateHeadings: duplicateCounts(headings.map((heading) => heading.text)),
      duplicateLabels: duplicateCounts(interactiveElements.map(labelFor).filter(Boolean)),
      interactiveCount: interactiveElements.length,
      undersizedTouchTargets,
      brokenImages,
      unresolvedImages,
      imageCount: images.length,
      paragraphs,
      paragraphCount: paragraphs.length,
      paragraphWordCount: paragraphs.reduce((total, paragraph) => total + paragraph.words, 0),
      longestParagraphWords: Math.max(0, ...paragraphs.map((paragraph) => paragraph.words)),
      firstUsefulAction,
    };
  }, { minimumTarget: TOUCH_TARGET_MIN_PX, viewportHeight: viewport.height });
}

function resultStatus(result: Omit<AuditResult, "status">): AuditResult["status"] {
  if (
    result.navigationError
    || result.httpStatus === null
    || result.httpStatus >= 400
    || result.pageErrors.length > 0
    || !result.metrics
  ) return "error";

  const metrics = result.metrics;
  const auditedStates = [metrics, result.expanded?.metrics].filter((state): state is DomMetrics => Boolean(state));
  if (
    result.imageRequestErrors.length > 0
    || Boolean(result.expanded && (
      result.expanded.nativeDetailsAttempted !== result.expanded.nativeDetailsOpened
      || result.expanded.buttonsAttempted !== result.expanded.buttonsRevealed
    ))
    || auditedStates.some((state) => (
      state.horizontalOverflowPx > 0
      || state.headingOrderIssues.length > 0
      || state.brokenImages.length > 0
      || state.unresolvedImages.length > 0
      || state.undersizedTouchTargets.length > 0
    ))
    || !metrics.firstUsefulAction?.inFirstViewport
  ) return "warning";
  return "pass";
}

function auditedStates(result: AuditResult): DomMetrics[] {
  return [result.metrics, result.expanded?.metrics]
    .filter((metrics): metrics is DomMetrics => Boolean(metrics));
}

function uniqueTargetFindings(result: AuditResult): TargetFinding[] {
  return uniqueBy(
    auditedStates(result).flatMap((metrics) => metrics.undersizedTouchTargets),
    (finding) => `${finding.selector}\u0000${finding.label}`,
  );
}

function uniqueImageFindings(
  result: AuditResult,
  kind: "brokenImages" | "unresolvedImages",
): ImageFinding[] {
  return uniqueBy(
    auditedStates(result).flatMap((metrics) => metrics[kind]),
    (finding) => `${finding.selector}\u0000${finding.src}`,
  );
}

function metricReviewSignals(
  metrics: DomMetrics,
  viewport: ViewportDefinition,
  prefix = "",
): string[] {
  const signals: string[] = [];
  const label = prefix ? `${prefix} ` : "";
  if (metrics.duplicateHeadings.length > 0) {
    signals.push(`${label}duplicate headings: ${metrics.duplicateHeadings.slice(0, 5).map((item) => `“${item.examples[0]}” ×${item.count}`).join(", ")}`);
  }
  if (metrics.duplicateLabels.length > 0) {
    signals.push(`${label}duplicate action labels: ${metrics.duplicateLabels.slice(0, 5).map((item) => `“${item.examples[0]}” ×${item.count}`).join(", ")}`);
  }
  const longParagraphs = metrics.paragraphs.filter((paragraph) => paragraph.words > 80);
  if (longParagraphs.length > 0) {
    signals.push(`${label}paragraphs over 80 words: ${longParagraphs.length} (longest ${metrics.longestParagraphWords})`);
  }
  if (metrics.interactiveCount > INTERACTIVE_REVIEW_THRESHOLD) {
    signals.push(`${label}high action count: ${metrics.interactiveCount}`);
  }
  const viewportScreens = Math.round((metrics.pageHeight / viewport.height) * 10) / 10;
  if (viewportScreens > PAGE_HEIGHT_REVIEW_SCREENS) {
    signals.push(`${label}extreme page height: ${metrics.pageHeight}px (${viewportScreens} screens)`);
  }
  return signals;
}

function reviewSignals(result: AuditResult): string[] {
  const signals: string[] = [];
  if (!result.navigationError && result.httpStatus !== null && result.finalUrl !== result.requestedUrl) {
    signals.push(`Redirected to ${result.finalUrl}`);
  }
  if (result.metrics) signals.push(...metricReviewSignals(result.metrics, result.viewport));
  if (result.expanded) signals.push(...metricReviewSignals(result.expanded.metrics, result.viewport, "Expanded"));
  return unique(signals);
}

async function auditRoute(
  context: BrowserContext,
  route: AuditRoute,
  viewport: ViewportDefinition,
): Promise<AuditResult> {
  const page = await context.newPage();
  const pageErrors: string[] = [];
  const imageRequestErrors: string[] = [];
  const requestedUrl = new URL(route.path, `${BASE_URL}/`).toString();
  const startedAt = performance.now();
  let httpStatus: number | null = null;
  let navigationError: string | null = null;
  let metrics: DomMetrics | null = null;
  let screenshot: string | null = null;
  let expanded: ExpandedAudit | null = null;

  page.setDefaultTimeout(NAVIGATION_TIMEOUT_MS);
  page.on("pageerror", (error) => pageErrors.push(`pageerror: ${error.message}`));
  page.on("console", (message) => {
    if (message.type() !== "error") return;
    const sourceUrl = message.location().url;
    pageErrors.push(
      sourceUrl
        ? `console: ${message.text()} — ${sourceUrl}`
        : `console: ${message.text()}`,
    );
  });
  page.on("requestfailed", (request) => {
    if (request.resourceType() === "image") {
      const errorText = request.failure()?.errorText ?? "request failed";
      // Responsive images legitimately abort a lower-resolution candidate
      // when layout or eager promotion selects a better srcset candidate. The
      // final DOM checks still catch an image that never resolves or decodes.
      if (/\b(?:ERR_ABORTED|NS_BINDING_ABORTED|cancelled|canceled)\b/i.test(errorText)) return;
      imageRequestErrors.push(`${request.url()} — ${errorText}`);
    }
  });
  page.on("response", (response) => {
    if (response.request().resourceType() === "image" && response.status() >= 400) {
      imageRequestErrors.push(`${response.url()} — HTTP ${response.status()}`);
    }
  });

  try {
    const response = await page.goto(requestedUrl, {
      waitUntil: "domcontentloaded",
      timeout: NAVIGATION_TIMEOUT_MS,
    });
    httpStatus = response?.status() ?? null;
    await page.waitForLoadState("networkidle", { timeout: 6_000 }).catch(() => undefined);
    await page.waitForTimeout(SETTLE_MS);
    await revealLazyContent(page);
    metrics = await collectDomMetrics(page, viewport);

    const screenshotName = `${fileSafe(route.id)}--${viewport.id}.png`;
    const screenshotAbsolute = resolve(OUTPUT_DIRECTORY, screenshotName);
    try {
      await page.screenshot({ path: screenshotAbsolute, fullPage: true, animations: "disabled" });
      screenshot = screenshotName;
    } catch (error) {
      pageErrors.push(`screenshot: ${error instanceof Error ? error.message : String(error)}`);
    }

    const disclosureState = await expandDisclosureContent(page);
    if (disclosureState.nativeDetailsAttempted > 0 || disclosureState.buttonsAttempted > 0) {
      await page.waitForTimeout(150);
      await revealLazyContent(page);
      const expandedMetrics = await collectDomMetrics(page, viewport);
      const expandedScreenshotName = `${fileSafe(route.id)}--${viewport.id}--expanded.png`;
      const expandedScreenshotAbsolute = resolve(OUTPUT_DIRECTORY, expandedScreenshotName);
      let expandedScreenshot: string | null = null;
      try {
        await page.screenshot({ path: expandedScreenshotAbsolute, fullPage: true, animations: "disabled" });
        expandedScreenshot = expandedScreenshotName;
      } catch (error) {
        pageErrors.push(`expanded screenshot: ${error instanceof Error ? error.message : String(error)}`);
      }
      expanded = {
        ...disclosureState,
        metrics: expandedMetrics,
        screenshot: expandedScreenshot,
      };
    }
  } catch (error) {
    navigationError = error instanceof Error ? error.message : String(error);
  }

  const partial: Omit<AuditResult, "status"> = {
    route,
    viewport,
    requestedUrl,
    finalUrl: page.url(),
    httpStatus,
    durationMs: Math.round(performance.now() - startedAt),
    screenshot,
    navigationError,
    pageErrors: unique(pageErrors),
    imageRequestErrors: unique(imageRequestErrors),
    metrics,
    expanded,
  };
  const result: AuditResult = { ...partial, status: resultStatus(partial) };
  await page.close();
  return result;
}

function buildMarkdown(report: AuditReport): string {
  const statePair = (resting: number | null, expanded: number | null): string => (
    `${resting ?? "—"} / ${expanded ?? "—"}`
  );
  const lines: string[] = [
    "# Frederick Radius page-quality audit",
    "",
    `Generated: ${report.generatedAt}`,
    `Base URL: ${report.baseUrl}`,
    `Routes: ${report.routes.length} representative routes × ${report.viewports.length} viewports`,
    report.routeFilter ? `Filter: ${report.routeFilter}` : "Filter: none",
    "",
    "## Summary",
    "",
    `- ${report.totals.passed} passed, ${report.totals.warnings} need review, ${report.totals.errors} failed`,
    `- ${report.totals.pageErrors} browser errors`,
    `- ${report.totals.imageRequestErrors} failed image requests`,
    `- ${report.totals.brokenImages} unique broken images across resting and expanded states`,
    `- ${report.totals.unresolvedImages} unique images still unresolved after the load allowance`,
    `- ${report.totals.undersizedTouchTargets} unique controls below ${TOUCH_TARGET_MIN_PX} × ${TOUCH_TARGET_MIN_PX}px across states`,
    `- ${report.totals.horizontalOverflowChecks} checks with horizontal overflow`,
    `- ${report.totals.reviewSignalChecks} checks with non-blocking review signals`,
    "",
    "## Route matrix",
    "",
    "State columns use resting / expanded values.",
    "",
    "| Route | Viewport | Status | HTTP | H1 | Headings | Actions | Small targets R/E | Overflow R/E | Broken R/E | Unresolved R/E | Expanded | Errors | Height | First useful action |",
    "|---|---:|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---|",
  ];

  for (const result of report.results) {
    const metrics = result.metrics;
    const firstAction = metrics?.firstUsefulAction
      ? `${metrics.firstUsefulAction.top}px (${metrics.firstUsefulAction.inFirstViewport ? "first screen" : "below fold"})`
      : "none";
    lines.push([
      `| ${markdownCell(`${result.route.id} (${result.route.path})`)}`,
      markdownCell(`${result.viewport.width}×${result.viewport.height}`),
      markdownCell(result.status),
      markdownCell(result.httpStatus),
      markdownCell(metrics?.headingCounts.h1 ?? null),
      markdownCell(metrics?.headings.length ?? null),
      markdownCell(metrics?.interactiveCount ?? null),
      markdownCell(statePair(
        metrics?.undersizedTouchTargets.length ?? null,
        result.expanded?.metrics.undersizedTouchTargets.length ?? null,
      )),
      markdownCell(statePair(
        metrics?.horizontalOverflowPx ?? null,
        result.expanded?.metrics.horizontalOverflowPx ?? null,
      )),
      markdownCell(statePair(
        metrics?.brokenImages.length ?? null,
        result.expanded?.metrics.brokenImages.length ?? null,
      )),
      markdownCell(statePair(
        metrics?.unresolvedImages.length ?? null,
        result.expanded?.metrics.unresolvedImages.length ?? null,
      )),
      markdownCell(result.expanded
        ? `${result.expanded.nativeDetailsOpened}/${result.expanded.nativeDetailsAttempted} details verified + ${result.expanded.buttonsRevealed}/${result.expanded.buttonsAttempted} controls revealed (${result.expanded.buttonsOpened} remain open)`
        : "none"),
      markdownCell(result.pageErrors.length),
      markdownCell(metrics?.pageHeight ?? null),
      `${markdownCell(firstAction)} |`,
    ].join(" | "));
  }

  lines.push("", "## Findings", "");
  const findings = report.results.filter((entry) => entry.status !== "pass");
  if (findings.length === 0) lines.push("- None.", "");
  for (const result of findings) {
    const metrics = result.metrics;
    lines.push(`### ${result.route.id} · ${result.viewport.id}`, "");
    if (result.navigationError) lines.push(`- Navigation: ${oneLine(result.navigationError)}`);
    if (result.httpStatus !== null && result.httpStatus >= 400) lines.push(`- HTTP ${result.httpStatus}`);
    for (const error of result.pageErrors.slice(0, 8)) lines.push(`- Browser error: ${oneLine(error)}`);
    for (const error of result.imageRequestErrors.slice(0, 8)) lines.push(`- Image request: ${oneLine(error)}`);
    if (metrics) {
      for (const issue of metrics.headingOrderIssues) lines.push(`- Heading: ${issue}`);
      if (metrics.horizontalOverflowPx > 0) {
        const offenders = metrics.overflowElements.slice(0, 5).map((item) => item.selector).join(", ");
        lines.push(`- Horizontal overflow: ${metrics.horizontalOverflowPx}px${offenders ? ` (${offenders})` : ""}`);
      }
      if (metrics.undersizedTouchTargets.length > 0) {
        const examples = metrics.undersizedTouchTargets.slice(0, 5)
          .map((item) => `${item.label} ${item.width}×${item.height}px`)
          .join("; ");
        lines.push(`- Small touch targets: ${metrics.undersizedTouchTargets.length}${examples ? ` (${examples})` : ""}`);
      }
      if (metrics.brokenImages.length > 0) {
        lines.push(`- Broken images: ${metrics.brokenImages.map((image) => image.src).slice(0, 5).join(", ")}`);
      }
      if (metrics.unresolvedImages.length > 0) {
        lines.push(`- Unresolved images: ${metrics.unresolvedImages.map((image) => image.src).slice(0, 5).join(", ")}`);
      }
      if (!metrics.firstUsefulAction) lines.push("- No useful action found in main content");
      else if (!metrics.firstUsefulAction.inFirstViewport) {
        lines.push(`- First useful action is below the fold at ${metrics.firstUsefulAction.top}px`);
      }
    }
    if (result.expanded) {
      const expandedMetrics = result.expanded.metrics;
      lines.push(`- Expanded disclosures: ${result.expanded.nativeDetailsOpened}/${result.expanded.nativeDetailsAttempted} native details verified; ${result.expanded.buttonsRevealed}/${result.expanded.buttonsAttempted} controlled panels revealed, ${result.expanded.buttonsOpened} remain open`);
      for (const issue of expandedMetrics.headingOrderIssues) lines.push(`- Expanded heading: ${issue}`);
      if (expandedMetrics.horizontalOverflowPx > 0) {
        const offenders = expandedMetrics.overflowElements.slice(0, 5).map((item) => item.selector).join(", ");
        lines.push(`- Expanded horizontal overflow: ${expandedMetrics.horizontalOverflowPx}px${offenders ? ` (${offenders})` : ""}`);
      }
      if (expandedMetrics.undersizedTouchTargets.length > 0) {
        const examples = expandedMetrics.undersizedTouchTargets.slice(0, 5)
          .map((item) => `${item.label} ${item.width}×${item.height}px`)
          .join("; ");
        lines.push(`- Expanded small touch targets: ${expandedMetrics.undersizedTouchTargets.length}${examples ? ` (${examples})` : ""}`);
      }
      if (expandedMetrics.brokenImages.length > 0) {
        lines.push(`- Expanded broken images: ${expandedMetrics.brokenImages.map((image) => image.src).slice(0, 5).join(", ")}`);
      }
      if (expandedMetrics.unresolvedImages.length > 0) {
        lines.push(`- Expanded unresolved images: ${expandedMetrics.unresolvedImages.map((image) => image.src).slice(0, 5).join(", ")}`);
      }
      if (result.expanded.screenshot) lines.push(`- Expanded screenshot: [${result.expanded.screenshot}](./${result.expanded.screenshot})`);
    }
    if (result.screenshot) lines.push(`- Screenshot: [${result.screenshot}](./${result.screenshot})`);
    lines.push("");
  }

  lines.push("## Review signals", "");
  const signaledResults = report.results
    .map((result) => ({ result, signals: reviewSignals(result) }))
    .filter(({ signals }) => signals.length > 0);
  if (signaledResults.length === 0) lines.push("- None.", "");
  for (const { result, signals } of signaledResults) {
    lines.push(`### ${result.route.id} · ${result.viewport.id}`, "");
    for (const signal of signals) lines.push(`- ${signal}`);
    lines.push("");
  }

  lines.push(
    "## Notes",
    "",
    "- Duplicate labels, long copy, redirects, extreme height, and high action counts remain visible as review signals without automatically failing a check.",
    "- Lazy images are checked only after the harness scrolls through the complete page; failed requests and images still unresolved after the allowance are reported separately.",
    "- Aggregate image and target totals deduplicate the same selector across resting and expanded states within each route check.",
    "- Expanded-state findings come from native details and verified inline panels; forms, navigation, popup/dialog launchers, app chrome, and destructive controls are excluded.",
    "- Every route and viewport runs in a fresh browser context so local storage, session storage, and cookies cannot leak into the next check.",
    "- Use the JSON report for full selectors, headings, paragraph counts, and error details.",
    "",
  );
  return lines.join("\n");
}

async function main(): Promise<void> {
  const routes = await resolveRuntimeRoutes(selectedRoutes(ROUTE_FILTER));
  if (routes.length === 0) {
    throw new Error(`No routes match ROUTE_FILTER=${JSON.stringify(ROUTE_FILTER)}. Available ids: ${ROUTES.map((route) => route.id).join(", ")}`);
  }

  await mkdir(OUTPUT_DIRECTORY, { recursive: true });
  const browser = await chromium.launch({ headless: process.env.HEADED !== "1" });
  const results: AuditResult[] = [];

  try {
    for (const viewport of VIEWPORTS) {
      for (const route of routes) {
        const context = await browser.newContext({
          viewport: { width: viewport.width, height: viewport.height },
          deviceScaleFactor: viewport.deviceScaleFactor,
          isMobile: viewport.isMobile,
          hasTouch: viewport.hasTouch,
          locale: "en-US",
          timezoneId: "America/New_York",
          colorScheme: "light",
          reducedMotion: "reduce",
          serviceWorkers: "block",
        });
        try {
          await prepareContext(context);
          process.stdout.write(`Auditing ${route.id} at ${viewport.id}… `);
          const result = await auditRoute(context, route, viewport);
          results.push(result);
          console.log(`${result.status} (${result.durationMs}ms)`);
        } finally {
          await context.close();
        }
      }
    }
  } finally {
    await browser.close();
  }

  const report: AuditReport = {
    generatedAt: new Date().toISOString(),
    baseUrl: BASE_URL,
    routeFilter: ROUTE_FILTER,
    outputDirectory: OUTPUT_DIRECTORY,
    routes,
    viewports: VIEWPORTS,
    totals: {
      checks: results.length,
      passed: results.filter((result) => result.status === "pass").length,
      warnings: results.filter((result) => result.status === "warning").length,
      errors: results.filter((result) => result.status === "error").length,
      pageErrors: results.reduce((total, result) => total + result.pageErrors.length, 0),
      imageRequestErrors: results.reduce((total, result) => total + result.imageRequestErrors.length, 0),
      brokenImages: results.reduce((total, result) => total + uniqueImageFindings(result, "brokenImages").length, 0),
      unresolvedImages: results.reduce((total, result) => total + uniqueImageFindings(result, "unresolvedImages").length, 0),
      undersizedTouchTargets: results.reduce((total, result) => total + uniqueTargetFindings(result).length, 0),
      horizontalOverflowChecks: results.filter((result) => (
        (result.metrics?.horizontalOverflowPx ?? 0) > 0
        || (result.expanded?.metrics.horizontalOverflowPx ?? 0) > 0
      )).length,
      reviewSignalChecks: results.filter((result) => reviewSignals(result).length > 0).length,
    },
    results,
  };

  const jsonPath = resolve(OUTPUT_DIRECTORY, "summary.json");
  const markdownPath = resolve(OUTPUT_DIRECTORY, "summary.md");
  await Promise.all([
    writeFile(jsonPath, `${JSON.stringify(report, null, 2)}\n`, "utf8"),
    writeFile(markdownPath, buildMarkdown(report), "utf8"),
  ]);

  console.log(`\nPage-quality report: ${markdownPath}`);
  console.log(`Machine-readable data: ${jsonPath}`);

  if (process.env.FAIL_ON_PAGE_ERRORS === "1" && report.totals.errors > 0) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack ?? error.message : error);
  process.exitCode = 1;
});
