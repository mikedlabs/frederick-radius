import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, waitFor, within } from "storybook/test";
import TopBar from "./TopBar";
import { getScope, setScope } from "@/lib/scope";
import { applyAppearance, getAppearance } from "@/lib/appearance";

const widths = [320, 375, 390, 430, 640, 768, 1024];
const meta = {
  title: "Radius Chrome/Header geometry", component: TopBar,
  parameters: { layout: "fullscreen", a11y: { test: "error" }, docs: { description: {
    component: "Real shared header with a controlled unavailable county-status report. The browser gate checks each route at 320, 375, 390, 430, 640, 768 and 1024 pixels, preserving every action and the visible uncertainty label.",
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

function geometryStory(pathname: string, enlarged = false, dark = false, fontFamily?: string): Story {
  return {
    parameters: { nextjs: { navigation: { pathname } } },
    beforeEach: enlarged || fontFamily ? () => {
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
      const testedWidths = enlarged ? [320, 390, 768, 1024] : widths;
      for (const width of browser ? testedWidths : [document.documentElement.clientWidth]) {
        if (browser) await browser.page.viewport(width, 844);
        await waitFor(() => expect(document.documentElement.clientWidth).toBe(width));
        await new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
        const context = `${pathname} at ${width}px${enlarged ? " / 200% text" : ""}`;
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
        if (!enlarged && width === 320 && header.getBoundingClientRect().height !== 57) {
          const rowStyle = getComputedStyle(row);
          console.info("Header font-fit diagnostic", JSON.stringify({ pathname, probeFont: fontFamily ?? "app system", rootFont: getComputedStyle(document.documentElement).fontSize,
            row: { width: row.clientWidth, height: row.getBoundingClientRect().height, font: rowStyle.fontFamily, gap: rowStyle.gap, padding: [rowStyle.paddingLeft, rowStyle.paddingRight] },
            children: [...row.children].flatMap((child) => {
              const elements = getComputedStyle(child).display === "contents" ? [...child.children] : [child];
              return elements.map((element) => {
                const box = element.getBoundingClientRect(), style = getComputedStyle(element);
                return { tag: element.tagName, label: element.getAttribute("aria-label") || element.textContent?.trim(), width: box.width, height: box.height,
                  left: box.left, top: box.top, display: style.display, basis: style.flexBasis, minWidth: style.minWidth,
                  padding: [style.paddingLeft, style.paddingRight], margin: [style.marginLeft, style.marginRight],
                  font: style.fontFamily, fontSize: style.fontSize, scrollWidth: element.scrollWidth };
              });
            }) }, null, 2));
        }
        if (!enlarged) {
          // Normal text retains the existing single-row app bar.
          await expect(getComputedStyle(document.documentElement).fontSize, context).toBe("16px");
          await expect(header.getBoundingClientRect().height, context).toBe(57);
        }
        await expect(document.documentElement.scrollWidth, context).toBeLessThanOrEqual(width);
        const targets = [...header.querySelectorAll<HTMLElement>("button, a[href]")].filter((element) => {
          const box = element.getBoundingClientRect();
          return box.width > 0 && box.height > 0 && getComputedStyle(element).visibility !== "hidden";
        });
        await expect(targets.length, context).toBeGreaterThanOrEqual(["/today", "/search"].includes(pathname) ? 4 : ["/map", "/compass"].includes(pathname) ? 5 : 6);
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
              await expect(hit !== null && target.contains(hit), `${context}: ${label} effective 44px target`).toBe(true);
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
        await expect(canvas.getByRole("button", { name: /Switch to (light|dark) appearance/ }), context).toBeVisible();
        await expect(canvas.getByRole("link", { name: "Open tools" }), context).toBeVisible();
        await expect(pulse, context).toBeVisible();
        await expect(canvas.getByText(width < 640 ? "Unverified" : "Unable to verify", { exact: true }), context).toBeVisible();
        if (!["/today", "/search"].includes(pathname)) {
          const area = header.querySelector<HTMLElement>("[data-location-chip]")!;
          await expect(area, context).toHaveAccessibleName(/Current scope: Frederick/);
          if (pathname === "/map") {
            const label = area.querySelector<HTMLElement>(width < 360 ? '[data-location-scope-label="compact"]' : '[data-location-scope-label="full"]')!;
            await expect(label, context).toBeVisible();
            await expect(label.textContent, context).toMatch(/Frederick/);
          }
        }
        if (!["/today", "/map", "/compass", "/search"].includes(pathname)) {
          await expect(canvas.getByRole("button", { name: "Ask or find across Frederick County" }), context).toBeVisible();
        }
        if (pathname === "/privacy") await expect(canvas.getByRole("button", { name: "Back" }), context).toBeVisible();
      }
    },
  };
}

export const Today: Story = geometryStory("/today");
export const Map: Story = geometryStory("/map");
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
