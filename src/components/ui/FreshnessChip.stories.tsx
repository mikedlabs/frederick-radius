import type { Meta, StoryObj } from "@storybook/nextjs-vite";

import FreshnessChip from "./FreshnessChip";

const HOUR = 3_600_000;
const DAY = 24 * HOUR;
// Relative to when the story loads, so each tier renders as it would live.
const hoursAgo = (hours: number) => new Date(Date.now() - hours * HOUR).toISOString();
const daysAgo = (days: number) => new Date(Date.now() - days * DAY).toISOString();

const meta = {
  title: "Radius UI/FreshnessChip",
  component: FreshnessChip,
  tags: ["autodocs"],
  parameters: {
    layout: "centered",
    docs: {
      description: {
        component:
          "The visible age of one timestamped fact, in the trust-language vocabulary. A real check reads \"Hours checked at source · 4 hours ago\"; an automated feed row reads \"Calendar read 1 hour ago\". Inside a day the age is relative, then it is a date such as \"Jun 15\". Old checks drop to a muted, then a stale tier.",
      },
    },
  },
  args: {
    iso: hoursAgo(4),
    subject: "Hours",
    basis: "checked",
  },
  argTypes: {
    subject: { control: "select", options: ["Listing", "Hours", "Event"] },
    basis: { control: "inline-radio", options: ["checked", "feed"] },
  },
} satisfies Meta<typeof FreshnessChip>;

export default meta;
type Story = StoryObj<typeof meta>;

export const CheckedAtSource: Story = {};

export const CalendarRead: Story = {
  args: { iso: hoursAgo(1), subject: "Event", basis: "feed" },
};

export const AgeTiers: Story = {
  render: () => (
    <div className="flex max-w-sm flex-col items-start gap-2 p-4">
      <FreshnessChip iso={daysAgo(3)} subject="Hours" />
      <FreshnessChip iso={daysAgo(40)} subject="Listing" />
      <FreshnessChip iso={daysAgo(200)} subject="Listing" />
      <FreshnessChip iso={daysAgo(2)} subject="Event" basis="feed" />
    </div>
  ),
};
