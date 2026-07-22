import { chromium } from "@playwright/test";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const BASE = process.env.BASE_URL || "http://127.0.0.1:3107";
const OUT = resolve("design-review");
const SCREENSHOTS = resolve(OUT, "screenshots");
const PROBES = resolve(OUT, "probes");
const AXE_PATH = resolve("node_modules/axe-core/axe.min.js");

const routes = [
  { name: "beta", path: "/beta", supplementary: true },
  { name: "today", path: "/today" },
  { name: "map", path: "/map" },
  { name: "events", path: "/events" },
  { name: "saved", path: "/my-radius" },
  { name: "search-coffee", path: "/search?q=coffee" },
  { name: "place-brewers-alley", path: "/places/brewers-alley-frederick" },
  { name: "event-alive-at-five", path: "/events/alive-at-five-2026-07-16" },
  { name: "town-frederick", path: "/m/frederick" },
];

const viewports = [
  { name: "mobile-375x812", width: 375, height: 812 },
  { name: "tablet-768x1024", width: 768, height: 1024 },
  { name: "desktop-1440x900", width: 1440, height: 900 },
];

await mkdir(SCREENSHOTS, { recursive: true });
await mkdir(PROBES, { recursive: true });

const browser = await chromium.launch({ headless: true, channel: "chrome" });
const summary = [];

