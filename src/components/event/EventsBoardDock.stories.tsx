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
