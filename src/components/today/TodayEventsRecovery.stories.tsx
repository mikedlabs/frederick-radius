import portraitFixture from "../../../tests/fixtures/event-artwork-portrait.json";
import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, waitFor, within } from "storybook/test";
import type { EventCardVisual } from "@/components/event/eventVisuals";
import type { TodayEvent, TodayEventResponse } from "@/lib/today-events";
import { TodayEventBriefCard, TodayEventsRecoveryView } from "./TodayEventsRecovery";

const fullTitle = "Offline Layout Ensemble: Live Theatre Production";
const eventFixture: TodayEvent = {
  slug: "offline-event-brief-fixture",
  title: "Live Theatre Production",
  presenter: "Offline Layout Ensemble",
  venue: "Fixture venue · Frederick",
  municipality: "frederick",
  time: "7:00 PM",
  moment: "Tonight",
  image: null,
  free: true,
};

// Declared layout bytes, not a publisher import or evidence of a real event.
// Only the presentation seam receives this data URL; the normal View must
// continue rejecting it as an unapproved production visual.
const artworkFixture: EventCardVisual = {
  src: portraitFixture.dataUrl,
  key: "recovery-portrait-layout-fixture",
  presentation: "artwork",
  caption: "Synthetic artwork · layout fixture",
  sourceHref: "https://example.test/offline-artwork-fixture",
};
const ownedPhoto: EventCardVisual = {
  src: "/images/seasons/summer/SUMMER CARROL CREEK.jpg",
  key: "radius-carroll-creek-summer",
  presentation: "photo",
  caption: "Venue · Carroll Creek Linear Park",
};
const relativeRows: TodayEvent[] = [
  { ...eventFixture, visual: artworkFixture },
  {
    ...eventFixture, slug: "offline-current-fixture", title: "Offline current fixture",
    presenter: undefined, time: "9:17 AM", moment: "Now", free: false,
  },
  {
    ...eventFixture, slug: "offline-all-day-fixture", title: "Offline all-day fixture",
    presenter: undefined, time: "All day", moment: "Today", free: false,
  },
];
const response: TodayEventResponse = { events: relativeRows, partial: true };

const meta = {
  title: "Today/Recovered event brief",
  component: TodayEventsRecoveryView,
  parameters: {
    layout: "fullscreen",
    a11y: { test: "error" },
    docs: {
      description: {
        component: "Fixed offline recovery fixtures, not a current schedule or provider-health claim. Synthetic tall artwork enters the shared approved-presentation seam only; the full View continues to reject data URLs. The owned-photo case uses an existing local venue photograph. No recovery effect, API fetch, publisher bytes, or navigation is invoked. Enlarged cases measure real text before and after changing the root from100% to200%; this is text resizing, not page zoom.",
      },
    },
  },
  decorators: [(Story) => (
    <main className="mx-auto min-w-0 p-4" style={{ maxWidth: 552, background: "var(--app-bg)", color: "var(--app-ink)" }}>
      <h1 className="text-lg font-semibold">Offline event brief fixture</h1>
      <p className="mt-1 text-sm">Synthetic event facts for layout review.</p>
      <Story />
    </main>
  )],
  beforeEach: () => {
    const previous = document.documentElement.style.fontSize;
    document.documentElement.style.fontSize = "100%";
    return () => { document.documentElement.style.fontSize = previous; };
  },
  args: { response },
} satisfies Meta<typeof TodayEventsRecoveryView>;
export default meta;
type Story = StoryObj<typeof meta>;
type Context = Parameters<NonNullable<Story["play"]>>[0];

function ArtworkPresentation() {
  return (
    <section className="mt-5" aria-label="Synthetic artwork event pick">
      <h2 className="mb-3 text-lg font-semibold">Events today</h2>
      <TodayEventBriefCard event={eventFixture} visual={artworkFixture} />
    </section>
  );
}

