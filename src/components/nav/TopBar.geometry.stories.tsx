import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, userEvent, waitFor, within } from "storybook/test";
import TopBar from "./TopBar";
import { getScope, setScope } from "@/lib/scope";
import { applyAppearance, getAppearance } from "@/lib/appearance";

const widths = [320, 375, 390, 430, 640, 768, 1024];
const meta = {
  title: "Radius Chrome/Header geometry", component: TopBar,
  parameters: { layout: "fullscreen", a11y: { test: "error" }, docs: { description: {
    component: "Real shared header with a controlled unavailable county-status report. The browser gate checks two rows on phones, one row at larger widths, and readable controls at 200% text.",
  } } },
  beforeEach: () => {
    const priorFetch = window.fetch;
    const priorScope = getScope();
    setScope("town:frederick");
    window.fetch = (input, init) => {
      const url = input instanceof Request ? input.url : String(input);
      if (new URL(url, window.location.href).pathname === "/api/pulse/status") {
        return Promise.resolve(Response.json({ active: false, count: 0, tone: "quiet", level: "Unknown", ok: false,
          lastUpdated: new Date().toISOString(), validUntil: new Date(Date.now() + 360_000).toISOString() }));
      }
      return priorFetch(input, init);
    };
    return () => { window.fetch = priorFetch; setScope(priorScope); };
  },
} satisfies Meta<typeof TopBar>;
export default meta;
type Story = StoryObj<typeof meta>;

