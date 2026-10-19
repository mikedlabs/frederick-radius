import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, waitFor, within } from "storybook/test";
import type { EventWithMeta } from "@/lib/loaders/events";
import EventsRestorePreview from "./EventsRestorePreview";

const nowISO = "2030-04-18T16:00:00.000Z";
const fixture: EventWithMeta = {
  slug: "offline-restore-preview", title: "Fictional community performance at a county venue",
  description: "This story uses fictional event facts to test the preview.",
  starts_at: "2030-04-18T22:00:00.000Z", ends_at: "2030-04-19T00:00:00.000Z", timezone: "America/New_York",
  venue_name: "Fictional county community venue", municipality: "frederick", municipality_name: "Frederick",
  address: "", geom: { lat: 39.42, lng: -77.42 }, geo_confidence: "unknown", category: "music", category_name: "Music", audience: [], is_free: true,
  source: "manual", source_id: "offline-restore-preview", source_url: "https://example.test/preview", license: "Fictional fixture",
  is_verified: false, confidence: "curated", first_seen_at: nowISO, last_verified_at: nowISO,
};
const meta = {
  title: "Events/Restore preview", component: EventsRestorePreview,
  parameters: { layout: "fullscreen", a11y: { test: "error" }, docs: { description: { component: "Actual countywide public fallback while URL/device filters restore. Fictional event facts; no live data, storage snapshot, provider, model or image calls. The links are ordinary anchors and do not require hydration." } } },
  globals: { viewport: { value: "radiusMobileNarrow", isRotated: false }, motion: "reduce" },
  decorators: [(Story) => <main className="mx-auto min-w-0 p-4" style={{ maxWidth: 720, background: "var(--app-bg)", color: "var(--app-ink)" }}>
    <p className="mb-3 text-sm">This preview uses fictional event facts for testing.</p><Story />
  </main>],
  args: { events: [fixture], nowISO, degraded: false },
} satisfies Meta<typeof EventsRestorePreview>;
export default meta;
type Story = StoryObj<typeof meta>;

async function geometry(root: HTMLElement) {
  expect(root.querySelector("button,input,img,script,[data-save-ref]")).toBeNull();
  for (const link of root.querySelectorAll<HTMLAnchorElement>("a")) {
    link.scrollIntoView({ block: "center", behavior: "instant" });
    await new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
    const r = link.getBoundingClientRect(), x = r.x + r.width / 2, y = r.y + r.height / 2;
    expect(r.height).toBeGreaterThanOrEqual(44); expect(r.width).toBeGreaterThanOrEqual(44);
    const points = [[0, 0], [-21, 0], [21, 0], [0, -21], [0, 21]].map(([dx, dy]) => {
      const hit = document.elementFromPoint(x + dx, y + dy);
      return { x: x + dx, y: y + dy, owned: hit === link || Boolean(hit && link.contains(hit)), hit: hit?.tagName ?? null };
    });
    const evidence = { href: link.getAttribute("href"), box: r.toJSON(), viewport: { width: innerWidth, height: innerHeight },
      rootFont: getComputedStyle(document.documentElement).fontSize, scrollY, points };
    for (const point of points) expect(point.owned, JSON.stringify(evidence)).toBe(true);
    expect(link.scrollWidth).toBeLessThanOrEqual(link.clientWidth + 1);
  }
  expect(document.documentElement.scrollWidth).toBeLessThanOrEqual(innerWidth + 1);
  expect(document.body.scrollWidth).toBeLessThanOrEqual(innerWidth + 1);
}

export const CountyPreviewAt320: Story = {
  play: async ({ canvasElement }) => {
    if ((globalThis as typeof globalThis & { __vitest_browser__?: boolean }).__vitest_browser__) {
      const browser = await import("vitest/browser"); await browser.page.viewport(320, 844);
    }
    await waitFor(() => expect(innerWidth).toBe(320));
    const canvas = within(canvasElement);
    expect(canvas.getByRole("heading", { level: 1, name: "County calendar preview" })).toBeVisible();
    expect(canvas.getByRole("link", { name: /Fictional community performance/ })).toHaveAttribute("href", "/events/offline-restore-preview");
    await geometry(canvasElement);
    const style = document.documentElement.style;
    const previous = style.getPropertyValue("font-size"), priority = style.getPropertyPriority("font-size");
    try {
      style.setProperty("font-size", "200%");
      await waitFor(() => expect(getComputedStyle(document.documentElement).fontSize).toBe("32px"));
      // Align the enlarged layout, rather than the old box before its reflow.
      await new Promise<void>(resolve => requestAnimationFrame(() => resolve()));
      await geometry(canvasElement);
    }
    finally { if (previous) style.setProperty("font-size", previous, priority); else style.removeProperty("font-size"); }
  },
};
export const IncompleteKnownRows: Story = {
  args: { degraded: true, events: [{ ...fixture, status: "cancelled", ends_at: fixture.starts_at }] },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    expect(canvas.getByText("Cancelled", { exact: true })).toBeVisible();
    expect(canvas.getByText(/end time not listed/)).toBeVisible();
    expect(canvas.getByText(/saved event schedule is incomplete/)).toBeVisible();
    await geometry(canvasElement);
  },
};
export const UnavailablePreview: Story = {
  args: { events: [], degraded: true },
  play: async ({ canvasElement }) => {
    expect(canvasElement.querySelector("[data-events-preview-link]")).toBeNull();
    expect(within(canvasElement).getByRole("link", { name: "County calendar" })).toHaveAttribute("href", "https://www.frederickcountymd.gov/calendar.aspx");
    await geometry(canvasElement);
  },
};
