import type { Meta, StoryObj } from "@storybook/react";
import FeedStatus, { FeedStatusGroup } from "./FeedStatus";

const meta: Meta<typeof FeedStatus> = {
  title: "UI/FeedStatus",
  component: FeedStatus,
  parameters: {
    layout: "padded",
  },
  tags: ["autodocs"],
};

export default meta;
type Story = StoryObj<typeof FeedStatus>;

export const Loading: Story = {
  args: {
    status: "loading",
    source: "live buses",
  },
};

export const Error: Story = {
  args: {
    status: "error",
    source: "TransIT feed",
    onRetry: () => alert("Retry clicked"),
  },
};

export const Stale: Story = {
  args: {
    status: "stale",
    source: "live buses",
    detail: "last update 2 min ago",
  },
};

export const Degraded: Story = {
  args: {
    status: "degraded",
    source: "event calendar",
    detail: "arrival estimates unavailable",
  },
};

export const Empty: Story = {
  args: {
    status: "empty",
    source: "buses",
    detail: "service resumes at 6 AM",
  },
};

export const MultipleStatuses: Story = {
  render: () => (
    <FeedStatusGroup>
      <FeedStatus
        status="stale"
        source="live buses"
        detail="last update 90s ago"
      />
      <FeedStatus
        status="error"
        source="weather radar"
        onRetry={() => alert("Retry weather")}
      />
      <FeedStatus
        status="loading"
        source="traffic cameras"
      />
    </FeedStatusGroup>
  ),
};

export const MobileView: Story = {
  render: () => (
    <div style={{ maxWidth: 375, margin: "0 auto" }}>
      <FeedStatusGroup>
        <FeedStatus
          status="degraded"
          source: "event feeds"
          detail: "2 of 5 calendars"
        />
        <FeedStatus
          status="stale"
          source="live buses"
          detail="delayed 2 min"
        />
      </FeedStatusGroup>
    </div>
  ),
  parameters: {
    viewport: {
      defaultViewport: "mobile1",
    },
  },
};
