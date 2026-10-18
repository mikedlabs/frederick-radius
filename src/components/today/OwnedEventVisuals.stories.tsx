import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, waitFor, within } from "storybook/test";
import { eventCardVisual, parseRecoveryEventVisual } from "@/components/event/eventVisuals";
import type { TodayEvent, TodayEventResponse } from "@/lib/today-events";
import { TodayEventsRecoveryView } from "./TodayEventsRecovery";

const fairgroundsSlug = "frederick-fairgrounds-home-of-the-great-frederick-fair-frederick";
const presenter = "Offline Layout Ensemble";
const fixtureTitle = "Fixture performance";
const displayedTitle = `${presenter}: ${fixtureTitle}`;

// Fictional event facts exercise real, previously approved local venue photos.
// These are not current listings, publisher artwork, or evidence of an event.
function fixture(venueSlug: string, eventSlug: string, venue: string): TodayEvent {
  const visual = eventCardVisual({ source: "manual", venue_place_slug: venueSlug }, { venuePhotos: "owned-only" });
  return {
    slug: eventSlug,
    title: fixtureTitle,
    presenter,
    venue,
    municipality: "frederick",
    time: "7:00 PM",
    moment: "Tonight",
    image: null,
    free: false,
    ...(visual ? { visual } : {}),
  };
}

const fairgrounds = fixture(fairgroundsSlug, "offline-owned-fairgrounds-fixture", "Frederick Fairgrounds");
const mccurdy = fixture("mccurdy-field", "offline-owned-mccurdy-fixture", "McCurdy Field");
const unknown = fixture("unknown-offline-fixture-venue", "offline-unknown-venue-fixture", "Unknown fixture venue");
const responseFor = (event: TodayEvent): TodayEventResponse => ({ events: [event], partial: false });

const meta = {
  title: "Today/Owned event venue visuals",
  component: TodayEventsRecoveryView,
  parameters: {
    layout: "fullscreen",
    a11y: { test: "error" },
    docs: {
      description: {
        component: "Declared fictional event facts use the pure recovery View and the real approved-visual resolver. Fairgrounds and McCurdy use existing local photographs; the unknown venue remains factual without an image. No recovery effect, API, Google media, publisher request, or navigation is invoked. The enlarged case measures actual text before and after 100% to 200% root text resizing, not page zoom. Native keyboard checks run only in the opt-in Vitest browser gate: macOS WebKit uses Option-Tab to include links, other engines use Tab. Ordinary Storybook does not substitute simulated keyboard acceptance.",
      },
    },
  },
  decorators: [(Story) => (
    <main className="mx-auto min-w-0 p-4" style={{ maxWidth: 552, background: "var(--app-bg)", color: "var(--app-ink)" }}>
      <h1 className="text-lg font-semibold">Offline venue-photo fixtures</h1>
      <p className="mt-1 text-sm">These event facts are fictional. The photograph shows the venue.</p>
      <Story />
    </main>
  )],
  beforeEach: () => {
    const previous = document.documentElement.style.fontSize;
    document.documentElement.style.fontSize = "100%";
    return () => { document.documentElement.style.fontSize = previous; };
  },
  args: { response: responseFor(fairgrounds) },
} satisfies Meta<typeof TodayEventsRecoveryView>;
export default meta;
type Story = StoryObj<typeof meta>;
type Context = Parameters<NonNullable<Story["play"]>>[0];
type NativeBrowser = typeof import("vitest/browser");

async function viewport(width: number, height: number): Promise<NativeBrowser | null> {
  const inBrowserGate = Boolean((globalThis as typeof globalThis & { __vitest_browser__?: boolean }).__vitest_browser__);
  const browser = inBrowserGate ? await import("vitest/browser") : null;
  if (browser) {
    await browser.page.viewport(width, height);
    // Do not pre-focus, blur, click, or amend tabindex to manufacture Tab reachability.
    await expect([document.body, document.documentElement]).toContain(document.activeElement);
  }
  await waitFor(() => expect(window.innerWidth).toBe(width));
  await document.fonts.ready;
  return browser;
}

