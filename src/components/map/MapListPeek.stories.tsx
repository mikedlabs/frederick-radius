import { useState } from "react";
import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, fn, userEvent, waitFor, within } from "storybook/test";
import MapListPeek from "./MapListPeek";
import type { MapTaskList } from "./mapListTask";
import { clearMapSelectionOpener, rememberMapSelectionOpener, restoreMapSelectionOpenerFocus, takeMapSelectionOpener } from "./mapSelectionFocus";

const list: MapTaskList = {
  key: "component-fixture", title: "Coffee shops and bakeries · Whole county", scope: "county", unit: "place",
  note: "Hours for these places are not confirmed, so check before you go.", pending: false, unavailable: false,
  rows: Array.from({ length: 8 }, (_, index) => ({ kind: "place", place: {
    slug: `component-fixture-${index}`, name: `Sample coffee place ${index + 1}`, category: "coffee", subcategories: [],
    geom: { lng: -77.41, lat: 39.414 }, municipality: "frederick", source: "manual", is_verified: false,
    short_blurb: "Component review fixture, not a public listing.", open_status: { state: "unknown" },
  } })),
  empty: { title: "Nothing here matches this view.", copy: "Choose another view or reset the map." }, askQuery: null,
};

const meta = {
  title: "Map/Ranked choices",
  component: MapListPeek,
  parameters: { layout: "centered" },
  decorators: [(Story) => <div data-app-primary-tab="/map" className="w-[min(38rem,calc(100vw-24px))]"><Story /></div>],
  args: { list, userLoc: null, expanded: true, onExpandedChange: fn(), onPickPlace: fn(), onPickEvent: fn() },
  render: function Render(args) {
    const [expanded, setExpanded] = useState(args.expanded);
    return <MapListPeek {...args} expanded={expanded} onExpandedChange={setExpanded} />;
  },
} satisfies Meta<typeof MapListPeek>;
export default meta;
type Story = StoryObj<typeof meta>;

export const RankedUnknownHours: Story = {
  globals: { viewport: { value: "radiusMobile", isRotated: false } },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getAllByText("Hours not confirmed")).toHaveLength(5);
    await expect(canvas.queryByText(/from you/)).not.toBeInTheDocument();
    await expect(canvas.getByRole("button", { name: /Show 3 more places/ })).toBeVisible();
  },
};
export const SelectedRow: Story = { args: { selectedPlaceSlug: "component-fixture-0" } };
export const FailedSearchRetainsChoices: Story = { args: { list: { ...list, unavailable: true }, onRetrySearch: fn() } };
export const LocationNotShared: Story = { args: { list: { ...list, rows: [], locationRequired: true, note: "Radius has not determined where you are.", empty: { title: "Your location is needed for this search.", copy: "Share your location from the header, or name a town. Your search is kept here." } } } };
export const MixedCanonicalLinks: Story = { args: { list: { ...list, unit: "result", rows: [
  { kind: "event-link", result: { type: "event", id: "event:component-fixture", title: "Sample event listing", subtitle: "Component fixture venue · Oct 12", href: "/events/component-fixture", event: { starts_at: "2026-10-12T22:00:00Z", ends_at: "2026-10-13T00:00:00Z", venue_name: "Component fixture venue", municipality: "frederick", source_label: "Component fixture source" } } },
  list.rows[0],
] } } };


/** Component layout fixtures use public town coordinates, not live venue or
 * hours claims. Directions remains the real native link, never a router mock. */
const narrowList: MapTaskList = {
  ...list,
  key: "narrow-directions-fixture",
  title: "Coffee · Brunswick",
  scope: "town:brunswick",
  rows: list.rows.map((row, index) => row.kind === "place" ? {
    ...row,
    place: {
      ...row.place,
      name: index === 0 ? "Sample coffee place near Brunswick station" : row.place.name,
      municipality: "brunswick",
      geom: { lat: 39.3135, lng: -77.6261 },
    },
  } : row),
};

/** The fallback's uncertainty and Retry precede the rows in a real scroller.
 * Scroll each independent target into reach, then probe one stable painted
 * frame. A clipped/covered 44px area still fails with its exact hit geometry. */
