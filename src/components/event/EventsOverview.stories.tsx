import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, fn, waitFor, within } from "storybook/test";
import type { EventWithMeta } from "@/lib/loaders/events";
import EventsOverview from "./EventsOverview";

const tonight: EventWithMeta = {
  slug: "overview-evening-concert", title: "Evening concert at the Baker Park bandshell", description: "This event is fictional.",
  starts_at: "2026-11-19T19:00:00-05:00", ends_at: "2026-11-19T21:00:00-05:00", timezone: "America/New_York",
  venue_name: "Baker Park Bandshell", venue_place_slug: "baker-park-bandshell", address: "", municipality: "frederick", municipality_name: "Frederick",
  geom: { lat: 39.417, lng: -77.417 }, geo_confidence: "venue_match", category: "music", category_name: "Music", audience: [],
  is_free: true, source: "manual", source_id: "overview-evening-concert", source_url: null, license: "Workshop fixture", confidence: "curated",
  is_verified: true, first_seen_at: "2026-11-01T13:00:00Z", last_verified_at: "2026-11-18T13:00:00Z",
};
const weekend: EventWithMeta = {
  ...tonight, slug: "overview-saturday-walk", title: "Carroll Creek walk", venue_name: "Carroll Creek Linear Park",
  venue_place_slug: "carroll-creek-linear-park-frederick", starts_at: "2026-11-21T10:00:00-05:00", ends_at: "2026-11-21T11:00:00-05:00",
};
const repeatVenue: EventWithMeta = {
  ...tonight, slug: "overview-sunday-concert", title: "Sunday concert", starts_at: "2026-11-22T10:00:00-05:00", ends_at: "2026-11-22T12:00:00-05:00",
};

const meta = {
  title: "Events/Photo-first overview", component: EventsOverview,
  parameters: { layout: "fullscreen", a11y: { test: "error" } },
  decorators: [Story => <main className="mx-auto max-w-[65rem] px-4"><h1 className="text-3xl font-bold">Events</h1><Story /></main>],
  args: { tonight: [tonight], weekend: [weekend, repeatVenue], coverage: "complete", nowISO: "2026-11-19T17:45:00-05:00", onSelectWindow: fn() },
} satisfies Meta<typeof EventsOverview>;
export default meta;
type Story = StoryObj<typeof meta>;

async function viewport(width: number, height: number) {
  if ((globalThis as typeof globalThis & { __vitest_browser__?: boolean }).__vitest_browser__) {
    const browser = await import("vitest/browser");
    await browser.page.viewport(width, height);
  }
}

export const TwoWindows390: Story = {
  globals: { viewport: { value: "radiusMobile", isRotated: false } },
  play: async ({ canvasElement, args, userEvent }) => {
    await viewport(390, 844);
    const canvas = within(canvasElement);
    const evening = within(canvas.getByRole("region", { name: "Tonight" }));
    const upcoming = within(canvas.getByRole("region", { name: "This weekend" }));
    const leadLink = evening.getByRole("link", { name: tonight.title });
    await expect(leadLink).toHaveAttribute("href", `/events/${tonight.slug}`);
    await expect(upcoming.getByRole("link", { name: weekend.title })).toHaveAttribute("href", `/events/${weekend.slug}`);
    const firstPhoto = canvasElement.querySelector<HTMLImageElement>('[data-events-window="tonight"] img')!;
    await firstPhoto.decode();
    await expect(firstPhoto.naturalWidth).toBeGreaterThan(1);
    await expect(evening.getByText("Venue · Baker Park Bandshell")).toBeVisible();
    await expect(canvasElement.querySelector(`[data-decision-id="${repeatVenue.slug}"] img`)).toBeNull();
    await expect(upcoming.getByRole("link", { name: repeatVenue.title })).toBeVisible();
    const picturedWeekend = upcoming.getByRole("link", { name: weekend.title }).closest("article")!;
    const bounds = (selector: string) => picturedWeekend.querySelector(selector)!.getBoundingClientRect();
    await expect(bounds("figure").left).toBeGreaterThanOrEqual(bounds("[data-event-card-heading]").right);
    await expect(Math.abs(bounds("figure").top - bounds("[data-event-card-heading]").top)).toBeLessThan(2);
    await expect(bounds("[data-event-photo-credit]").top).toBeGreaterThanOrEqual(bounds("figure").bottom);
    await expect(canvasElement.querySelectorAll('[data-event-row="lead"]')).toHaveLength(1);
    await expect(canvasElement.querySelectorAll('[data-decision-position="lead"]')).toHaveLength(1);
    await expect(leadLink).toHaveAccessibleDescription("Frederick time. 7:00 PM to 9:00 PM.");
    const rail = evening.getByRole("article").querySelector("[data-time-track]")!;
    await expect(rail.getBoundingClientRect().width).toBeGreaterThan(firstPhoto.getBoundingClientRect().width * .95);
    await expect(upcoming.getByRole("heading", { name: "This weekend" }).getBoundingClientRect().top).toBeLessThan(450);
    const allWeekend = upcoming.getByRole("button", { name: "See all events this weekend" });
    await expect(allWeekend.getBoundingClientRect().height).toBeGreaterThanOrEqual(44);
    await expect(allWeekend.getBoundingClientRect().width).toBeGreaterThanOrEqual(44);
    await userEvent.click(allWeekend);
    await expect(args.onSelectWindow).toHaveBeenCalledWith("weekend");
  },
};

