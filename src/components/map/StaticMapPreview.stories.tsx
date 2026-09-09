import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import StaticMapPreview from "./StaticMapPreview";

const meta = {
  title: "Radius Chrome/Static map preview",
  component: StaticMapPreview,
  parameters: { layout: "centered" },
  args: {
    src: "data:image/png;base64,broken",
    alt: "Event venue map",
    width: 640,
    height: 320,
    className: "h-40 w-80 rounded-[var(--app-radius-md)]",
  },
} satisfies Meta<typeof StaticMapPreview>;

export default meta;
type Story = StoryObj<typeof meta>;
export const Unavailable: Story = {};