function facts(canvasElement: HTMLElement, event = eventFixture) {
  const canvas = within(canvasElement);
  return {
    title: canvas.getByText(fullTitle, { exact: true }),
    time: canvas.getByText(event.time, { exact: true }),
    venue: canvas.getByText(event.venue + (event.free ? " · Free" : ""), { exact: true }),
  };
}

async function assertReadable(canvasElement: HTMLElement, event = eventFixture) {
  const canvas = within(canvasElement);
  const nodes = facts(canvasElement, event);
  for (const node of Object.values(nodes)) {
    await expect(node).toBeVisible();
    await expect(node.scrollWidth).toBeLessThanOrEqual(node.clientWidth + 1);
    await expect(node.scrollHeight).toBeLessThanOrEqual(node.clientHeight + 1);
  }
  await expect(canvas.getByRole("link", { name: /Offline Layout Ensemble: Live Theatre Production/ }))
    .toHaveAttribute("href", "/events/" + event.slug);
  await expect(canvasElement.querySelector("a a")).toBeNull();
  await expect(canvasElement.scrollWidth).toBeLessThanOrEqual(canvasElement.clientWidth + 1);
  await expect(document.documentElement.scrollWidth).toBeLessThanOrEqual(window.innerWidth);
}

async function assertArtworkReadingLayout(canvasElement: HTMLElement, stacked: boolean) {
  const nodes = facts(canvasElement);
  const figure = canvasElement.querySelector<HTMLImageElement>("img")!.closest("figure")!;
  const layout = figure.parentElement!;
  const factPanel = nodes.title.parentElement!;
  // Read all related geometry in one frame after responsive styles settle.
  // A narrow, technically unoverflowing column is not an acceptable200% layout.
  await waitFor(() => {
    const row = layout.getBoundingClientRect(), panel = factPanel.getBoundingClientRect();
    const title = nodes.title.getBoundingClientRect(), venue = nodes.venue.getBoundingClientRect();
    const art = figure.getBoundingClientRect(), frame = figure.firstElementChild!.getBoundingClientRect();
    expect(row.width).toBeGreaterThan(0);
    if (stacked) {
      expect(Math.abs(title.left - row.left)).toBeLessThanOrEqual(1);
      expect(Math.abs(title.right - row.right)).toBeLessThanOrEqual(1);
      expect(Math.abs(venue.left - row.left)).toBeLessThanOrEqual(1);
      expect(Math.abs(venue.right - row.right)).toBeLessThanOrEqual(1);
      expect(art.top).toBeGreaterThanOrEqual(panel.bottom - 1);
      expect(art.top).toBeGreaterThanOrEqual(venue.bottom - 1);
      expect(Math.abs(art.width - row.width)).toBeLessThanOrEqual(1);
      expect(Math.abs(frame.width / frame.height - 4 / 3)).toBeLessThanOrEqual(0.01);
    } else {
      // Both ordinary portrait cases retain compact side-by-side discovery.
      expect(art.left).toBeGreaterThanOrEqual(panel.right + 1);
      expect(art.top).toBeLessThan(panel.bottom);
      expect(panel.top).toBeLessThan(art.bottom);
      expect(title.width).toBeLessThan(row.width - 44);
    }
  });
}

async function doubleActualText(canvasElement: HTMLElement, baselineSizes: [number, number, number]) {
  const nodes = facts(canvasElement);
  const elements = [nodes.title, nodes.time, nodes.venue];
  const size = (element: Element) => parseFloat(getComputedStyle(element).fontSize);
  // Wait for the real reading styles, rather than sampling before CSS settles.
  await waitFor(() => {
    expect(size(document.documentElement)).toBe(16);
    elements.forEach((element, index) => expect(size(element)).toBe(baselineSizes[index]));
  });
  const before = elements.map(size);
  const rootBefore = size(document.documentElement);
  document.documentElement.style.fontSize = "200%";
  await waitFor(() => {
    expect(size(document.documentElement)).toBe(rootBefore * 2);
    elements.forEach((element, index) => expect(size(element)).toBeGreaterThanOrEqual(before[index] * 2));
  });
  await expect(size(document.documentElement)).toBe(32);
}

