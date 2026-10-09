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
    // The credit waits for the owned photo to decode (no credit before a photo loads).
    await expect(
      await within(dialog).findByText("Venue · Baker Park Bandshell", undefined, { timeout: 8000 }),
    ).toBeVisible();
  },
};
export const LoadingDetails: Story = { args: { event: null, pending: true, onOpenFullPage: fn() } };
