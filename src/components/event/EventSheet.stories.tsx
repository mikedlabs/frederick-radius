import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { usePathname } from "@storybook/nextjs-vite/navigation.mock";
import { expect, fn, waitFor, within } from "storybook/test";
import type { EventWithMeta } from "@/lib/loaders/events";
import EventSheet from "./EventSheet";

const event = {
  slug: "workshop-event-detail", title: "Community arts afternoon", description: "You can review the existing event details here.",
  starts_at: "2029-10-10T14:00:00-04:00", ends_at: "2029-10-10T16:00:00-04:00", timezone: "America/New_York",
  venue_name: "Community hall", address: "Frederick County, Maryland", municipality: "frederick", municipality_name: "Frederick",
  category: "arts", category_name: "Arts & culture", audience: [], is_free: true, source: "manual", is_verified: false,
  source_id: "workshop", source_url: "https://example.com/workshop-event", license: "Demonstration fixture", confidence: "curated",
  first_seen_at: "2029-10-01T12:00:00Z", last_verified_at: "2029-10-01T12:00:00Z", geom: { lat: 39.414, lng: -77.41 }, geo_confidence: "area",
} as EventWithMeta;

const meta = {
  title: "Events/Detail sheet", component: EventSheet, tags: ["autodocs"], parameters: { layout: "fullscreen" },
  globals: { viewport: { value: "radiusMobile", isRotated: false } },
  args: { event, onClose: fn(), historyLayerId: "workshop-event-detail" },
  beforeEach: () => {
    const oldFontSize = document.documentElement.style.fontSize;
    document.documentElement.style.fontSize = "100%";
    // Match the real preview document, as in the shared Sheet story. A
    // different mocked route correctly dismisses this route-scoped sheet.
    const originalPathname = usePathname.getMockImplementation();
    usePathname.mockReturnValue(window.location.pathname);
    const key = "fr:saved:v1";
    const originalSaved = localStorage.getItem(key);
    const originalFetch = window.fetch;
    localStorage.setItem(key, "[]");
    const fixtureFetch: typeof fetch = async () => Response.json({ user: null, slugs: [] });
    window.fetch = fixtureFetch;
    return () => {
      document.documentElement.style.fontSize = oldFontSize;
      if (originalPathname) usePathname.mockImplementation(originalPathname);
      else usePathname.mockReset();
      if (window.fetch === fixtureFetch) window.fetch = originalFetch;
      if (originalSaved === null) localStorage.removeItem(key); else localStorage.setItem(key, originalSaved);
      window.dispatchEvent(new StorageEvent("storage", { key, storageArea: localStorage }));
    };
  },
} satisfies Meta<typeof EventSheet>;
export default meta;
type Story = StoryObj<typeof meta>;

export const LicensedVenueAt320Root200: Story = {
  globals: { viewport: { value: "radiusMobileNarrow", isRotated: false }, motion: "reduce" },
  args: { event: { ...event, venue_name: "Brewer's Alley", venue_place_slug: "brewers-alley-frederick" } },
  play: async () => {
    if ((globalThis as typeof globalThis & { __vitest_browser__?: boolean }).__vitest_browser__) {
      const { page } = await import("vitest/browser"); await page.viewport(320, 568);
    }
    await waitFor(() => expect(window.innerWidth).toBe(320));
    const dialog = await within(document.body).findByRole("dialog", { name: event.title });
    const panel = dialog.querySelector<HTMLElement>("[data-bottom-sheet-panel]")!;
    const heading = panel.querySelector("h2")!;
    const image = panel.querySelector<HTMLImageElement>("img")!;
    image.scrollIntoView({ block: "center", behavior: "instant" });
    await waitFor(async () => { await image.decode(); expect(image.naturalWidth).toBeGreaterThan(1); });
    const caption = within(panel).getByText("Venue · Brewer's Alley side entrance, photographed in 2004");
    const time = within(panel).getByText(/2:00 PM/).closest("p")!;
    const venue = within(panel).getByText("Brewer's Alley · Frederick", { exact: true });
    const nodes = [heading, time, venue, caption];
    const normal = nodes.map(node => parseFloat(getComputedStyle(node).fontSize));
    document.documentElement.style.fontSize = "200%";
    await waitFor(() => nodes.forEach((node, i) => expect(parseFloat(getComputedStyle(node).fontSize) / normal[i]).toBeCloseTo(2, 2)));
    for (const node of nodes) {
      node.scrollIntoView({ block: "center", behavior: "instant" });
      await waitFor(() => expect(node).toBeVisible());
      expect(node.scrollWidth).toBeLessThanOrEqual(node.clientWidth + 1);
      expect(node.scrollHeight).toBeLessThanOrEqual(node.clientHeight + 1);
    }
    expect(panel.querySelector("figure")?.contains(heading)).toBe(false);
    expect(heading.compareDocumentPosition(image) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(document.body.scrollWidth).toBeLessThanOrEqual(window.innerWidth + 1);
    expect(document.documentElement.scrollWidth).toBeLessThanOrEqual(window.innerWidth + 1);
  },
};

export const FreeWithoutPhotography: Story = {
  play: async () => {
    await waitFor(() => {
      const dialog = within(document.body).getByRole("dialog", { name: event.title });
      const panel = dialog.querySelector<HTMLElement>("[data-bottom-sheet-panel]");
      expect(panel).not.toBeNull();
      const sheet = within(panel!);
      expect(sheet.getByText("Free")).toBeVisible();
      expect(sheet.getByRole("link", { name: /See full page/ })).toBeVisible();
      expect(sheet.getByRole("button", { name: "Close" })).toBeVisible();
    });
  },
};
export const OwnedVenuePhotography: Story = {
  args: { event: { ...event, venue_name: "Baker Park Bandshell", venue_place_slug: "baker-park-bandshell" } },
  play: async () => {
    const dialog = await within(document.body).findByRole("dialog", { name: event.title });
    const caption = within(dialog).getByText("Venue · Baker Park Bandshell");
    caption.scrollIntoView({ block: "center", behavior: "instant" });
    await waitFor(() => expect(caption).toBeVisible());
  },
};
export const LoadingDetails: Story = { args: { event: null, pending: true, onOpenFullPage: fn() } };