for (const viewport of viewports) {
  const context = await browser.newContext({
    viewport: { width: viewport.width, height: viewport.height },
    deviceScaleFactor: 1,
    isMobile: viewport.width === 375,
    hasTouch: viewport.width < 1024,
    colorScheme: "light",
    reducedMotion: "no-preference",
    locale: "en-US",
    timezoneId: "America/New_York",
    geolocation: { latitude: 39.4143, longitude: -77.4105 },
    permissions: ["geolocation"],
    serviceWorkers: "block",
  });

  await context.addCookies([
    { name: "fr_onboarded", value: "1", url: BASE },
    { name: "fr:beta-intro-dismissed:v10", value: "true", url: BASE },
  ]);

  await context.addInitScript(() => {
    try {
      localStorage.setItem("fr:beta-intro-dismissed:v10", "true");
      localStorage.setItem("fr:onboarded", "1");
    } catch {}

    window.__designReviewCLS = 0;
    try {
      const observer = new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          if (!entry.hadRecentInput) window.__designReviewCLS += entry.value;
        }
      });
      observer.observe({ type: "layout-shift", buffered: true });
    } catch {}
  });

  const page = await context.newPage();
  page.setDefaultTimeout(30_000);

  for (const route of routes) {
    const screenshotName = `${route.name}--${viewport.name}--baseline.png`;
    const screenshotPath = resolve(SCREENSHOTS, screenshotName);
    const probeName = `${route.name}--${viewport.name}.json`;
    const probePath = resolve(PROBES, probeName);
    const consoleMessages = [];
    const pageErrors = [];
    const onConsole = (msg) => {
      if (["warning", "error"].includes(msg.type())) {
        consoleMessages.push({ type: msg.type(), text: msg.text().slice(0, 1000) });
      }
    };
    const onPageError = (error) => pageErrors.push(String(error).slice(0, 1200));
    page.on("console", onConsole);
    page.on("pageerror", onPageError);

    const startedAt = Date.now();
    let probe;
    try {
      const response = await page.goto(`${BASE}${route.path}`, {
        waitUntil: "domcontentloaded",
        timeout: 60_000,
      });
      await page.waitForLoadState("networkidle", { timeout: 12_000 }).catch(() => {});
      await page.evaluate(() => document.fonts.ready);
      await page.waitForTimeout(route.name === "map" ? 4_000 : 1_800);
      await page.addStyleTag({ content: "nextjs-portal { display: none !important; }" });

      await page.screenshot({ path: screenshotPath, fullPage: true, animations: "disabled" });
      await page.addScriptTag({ path: AXE_PATH });

      const measured = await page.evaluate(async () => {
        const isVisible = (el) => {
          const style = getComputedStyle(el);
          const rect = el.getBoundingClientRect();
          return style.display !== "none" && style.visibility !== "hidden" && Number(style.opacity) > 0 && rect.width > 0 && rect.height > 0;
        };

        const labelFor = (el) =>
          (el.getAttribute("aria-label") || el.getAttribute("title") || el.textContent || el.getAttribute("alt") || "")
            .replace(/\s+/g, " ")
            .trim()
            .slice(0, 180);

        const selectorFor = (el) => {
          if (el.id) return `#${CSS.escape(el.id)}`;
          const parts = [];
          let node = el;
          while (node && node.nodeType === Node.ELEMENT_NODE && parts.length < 5) {
            let part = node.tagName.toLowerCase();
            if (node.getAttribute("data-testid")) {
              part += `[data-testid="${node.getAttribute("data-testid")}"]`;
              parts.unshift(part);
              break;
            }
            const parent = node.parentElement;
            if (parent) {
              const siblings = [...parent.children].filter((child) => child.tagName === node.tagName);
              if (siblings.length > 1) part += `:nth-of-type(${siblings.indexOf(node) + 1})`;
            }
            parts.unshift(part);
            node = parent;
          }
          return parts.join(" > ");
        };

        const visible = [...document.querySelectorAll("body *")].filter(isVisible);
        const interactiveSelector = "a[href], button, input, select, textarea, summary, [role='button'], [tabindex]:not([tabindex='-1'])";
        const interactive = [...document.querySelectorAll(interactiveSelector)].filter(isVisible);

        const countStyles = (property) => {
          const counts = new Map();
          for (const el of visible) {
            const value = getComputedStyle(el)[property];
            if (!value || value === "none" || value === "normal" || value === "0s") continue;
            counts.set(value, (counts.get(value) || 0) + 1);
          }
          return [...counts.entries()].sort((a, b) => b[1] - a[1]).map(([value, count]) => ({ value, count }));
        };

        const textMeasures = visible
          .filter((el) => {
            const text = (el.textContent || "").replace(/\s+/g, " ").trim();
            return text.length >= 40 && el.children.length === 0;
          })
          .map((el) => {
            const style = getComputedStyle(el);
            const rect = el.getBoundingClientRect();
            const text = (el.textContent || "").replace(/\s+/g, " ").trim();
            const lineHeight = Number.parseFloat(style.lineHeight) || Number.parseFloat(style.fontSize) * 1.2;
            const lines = Math.max(1, Math.round(rect.height / lineHeight));
            return {
              selector: selectorFor(el),
              text: text.slice(0, 220),
              chars: text.length,
              estimatedLines: lines,
              estimatedCharsPerLine: Number((text.length / lines).toFixed(1)),
              width: Number(rect.width.toFixed(1)),
              fontSize: style.fontSize,
              lineHeight: style.lineHeight,
            };
          })
          .slice(0, 160);

        const tapTargets = interactive.map((el) => {
          const rect = el.getBoundingClientRect();
          const pseudoSize = (pseudo) => {
            const style = getComputedStyle(el, pseudo);
            if (!style || style.content === "none" || style.display === "none" || style.pointerEvents === "none") {
              return { width: 0, height: 0 };
            }
            return {
              width: Number.parseFloat(style.width) || 0,
              height: Number.parseFloat(style.height) || 0,
            };
          };
          const before = pseudoSize("::before");
          const after = pseudoSize("::after");
          const effectiveWidth = Math.max(rect.width, before.width, after.width);
          const effectiveHeight = Math.max(rect.height, before.height, after.height);
          return {
            selector: selectorFor(el),
            tag: el.tagName.toLowerCase(),
            role: el.getAttribute("role"),
            label: labelFor(el),
            width: Number(rect.width.toFixed(1)),
            height: Number(rect.height.toFixed(1)),
            effectiveWidth: Number(effectiveWidth.toFixed(1)),
            effectiveHeight: Number(effectiveHeight.toFixed(1)),
            hasTapExtender: el.classList.contains("tap-44") || el.classList.contains("tap-44-y"),
            x: Number(rect.x.toFixed(1)),
            y: Number(rect.y.toFixed(1)),
          };
        });

        const overflow = visible
          .map((el) => ({ el, rect: el.getBoundingClientRect() }))
          .filter(({ rect }) => rect.right > document.documentElement.clientWidth + 1 || rect.left < -1)
          .map(({ el, rect }) => ({
            selector: selectorFor(el),
            label: labelFor(el),
            left: Number(rect.left.toFixed(1)),
            right: Number(rect.right.toFixed(1)),
            width: Number(rect.width.toFixed(1)),
          }))
          .slice(0, 100);

        const headings = [...document.querySelectorAll("h1,h2,h3,h4,h5,h6")]
          .filter(isVisible)
          .map((el) => ({ level: Number(el.tagName.slice(1)), text: labelFor(el), selector: selectorFor(el) }));

        const images = [...document.images].filter(isVisible).map((img) => {
          const rect = img.getBoundingClientRect();
          return {
            selector: selectorFor(img),
            alt: img.alt,
            loading: img.loading,
            src: img.currentSrc || img.src,
            renderedWidth: Number(rect.width.toFixed(1)),
            renderedHeight: Number(rect.height.toFixed(1)),
            naturalWidth: img.naturalWidth,
            naturalHeight: img.naturalHeight,
          };
        });

        const axeResult = await window.axe.run(document, {
          runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"] },
          resultTypes: ["violations", "incomplete"],
        });

        return {
          title: document.title,
          url: location.href,
          document: {
            clientWidth: document.documentElement.clientWidth,
            scrollWidth: document.documentElement.scrollWidth,
            scrollHeight: document.documentElement.scrollHeight,
            horizontalOverflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
          },
          cls: Number((window.__designReviewCLS || 0).toFixed(5)),
          fonts: {
            status: document.fonts.status,
            loadedFamilies: [...new Set([...document.fonts].map((font) => font.family))].sort(),
          },
          landmarks: {
            main: document.querySelectorAll("main").length,
            nav: document.querySelectorAll("nav").length,
            header: document.querySelectorAll("header").length,
            footer: document.querySelectorAll("footer").length,
          },
          headings,
          styles: {
            fontSize: countStyles("fontSize"),
            fontWeight: countStyles("fontWeight"),
            lineHeight: countStyles("lineHeight"),
            fontFamily: countStyles("fontFamily"),
            color: countStyles("color"),
            backgroundColor: countStyles("backgroundColor"),
            borderRadius: countStyles("borderRadius"),
            boxShadow: countStyles("boxShadow"),
            transitionDuration: countStyles("transitionDuration"),
            transitionTimingFunction: countStyles("transitionTimingFunction"),
          },
          textMeasures,
          tapTargets: {
            total: tapTargets.length,
            under44: tapTargets.filter((target) => target.effectiveWidth < 44 || target.effectiveHeight < 44),
          },
          overflow,
          images,
          axe: {
            violations: axeResult.violations.map((violation) => ({
              id: violation.id,
              impact: violation.impact,
              help: violation.help,
              helpUrl: violation.helpUrl,
              nodes: violation.nodes.map((node) => ({
                target: node.target,
                html: node.html.slice(0, 600),
                failureSummary: node.failureSummary,
                data: node.any?.map((check) => check.data).filter(Boolean),
              })),
            })),
            incomplete: axeResult.incomplete.map((item) => ({
              id: item.id,
              impact: item.impact,
              help: item.help,
              nodes: item.nodes.length,
            })),
          },
        };
      });

      probe = {
        route,
        viewport,
        responseStatus: response?.status() ?? null,
        elapsedMs: Date.now() - startedAt,
        screenshot: `screenshots/${screenshotName}`,
        consoleMessages,
        pageErrors,
        ...measured,
      };
      console.log(`captured ${route.name} ${viewport.name} (${probe.responseStatus})`);
    } catch (error) {
      probe = {
        route,
        viewport,
        elapsedMs: Date.now() - startedAt,
        screenshot: `screenshots/${screenshotName}`,
        error: String(error),
        consoleMessages,
        pageErrors,
      };
      console.error(`FAILED ${route.name} ${viewport.name}: ${error}`);
    } finally {
      page.off("console", onConsole);
      page.off("pageerror", onPageError);
    }

    await writeFile(probePath, `${JSON.stringify(probe, null, 2)}\n`);
    summary.push({
      route: route.name,
      path: route.path,
      viewport: viewport.name,
      status: probe.responseStatus ?? null,
      error: probe.error ?? null,
      screenshot: probe.screenshot,
      cls: probe.cls ?? null,
      horizontalOverflow: probe.document?.horizontalOverflow ?? null,
      axeViolations: probe.axe?.violations.length ?? null,
      under44: probe.tapTargets?.under44.length ?? null,
      consoleErrors: consoleMessages.filter((message) => message.type === "error").length,
      pageErrors: pageErrors.length,
    });
  }

  await page.close();
  await context.close();
}

await browser.close();
await writeFile(resolve(PROBES, "baseline-summary.json"), `${JSON.stringify({ base: BASE, routes, viewports, summary }, null, 2)}\n`);
console.log(`baseline complete: ${summary.length} captures`);