async function expectReachableTarget(target: HTMLElement, edgeClearance = 0) {
  target.scrollIntoView({ block: "nearest", inline: "nearest" });
  const owner = target.ownerDocument;
  const view = owner.defaultView!;
  await waitFor(async () => {
    const previous = target.getBoundingClientRect();
    await new Promise<void>((resolve) => view.requestAnimationFrame(() => resolve()));
    const box = target.getBoundingClientRect();
    const point = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
    const samples = [[0, 0], [-21.5, 0], [21.5, 0], [0, -21.5], [0, 21.5]].map(([dx, dy]) => {
      const x = point.x + dx;
      const y = point.y + dy;
      const hit = owner.elementFromPoint(x, y);
      return {
        x, y,
        reachable: x >= 0 && y >= 0 && x < view.innerWidth && y < view.innerHeight && hit !== null && target.contains(hit),
        hit: hit ? { tag: hit.tagName, label: hit.getAttribute("aria-label") } : null,
      };
    });
    const scroller = target.closest<HTMLElement>("[data-map-list-body]");
    const clip = scroller?.getBoundingClientRect();
    const scrollport = scroller && clip ? {
      top: clip.top + scroller.clientTop, bottom: clip.bottom,
      scrollTop: scroller.scrollTop, clientHeight: scroller.clientHeight,
      scrollHeight: scroller.scrollHeight,
    } : null;
    const geometry = JSON.stringify({
      target: target.getAttribute("aria-label") ?? target.textContent,
      box: { x: box.x, y: box.y, width: box.width, height: box.height },
      viewport: { width: view.innerWidth, height: view.innerHeight }, samples, scrollport,
    });
    await expect(Math.abs(box.x - previous.x), geometry).toBeLessThanOrEqual(0.25);
    await expect(Math.abs(box.y - previous.y), geometry).toBeLessThanOrEqual(0.25);
    await expect(box.width, geometry).toBeGreaterThanOrEqual(44);
    await expect(box.height, geometry).toBeGreaterThanOrEqual(44);
    await expect(samples.map((sample) => sample.reachable), geometry).toEqual([true, true, true, true, true]);
    if (edgeClearance > 0) {
      if (!scrollport) throw new Error("This action must belong to the real map-list scrollport.");
      await expect(scrollport.scrollHeight, geometry).toBeGreaterThan(scrollport.clientHeight);
      await expect(box.top - scrollport.top, geometry).toBeGreaterThanOrEqual(edgeClearance);
      await expect(scrollport.bottom - box.bottom, geometry).toBeGreaterThanOrEqual(edgeClearance);
    }
  });
}

export const DirectDirectionsAt320: Story = {
  globals: { viewport: { value: "radiusMobileNarrow", isRotated: false } },
  args: { list: narrowList },
  parameters: {
    a11y: { test: "error" },
    docs: { description: { story: "Component fixtures at 320px. The native Directions link and open-details button have separate physical targets. No venue photo, current hours, or external map is loaded by this story." } },
  },
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    const name = "Sample coffee place near Brunswick station";
    const details = canvas.getByRole("button", { name: new RegExp(name) });
    const directions = canvas.getByRole("link", { name: `Directions to ${name}` });
    await expect(directions).toBeVisible();
    await expect(directions).toHaveTextContent("Directions");
    await expect(details).toHaveTextContent("Brunswick");
    await expect(details).toHaveTextContent("Hours not confirmed");
    await expect(canvas.queryByText(/from you/)).not.toBeInTheDocument();
    await expect(canvasElement.querySelector("button a, a button")).toBeNull();
    const href = new URL(directions.getAttribute("href")!);
    await expect([
      "https://www.google.com/maps/dir/?api=1&destination=39.3135,-77.6261",
      "https://maps.apple.com/?daddr=39.3135,-77.6261",
    ]).toContain(href.href);
    await canvasElement.ownerDocument.fonts.ready;
    const title = details.querySelector<HTMLElement>("[data-map-list-place-name]")!;
    await expect(title.scrollWidth).toBeLessThanOrEqual(title.clientWidth);
    await expect(title.textContent).toBe(name);
    const label = directions.querySelector<HTMLElement>("span")!;
    await expect(label.scrollWidth).toBeLessThanOrEqual(label.clientWidth);
    const detailsBox = details.getBoundingClientRect();
    const directionsBox = directions.getBoundingClientRect();
    await expect(detailsBox.width).toBeGreaterThanOrEqual(44);
    await expect(detailsBox.height).toBeGreaterThanOrEqual(44);
    await expect(directionsBox.width).toBeGreaterThanOrEqual(44);
    await expect(directionsBox.height).toBeGreaterThanOrEqual(44);
    await expect(detailsBox.right).toBeLessThanOrEqual(directionsBox.left);
    await expect(directionsBox.right).toBeLessThanOrEqual(canvasElement.ownerDocument.defaultView!.innerWidth);
    for (const target of [details, directions]) await expectReachableTarget(target);
    await userEvent.click(details);
    const first = narrowList.rows[0];
    if (first.kind !== "place") throw new Error("The first fixture must be a place.");
    await expect(args.onPickPlace).toHaveBeenCalledTimes(1);
    await expect(args.onPickPlace).toHaveBeenCalledWith(first.place);
    details.focus();
    await userEvent.tab();
    await expect(directions).toHaveFocus();
  },
};

