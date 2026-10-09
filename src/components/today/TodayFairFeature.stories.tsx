import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import TodayFairFeature from "./TodayFairFeature";

const meta = {
  title: "Today/Fair feature",
  component: TodayFairFeature,
  parameters: { layout: "centered" },
  decorators: [(Story) => <div data-app-primary-tab="/today" className="w-[min(38rem,calc(100vw-32px))]"><Story /></div>],
  args: { phase: "planning" },
} satisfies Meta<typeof TodayFairFeature>;

export default meta;
type Story = StoryObj<typeof meta>;
export const PhotographFrame: Story = {};
export const BriefingRow: Story = { args: { briefing: true } };
