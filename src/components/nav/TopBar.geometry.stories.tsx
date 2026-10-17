import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, waitFor, within } from "storybook/test";
import TopBar from "./TopBar";
import { getScope, setScope } from "@/lib/scope";

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

function geometryStory(pathname: string): Story {
  return {
    parameters: { nextjs: { navigation: { pathname } } },
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
        await new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
        const context = `${pathname} at ${width}px`;
        await expect(header.scrollWidth, context).toBeLessThanOrEqual(header.clientWidth);
        await expect(document.documentElement.scrollWidth, context).toBeLessThanOrEqual(width);
        const targets = [...header.querySelectorAll<HTMLElement>("button, a[href]")].filter((element) => {
          const box = element.getBoundingClientRect();
          return box.width > 0 && box.height > 0 && getComputedStyle(element).visibility !== "hidden";
        });
        await expect(targets.length, context).toBeGreaterThanOrEqual(pathname === "/today" ? 4 : ["/map", "/compass"].includes(pathname) ? 5 : 6);
        for (const target of targets) {
          const box = target.getBoundingClientRect();
          const label = target.getAttribute("aria-label") || target.textContent;
          await expect(box.width, `${context}: ${label}`).toBeGreaterThanOrEqual(44);
          await expect(box.height, `${context}: ${label}`).toBeGreaterThanOrEqual(44);
          await expect(box.left, `${context}: ${label}`).toBeGreaterThanOrEqual(0);
          await expect(box.right, `${context}: ${label}`).toBeLessThanOrEqual(width);
          const hit = document.elementFromPoint(box.x + box.width / 2, box.y + box.height / 2);
          await expect(hit !== null && target.contains(hit), `${context}: ${label} hit target`).toBe(true);
        }
        for (let i = 0; i < targets.length; i += 1) for (let j = i + 1; j < targets.length; j += 1) {
          const a = targets[i].getBoundingClientRect(); const b = targets[j].getBoundingClientRect();
          const overlap = Math.min(a.right, b.right) - Math.max(a.left, b.left);
          await expect(overlap, `${context}: adjacent actions overlap`).toBeLessThanOrEqual(0.5);
        }
        await expect(canvas.getByRole("button", { name: /Switch to (light|dark) appearance/ }), context).toBeVisible();
        await expect(canvas.getByRole("link", { name: "Open tools" }), context).toBeVisible();
        await expect(pulse, context).toBeVisible();
        await expect(canvas.getByText(width < 640 ? "Unverified" : "Unable to verify", { exact: true }), context).toBeVisible();
        if (pathname !== "/today") {
          const area = header.querySelector<HTMLElement>("[data-location-chip]")!;
          await expect(area, context).toHaveAccessibleName(/Current scope: Frederick/);
          if (pathname === "/map") {
            const label = area.querySelector<HTMLElement>(width < 360 ? '[data-location-scope-label="compact"]' : '[data-location-scope-label="full"]')!;
            await expect(label, context).toBeVisible();
            await expect(label.textContent, context).toMatch(/Frederick/);
          }
        }
        if (!["/today", "/map", "/compass"].includes(pathname)) {
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
