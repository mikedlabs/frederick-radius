import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { CalendarDays, CheckCircle2, Clock3, MapPinOff } from "lucide-react";

import EmptyState from "./EmptyState";

const meta = {
  title: "Radius UI/EmptyState",
  component: EmptyState,
  tags: ["autodocs"],
  parameters: {
    layout: "centered",
    docs: {
      description: {
        component:
          "The designed absence state. Copy says exactly what Radius can confirm, explains the gap and offers one useful next move.",
      },
    },
  },
  decorators: [
    (Story) => (
      <div className="w-[min(34rem,calc(100vw-24px))] p-3">
        <Story />
      </div>
    ),
  ],
  args: {
    icon: CalendarDays,
    title: "No events are on the calendar in this range.",
    body: "Try a wider time window from the filters above, or jump to the weekend.",
    cta: { label: "See this weekend", href: "/events?lens=weekend" },
  },
} satisfies Meta<typeof EmptyState>;

export default meta;
type Story = StoryObj<typeof meta>;

export const NoEventsInRange: Story = {};

export const HoursUnknown: Story = {
  args: {
    icon: Clock3,
    title: "Open hours are not confirmed here yet.",
    body: "Radius will not call this place closed without current hours. Check the official listing before you go.",
    tone: "brand",
    cta: { label: "See the official listing", href: "/places" },
  },
};
export const AmenityNotMapped: Story = {
  args: {
    icon: MapPinOff,
    title: "No public water fountain is mapped nearby yet.",
    body: "Radius will not substitute a different amenity or invent an answer. You can check every confirmed location on the map.",
    cta: { label: "Open the map", href: "/map?amenity=water" },
  },
};

export const NoActiveAlert: Story = {
  args: {
    icon: CheckCircle2,
    title: "No active county alerts are posted.",
    body: "Public safety, weather and travel sources are reporting normally in this preview.",
    tone: "positive",
    cta: undefined,
  },
};

export const LongHonestStateAt320: Story = {
  globals: {
    viewport: { value: "radiusMobileNarrow", isRotated: false },
  },
  args: {
    icon: Clock3,
    title: "No nearby places have recently verified open hours.",
    body: "There may still be places open. Radius does not have enough current hours data to make that claim, so the full list remains available.",
    tone: "brand",
    cta: { label: "See places with unknown hours", href: "/places" },
  },
};
