import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import ItineraryButton from "./ItineraryButton";
const meta = {
  title: "Saved/Day Plan action", component: ItineraryButton, tags: ["autodocs"],
  parameters: { layout: "centered", nextjs: { appDirectory: true } },
  args: { eventId: "workshop-day-plan-event", eventTitle: "Community concert" },
} satisfies Meta<typeof ItineraryButton>;
export default meta;
type Story = StoryObj<typeof meta>;
export const AddToDayPlan: Story = {};
