import type { Meta, StoryObj } from "@storybook/nextjs-vite";

import LocationChip from "./LocationChip";

const meta = {
  title: "Radius Chrome/Location scope",
  component: LocationChip,
  tags: ["autodocs"],
  parameters: {
    layout: "fullscreen",
    docs: {
      description: {
        component:
          "The one shared area control. Mobile widths show a complete short scope; larger screens restore the full place label.",
      },
    },
  },
  args: {
    compact: false,
  },
  render: (args) => (
    <header className="flex min-h-16 items-center justify-end px-4">
      <LocationChip {...args} />
    </header>
  ),
} satisfies Meta<typeof LocationChip>;

export default meta;
type Story = StoryObj<typeof meta>;

export const TodayAt390: Story = {
  globals: {
    viewport: { value: "radiusMobile", isRotated: false },
  },
};

export const MapAt320: Story = {
  args: {
    compact: true,
  },
  globals: {
    viewport: { value: "radiusMobileNarrow", isRotated: false },
  },
  render: (args) => (
    <header
      data-map-header="true"
      className="flex min-h-16 items-center justify-end px-4"
    >
      <LocationChip {...args} />
    </header>
  ),
};

export const DesktopFullLabel: Story = {
  globals: {
    viewport: { value: "radiusTablet", isRotated: false },
  },
};

export const ExplicitBrunswick: Story = {
  args: { compact: true },
  parameters: { nextjs: { navigation: { pathname: "/map", query: { in: "brunswick", q: "coffee" } } } },
  globals: { viewport: { value: "radiusMobile", isRotated: false } },
};

/** The real native URL/Back contract is covered by the compiled Tools journey. */
export const CompassWorkspace: Story = {
  args: { compact: true },
  parameters: { nextjs: { navigation: { pathname: "/compass", query: { in: "thurmont", chapter: "go-out" } } } },
  globals: { viewport: { value: "radiusMobile", isRotated: false } },
};
