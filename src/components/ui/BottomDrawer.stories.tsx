import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { Droplets, MapPin, Navigation, Toilet } from "lucide-react";
import { useRef, useState } from "react";
import { Toaster, toast } from "sonner";
import { expect, userEvent, waitFor, within } from "storybook/test";

import BottomDrawer from "./BottomDrawer";
import { Button } from "./Button";
import { Chip } from "./Chip";
import SectionHeading from "./SectionHeading";

const meta = {
  title: "Radius UI/BottomDrawer",
  component: BottomDrawer,
  tags: ["autodocs"],
  parameters: {
    layout: "fullscreen",
    docs: {
      description: {
        component:
          "The shared mobile detail layer. Vaul supplies drag, focus trapping, Escape handling and scroll locking. Radius supplies an opaque surface, a 760 pixel cap from the tablet breakpoint, the Back rule (`historyLayerId`) and a toast that stays usable above the drawer.",
      },
    },
  },
  args: {
    title: "Nearby essentials",
    children: null,
  },
} satisfies Meta<typeof BottomDrawer>;

export default meta;
type Story = StoryObj<typeof meta>;

type DrawerFixtureProps = {
  initiallyOpen?: boolean;
  surface?: "solid" | "translucent";
  width?: "standard" | "wide";
  historyLayerId?: string;
};

function DrawerFixture({ initiallyOpen = false, surface, width, historyLayerId }: DrawerFixtureProps) {
  const [open, setOpen] = useState(initiallyOpen);

  return (
    <main className="min-h-screen p-4" style={{ background: "var(--app-bg)" }}>
      <div className="mx-auto max-w-md space-y-3">
        <p className="text-sm leading-relaxed" style={{ color: "var(--app-ink-2)" }}>
          Keep the map in place while checking nearby mapped public amenities.
        </p>
        <Button
          onClick={() => setOpen(true)}
          iconLeft={<MapPin className="h-4 w-4" aria-hidden />}
        >
          Show nearby essentials
        </Button>
      </div>

      <BottomDrawer
        open={open}
        onOpenChange={setOpen}
        title="Nearby essentials"
        subtitle="Example results from a confirmed starting point."
        surface={surface}
        width={width}
        historyLayerId={historyLayerId}
      >
        <div className="mx-auto max-w-xl space-y-5 px-4 py-4">
          <SectionHeading title="Closest mapped amenities" count={2} size="sm" />

          <ul aria-label="Closest mapped amenities" className="space-y-3">
            <li
              className="rounded-[var(--app-radius-md)] border p-3"
              style={{ background: "var(--app-bg-elevated)", borderColor: "var(--app-border)" }}
            >
              <div className="flex items-start gap-3">
                <span
                  aria-hidden
                  className="grid h-10 w-10 shrink-0 place-items-center rounded-full"
                  style={{ background: "var(--app-cool-tint-14)", color: "var(--app-cool)" }}
                >
                  <Toilet className="h-5 w-5" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="font-semibold" style={{ color: "var(--app-ink)" }}>
                    Public restroom
                  </p>
                  <p className="mt-0.5 text-xs" style={{ color: "var(--app-ink-2)" }}>
                    Exact location and source details appear here for the selected mapped point.
                  </p>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    <Chip tone="cool">Mapped point</Chip>
                    <Chip tone="warning">Hours not recently verified</Chip>
                  </div>
                </div>
              </div>
            </li>

            <li
              className="rounded-[var(--app-radius-md)] border p-3"
              style={{ background: "var(--app-bg-elevated)", borderColor: "var(--app-border)" }}
            >
              <div className="flex items-start gap-3">
                <span
                  aria-hidden
                  className="grid h-10 w-10 shrink-0 place-items-center rounded-full"
                  style={{ background: "var(--app-cool-tint-14)", color: "var(--app-cool)" }}
                >
                  <Droplets className="h-5 w-5" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="font-semibold" style={{ color: "var(--app-ink)" }}>
                    Drinking water
                  </p>
                  <p className="mt-0.5 text-xs" style={{ color: "var(--app-ink-2)" }}>
                    Radius keeps the public source visible and does not guess availability.
                  </p>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    <Chip tone="cool">Distance after location</Chip>
                    <Chip tone="neutral">OpenStreetMap source</Chip>
                  </div>
                </div>
              </div>
            </li>
          </ul>

          <div className="flex flex-col gap-2 min-[360px]:flex-row">
            <Button
              className="flex-1"
              iconRight={<Navigation className="h-4 w-4" aria-hidden />}
            >
              Open walking directions
            </Button>
            <Button className="flex-1" variant="secondary" href="/map?amenity=restroom,water">
              See both on the map
            </Button>
          </div>
        </div>
      </BottomDrawer>
    </main>
  );
}

export const Triggered: Story = {
  render: () => <DrawerFixture />,
};

