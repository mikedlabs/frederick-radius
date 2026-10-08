import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import TodaySectionHeading from "./TodaySectionHeading";

const meta = {
  title: "Today/Section heading",
  component: TodaySectionHeading,
  tags: ["autodocs"],
  parameters: { layout: "centered" },
  decorators: [(Story) => <div data-app-primary-tab="/today" className="w-[min(38rem,calc(100vw-32px))]"><Story /></div>],
  args: { title: "Places for right now", meta: "Current hours and nearby options", href: "/places" },
} satisfies Meta<typeof TodaySectionHeading>;

export default meta;
type Story = StoryObj<typeof meta>;
export const NeutralSection: Story = {};
export const LiveSection: Story = { args: { title: "Happening now", live: true, href: "/events" } };
