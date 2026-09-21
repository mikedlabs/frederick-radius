import type { Meta, StoryObj } from "@storybook/react";
import EmptyState, { CompactEmptyState } from "./EmptyState";
import { Calendar, Search, MapPin, Coffee, CloudOff } from "lucide-react";

const meta: Meta<typeof EmptyState> = {
  title: "UI/EmptyState",
  component: EmptyState,
  parameters: {
    layout: "padded",
  },
  tags: ["autodocs"],
};

export default meta;
type Story = StoryObj<typeof EmptyState>;

export const Default: Story = {
  args: {
    icon: Calendar,
    title: "Nothing on tonight's calendar yet.",
    body: "Try a wider time window, or come back later in the day.",
    tone: "quiet",
  },
};

export const WithCTA: Story = {
  args: {
    icon: Search,
    title: "No places match your filters.",
    body: "Remove a filter below to widen the search.",
    tone: "brand",
    cta: { label: "Reset filters", href: "/map" },
  },
};

export const WithBothLinks: Story = {
  args: {
    icon: MapPin,
    title: "Nothing saved yet.",
    body: "Tap the bookmark icon on any place or event to keep it here.",
    tone: "positive",
    cta: { label: "Explore places", href: "/map" },
    secondary: { label: "See upcoming events", href: "/events" },
  },
};

export const Caution: Story = {
  args: {
    icon: CloudOff,
    title: "Event calendar is incomplete.",
    body: "Some event sources timed out. The calendar shown may be missing upcoming events.",
    tone: "caution",
    cta: { label: "Try again", href: "/events" },
  },
};

export const Compact: Story = {
  args: {
    icon: Coffee,
    title: "No coffee shops open right now.",
    body: "Try removing the open-now filter.",
    tone: "quiet",
    compact: true,
  },
};

export const CompactWithAction: Story = {
  render: () => (
    <CompactEmptyState
      icon={Calendar}
      title="No events match"
      body="Try a wider time window"
      action={{ label: "Show all", onClick: () => alert("Show all clicked") }}
    />
  ),
};

export const MobileNarrow: Story = {
  args: {
    icon: Search,
    title: "No search results.",
    body: "Try a different search term or browse the map instead.",
    tone: "quiet",
    cta: { label: "Browse map", href: "/map" },
  },
  parameters: {
    viewport: {
      defaultViewport: "mobile1",
    },
  },
};