function facts(canvasElement: HTMLElement, event: TodayEvent) {
  const canvas = within(canvasElement);
  return {
    title: canvas.getByText(displayedTitle, { exact: true }),
    time: canvas.getByText(event.time, { exact: true }),
    venue: canvas.getByText(event.venue, { exact: true }),
  };
}

function eventLink(canvasElement: HTMLElement, event: TodayEvent): HTMLAnchorElement {
  const link = canvasElement.querySelector<HTMLAnchorElement>(`a[href="/events/${event.slug}"]`);
  if (!link) throw new Error("The real event detail link is missing.");
  return link;
}

async function readableFacts(canvasElement: HTMLElement, event: TodayEvent) {
  const nodes = facts(canvasElement, event);
  await expect(nodes.title).toHaveTextContent(presenter);
  await expect(nodes.title).toHaveTextContent(fixtureTitle);
  for (const node of Object.values(nodes)) {
    await expect(node).toBeVisible();
    await expect(node.scrollWidth).toBeLessThanOrEqual(node.clientWidth + 1);
    await expect(node.scrollHeight).toBeLessThanOrEqual(node.clientHeight + 1);
  }
  await expect(eventLink(canvasElement, event)).toHaveAttribute("href", `/events/${event.slug}`);
  await expect(canvasElement.querySelector("a a")).toBeNull();
  await expect(canvasElement.scrollWidth).toBeLessThanOrEqual(canvasElement.clientWidth + 1);
  await expect(document.documentElement.scrollWidth).toBeLessThanOrEqual(window.innerWidth + 1);
}

async function physicalEventLink(canvasElement: HTMLElement, event: TodayEvent) {
  const link = eventLink(canvasElement, event);
  link.scrollIntoView({ block: "center", behavior: "instant" });
  await waitFor(async () => {
    const box = link.getBoundingClientRect();
    await expect(box.width).toBeGreaterThanOrEqual(44);
    await expect(box.height).toBeGreaterThanOrEqual(44);
    const x = box.left + box.width / 2, y = box.top + box.height / 2;
    for (const [dx, dy] of [[0, 0], [-21.5, 0], [21.5, 0], [0, -21.5], [0, 21.5]]) {
      const hit = document.elementFromPoint(x + dx, y + dy);
      await expect(hit === link || Boolean(hit && link.contains(hit))).toBe(true);
    }
  });
}

async function nativeEventFocus(browser: NativeBrowser | null, canvasElement: HTMLElement, event: TodayEvent) {
  if (!browser) return;
  const link = eventLink(canvasElement, event);
  // Native macOS WebKit traversal includes links with Option-Tab. Read the
  // installed provider metadata rather than guessing an engine from user agent.
  const optionTab = browser.server.browser === "webkit" && browser.server.platform === "darwin";
  const keys = optionTab ? "{Alt>}{Tab}{/Alt}" : "{Tab}";
  let presses = 0;
  while (document.activeElement !== link && presses < 24) {
    await browser.userEvent.keyboard(keys);
    presses += 1;
  }
  await expect(presses).toBeGreaterThan(0);
  await expect(link, `The event link is reached by native ${optionTab ? "Option-Tab" : "Tab"} without target pre-focus.`).toHaveFocus();
  await physicalEventLink(canvasElement, event);
}

async function doubleActualText(canvasElement: HTMLElement, event: TodayEvent, caption: string) {
  const nodes = facts(canvasElement, event);
  const elements = [...Object.values(nodes), within(canvasElement).getByText(caption, { exact: true })];
  const size = (element: Element) => parseFloat(getComputedStyle(element).fontSize);
  await waitFor(() => {
    expect(size(document.documentElement)).toBe(16);
    expect(size(nodes.title)).toBeGreaterThan(size(nodes.venue));
    elements.forEach(element => expect(size(element)).toBeGreaterThan(0));
  });
  const normal = elements.map(size);
  document.documentElement.style.fontSize = "200%";
  await waitFor(() => {
    expect(size(document.documentElement)).toBe(32);
    elements.forEach((element, index) => expect(size(element) / normal[index]).toBeCloseTo(2, 2));
  });
}

type OwnedCase = {
  event: TodayEvent;
  venueSlug: string;
  src: string;
  caption: string;
  position: "right" | "center";
  computedPosition: "100% 50%" | "50% 50%";
};