export const DirectDirectionsInMapFallback: Story = {
  ...DirectDirectionsAt320,
  args: { list: { ...narrowList, unavailable: true }, collapsible: false, onRetrySearch: fn() },
  parameters: {
    ...DirectDirectionsAt320.parameters,
    docs: { description: { story: "The same 320px shortlist in the map-unavailable presentation, retaining its partial-search and unknown-hours qualifications. These are component fixtures, not live status evidence." } },
  },
};

export const NativePointerOpener: Story = {
  globals: { viewport: { value: "radiusMobileNarrow", isRotated: false } },
  beforeEach: () => {
    clearMapSelectionOpener();
    return () => clearMapSelectionOpener();
  },
  render: args => <div>
    <p className="p-3 text-sm">Choose a place to see its details.</p>
    <MapListPeek {...args} onPickPlace={place => {
      // This is the same synchronous opener capture used by AppMap before
      // opening its selected result. The real row must supply pointer focus.
      rememberMapSelectionOpener();
      args.onPickPlace(place);
    }} />
  </div>,
  play: async ({ canvasElement, args }) => {
    if (!(globalThis as typeof globalThis & { __vitest_browser__?: boolean }).__vitest_browser__) return;
    const browser = await import("vitest/browser");
    const canvas = within(canvasElement);
    // A trusted click on noninteractive text establishes this story frame;
    // neither the test nor the callback assigns preparatory focus to a row.
    await browser.userEvent.click(canvas.getByText("Choose a place to see its details."));
    const owner = canvasElement.ownerDocument;
    await expect([owner.body, owner.documentElement]).toContain(owner.activeElement);
    const rows = canvasElement.querySelectorAll<HTMLButtonElement>("[data-map-list-place]");
    const before = { href: location.href, state: history.state };
    for (const row of [rows[0], rows[1]]) {
      let trusted = false;
      row.addEventListener("pointerdown", event => { trusted = event.isTrusted; }, { once: true });
      await browser.userEvent.click(row);
      await expect(trusted).toBe(true);
      await expect(row).toHaveFocus();
      await expect(takeMapSelectionOpener()?.exact).toBe(rows[0]);
    }
    await expect(args.onPickPlace).toHaveBeenCalledTimes(2);
    await expect(rows[1]).toHaveFocus();
    restoreMapSelectionOpenerFocus();
    await waitFor(() => expect(rows[0]).toHaveFocus());
    await expect(takeMapSelectionOpener()).toBeNull();
    await expect({ href: location.href, state: history.state }).toEqual(before);
    await expect(args.onPickEvent).not.toHaveBeenCalled();
  },
};


const photoFixture = list.rows[0];
if (photoFixture.kind !== "place") throw new Error("Expected the declared place fixture.");
const reviewedPhotoList: MapTaskList = {
  ...list, key: "reviewed-photo-list", title: "Places with reviewed local photos", note: null,
  rows: [
    { kind: "place", place: { ...photoFixture.place, slug: "mccurdy-field", name: "McCurdy Field", category: "park", short_blurb: "" } },
    { kind: "place", place: { ...photoFixture.place, slug: "new-market-historic-district-new-market", name: "New Market Historic District", municipality: "new-market", geom: { lat: 39.3828, lng: -77.2694 }, category: "antiques", short_blurb: "" } },
    { kind: "place", place: { ...photoFixture.place, slug: "catoctin-mountain-park", name: "Catoctin Mountain Park", municipality: "thurmont", geom: { lat: 39.6483, lng: -77.4665 }, category: "park", short_blurb: "" } },
  ],
};

