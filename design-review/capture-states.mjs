import { chromium } from "@playwright/test";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const BASE = process.env.BASE_URL || "http://127.0.0.1:3107";
const SCREENSHOTS = resolve("design-review/screenshots");
const PROBES = resolve("design-review/probes");
const mobile = { width: 375, height: 812 };
const desktop = { width: 1440, height: 900 };

await mkdir(SCREENSHOTS, { recursive: true });
await mkdir(PROBES, { recursive: true });

const browser = await chromium.launch({ headless: true, channel: "chrome" });
const evidence = {
  base: BASE,
  capturedAt: new Date().toISOString(),
  screenshots: [],
  checks: {},
};

async function makeContext({ viewport = mobile, dismissed = true, reducedMotion = "no-preference" } = {}) {
  const context = await browser.newContext({
    viewport,
    deviceScaleFactor: 1,
    isMobile: viewport.width === 375,
    hasTouch: viewport.width < 1024,
    colorScheme: "light",
    reducedMotion,
    locale: "en-US",
    timezoneId: "America/New_York",
    geolocation: { latitude: 39.4143, longitude: -77.4105 },
    permissions: ["geolocation"],
    serviceWorkers: "block",
  });
  if (dismissed) {
    await context.addCookies([
      { name: "fr_onboarded", value: "1", url: BASE },
      { name: "fr:beta-intro-dismissed:v10", value: "true", url: BASE },
    ]);
  }
  await context.addInitScript(({ dismissed }) => {
    try {
      if (dismissed) {
        localStorage.setItem("fr:beta-intro-dismissed:v10", "true");
        localStorage.setItem("fr:onboarded", "1");
      } else {
        localStorage.removeItem("fr:beta-intro-dismissed:v10");
        localStorage.removeItem("fr:onboarded");
      }
    } catch {}
    window.__reviewEventEntries = [];
    try {
      const observer = new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          window.__reviewEventEntries.push({
            name: entry.name,
            duration: entry.duration,
            interactionId: entry.interactionId || 0,
            startTime: entry.startTime,
          });
        }
      });
      observer.observe({ type: "event", buffered: true, durationThreshold: 16 });
    } catch {}
  }, { dismissed });
  return context;
}

async function settle(page, path, { delay = 1800, waitForIdle = true } = {}) {
  const response = await page.goto(`${BASE}${path}`, { waitUntil: "domcontentloaded", timeout: 60_000 });
  if (waitForIdle) await page.waitForLoadState("networkidle", { timeout: 12_000 }).catch(() => {});
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(delay);
  await page.addStyleTag({ content: "nextjs-portal { display: none !important; }" });
  return response?.status() ?? null;
}

async function capture(page, filename, { fullPage = false } = {}) {
  const path = resolve(SCREENSHOTS, filename);
  await page.screenshot({ path, fullPage, animations: "disabled" });
  evidence.screenshots.push(`screenshots/${filename}`);
}

async function captureLocator(locator, filename) {
  const path = resolve(SCREENSHOTS, filename);
  await locator.screenshot({ path, animations: "disabled" });
  evidence.screenshots.push(`screenshots/${filename}`);
}

async function focusDescriptor(page) {
  return page.evaluate(() => {
    const el = document.activeElement;
    if (!(el instanceof HTMLElement)) return null;
    return {
      tag: el.tagName.toLowerCase(),
      id: el.id || null,
      role: el.getAttribute("role"),
      label: el.getAttribute("aria-label") || el.getAttribute("placeholder") || el.textContent?.replace(/\s+/g, " ").trim().slice(0, 160) || null,
      href: el instanceof HTMLAnchorElement ? el.getAttribute("href") : null,
    };
  });
}