export const PartialCoverage320: Story = {
  globals: { viewport: { value: "radiusMobileNarrow", isRotated: false } },
  args: { tonight: [], weekend: [], coverage: "partial" },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByText("No picks for tonight in the available listings.")).toBeVisible();
    await expect(canvas.getByText("No picks for this weekend in the available listings.")).toBeVisible();
    await expect(document.documentElement.scrollWidth).toBeLessThanOrEqual(window.innerWidth);
  },
};

export const SaturdayOverlap: Story = {
  args: { tonight: [{ ...tonight, starts_at: "2026-11-21T19:00:00-05:00", ends_at: "2026-11-21T21:00:00-05:00" }],
    nowISO: "2026-11-21T17:45:00-05:00", weekend: [], weekendIncludesTonight: true },
};

export const Enlarged320: Story = {
  globals: { viewport: { value: "radiusMobileNarrow", isRotated: false }, motion: "reduce" },
  play: async ({ canvasElement }) => {
    await viewport(320, 844);
    const root = canvasElement.ownerDocument.documentElement;
    const initial = root.style.fontSize;
    const title = canvasElement.querySelector<HTMLElement>('[data-events-overview-pick="lead"] h3')!;
    root.style.fontSize = "100%";
    const originalTitleSize = parseFloat(getComputedStyle(title).fontSize);
    try {
      root.style.fontSize = "200%";
      await waitFor(() => expect(parseFloat(getComputedStyle(title).fontSize)).toBeCloseTo(2 * originalTitleSize));
      await expect(root.scrollWidth).toBeLessThanOrEqual(innerWidth);
      for (const link of canvasElement.querySelectorAll<HTMLAnchorElement>('[data-events-overview-pick] h3 a')) {
        const box = link.getBoundingClientRect();
        await expect(box.height).toBeGreaterThanOrEqual(44);
        await expect(box.width).toBeGreaterThanOrEqual(44);
      }
    } finally {
      root.style.fontSize = initial;
    }
  },
};

export const MissingLeadImage: Story = {
  globals: { viewport: { value: "radiusMobileLarge", isRotated: false } },
  play: async ({ canvasElement }) => {
    const region = canvasElement.querySelector('[data-events-window="tonight"]')!;
    const photo = region.querySelector<HTMLImageElement>("img")!;
    await photo.decode();
    photo.dispatchEvent(new Event("error"));
    await waitFor(() => expect(region.querySelector("img")).toBeNull());
    await expect(region.querySelector("[data-event-photo-credit]")).toBeNull();
    await expect(within(canvasElement).getByRole("link", { name: tonight.title })).toBeVisible();
    await expect(region).toHaveTextContent("7:00PM");
  },
};
