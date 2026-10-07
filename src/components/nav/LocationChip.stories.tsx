import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, userEvent, within } from "storybook/test";

import { NEAR_ME_BENEFIT } from "@/lib/scope";
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
          "The one shared area control. An unset scope reads Whole county. Phone headers narrower than 448px have room only for the complete short word County, and wider headers show the full label. Near me explains what location is for before the browser can ask.",
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

export const WholeCountyOnDesktop: Story = {
  globals: {
    viewport: { value: "radiusDesktop", isRotated: false },
  },
  play: async ({ canvasElement }) => {
    const chip = within(canvasElement).getByRole("button", {
      name: /Current scope: Whole county$/,
    });
    await expect(
      chip.querySelector('[data-location-scope-label="full"]'),
    ).toHaveTextContent("Whole county");
  },
};

export const NearMeExplainsBeforeAsking: Story = {
  globals: {
    viewport: { value: "radiusMobile", isRotated: false },
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(
      canvas.getByRole("button", { name: /Current scope: Whole county$/ }),
    );
    await expect(
      await canvas.findByRole("button", { name: "Near me" }),
    ).toHaveAccessibleDescription(NEAR_ME_BENEFIT);
  },
};

export const ExplicitBrunswick: Story = {
  args: { compact: true },
  parameters: { nextjs: { navigation: { pathname: "/map", query: { in: "brunswick", q: "coffee" } } } },
  globals: { viewport: { value: "radiusMobile", isRotated: false } },
};
