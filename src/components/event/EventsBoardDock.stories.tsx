import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, userEvent, waitFor, within } from "storybook/test";
import { useState } from "react";
import TopBar from "@/components/nav/TopBar";
import EventsBoardDock, { type EventsBoardDockProps } from "./EventsBoardDock";

const noop = () => undefined;
const sample: EventsBoardDockProps = {
  nowISO: "2026-10-09T16:00:00Z", dayCounts: {}, filteredCount: 2, resultTownCount: 1, countComplete: true,
  categories: [{ slug: "arts", name: "Arts & culture" }, { slug: "music", name: "Live music" }],
  towns: [{ slug: "thurmont", name: "Thurmont" }],
  intent: null, setIntent: noop, sub: null, setSub: noop, cat: null, setCat: noop,
  lens: "weekend", setLens: noop, tod: null, setTod: noop, day: null, setDay: noop,
  town: "thurmont", setTown: noop, q: "a very long local music search phrase with additional words", setQ: noop,
  freeOnly: false, setFreeOnly: noop, happyOnly: false, setHappyOnly: noop, kidsOnly: false, setKidsOnly: noop,
  lgbtqOnly: false, setLgbtqOnly: noop, communicationAccessOnly: false, setCommunicationAccessOnly: noop,
  recurringOnly: false, setRecurringOnly: noop, anyFilter: true, clear: noop,
  view: "list", setView: noop, sort: "recommended", setSort: noop,
};
function Workshop() {
  const [query, setQuery] = useState(sample.q);
  const [lens, setLens] = useState(sample.lens);
  const [town, setTown] = useState(sample.town);
  return <>
    <TopBar />
    <main data-app-primary-tab="/events" className="mx-auto max-w-screen-md px-4">
      <EventsBoardDock {...sample} q={query} setQ={setQuery} lens={lens} setLens={setLens} town={town} setTown={setTown} />
      <section className="py-6" data-sample-event-results>
        <h2 className="text-xl font-semibold">Sample event results</h2>
        <p className="mt-2 text-sm">You can review the filter controls here. The event counts are sample data.</p>
        <button type="button" className="tap-44 mt-3">Open sample event</button>
      </section>
    </main>
  </>;
}
const meta = {
  title: "Events/Filter layer",
  component: EventsBoardDock,
  args: sample,
  parameters: { layout: "fullscreen", nextjs: { navigation: { pathname: "/events" } } },
  render: () => <Workshop />,
} satisfies Meta<typeof EventsBoardDock>;
export default meta;
type Story = StoryObj<typeof meta>;

async function ownFilter({ canvasElement }: { canvasElement: HTMLElement }) {
  const canvas = within(canvasElement);
  const filters = canvas.getByRole("button", { name: /^Filters/ });
  const time = canvasElement.querySelector<HTMLElement>("[data-event-filter-time]")!;
  const town = canvasElement.querySelector<HTMLElement>("[data-event-filter-scope]")!;
  expect(time).toHaveTextContent("This weekend");
  expect(town).toHaveTextContent("Thurmont");
  expect(time.scrollWidth).toBeLessThanOrEqual(time.clientWidth + 1);
  expect(town.scrollWidth).toBeLessThanOrEqual(town.clientWidth + 1);
  const display = canvasElement.querySelector<HTMLDetailsElement>(".eb-display-options")!;
  display.open = true;
  await userEvent.click(filters);
  const dialog = await canvas.findByRole("dialog", { name: "Event filters" });
  await waitFor(() => expect(within(dialog).getByRole("button", { name: "Done" })).toBeVisible());
  expect(display.open).toBe(false);
  expect(dialog).toHaveAttribute("aria-modal", "true");
  expect(canvasElement.querySelector("[data-sample-event-results]")).toHaveAttribute("inert");
  await userEvent.keyboard("/");
  expect(canvas.queryByRole("dialog", { name: "What do you need?" })).toBeNull();
  await userEvent.click(within(dialog).getByRole("button", { name: "Done" }));
  await waitFor(() => expect(filters).toHaveFocus());
  expect(canvasElement.querySelector("[data-sample-event-results]")).not.toHaveAttribute("inert");
}
export const MobileScopeAndOwnership: Story = {
  globals: { viewport: { value: "radiusMobile", isRotated: false } },
  play: ownFilter,
};
export const DesktopScopeAndOwnership: Story = {
  globals: { viewport: { value: "radiusDesktop", isRotated: false } },
  play: ownFilter,
};

/** The phone Display panel and the Order menu inside it stay on screen, and
 *  the panel closes on Escape and on a press anywhere else. The browser gate
 *  checks 320, 375 and 390; the Storybook canvas checks its own viewport. */
async function displayPanel({ canvasElement }: { canvasElement: HTMLElement }) {
  const canvas = within(canvasElement);
  const display = canvasElement.querySelector<HTMLDetailsElement>("details.eb-display-options")!;
  const summary = display.querySelector("summary")!;
  const inBrowserGate = Boolean((globalThis as typeof globalThis & { __vitest_browser__?: boolean }).__vitest_browser__);
  // The native toggle event, and the dismissal listeners it starts, land a
  // task after the press.
  const openDisplay = async () => {
    await userEvent.click(summary);
    await waitFor(() => expect(display.open).toBe(true));
    await new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
  };
  for (const width of inBrowserGate ? [320, 375, 390] : [window.innerWidth]) {
    if (inBrowserGate) {
      const { page } = await import("vitest/browser");
      await page.viewport(width, 844);
      await waitFor(() => expect(window.innerWidth).toBe(width));
    }
    const onScreen = async (element: Element, name: string) => {
      const box = element.getBoundingClientRect();
      await expect(box.width, `${name} is rendered at ${width}px`).toBeGreaterThan(0);
      await expect(box.left, `${name} left edge at ${width}px`).toBeGreaterThanOrEqual(0);
      await expect(box.right, `${name} right edge at ${width}px`).toBeLessThanOrEqual(width);
    };

    await openDisplay();
    await onScreen(display.querySelector(".eb-display-panel")!, "Display panel");
    const order = within(display).getByRole("button", { name: "Order: Recommended" });
    await onScreen(order, "Order button");
    await expect(within(order).getByText("Recommended")).toBeVisible();
    for (const view of within(display).getAllByRole("button", { name: / view$/ })) await onScreen(view, "View button");

    await userEvent.click(order);
    const menu = within(display).getByRole("group", { name: "Order" });
    await onScreen(menu, "Order menu");
    // The menu hangs from the Order button's left edge, inside the panel.
    await expect(Math.abs(menu.getBoundingClientRect().left - order.getBoundingClientRect().left), `Order menu starts at its button at ${width}px`).toBeLessThanOrEqual(1);

    // The first Escape belongs to the Order menu, the second to Display.
    await userEvent.keyboard("{Escape}");
    await expect(order).toHaveAttribute("aria-expanded", "false");
    await expect(order).toHaveFocus();
    expect(display.open).toBe(true);
    await userEvent.keyboard("{Escape}");
    expect(display.open).toBe(false);
    await expect(summary).toHaveFocus();

    await openDisplay();
    await userEvent.click(canvas.getByRole("button", { name: "Open sample event" }));
    expect(display.open).toBe(false);
  }
}
export const MobileDisplayPanel: Story = {
  globals: { viewport: { value: "radiusMobileNarrow", isRotated: false } },
  play: displayPanel,
};
