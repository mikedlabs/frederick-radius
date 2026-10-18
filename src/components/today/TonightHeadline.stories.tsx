import portraitFixture from "../../../tests/fixtures/event-artwork-portrait.json";
import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, waitFor, within } from "storybook/test";
import type { EventWithMeta } from "@/lib/loaders/events";
import type { EventCardVisual } from "@/components/event/eventVisuals";
import TonightHeadline, { TonightHeadlineContent } from "./TonightHeadline";
import TodayEventRow from "./TodayEventRow";

const row: EventWithMeta = {
  slug: "presented-production-fixture", title: "Live Theatre Production", presenter: "Other Voices Theatre",
  description: "This fixture demonstrates source identity and makes no current production or availability claim.",
  starts_at: "2026-07-16T23:00:00.000Z", ends_at: "2026-07-17T01:00:00.000Z", timezone: "America/New_York",
  venue_name: "Sky Stage", address: "59 S Carroll St, Frederick, MD", geom: { lng: -77.409, lat: 39.4113 },
  municipality: "frederick", category: "arts", audience: [], is_free: false, source: "manual", is_verified: true,
  source_id: "presented-production-fixture", source_url: "https://example.test/events/presented-production",
  license: "Test fixture", confidence: "curated", first_seen_at: "2026-07-15T12:00:00.000Z",
  last_verified_at: "2026-07-16T15:00:00.000Z", geo_confidence: "venue_match", category_name: "Arts", municipality_name: "Frederick",
};
const meta = {
  title: "Today/Event headline", component: TonightHeadline,
  parameters: { layout: "centered", a11y: { test: "error" }, docs: { description: { component: "The real embedded Today headline with a supplied presenter. Source identity and time are fixed fixtures. Artwork stories use the shared presentation with explicitly synthetic offline image bytes; they do not prove publisher approval or live event availability. The default approval boundary has a separate unit regression. No provider transport is requested." } } },
  decorators: [(Story) => <div style={{ width: "min(520px, calc(100vw - 32px))" }}><Story /></div>],
  args: { event: row, now: new Date("2026-07-16T17:45:00.000Z"), embedded: true },
} satisfies Meta<typeof TonightHeadline>;
export default meta;
type Story = StoryObj<typeof meta>;
const readableIdentity: NonNullable<Story["play"]> = async ({ canvasElement }) => {
  const canvas = within(canvasElement);
  const label = "Other Voices Theatre: Live Theatre Production";
  const title = canvas.getByRole("heading", { name: label });
  const link = canvas.getByRole("link", { name: label });
  await expect(title).toBeVisible();
  await expect(link).toHaveAttribute("href", "/events/presented-production-fixture");
  const bounds = link.getBoundingClientRect();
  await expect(bounds.width).toBeGreaterThanOrEqual(44);
  await expect(bounds.height).toBeGreaterThanOrEqual(44);
  await expect(title.scrollWidth).toBeLessThanOrEqual(title.clientWidth + 1);
  await expect(canvasElement.scrollWidth).toBeLessThanOrEqual(canvasElement.clientWidth + 1);
  await expect(canvasElement.querySelector("a a")).toBeNull();
};
export const PresentedProduction: Story = {
  globals: { viewport: { value: "radiusMobile", isRotated: false } }, play: readableIdentity,
};
export const EnlargedPresentedProduction320: Story = {
  globals: { viewport: { value: "radiusMobileNarrow", isRotated: false } },
  beforeEach: () => {
    const previous = document.documentElement.style.fontSize;
    document.documentElement.style.fontSize = "200%";
    return () => { document.documentElement.style.fontSize = previous; };
  }, play: async (context) => {
    const title = within(context.canvasElement).getByRole("heading", { name: "Other Voices Theatre: Live Theatre Production" });
    await expect(window.innerWidth).toBe(320);
    await expect(parseFloat(getComputedStyle(document.documentElement).fontSize)).toBe(32);
    // The clamp's 1.875rem minimum becomes at least60px at this root size.
    await waitFor(() => expect(parseFloat(getComputedStyle(title).fontSize)).toBeGreaterThanOrEqual(60));
    await readableIdentity(context);
  },
};

export const PresentedProgramRow320: Story = {
  globals: { viewport: { value: "radiusMobileNarrow", isRotated: false } },
  render: (args) => <ul><TodayEventRow event={args.event} now={args.now} quiet={false} /></ul>,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const title = canvas.getByText("Other Voices Theatre: Live Theatre Production", { exact: true });
    const link = canvas.getByRole("link", { name: /Other Voices Theatre: Live Theatre Production/ });
    await expect(title).toBeVisible();
    await expect(link).toHaveAttribute("href", "/events/presented-production-fixture");
    await expect(window.innerWidth).toBe(320);
    const bounds = link.getBoundingClientRect(), x = bounds.left + bounds.width / 2, y = bounds.top + bounds.height / 2;
    await expect(bounds.width).toBeGreaterThanOrEqual(44);
    await expect(bounds.height).toBeGreaterThanOrEqual(44);
    // The existing tap-44-y extender must actually own the44px sample, even
    // when the visible single row is shorter than its effective touch area.
    for (const [dx, dy] of [[0, 0], [-21.5, 0], [21.5, 0], [0, -21.5], [0, 21.5]]) {
      const hit = document.elementFromPoint(x + dx, y + dy);
      await expect(hit === link || Boolean(hit && link.contains(hit))).toBe(true);
    }
    await expect(canvasElement.scrollWidth).toBeLessThanOrEqual(canvasElement.clientWidth + 1);
  },
};