async function computedState(locator) {
  return locator.evaluate((el) => {
    const s = getComputedStyle(el);
    return {
      backgroundColor: s.backgroundColor,
      color: s.color,
      borderColor: s.borderColor,
      boxShadow: s.boxShadow,
      outline: `${s.outlineWidth} ${s.outlineStyle} ${s.outlineColor}`,
      opacity: s.opacity,
      transform: s.transform,
      cursor: s.cursor,
      disabled: el instanceof HTMLButtonElement ? el.disabled : null,
    };
  });
}

// Beta primary CTA: default, hover, focus-visible, loading, error, and the
// server-rendered invalid-code state. The POST is intercepted so no email is
// sent and no external state changes.
{
  const context = await makeContext({ viewport: mobile });
  const page = await context.newPage();
  await settle(page, "/beta?error=1", { delay: 1200 });
  await capture(page, "beta--mobile-375x812--validation-error.png", { fullPage: true });

  const email = page.getByLabel("Email for launch news").first();
  const cta = page.getByRole("button", { name: "Email me a code" }).first();
  const states = { default: await computedState(cta) };

  await cta.hover();
  states.hover = await computedState(cta);
  await capture(page, "beta--mobile-375x812--primary-hover.png");

  await cta.focus();
  states.focusVisible = await computedState(cta);
  await capture(page, "beta--mobile-375x812--primary-focus-visible.png");

  await page.route("**/api/beta/email", async (route) => {
    await new Promise((resolvePromise) => setTimeout(resolvePromise, 6_000));
    await route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ ok: false }) });
  });
  await email.fill("design-review@example.invalid");
  await cta.click();
  await page.getByRole("button", { name: "…" }).waitFor();
  states.loading = await computedState(page.getByRole("button", { name: "…" }).first());
  await captureLocator(email.locator("xpath=ancestor::form"), "beta--mobile-375x812--primary-loading.png");
  await page.getByRole("alert").waitFor({ timeout: 10_000 });
  states.error = {
    button: await computedState(page.getByRole("button", { name: "Email me a code" }).first()),
    message: await page.getByRole("alert").innerText(),
  };
  await captureLocator(email.locator("xpath=ancestor::form"), "beta--mobile-375x812--email-error.png");
  evidence.checks.betaPrimaryStates = states;
  await context.close();
}

// First-visit onboarding card on the primary route.
{
  const context = await makeContext({ viewport: mobile, dismissed: false });
  const page = await context.newPage();
  await settle(page, "/today", { delay: 2200 });
  await capture(page, "today--mobile-375x812--first-visit-intro.png");
  evidence.checks.firstVisitIntro = {
    dialogs: await page.locator('[role="dialog"]').count(),
    visibleText: (await page.locator("body").innerText()).replace(/\s+/g, " ").slice(0, 600),
  };
  await context.close();
}