function geometryStory(pathname: string, enlarged = false, dark = false, fontFamily?: string, wholeCounty = false): Story {
  const areaName = wholeCounty ? /Whole county/ : /Frederick/;
  // These are the expected controls for each surface, independent of TopBar's render logic.
  const isToday = pathname === "/today";
  const isAsk = pathname === "/ask" || pathname.startsWith("/ask/");
  const globalArea = !isToday && !isAsk && pathname !== "/search";
  const globalFind = globalArea && !["/map", "/compass"].includes(pathname);
  const minimumVisibleTargets = 3 + Number(isToday || globalArea) + Number(isToday || globalFind);
  return {
    parameters: { nextjs: { navigation: { pathname } } },
    beforeEach: wholeCounty ? () => { setScope("county"); } : enlarged || fontFamily ? () => {
      const previousFontFamily = document.documentElement.style.getPropertyValue("--font-sans-base");
      const previousFontSize = document.documentElement.style.fontSize;
      const previousAppearance = getAppearance();
      if (fontFamily) document.documentElement.style.setProperty("--font-sans-base", fontFamily);
      if (enlarged) document.documentElement.style.fontSize = "200%";
      applyAppearance(dark ? "dark" : "light", false);
      return () => {
        if (previousFontFamily) document.documentElement.style.setProperty("--font-sans-base", previousFontFamily);
        else document.documentElement.style.removeProperty("--font-sans-base");
        document.documentElement.style.fontSize = previousFontSize;
        applyAppearance(previousAppearance, false);
      };
    } : undefined,
    globals: { viewport: { value: "radiusMobile", isRotated: false } },
    play: async ({ canvasElement }) => {
      const document = canvasElement.ownerDocument;
      const header = canvasElement.querySelector("header")!;
      const canvas = within(header);
      const pulse = header.querySelector<HTMLElement>("[data-pulse-indicator]")!;
      await waitFor(() => expect(pulse).toHaveAttribute("data-pulse-state", "ready"));
      await expect(pulse).toHaveAccessibleName("County status: Unable to verify; current alerts are unverified");
      await document.fonts.ready;
      // The regular workshop uses its viewport toolbar. Vitest changes the
      // actual iframe viewport, so these are media-query and hit-test checks,
      // not a narrow div drawn inside a desktop layout.
      const inBrowserGate = Boolean((globalThis as typeof globalThis & { __vitest_browser__?: boolean }).__vitest_browser__);
      const browser = inBrowserGate ? await import("vitest/browser") : null;
      for (const width of browser ? widths : [document.documentElement.clientWidth]) {
        if (browser) await browser.page.viewport(width, 844);
        await waitFor(() => expect(document.documentElement.clientWidth).toBe(width));
        const context = `${pathname} at ${width}px${enlarged ? " / 200% text" : ""}`;
        // Measure the wordmark in its loaded face. Deep pages show Back instead.
        if (header.querySelector<HTMLElement>("[data-header-wordmark]")?.getClientRects().length) await waitFor(() => expect(
          [...document.fonts].filter((face) => /caslon/i.test(face.family)).map((face) => face.status),
          `${context}: wordmark face loaded`,
        ).toEqual(["loaded"]), { timeout: 15_000 });
        await new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
        if (enlarged) {
          await expect(getComputedStyle(document.documentElement).fontSize, context).toBe("32px");
          await expect(document.documentElement.dataset.appearance, context).toBe(dark ? "dark" : "light");
          if (browser) await browser.userEvent.keyboard("{Tab}");
        }
        const row = header.querySelector<HTMLElement>("[data-app-topbar-row]")!;
        await waitFor(() => expect(
          parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--app-topbar-h")),
          `${context}: shared chrome offset matches actual row`,
        ).toBe(row.getBoundingClientRect().height));
        await expect(header.scrollWidth, context).toBeLessThanOrEqual(header.clientWidth);
        const identity = row.querySelector<HTMLElement>("[data-header-identity]")!;
        const actions = row.querySelector<HTMLElement>("[data-header-actions]")!;
        const contextRow = row.querySelector<HTMLElement>("[data-header-context]")!;
        const identityControl = identity.querySelector<HTMLElement>("a[href], button")!;
        const moreTrigger = actions.querySelector<HTMLElement>("[data-today-tools-trigger]")!;
        await expect(identityControl, context).toBeVisible();
        await expect(within(moreTrigger).getByText("More", { exact: true }), context).toBeVisible();
        await expect(contextRow, context).toContainElement(pulse);
        const statusNames = within(pulse).getAllByText("County status", { exact: true });
        await expect(statusNames.filter(label => label.getClientRects().length > 0), context).toHaveLength(1);
        if (isToday || globalArea) {
          const area = contextRow.querySelector<HTMLElement>("[data-location-chip], [data-today-area-trigger]");
          await expect(area, context).toBeVisible();
        }
        if (isToday || globalFind) {
          const find = within(actions).getByRole(isToday ? "link" : "button", {
            name: isToday ? "Find a place, service, event, or answer" : "Ask or find across Frederick County",
          });
          await expect(find, context).toBeVisible();
          if (width < 640) await expect(within(find).getByText("Find", { exact: true }), context).toBeVisible();
        }
        if (!enlarged) {
          await expect(getComputedStyle(document.documentElement).fontSize, context).toBe("16px");
          const brandBox = identityControl.getBoundingClientRect();
          const moreBox = moreTrigger.getBoundingClientRect();
          const statusBox = pulse.getBoundingClientRect();
          const headerHeight = header.getBoundingClientRect().height;
          const centerY = (box: DOMRect) => box.top + box.height / 2;
          const boxLabel = (box: DOMRect) => `${Math.round(box.width)}×${Math.round(box.height)} at (${Math.round(box.x)},${Math.round(box.y)})`;
          const arrangement = `${context}: identity ${boxLabel(brandBox)}, More ${boxLabel(moreBox)}, county status ${boxLabel(statusBox)}`;
          await expect(brandBox.right, `${arrangement}: identity before utilities`).toBeLessThanOrEqual(moreBox.left + 1);
          await expect(Math.abs(centerY(brandBox) - centerY(moreBox)), arrangement).toBeLessThanOrEqual(5);
          if (width < 640) {
            await expect(statusBox.top, `${context}: context below the first row`).toBeGreaterThanOrEqual(Math.max(brandBox.bottom, moreBox.bottom) - 1);
            await expect(headerHeight, `${context}: two compact rows`).toBeLessThan(114);
          } else {
            await expect(Math.abs(centerY(statusBox) - centerY(brandBox)), `${arrangement}: one masthead row`).toBeLessThanOrEqual(5);
            await expect(headerHeight, `${context}: one compact row`).toBeLessThan(80);
          }
          if (width === 1024) {
            const reading = document.createElement("div");
            reading.className = "app-main-reading";
            reading.style.visibility = "hidden";
            canvasElement.append(reading);
            try {
              const leftInset = (element: Element) => element.getBoundingClientRect().left + parseFloat(getComputedStyle(element).paddingLeft);
              await expect(leftInset(row), `${context}: align with the reading column`).toBeCloseTo(leftInset(reading), 0);
            } finally { reading.remove(); }
          }
        }
        await expect(document.documentElement.scrollWidth, context).toBeLessThanOrEqual(width);
        const disclosure = header.querySelector<HTMLDetailsElement>('details[data-today-header-disclosure="tools"]')!;
        const more = disclosure.querySelector<HTMLElement>("summary")!;
        await expect(more, context).toHaveAccessibleName("More tools");
        await expect(disclosure.open, context).toBe(false);
        const wordmark = header.querySelector<HTMLElement>("[data-header-wordmark]");
        if (wordmark) {
          const home = wordmark.closest("a")!;
          await expect(home, context).toHaveAttribute("href", "/");
          await expect(home, context).toHaveAccessibleName("Frederick Radius, home");
          await expect(home.querySelector("svg"), context).toBeVisible();
          if (!enlarged) {
            await expect(wordmark, context).toBeVisible();
            await expect(wordmark, context).toHaveTextContent("Frederick Radius");
            // A visible span can still clip the end of Radius or wrap to two lines.
            const range = document.createRange();
            range.selectNodeContents(wordmark);
            const lines = [...range.getClientRects()].filter(rect => rect.width && rect.height);
            await expect(lines, context).toHaveLength(1);
            const word = lines[0];
            const lockup = home.getBoundingClientRect();
            await expect(word.left, context).toBeGreaterThanOrEqual(lockup.left - 1);
            await expect(word.right, context).toBeLessThanOrEqual(lockup.right + 1);
            await expect(word.width, context).toBeLessThanOrEqual(wordmark.getBoundingClientRect().width + 1);
          }
        } else {
          await expect(canvas.getByRole("button", { name: "Back" }), context).toBeVisible();
        }
        if (["/today", "/map", "/events", "/nearby"].includes(pathname)) {
          await expect(wordmark, context).toBeInTheDocument();
        }
        if (pathname === "/today") {
          await expect(canvas.getByRole("link", { name: "Find a place, service, event, or answer" }), context).toBeVisible();
          await expect(header.querySelector("[data-today-area-trigger]"), context).toBeVisible();
        }
        const targets = [...header.querySelectorAll<HTMLElement>("button, a[href], summary")].filter((element) => {
          const closed = element.closest("details:not([open])");
          if (closed && element !== closed.querySelector(":scope > summary")) return false;
          const box = element.getBoundingClientRect();
          return box.width > 0 && box.height > 0 && getComputedStyle(element).visibility !== "hidden";
        });
        await expect(targets.length, `${context}: direct header controls`).toBeGreaterThanOrEqual(minimumVisibleTargets);
        for (const target of targets) {
          const box = target.getBoundingClientRect();
          const label = target.getAttribute("aria-label") || target.textContent;
          await expect(box.width, `${context}: ${label}`).toBeGreaterThanOrEqual(44);
          await expect(box.height, `${context}: ${label}`).toBeGreaterThanOrEqual(44);
          await expect(box.left, `${context}: ${label}`).toBeGreaterThanOrEqual(0);
          await expect(box.right, `${context}: ${label}`).toBeLessThanOrEqual(width);
          if (enlarged) {
            target.focus();
            await expect(target, `${context}: ${label}`).toHaveFocus();
            const focused = getComputedStyle(target);
            await expect(focused.outlineStyle, `${context}: ${label} focus indicator`).not.toBe("none");
            const ring = Math.max(0, parseFloat(focused.outlineWidth) + parseFloat(focused.outlineOffset));
            await expect(box.top - ring, `${context}: ${label} focus above viewport`).toBeGreaterThanOrEqual(0);
            await expect(box.bottom + ring, `${context}: ${label} focus below header`).toBeLessThanOrEqual(header.getBoundingClientRect().bottom);
            await expect(box.left - ring, `${context}: ${label} focus left of viewport`).toBeGreaterThanOrEqual(0);
            await expect(box.right + ring, `${context}: ${label} focus right of viewport`).toBeLessThanOrEqual(width);
            // Page overflow can stay zero while a root or nested clipping
            // ancestor hides an action. Check its physical client box instead.
            for (let ancestor = target.parentElement; ancestor; ancestor = ancestor.parentElement) {
              const style = getComputedStyle(ancestor);
              const bounds = ancestor.getBoundingClientRect();
              const left = bounds.left + ancestor.clientLeft;
              const top = bounds.top + ancestor.clientTop;
              if (/^(hidden|clip|auto|scroll)$/.test(style.overflowX)) {
                await expect(box.left - ring, `${context}: ${label} horizontal clip`).toBeGreaterThanOrEqual(left);
                await expect(box.right + ring, `${context}: ${label} horizontal clip`).toBeLessThanOrEqual(left + ancestor.clientWidth);
              }
              if (/^(hidden|clip|auto|scroll)$/.test(style.overflowY)) {
                await expect(box.top - ring, `${context}: ${label} vertical clip`).toBeGreaterThanOrEqual(top);
                await expect(box.bottom + ring, `${context}: ${label} vertical clip`).toBeLessThanOrEqual(top + ancestor.clientHeight);
              }
            }
            const x = box.left + box.width / 2;
            const y = box.top + box.height / 2;
            for (const [dx, dy] of [[0, 0], [-21.5, 0], [21.5, 0], [0, -21.5], [0, 21.5]]) {
              const hit = document.elementFromPoint(x + dx, y + dy);
              const hitControl = hit?.closest("a, button, summary");
              const hitLabel = hitControl?.getAttribute("aria-label") || hit?.tagName || "none";
              await expect(hit !== null && target.contains(hit), `${context}: ${label} at (${x + dx}, ${y + dy}) hit ${hitLabel}, expected 44px target`).toBe(true);
            }
          }
          const hit = document.elementFromPoint(box.x + box.width / 2, box.y + box.height / 2);
          await expect(hit !== null && target.contains(hit), `${context}: ${label} hit target`).toBe(true);
        }
        for (let i = 0; i < targets.length; i += 1) for (let j = i + 1; j < targets.length; j += 1) {
          const a = targets[i].getBoundingClientRect(); const b = targets[j].getBoundingClientRect();
          const horizontalOverlap = Math.min(a.right, b.right) - Math.max(a.left, b.left);
          const verticalOverlap = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
          await expect(Math.min(horizontalOverlap, verticalOverlap), `${context}: adjacent actions overlap`).toBeLessThanOrEqual(0.5);
        }
        await userEvent.click(more);
        await expect(disclosure.open, context).toBe(true);
        const panel = within(disclosure);
        const appearance = panel.getByRole("button", { name: /Switch to (light|dark) appearance/ });
        const tools = panel.getByRole("link", { name: "Open tools" });
        await expect(tools, context).toHaveAttribute("href", "/compass");
        await expect(within(tools).getByText("Tools", { exact: true }), context).toBeVisible();
        await expect(within(appearance).getByText(/Switch to (light|dark) appearance/), context).toBeVisible();
        for (const utility of [appearance, tools]) {
          await expect(utility, context).toBeVisible();
          const rect = utility.getBoundingClientRect();
          await expect(rect.width, context).toBeGreaterThanOrEqual(44);
          await expect(rect.height, context).toBeGreaterThanOrEqual(44);
          await expect(utility.contains(document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2)), context).toBe(true);
        }
        await userEvent.click(more);
        await expect(disclosure.open, context).toBe(false);
        await expect(pulse, context).toBeVisible();
        await expect(canvas.getByText(width < 640 ? "Unverified" : "Unable to verify", { exact: true }), context).toBeVisible();
        if (globalArea) {
          const area = header.querySelector<HTMLElement>("[data-location-chip]")!;
          await expect(area, context).toHaveAccessibleName(new RegExp(`Current scope: ${areaName.source}`));
          const visibleLabels = [...area.querySelectorAll<HTMLElement>("[data-location-scope-label]")]
            .filter(label => label.getClientRects().length > 0);
          await expect(visibleLabels, `${context}: one printed scope`).toHaveLength(1);
          const label = visibleLabels[0];
          await expect(label.textContent, context).toMatch(wholeCounty && width < 640 ? /^(?:Whole county|County)$/ : areaName);
          await expect(label.scrollWidth, `${context}: complete area name`).toBeLessThanOrEqual(label.clientWidth + 1);
        }
        if (globalFind) {
          await expect(canvas.getByRole("button", { name: "Ask or find across Frederick County" }), context).toBeVisible();
        }
        if (pathname === "/privacy") await expect(canvas.getByRole("button", { name: "Back" }), context).toBeVisible();
      }
    },
  };
}

