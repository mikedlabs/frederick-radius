import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, waitFor } from "storybook/test";
import type { EventWithMeta } from "@/lib/loaders/events";
import { buildHorizonBounds } from "@/lib/eventHorizon";
import { summarizeEventsForBrowse } from "@/lib/events/browsePayload";
import { getScope, setScope } from "@/lib/scope";
import EventsExplorer from "./EventsExplorer";

const now = new Date("2026-10-12T14:00:00.000Z");
const bounds = buildHorizonBounds(now);
const weak: EventWithMeta = {
  slug: "offline-off-campus-fixture", title: "Offline ticket notice", description: "Synthetic source facts for selection review.",
  starts_at: "2026-10-12T17:00:00.000Z", ends_at: "2026-10-12T19:00:00.000Z", timezone: "America/New_York",
  venue_name: "Off Campus", address: "", municipality: "frederick", municipality_name: "Frederick",
  geom: { lat: 39.414, lng: -77.41 }, geo_confidence: "area", category: "community", category_name: "Community",
  audience: [], is_free: true, source: "manual", is_verified: true, source_id: "offline-off-campus-fixture",
  source_url: "https://example.test/offline-ticket-notice", confidence: "curated", license: "Synthetic fixture",
  first_seen_at: now.toISOString(), last_verified_at: now.toISOString(),
};
const named: EventWithMeta = {
  ...weak, slug: "offline-named-venue-fixture", title: "Offline concert fixture",
  starts_at: "2026-10-12T23:00:00.000Z", ends_at: "2026-10-13T01:00:00.000Z",
  venue_name: "Community Hall", category: "music", category_name: "Music",
  source_id: "offline-named-venue-fixture", source_url: "https://example.test/offline-concert",
};
const generic: EventWithMeta = {
  ...weak, slug: "offline-town-only-fixture", title: "Offline town listing", venue_name: "Frederick",
  source_id: "offline-town-only-fixture",
};

function argsFor(events: EventWithMeta[]) {
  return {
    events, summary: summarizeEventsForBrowse(events, bounds), liveSlugs: [],
    sourceHealth: { degraded: false, unavailable: [] },
    categories: [{ slug: "community", name: "Community" }, { slug: "music", name: "Music" }],
    towns: [{ slug: "frederick", name: "Frederick" }], nowISO: now.toISOString(),
    next24ISO: new Date(bounds.next24).toISOString(), weekendStartISO: new Date(bounds.weekendStart).toISOString(),
    weekendEndISO: new Date(bounds.weekendEnd).toISOString(),
  };
}

const meta = {
  title: "Events/Recommendation attendance",
  component: EventsExplorer,
  parameters: {
    layout: "fullscreen", a11y: { test: "error" },
    docs: { description: { component: "The actual Events explorer and cards using a fixed complete offline event corpus. These are synthetic notices and venue facts, not a current schedule. No event imagery, publisher requests or incomplete continuation are supplied. The candidate changes promotion only: ambiguous listings remain visible. Unit/mounted regressions separately cover server slicing, featured/Near Me, Soonest and Calendar." } },
  },
  globals: { motion: "reduce" },
  decorators: [(Story) => <main className="mx-auto p-4" style={{ maxWidth: 900 }}>
    <p className="mb-4 text-sm">Offline recommendation fixtures · not a real schedule</p>
    <Story />
  </main>],
  beforeEach: () => {
    const previousUrl = window.location.href, previousState = window.history.state, previousScope = getScope();
    setScope("county");
    window.history.replaceState(previousState, "", window.location.pathname + "?in=county");
    return () => {
      window.history.replaceState(previousState, "", previousUrl);
      setScope(previousScope);
    };
  },
  args: argsFor([weak, named]),
} satisfies Meta<typeof EventsExplorer>;
export default meta;
type Story = StoryObj<typeof meta>;

async function ownsTouchTarget(link: HTMLAnchorElement) {
  link.scrollIntoView({ block: "center", behavior: "instant" });
  await new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
  const box = link.getBoundingClientRect(), x = box.left + box.width / 2, y = box.top + box.height / 2;
  await expect(box.width).toBeGreaterThanOrEqual(44);
  await expect(box.height).toBeGreaterThanOrEqual(44);
  for (const [dx, dy] of [[0, 0], [-21.5, 0], [21.5, 0], [0, -21.5], [0, 21.5]]) {
    const hit = document.elementFromPoint(x + dx, y + dy);
    await expect(hit === link || Boolean(hit && link.contains(hit))).toBe(true);
  }
}

const assertNamedLead: NonNullable<Story["play"]> = async ({ canvasElement }) => {
  await waitFor(() => {
    const lead = canvasElement.querySelector('[data-decision-position="lead"]');
    expect(lead).toHaveAttribute("data-decision-id", named.slug);
  });
  const namedLink = canvasElement.querySelector<HTMLAnchorElement>('a[href="/events/' + named.slug + '"]')!;
  const weakLink = canvasElement.querySelector<HTMLAnchorElement>('a[href="/events/' + weak.slug + '"]')!;
  // Framer's inline entrance opacity must settle before the accessibility
  // audit samples text contrast; the CSS motion preview cannot end JS springs.
  await waitFor(() => {
    let node: HTMLElement | null = namedLink;
    while (node && node !== canvasElement) {
      expect(parseFloat(getComputedStyle(node).opacity)).toBe(1);
      node = node.parentElement;
    }
  });
  await expect(namedLink).toBeVisible();
  await expect(weakLink).toBeVisible();
  await expect(canvasElement.querySelectorAll('[data-decision-id="' + named.slug + '"]')).toHaveLength(1);
  await expect(canvasElement.querySelector("a a")).toBeNull();
  await ownsTouchTarget(namedLink);
  await ownsTouchTarget(weakLink);
  await expect(document.documentElement.scrollWidth).toBeLessThanOrEqual(window.innerWidth + 1);
};

export const NamedVenueLeads390: Story = {
  globals: { viewport: { value: "radiusMobile", isRotated: false } },
  play: async (context) => {
    await expect(window.innerWidth).toBe(390);
    await assertNamedLead(context);
  },
};
export const NamedVenueLeads320: Story = {
  globals: { viewport: { value: "radiusMobileNarrow", isRotated: false } },
  play: async (context) => {
    await expect(window.innerWidth).toBe(320);
    await assertNamedLead(context);
  },
};
export const AmbiguousRowsRemainWithoutHero320: Story = {
  globals: { viewport: { value: "radiusMobileNarrow", isRotated: false } },
  args: argsFor([weak, generic]),
  play: async ({ canvasElement }) => {
    await expect(window.innerWidth).toBe(320);
    await waitFor(() => expect(canvasElement.querySelector('a[href="/events/' + weak.slug + '"]')).toBeVisible());
    await expect(canvasElement.querySelector('[data-decision-position="lead"]')).toBeNull();
    await expect(canvasElement.querySelector("[data-events-primary-lead]")).toBeNull();
    for (const row of [weak, generic]) {
      const link = canvasElement.querySelector<HTMLAnchorElement>('a[href="/events/' + row.slug + '"]')!;
      await expect(link).toBeVisible();
      await ownsTouchTarget(link);
    }
    await expect(canvasElement.textContent).not.toContain("No upcoming events are listed");
    await expect(document.documentElement.scrollWidth).toBeLessThanOrEqual(window.innerWidth + 1);
  },
};