// Keyboard flow: skip link, search dialog focus trap and return, Browse drawer
// focus containment and Escape return.
{
  const context = await makeContext({ viewport: mobile });
  const page = await context.newPage();
  await settle(page, "/today", { delay: 1800 });

  await page.keyboard.press("Tab");
  const skipFocused = await focusDescriptor(page);
  await capture(page, "today--mobile-375x812--skip-link-focus.png");
  await page.keyboard.press("Enter");
  await page.waitForTimeout(100);
  const afterSkip = await focusDescriptor(page);

  const searchTrigger = page.getByRole("button", { name: "Search places, events, towns" });
  await searchTrigger.focus();
  const searchTriggerState = await computedState(searchTrigger);
  await searchTrigger.click();
  const searchDialog = page.getByRole("dialog").first();
  await searchDialog.waitFor();
  const searchOpenFocus = await focusDescriptor(page);
  await capture(page, "today--mobile-375x812--search-overlay-open.png");
  const searchInput = page.getByRole("combobox").or(page.getByRole("searchbox")).or(page.locator('input[placeholder*="Search"]')).first();
  await searchInput.fill("coffee");
  await page.waitForTimeout(1200);
  await capture(page, "today--mobile-375x812--search-overlay-results.png");
  const searchTrap = await page.evaluate(() => {
    const dialog = document.querySelector('[role="dialog"]');
    if (!dialog) return null;
    const focusables = [...dialog.querySelectorAll('a[href], button:not([disabled]), input, [tabindex]:not([tabindex="-1"])')]
      .filter((el) => el instanceof HTMLElement && getComputedStyle(el).display !== "none");
    const describe = (el) => el ? (el.getAttribute("aria-label") || el.textContent || el.tagName).replace(/\s+/g, " ").trim().slice(0, 120) : null;
    focusables.at(-1)?.focus();
    return { count: focusables.length, first: describe(focusables[0]), last: describe(focusables.at(-1)) };
  });
  await page.keyboard.press("Tab");
  const searchAfterTabFromLast = await focusDescriptor(page);
  await page.keyboard.press("Escape");
  await searchDialog.waitFor({ state: "hidden" });
  const searchReturnFocus = await focusDescriptor(page);

  const browse = page.getByRole("button", { name: "Browse" });
  await browse.click();
  const browseDialog = page.getByRole("dialog").first();
  await browseDialog.waitFor();
  await capture(page, "today--mobile-375x812--browse-drawer-open.png");
  const browseFocus = await focusDescriptor(page);
  const browseTrap = await page.evaluate(() => {
    const dialog = document.querySelector('[role="dialog"]');
    if (!dialog) return null;
    const focusables = [...dialog.querySelectorAll('a[href], button:not([disabled]), input, [tabindex]:not([tabindex="-1"])')]
      .filter((el) => el instanceof HTMLElement && getComputedStyle(el).display !== "none");
    const last = focusables.at(-1);
    last?.focus();
    return { count: focusables.length, lastLabel: last?.getAttribute("aria-label") || last?.textContent?.replace(/\s+/g, " ").trim().slice(0, 120) || null };
  });
  await page.keyboard.press("Tab");
  const browseAfterTabFromLast = await focusDescriptor(page);
  await page.keyboard.press("Escape");
  await browseDialog.waitFor({ state: "hidden" });
  const browseReturnFocus = await focusDescriptor(page);

  const eventEntries = await page.evaluate(() => window.__reviewEventEntries || []);
  evidence.checks.keyboardPrimaryFlow = {
    skipFocused,
    afterSkip,
    searchTriggerState,
    searchOpenFocus,
    searchTrap,
    searchAfterTabFromLast,
    searchReturnFocus,
    browseFocus,
    browseTrap,
    browseAfterTabFromLast,
    browseReturnFocus,
    labEventTiming: {
      note: "Controlled Playwright Event Timing entries. This is not field INP.",
      maxDurationMs: eventEntries.length ? Math.max(...eventEntries.map((entry) => entry.duration)) : null,
      entries: eventEntries.slice(-40),
    },
  };
  await context.close();
}

// Map loading and alternate list/panel states.
{
  const context = await makeContext({ viewport: mobile });
  const page = await context.newPage();
  await settle(page, "/map", { delay: 300, waitForIdle: false });
  await capture(page, "map--mobile-375x812--loading.png");
  await page.waitForTimeout(4_700);
  const listToggle = page.locator(".dock-viewtoggle");
  let listText = null;
  if (await listToggle.isVisible().catch(() => false)) {
    await listToggle.click();
    await page.waitForTimeout(350);
    await capture(page, "map--mobile-375x812--list-open.png");
    listText = (await page.locator("body").innerText()).replace(/\s+/g, " ").slice(0, 1_000);
  }
  evidence.checks.mapStates = { listAvailable: listText !== null, listText };
  await context.close();
}