export const Today: Story = geometryStory("/today");
export const Map: Story = geometryStory("/map");
export const MapWholeCounty: Story = geometryStory("/map", false, false, undefined, true);
export const Events: Story = geometryStory("/events");
export const Nearby: Story = geometryStory("/nearby");
export const Contacts: Story = geometryStory("/contacts");
export const Access: Story = geometryStory("/access");
export const PlaceDetails: Story = geometryStory("/places/beans-in-the-belfry-brunswick");

export const DeepPrivacy: Story = geometryStory("/privacy");

export const Tools: Story = geometryStory("/compass");

// Real root text enlargement, not a smaller wrapper in a desktop viewport.
export const EnlargedToday: Story = geometryStory("/today", true);
export const EnlargedMap: Story = geometryStory("/map", true);
export const EnlargedEvents: Story = geometryStory("/events", true);
export const EnlargedSearch: Story = geometryStory("/search", true);
export const EnlargedDeepPrivacyDark: Story = geometryStory("/privacy", true, true);

// Platform-native alternatives protect the narrow row against font-metric drift.
// No font asset is acquired or added to the application.
export const NativeArialMap: Story = geometryStory("/map", false, false, "Arial, sans-serif");
export const NativeArialEvents: Story = geometryStory("/events", false, false, "Arial, sans-serif");
export const NativeNotoMap: Story = geometryStory("/map", false, false, "'Noto Sans', sans-serif");
export const NativeNotoEvents: Story = geometryStory("/events", false, false, "'Noto Sans', sans-serif");