// A declared layout fixture, never imported publisher media. The real default
// component's resolver rejects data URLs; this enters the shared presentation
// only, while the unit regression covers default resolver → approved artwork.
const portraitArtwork: EventCardVisual = {
  src: portraitFixture.dataUrl,
  key: "today-portrait-layout-fixture",
  presentation: "artwork",
  caption: "Synthetic artwork · layout fixture",
  sourceHref: "https://example.test/offline-layout-fixture",
};

async function ownsTouchTarget(link: HTMLAnchorElement, extended = false) {
  link.scrollIntoView({ block: "center", behavior: "instant" });
  const bounds = link.getBoundingClientRect();
  await expect(bounds.width).toBeGreaterThanOrEqual(44);
  if (extended) {
    await expect(parseFloat(getComputedStyle(link, "::after").height)).toBeGreaterThanOrEqual(44);
  } else {
    await expect(bounds.height).toBeGreaterThanOrEqual(44);
  }
  const x = bounds.left + bounds.width / 2, y = bounds.top + bounds.height / 2;
  for (const [dx, dy] of [[0, 0], [-21.5, 0], [21.5, 0], [0, -21.5], [0, 21.5]]) {
    const hit = document.elementFromPoint(x + dx, y + dy);
    await expect(hit === link || Boolean(hit && link.contains(hit))).toBe(true);
  }
}

const intactHeadlineArtwork: NonNullable<Story["play"]> = async (context) => {
  await readableIdentity(context);
  const { canvasElement } = context;
  const canvas = within(canvasElement);
  const eventLink = canvas.getByRole<HTMLAnchorElement>("link", { name: "Other Voices Theatre: Live Theatre Production" });
  const credit = canvas.getByRole<HTMLAnchorElement>("link", { name: portraitArtwork.caption });
  const figure = canvasElement.querySelector<HTMLElement>("[data-event-artwork]")!;
  const image = figure.querySelector<HTMLImageElement>("img")!;
  await waitFor(async () => {
    await image.decode();
    await expect(image.naturalWidth).toBe(600);
    await expect(image.naturalHeight).toBe(900);
  });
  const style = getComputedStyle(image);
  await expect(style.objectFit).toBe("contain");
  // Artwork is still even without reduced-motion enabled, so the same no-motion
  // contract applies when that preference is enabled. No poster gets Ken Burns.
  await expect(style.animationName).toBe("none");
  await expect(style.transform).toBe("none");
  const box = image.getBoundingClientRect(), frame = image.parentElement!.getBoundingClientRect();
  const horizontalPadding = parseFloat(style.paddingLeft) + parseFloat(style.paddingRight);
  const verticalPadding = parseFloat(style.paddingTop) + parseFloat(style.paddingBottom);
  const scale = Math.min((box.width - horizontalPadding) / image.naturalWidth, (box.height - verticalPadding) / image.naturalHeight);
  await expect(scale).toBeGreaterThan(0);
  await expect(image.naturalWidth * scale).toBeLessThanOrEqual(frame.width - horizontalPadding + 1);
  await expect(image.naturalHeight * scale).toBeLessThanOrEqual(frame.height - verticalPadding + 1);
  await expect(figure.contains(canvas.getByRole("heading", { name: "Other Voices Theatre: Live Theatre Production" }))).toBe(false);
  await expect(canvas.getByText("7:00 PM", { exact: true })).toBeVisible();
  await expect(canvas.getByText(/Sky Stage · Frederick/)).toBeVisible();
  await expect(credit).toHaveAttribute("href", portraitArtwork.sourceHref!);
  await expect(eventLink.contains(credit)).toBe(false);
  await expect(canvasElement.querySelectorAll("[data-event-photo-credit]")).toHaveLength(1);
  await ownsTouchTarget(eventLink);
  await ownsTouchTarget(credit);
  await expect(document.documentElement.scrollWidth).toBeLessThanOrEqual(window.innerWidth);
};

export const IntactPortraitArtwork390: Story = {
  globals: { viewport: { value: "radiusMobile", isRotated: false } },
  render: (args) => <TonightHeadlineContent {...args} approvedVisual={portraitArtwork} />,
  play: async (context) => {
    await expect(window.innerWidth).toBe(390);
    await intactHeadlineArtwork(context);
  },
};

export const IntactPortraitArtwork320: Story = {
  globals: { viewport: { value: "radiusMobileNarrow", isRotated: false }, motion: "reduce" },
  render: (args) => <TonightHeadlineContent {...args} approvedVisual={portraitArtwork} />,
  play: async (context) => {
    await expect(window.innerWidth).toBe(320);
    // Storybook's deterministic reduced-motion mode, not a claim that this
    // fixture changes the operating-system prefers-reduced-motion setting.
    await waitFor(() => expect(document.documentElement.dataset.storybookMotion).toBe("reduce"));
    await intactHeadlineArtwork(context);
  },
};