export const ExactReviewedPhotosAt320: Story = {
  globals: { viewport: { value: "radiusMobileNarrow", isRotated: false } },
  args: { list: reviewedPhotoList },
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    await canvasElement.ownerDocument.fonts.ready;
    for (const image of canvasElement.querySelectorAll<HTMLImageElement>("img")) {
      await image.decode();
      await expect(image.naturalWidth).toBeGreaterThan(1);
      await expect(image.naturalHeight).toBeGreaterThan(1);
    }
    await waitFor(() => expect(canvasElement.querySelectorAll('[data-photo-state="ready"]')).toHaveLength(3));
    for (const frame of canvasElement.querySelectorAll<HTMLElement>("[data-map-list-photo]")) {
      await expect(frame.getBoundingClientRect().width).toBe(72);
      await expect(frame.getBoundingClientRect().height).toBe(72);
    }
    const row = canvasElement.querySelector<HTMLElement>('[data-map-list-place-row="new-market-historic-district-new-market"]')!;
    const scoped = within(row);
    const open = scoped.getByRole("button", { name: /New Market Historic District/ });
    const directions = scoped.getByRole("link", { name: "Directions to New Market Historic District" });
    const source = scoped.getByRole("link", { name: "Wikimedia Commons" });
    const license = scoped.getByRole("link", { name: "CC BY-SA 4.0" });
    await expect(source).toHaveAttribute("href", "https://commons.wikimedia.org/wiki/File:New_Market_HD_MD1.jpg");
    await expect(license).toHaveAttribute("href", "https://creativecommons.org/licenses/by-sa/4.0/");
    await expect(scoped.getByText("Photo by Acroterion.")).toBeVisible();
    await expect(source.closest("button")).toBeNull();
    await expect(canvasElement.querySelector("button a, a button")).toBeNull();
    for (const target of [open, directions]) await expectReachableTarget(target);
    // Native nearest scrolling must expose the entire credit action inside
    // the fractional-height scrollport, including its physical edge probes.
    for (const target of [source, license]) await expectReachableTarget(target, 3);
    await expect(canvas.queryByText(/from you/)).not.toBeInTheDocument();
    await userEvent.click(open);
    const selected = reviewedPhotoList.rows[1];
    if (selected.kind !== "place") throw new Error("Expected the reviewed exact place row.");
    await expect(args.onPickPlace).toHaveBeenCalledWith(selected.place);
  },
};

export const PhotoFailureKeepsStableRows: Story = {
  globals: { viewport: { value: "radiusMobileNarrow", isRotated: false } },
  args: { list: { ...reviewedPhotoList, key: "reviewed-failed-photo", rows: [reviewedPhotoList.rows[0], list.rows[0]] } },
  play: async ({ canvasElement, args }) => {
    await canvasElement.ownerDocument.fonts.ready;
    const canvas = within(canvasElement);
    const first = canvas.getByRole("button", { name: /McCurdy Field/ });
    const second = canvas.getByRole("button", { name: /Sample coffee place 1/ });
    const frame = first.querySelector<HTMLElement>("[data-map-list-photo]")!;
    const emptyFrame = second.querySelector<HTMLElement>("[data-map-list-photo]")!;
    const image = frame.querySelector("img")!;
    await image.decode();
    await waitFor(() => expect(frame).toHaveAttribute("data-photo-state", "ready"));
    const before = [frame, first, second].map(element => element.getBoundingClientRect());
    await expect(before[0].width).toBe(72);
    await expect(before[0].height).toBe(72);
    await expect(emptyFrame.getBoundingClientRect().width).toBe(38);
    await expect(emptyFrame.getBoundingClientRect().height).toBe(38);
    image.dispatchEvent(new Event("error"));
    await waitFor(() => expect(frame).toHaveAttribute("data-photo-state", "fallback"));
    await expect(frame.querySelector("img")).toBeNull();
    for (const [index, element] of [frame, first, second].entries()) {
      const after = element.getBoundingClientRect();
      for (const dimension of ["x", "y", "width", "height"] as const) {
        await expect(Math.abs(after[dimension] - before[index][dimension])).toBeLessThanOrEqual(0.5);
      }
    }
    await expect(first).toHaveTextContent("Hours not confirmed");
    await expect(canvasElement.querySelector(".place-card-photo-credit")).toBeNull();
    await expectReachableTarget(first);
    await userEvent.click(first);
    const selected = reviewedPhotoList.rows[0];
    if (selected.kind !== "place") throw new Error("Expected the owned place row.");
    await expect(args.onPickPlace).toHaveBeenCalledWith(selected.place);
  },
};