// Events segmented filter panel and view-state proof.
{
  const context = await makeContext({ viewport: mobile });
  const page = await context.newPage();
  await settle(page, "/events", { delay: 1800 });
  const what = page.locator(".eb-seg-what");
  let whatPanelAvailable = false;
  if (await what.isVisible().catch(() => false)) {
    await what.click();
    await page.waitForTimeout(250);
    await capture(page, "events--mobile-375x812--what-panel-open.png");
    whatPanelAvailable = true;
    const done = page.locator(".dock-done");
    if (await done.isVisible().catch(() => false)) await done.click();
  }
  const compact = page.getByRole("button", { name: "Compact view" });
  let compactPressed = null;
  if (await compact.isVisible().catch(() => false)) {
    await compact.click();
    await page.waitForTimeout(450);
    await capture(page, "events--mobile-375x812--compact-view.png");
    compactPressed = await compact.getAttribute("aria-pressed");
  }
  evidence.checks.eventsStates = {
    whatPanelAvailable,
    compactPressed,
  };
  await context.close();
}

// Search empty state, kept separate from the populated baseline.
{
  const context = await makeContext({ viewport: mobile });
  const page = await context.newPage();
  await settle(page, "/search?q=zzzz-audit-no-result", { delay: 1800 });
  await capture(page, "search-no-results--mobile-375x812--empty.png");
  evidence.checks.searchEmpty = {
    visibleText: (await page.locator("main").innerText()).replace(/\s+/g, " ").slice(0, 1_200),
  };
  await context.close();
}

// Desktop hover and focus proof for the same primary beta CTA.
{
  const context = await makeContext({ viewport: desktop });
  const page = await context.newPage();
  await settle(page, "/beta", { delay: 1200 });
  const cta = page.getByRole("button", { name: "Email me a code" }).first();
  await cta.hover();
  await capture(page, "beta--desktop-1440x900--primary-hover.png");
  await cta.focus();
  await capture(page, "beta--desktop-1440x900--primary-focus-visible.png");
  await context.close();
}

// Reduced-motion audit on all priority routes. A duration above 1ms after the
// media preference is active is retained for review, not automatically called
// a defect because static transitions may never run without interaction.
{
  const context = await makeContext({ viewport: mobile, reducedMotion: "reduce" });
  const page = await context.newPage();
  const routes = [
    ["today", "/today"],
    ["map", "/map"],
    ["events", "/events"],
    ["saved", "/my-radius"],
    ["search", "/search?q=coffee"],
    ["place", "/places/brewers-alley-frederick"],
    ["event", "/events/alive-at-five-2026-07-16"],
    ["town", "/m/frederick"],
    ["beta", "/beta"],
  ];
  const motion = {};
  for (const [name, path] of routes) {
    await settle(page, path, { delay: name === "map" ? 3_500 : 800 });
    motion[name] = await page.evaluate(() => {
      const parseMaxMs = (value) => Math.max(...value.split(",").map((part) => {
        const v = part.trim();
        return v.endsWith("ms") ? Number.parseFloat(v) : Number.parseFloat(v) * 1000;
      }));
      const offenders = [];
      for (const el of document.querySelectorAll("body *")) {
        const rect = el.getBoundingClientRect();
        const s = getComputedStyle(el);
        if (s.display === "none" || s.visibility === "hidden" || rect.width <= 0 || rect.height <= 0) continue;
        const animationMs = parseMaxMs(s.animationDuration);
        const transitionMs = parseMaxMs(s.transitionDuration);
        if (animationMs > 1 || transitionMs > 1) {
          offenders.push({
            tag: el.tagName.toLowerCase(),
            label: (el.getAttribute("aria-label") || el.textContent || "").replace(/\s+/g, " ").trim().slice(0, 100),
            animationName: s.animationName,
            animationDuration: s.animationDuration,
            transitionDuration: s.transitionDuration,
          });
        }
      }
      return { offenderCount: offenders.length, offenders: offenders.slice(0, 120) };
    });
  }
  evidence.checks.reducedMotion = motion;
  await context.close();
}

await browser.close();
await writeFile(resolve(PROBES, "interactive-states.json"), `${JSON.stringify(evidence, null, 2)}\n`);
console.log(JSON.stringify({ screenshots: evidence.screenshots.length, checks: Object.keys(evidence.checks) }, null, 2));
