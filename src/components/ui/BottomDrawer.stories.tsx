import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { Droplets, MapPin, Navigation, Toilet } from "lucide-react";
import { useState } from "react";

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
          "The shared mobile detail layer. Vaul supplies drag, focus trapping, Escape handling and scroll locking while Radius supplies the surface and content hierarchy.",
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

function DrawerFixture({ initiallyOpen = false, surface = "default" }: { initiallyOpen?: boolean; surface?: "default" | "solid" }) {
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

export const SolidSurface: Story = {
  parameters: {
    docs: { description: { story: "An opaque detail layer for vendor information or dense text over a busy map. Existing drawers retain their default surface." } },
  },
  render: () => <DrawerFixture initiallyOpen surface="solid" />,
};