async function assertControls(canvasElement: HTMLElement) {
  const links = Array.from(canvasElement.querySelectorAll<HTMLAnchorElement>("a"));
  await expect(links.length).toBeGreaterThan(0);
  for (const link of links) {
    link.scrollIntoView({ block: "center", behavior: "instant" });
    // Observe after native scrolling paints; do not reposition or shrink targets.
    await new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
    const bounds = link.getBoundingClientRect();
    await expect(bounds.width).toBeGreaterThanOrEqual(44);
    if (bounds.height < 44) {
      await expect(link.classList.contains("tap-44-y")).toBe(true);
      await expect(parseFloat(getComputedStyle(link, "::after").height)).toBeGreaterThanOrEqual(44);
    }
    const x = bounds.left + bounds.width / 2, y = bounds.top + bounds.height / 2;
    for (const [dx, dy] of [[0, 0], [-21.5, 0], [21.5, 0], [0, -21.5], [0, 21.5]]) {
      const hit = document.elementFromPoint(x + dx, y + dy);
      await expect(hit === link || Boolean(hit && link.contains(hit))).toBe(true);
    }
  }
}

async function renderedImage(canvasElement: HTMLElement) {
  // Storybook may start play while React is committing a new selection.
  // Wait for the real image; decode, dimensions and physical checks still run.
  await waitFor(() => expect(canvasElement.querySelector("img")).not.toBeNull());
  return canvasElement.querySelector<HTMLImageElement>("img")!;
}

async function assertIntactArtwork({ canvasElement }: Context, stacked = false) {
  const canvas = within(canvasElement);
  const image = await renderedImage(canvasElement);
  image.scrollIntoView({ block: "center", behavior: "instant" });
  await waitFor(async () => {
    await image.decode();
    await expect(image.naturalWidth).toBe(600);
    await expect(image.naturalHeight).toBe(900);
  });
  const style = getComputedStyle(image), box = image.getBoundingClientRect();
  const frame = image.parentElement!.getBoundingClientRect();
  await expect(style.objectFit).toBe("contain");
  await expect(style.transform).toBe("none");
  await expect(style.animationName).toBe("none");
  await expect(image.classList.contains("ken-burns")).toBe(false);
  const horizontal = parseFloat(style.paddingLeft) + parseFloat(style.paddingRight);
  const vertical = parseFloat(style.paddingTop) + parseFloat(style.paddingBottom);
  const scale = Math.min((box.width - horizontal) / image.naturalWidth, (box.height - vertical) / image.naturalHeight);
  await expect(scale).toBeGreaterThan(0);
  await expect(image.naturalWidth * scale).toBeLessThanOrEqual(frame.width - horizontal + 1);
  await expect(image.naturalHeight * scale).toBeLessThanOrEqual(frame.height - vertical + 1);
  const eventLink = canvas.getByRole("link", { name: /Offline Layout Ensemble: Live Theatre Production/ });
  const sourceLink = canvas.getByRole("link", { name: artworkFixture.caption });
  await expect(sourceLink).toHaveAttribute("href", artworkFixture.sourceHref!);
  await expect(sourceLink).toHaveAttribute("target", "_blank");
  // Source actions need their own physical space, including before text grows.
  // A pseudo target alone can overlap the event or fixed navigation on focus.
  await expect(sourceLink.getBoundingClientRect().height).toBeGreaterThanOrEqual(44);
  await expect(eventLink.contains(sourceLink)).toBe(false);
  await expect(canvasElement.querySelectorAll("[data-event-photo-credit]")).toHaveLength(1);
  await expect(image.closest("figure")!.contains(canvas.getByRole("heading", { name: fullTitle }))).toBe(false);
  await assertReadable(canvasElement);
  await assertArtworkReadingLayout(canvasElement, stacked);
  await assertControls(canvasElement);
}