export const LicensedPhotoKeepsTotalRowGeometry: Story = {
  globals: { viewport: { value: "radiusMobileNarrow", isRotated: false } },
  args: { list: { ...reviewedPhotoList, key: "stable-licensed-credit", rows: [reviewedPhotoList.rows[1], list.rows[0]] } },
  render: function Render(args) {
    const [shown, setShown] = useState(false);
    return <div>
      <button type="button" className="min-h-[44px] px-3" onClick={() => setShown(true)}>Show the reviewed photo fixture</button>
      {shown && <MapListPeek {...args} />}
    </div>;
  },
  play: async ({ canvasElement }) => {
    await canvasElement.ownerDocument.fonts.ready;
    const canvas = within(canvasElement);
    const measure = () => {
      const row = canvasElement.querySelector<HTMLElement>('[data-map-list-place-row="new-market-historic-district-new-market"]')!;
      const nextRow = canvasElement.querySelector<HTMLElement>('[data-map-list-place-row="component-fixture-0"]')!;
      return [row, row.querySelector<HTMLElement>("[data-map-list-place]")!, row.querySelector<HTMLElement>("[data-map-list-photo]")!, nextRow]
        .map(element => { const box = element.getBoundingClientRect(); return { x: box.x, y: box.y, width: box.width, height: box.height }; });
    };
    let pending: ReturnType<typeof measure> | undefined;
    // Observe the actual initial commit before its local image decode, rather
    // than changing the image, clock, source plan or component's load handler.
    const observer = new MutationObserver(() => {
      const frame = canvasElement.querySelector<HTMLElement>('[data-map-list-photo="new-market-historic-district-new-market"]');
      if (!pending && frame?.dataset.photoState === "pending") pending = measure();
    });
    observer.observe(canvasElement, { childList: true, subtree: true, attributes: true, attributeFilter: ["data-photo-state"] });
    try {
      await userEvent.click(canvas.getByRole("button", { name: "Show the reviewed photo fixture" }));
      const frame = canvasElement.querySelector<HTMLElement>('[data-map-list-photo="new-market-historic-district-new-market"]')!;
      const image = frame.querySelector("img")!;
      await image.decode();
      await waitFor(() => expect(frame).toHaveAttribute("data-photo-state", "ready"));
      await expect(pending).toBeDefined();
      const loaded = measure();
      await expect(canvas.getByRole("link", { name: "Wikimedia Commons" })).toBeVisible();
      image.dispatchEvent(new Event("error"));
      await waitFor(() => expect(frame).toHaveAttribute("data-photo-state", "fallback"));
      const failed = measure();
      const evidence = JSON.stringify({ pending, loaded, failed });
      for (const state of [loaded, failed]) {
        for (const [index, box] of state.entries()) {
          for (const dimension of ["x", "y", "width", "height"] as const) {
            await expect(Math.abs(box[dimension] - pending![index][dimension]), evidence).toBeLessThanOrEqual(0.5);
          }
        }
      }
      // Failed bytes must not leave an accessible claim that their photograph
      // is displayed, even while the exact legal-credit footprint stays put.
      await expect(canvas.queryByRole("link", { name: "Wikimedia Commons" })).not.toBeInTheDocument();
      await expect(canvas.getByRole("button", { name: /New Market Historic District/ })).toHaveTextContent("Hours not confirmed");
    } finally { observer.disconnect(); }
  },
};