export const OpenAt375: Story = {
  globals: {
    viewport: { value: "radiusMobileCompact", isRotated: false },
  },
  render: () => <DrawerFixture initiallyOpen />,
};

export const OpenAt320: Story = {
  globals: {
    viewport: { value: "radiusMobileNarrow", isRotated: false },
  },
  render: () => <DrawerFixture initiallyOpen />,
};

export const TranslucentSurface: Story = {
  parameters: {
    docs: { description: { story: "Drawers are opaque by default so the page beneath never reads through the controls. The translucent surface is an explicit choice for a short, light panel over a calm background." } },
  },
  render: () => <DrawerFixture initiallyOpen surface="translucent" />,
};

async function openDrawerFrame(): Promise<DOMRect> {
  const drawer = await within(document.body).findByRole("dialog", { name: "Nearby essentials" });
  // Vaul slides the panel in. The horizontal frame is final from the first frame.
  return drawer.getBoundingClientRect();
}

export const StandardWidthAtDesktop: Story = {
  globals: {
    viewport: { value: "radiusDesktop", isRotated: false },
  },
  parameters: {
    docs: { description: { story: "From the tablet breakpoint the drawer is a centered panel no wider than 760 pixels, the same measure as BottomSheet, and it stays attached to the bottom edge." } },
  },
  render: () => <DrawerFixture initiallyOpen />,
  play: async () => {
    const frame = await openDrawerFrame();
    await expect(frame.width).toBeLessThanOrEqual(760);
    await expect(Math.abs(frame.left - (window.innerWidth - frame.width) / 2)).toBeLessThanOrEqual(1);
  },
};

export const WideAtDesktop: Story = {
  globals: {
    viewport: { value: "radiusDesktop", isRotated: false },
  },
  parameters: {
    docs: { description: { story: "A drawer whose content was laid out for the full window, such as the Fair vendor grid, opts out of the cap." } },
  },
  render: () => <DrawerFixture initiallyOpen width="wide" />,
  play: async () => {
    const frame = await openDrawerFrame();
    await expect(Math.round(frame.width)).toBe(document.documentElement.clientWidth);
  },
};

export const BackClosesInPlace: Story = {
  parameters: {
    docs: { description: { story: "With a history layer the drawer pushes one entry when it opens. Back closes it without leaving the page and returns focus to the opener." } },
  },
  render: () => <DrawerFixture historyLayerId="story-nearby-essentials" />,
  play: async ({ canvasElement }) => {
    const body = within(document.body);
    const launcher = within(canvasElement).getByRole("button", { name: "Show nearby essentials" });
    const here = window.location.href;
    const originalState: unknown = window.history.state;
    await userEvent.click(launcher);
    await body.findByRole("dialog", { name: "Nearby essentials" });
    // The pushed entry is read from its own state. history.length cannot
    // prove it: a forward entry left by an earlier Back makes a push replace
    // that entry, so the count stays the same.
    await waitFor(() => expect(window.history.state?.__frederickRadiusLayer).toBe("story-nearby-essentials"));
    window.history.back();
    await waitFor(() => expect(body.queryByRole("dialog", { name: "Nearby essentials" })).not.toBeInTheDocument());
    await expect(window.location.href).toBe(here);
    await expect(window.history.state).toEqual(originalState);
    await waitFor(() => expect(launcher).toHaveFocus());
  },
};

function ToastFixture() {
  const [open, setOpen] = useState(false);
  const [undone, setUndone] = useState(0);
  return (
    <main className="min-h-screen space-y-3 p-4" style={{ background: "var(--app-bg)" }}>
      <Button onClick={() => setOpen(true)}>Open drawer with a toast</Button>
      <p role="status" className="text-sm" style={{ color: "var(--app-ink-2)" }}>
        Toast actions run: {undone}.
      </p>
      <BottomDrawer
        open={open}
        onOpenChange={setOpen}
        title="Toast above a drawer"
        subtitle="Pressing the toast does not count as pressing outside the drawer."
      >
        <div className="p-4">
          <Button
            onClick={() => toast("Added to My Day.", {
              duration: Infinity,
              action: { label: "Undo", onClick: () => setUndone((count) => count + 1) },
            })}
          >
            Add to My Day
          </Button>
        </div>
      </BottomDrawer>
      {/* A modal drawer turns pointer events off for the page behind it, so
          the toast has to turn them back on for itself. */}
      <Toaster position="top-center" toastOptions={{ style: { pointerEvents: "auto" } }} />
    </main>
  );
}