export const PortraitArtwork390: Story = {
  globals: { viewport: { value: "radiusMobile", isRotated: false } },
  render: () => <ArtworkPresentation />,
  play: async (context) => {
    await expect(window.innerWidth).toBe(390);
    await assertIntactArtwork(context);
  },
};

export const PortraitArtwork320: Story = {
  globals: { viewport: { value: "radiusMobileNarrow", isRotated: false }, motion: "reduce" },
  render: () => <ArtworkPresentation />,
  play: async (context) => {
    await expect(window.innerWidth).toBe(320);
    // This is the Storybook reduced-motion companion, not an OS preference mock.
    await waitFor(() => expect(document.documentElement.dataset.storybookMotion).toBe("reduce"));
    await assertIntactArtwork(context);
  },
};

export const EnlargedPortraitArtwork320: Story = {
  globals: { viewport: { value: "radiusMobileNarrow", isRotated: false } },
  render: () => <ArtworkPresentation />,
  play: async (context) => {
    await expect(window.innerWidth).toBe(320);
    await doubleActualText(context.canvasElement, [16, 12, 14]);
    await assertIntactArtwork(context, true);
  },
};

const ownedEvent: TodayEvent = {
  ...eventFixture, venue: "Carroll Creek Linear Park", visual: ownedPhoto,
};
export const OwnedPhotoFullView390: Story = {
  globals: { viewport: { value: "radiusMobile", isRotated: false } },
  args: { response: { events: [ownedEvent], partial: false } },
  play: async ({ canvasElement }) => {
    await expect(window.innerWidth).toBe(390);
    const canvas = within(canvasElement), image = await renderedImage(canvasElement);
    image.scrollIntoView({ block: "center", behavior: "instant" });
    await waitFor(async () => {
      await image.decode();
      await expect(image.naturalWidth).toBeGreaterThan(1);
      await expect(image.naturalHeight).toBeGreaterThan(1);
    });
    await expect(getComputedStyle(image).objectFit).toBe("cover");
    await expect(image.getAttribute("src")).toContain("SUMMER");
    await expect(canvas.getByText(ownedPhoto.caption, { exact: true })).toBeVisible();
    await expect(canvas.getByRole("link", { name: "See all: Events today" })).toHaveAttribute("href", "/events");
    await expect(canvasElement.querySelectorAll("[data-event-photo-credit]")).toHaveLength(1);
    await assertReadable(canvasElement, ownedEvent);
    await assertControls(canvasElement);
  },
};

export const EnlargedTextOnlyRelative320: Story = {
  globals: { viewport: { value: "radiusMobileNarrow", isRotated: false } },
  play: async ({ canvasElement }) => {
    await expect(window.innerWidth).toBe(320);
    await doubleActualText(canvasElement, [14, 12, 12]);
    const canvas = within(canvasElement);
    // The full View revalidates and rejects the data URL supplied in response.
    await expect(canvasElement.querySelector("img")).toBeNull();
    await expect(canvasElement.querySelector("[data-event-photo-credit]")).toBeNull();
    await expect(canvas.getByText("Now", { exact: true })).toBeVisible();
    await expect(canvas.getByText("Today", { exact: true })).toBeVisible();
    await expect(canvas.queryByText("9:17 AM", { exact: true })).toBeNull();
    await expect(canvas.queryByText("All day", { exact: true })).toBeNull();
    await expect(canvas.getByText("Offline current fixture", { exact: true })).toBeVisible();
    await expect(canvas.getByText("Offline all-day fixture", { exact: true })).toBeVisible();
    await waitFor(() => expect(canvas.getByText(/Partial coverage/)).toBeVisible());
    await expect(canvas.getByRole("link", { name: "See all: Events today" })).toHaveAttribute("href", "/events");
    await assertReadable(canvasElement);
    await assertControls(canvasElement);
  },
};