async function ownedVisual({ canvasElement }: Context, expected: OwnedCase) {
  const visual = eventCardVisual({ source: "manual", venue_place_slug: expected.venueSlug }, { venuePhotos: "owned-only" });
  await expect(visual).toMatchObject({
    src: expected.src,
    caption: expected.caption,
    key: `owned-venue:${expected.venueSlug}`,
    presentation: "photo",
    objectPosition: expected.position,
  });
  await expect(parseRecoveryEventVisual(visual)).toEqual(visual);
  await waitFor(() => expect(canvasElement.querySelector("img")).not.toBeNull());
  const image = canvasElement.querySelector<HTMLImageElement>("img")!;
  image.scrollIntoView({ block: "center", behavior: "instant" });
  await waitFor(async () => {
    await image.decode();
    await expect(image.naturalWidth).toBeGreaterThan(1);
    await expect(image.naturalHeight).toBeGreaterThan(1);
  });
  const displayed = new URL(image.currentSrc || image.src, document.baseURI);
  await expect(decodeURIComponent(displayed.searchParams.get("url") ?? displayed.pathname)).toBe(expected.src);
  await expect(getComputedStyle(image).objectFit).toBe("cover");
  await expect(getComputedStyle(image).objectPosition).toBe(expected.computedPosition);
  const caption = within(canvasElement).getByText(expected.caption, { exact: true });
  await expect(caption).toBeVisible();
  await expect(eventLink(canvasElement, expected.event).contains(caption)).toBe(false);
  await expect(canvasElement.querySelectorAll("[data-event-photo-credit]")).toHaveLength(1);
  for (const candidate of canvasElement.querySelectorAll("img")) {
    await expect(`${candidate.src} ${candidate.currentSrc} ${candidate.srcset}`).not.toContain("/api/place-photo");
  }
  await readableFacts(canvasElement, expected.event);
  await physicalEventLink(canvasElement, expected.event);
}

const fairgroundsCase: OwnedCase = {
  event: fairgrounds,
  venueSlug: fairgroundsSlug,
  src: "/images/fair/fairgrounds-night-mike-d-1920.jpg",
  caption: "Venue · Frederick Fairgrounds during The Great Frederick Fair",
  position: "right",
  computedPosition: "100% 50%",
};

export const Fairgrounds320At200Percent: Story = {
  globals: { viewport: { value: "radiusMobileNarrow", isRotated: false } },
  play: async (context) => {
    const browser = await viewport(320, 568);
    await ownedVisual(context, fairgroundsCase);
    await doubleActualText(context.canvasElement, fairgrounds, fairgroundsCase.caption);
    await ownedVisual(context, fairgroundsCase);
    await nativeEventFocus(browser, context.canvasElement, fairgrounds);
  },
};

export const McCurdy390: Story = {
  globals: { viewport: { value: "radiusMobile", isRotated: false } },
  args: { response: responseFor(mccurdy) },
  play: async (context) => {
    const browser = await viewport(390, 844);
    await ownedVisual(context, {
      event: mccurdy,
      venueSlug: "mccurdy-field",
      src: "/images/seasons/spring/aerial-view-baseball-field.jpg",
      caption: "Venue · McCurdy Field",
      position: "center",
      computedPosition: "50% 50%",
    });
    await nativeEventFocus(browser, context.canvasElement, mccurdy);
  },
};

export const UnknownVenueKeepsFacts320: Story = {
  globals: { viewport: { value: "radiusMobileNarrow", isRotated: false } },
  args: { response: responseFor(unknown) },
  play: async ({ canvasElement }) => {
    const browser = await viewport(320, 568);
    await expect(eventCardVisual({ source: "manual", venue_place_slug: "unknown-offline-fixture-venue" }, { venuePhotos: "owned-only" })).toBeNull();
    await expect(canvasElement.querySelector("img")).toBeNull();
    await expect(canvasElement.querySelector("[data-event-photo-credit]")).toBeNull();
    await readableFacts(canvasElement, unknown);
    await physicalEventLink(canvasElement, unknown);
    await nativeEventFocus(browser, canvasElement, unknown);
  },
};