export const ToastStaysReachable: Story = {
  parameters: {
    docs: { description: { story: "A toast raised while the drawer is open takes its own press: the action runs and the drawer stays open. Keyboard focus cannot leave a modal drawer, so feedback that starts inside one should also appear inside it." } },
  },
  render: () => <ToastFixture />,
  play: async ({ canvasElement }) => {
    const body = within(document.body);
    const outcomes = within(canvasElement).getByRole("status");
    await userEvent.click(within(canvasElement).getByRole("button", { name: "Open drawer with a toast" }));
    const drawer = await body.findByRole("dialog", { name: "Toast above a drawer" });
    await userEvent.click(within(drawer).getByRole("button", { name: "Add to My Day" }));
    const undo = await waitFor(() => {
      const action = document.querySelector<HTMLButtonElement>("[data-sonner-toaster] button[data-action]");
      if (!action) throw new Error("The toast action has not rendered yet.");
      return action;
    });
    await expect(drawer.contains(undo)).toBe(false);
    await userEvent.click(undo);
    await waitFor(() => expect(outcomes).toHaveTextContent("Toast actions run: 1."));
    await expect(drawer).toHaveAttribute("data-state", "open");
    await expect(body.getAllByRole("dialog")).toHaveLength(1);
  },
};


function EscapeDelegationFixture() {
  const [open, setOpen] = useState(false);
  const [panelOpen, setPanelOpen] = useState(false);
  const [innerCloses, setInnerCloses] = useState(0);
  const [outerCloses, setOuterCloses] = useState(0);
  const panelOpener = useRef<HTMLButtonElement>(null);
  const closePanel = () => {
    setPanelOpen(false);
    setInnerCloses((count) => count + 1);
    window.requestAnimationFrame(() => panelOpener.current?.focus());
  };
  return (
    <main className="min-h-screen space-y-3 p-4" style={{ background: "var(--app-bg)" }}>
      <Button onClick={() => setOpen(true)}>Open delegated drawer</Button>
      <p role="status" className="text-sm" style={{ color: "var(--app-ink-2)" }}>
        Inner closes: {innerCloses}. Outer closes: {outerCloses}.
      </p>
      <BottomDrawer
        open={open}
        onOpenChange={(nextOpen) => {
          setOpen(nextOpen);
          if (!nextOpen) setOuterCloses((count) => count + 1);
        }}
        title="Escape delegation"
        subtitle="The inner panel owns its first Escape; the drawer owns the next."
        onEscapeKeyDown={(event) => {
          if (event.target instanceof Element && event.target.closest("[data-owned-drawer-panel]")) event.preventDefault();
        }}
      >
        <div className="space-y-3 p-4">
          <div hidden={panelOpen}>
            <button
              ref={panelOpener}
              type="button"
              className="min-h-11 rounded-full px-3 text-sm font-semibold"
              style={{ color: "var(--app-link)" }}
              onClick={() => setPanelOpen(true)}
            >
              Open owned panel
            </button>
          </div>
          {panelOpen ? (
            <section
              aria-label="Owned panel"
              data-owned-drawer-panel
              onKeyDownCapture={(event) => {
                if (event.key !== "Escape") return;
                event.preventDefault();
                event.stopPropagation();
                closePanel();
              }}
              className="space-y-3"
            >
              <button
                type="button"
                autoFocus
                className="min-h-11 rounded-full px-3 text-sm font-semibold"
                style={{ color: "var(--app-link)" }}
                onClick={closePanel}
              >
                Back to drawer
              </button>
              <p className="text-sm" style={{ color: "var(--app-ink-2)" }}>
                This is a workshop panel within the existing drawer.
              </p>
            </section>
          ) : null}
        </div>
      </BottomDrawer>
    </main>
  );
}

export const EscapeDelegation: Story = {
  globals: {
    viewport: { value: "radiusMobileCompact", isRotated: false },
  },
  render: () => <EscapeDelegationFixture />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const body = within(document.body);
    const launcher = canvas.getByRole("button", { name: "Open delegated drawer" });
    const outcomes = canvas.getByRole("status");
    await userEvent.click(launcher);
    const drawer = await body.findByRole("dialog", { name: "Escape delegation" });
    const contents = within(drawer);
    const panelOpener = contents.getByRole("button", { name: "Open owned panel" });
    await userEvent.click(panelOpener);
    const panel = await contents.findByRole("region", { name: "Owned panel" });
    await waitFor(() => expect(within(panel).getByRole("button", { name: "Back to drawer" })).toHaveFocus());
    await expect(body.getAllByRole("dialog")).toHaveLength(1);
    await userEvent.keyboard("{Escape}");
    await waitFor(() => expect(contents.queryByRole("region", { name: "Owned panel" })).not.toBeInTheDocument());
    await expect(body.getByRole("dialog", { name: "Escape delegation" })).toBe(drawer);
    await expect(body.getAllByRole("dialog")).toHaveLength(1);
    await expect(outcomes).toHaveTextContent("Inner closes: 1. Outer closes: 0.");
    await waitFor(() => expect(panelOpener).toHaveFocus());
    await userEvent.keyboard("{Escape}");
    await waitFor(() => expect(body.queryByRole("dialog", { name: "Escape delegation" })).not.toBeInTheDocument());
    await expect(outcomes).toHaveTextContent("Inner closes: 1. Outer closes: 1.");
    await waitFor(() => expect(launcher).toHaveFocus());
  },
};