export const NativeWideSansMap: Story = geometryStory("/map", false, false, "Verdana, sans-serif");
export const NativeWideSansEvents: Story = geometryStory("/events", false, false, "Verdana, sans-serif");

// The Ubuntu browser measured a 125.52px home link at 320px, including the
// 24px mark and 2px gap, and a 51.17px Unverified label. Reserve just the
// measured text advances (at 16px and 9px respectively); geometry, text
// scaling and the placement of the mark remain under the real stylesheet.
function measuredTextStory(pathname: string, enlarged = false): Story {
  return {
    ...geometryStory(pathname, enlarged),
    decorators: [(Story) => (
      <div data-measured-header-text style={{ display: "contents" }}>
        <style>{`
          @media (max-width: 639.98px) {
            [data-measured-header-text] [data-header-wordmark] { min-inline-size: 6.22em; }
            [data-measured-header-text] [data-pulse-mobile-state] { min-inline-size: 5.69em; }
          }
          @media (min-width: 640px) and (max-width: 767.98px) {
            /* The hosted runner measured a 170px lockup, 73px icon-and-text
               More control and 132px report. Widen the text only so the
               product remains free to spend less space on optional icons. */
            [data-measured-header-text] [data-header-wordmark] { min-inline-size: 5.71em; }
            [data-measured-header-text] [data-today-tools-trigger] > span { min-inline-size: 2.79em; }
            [data-measured-header-text] [data-pulse-indicator] { min-inline-size: 8.25rem; }
            [data-measured-header-text] [data-today-area-trigger] > span,
            [data-measured-header-text] [data-location-scope-label="full"] { min-inline-size: 7.65em; }
          }
        `}</style>
        <Story />
      </div>
    )],
  };
}

export const MeasuredUbuntuToday: Story = measuredTextStory("/today");
export const MeasuredUbuntuEvents: Story = measuredTextStory("/events");
export const MeasuredUbuntuLargeText: Story = measuredTextStory("/events", true);
