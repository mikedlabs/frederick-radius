import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, userEvent, within } from "storybook/test";
import LocalNewsBriefView, { LocalNewsLoading } from "./LocalNewsBriefView";

const meta = {
  title: "Today/Local news",
  component: LocalNewsBriefView,
  parameters: { layout: "centered" },
  decorators: [(Story) => (
    <div data-app-primary-tab="/today" className="w-[min(38rem,calc(100vw-32px))]">
      <Story />
    </div>
  )],
  args: {
    news: {
      status: "available",
      items: [
        { title: "County announces a public workshop on its capital plan", source: "Local publisher",
          url: "https://news.google.com/rss/articles/fixture-county", published_at: "2026-10-08T14:15:00.000Z" },
        { title: "Library announces weekend hours for the fall", source: "Another local publisher",
          url: "https://news.google.com/rss/articles/fixture-library", published_at: "2026-10-08T12:00:00.000Z" },
        { title: "Brunswick invites residents to a community meeting", source: "Local publisher",
          url: "https://news.google.com/rss/articles/fixture-brunswick", published_at: "2026-10-07T17:00:00.000Z" },
      ],
    },
    official: {
      status: "available",
      items: [
        { title: "County announces a community listening session", source: "Frederick County", sourceShort: "County",
          url: "https://www.frederickcountymd.gov/CivicAlerts.aspx?AID=fixture-county",
          publishedAt: "2026-10-08T13:00:00.000Z", lane: "civic" },
        { title: "City publishes its meeting schedule", source: "City of Frederick", sourceShort: "City",
          url: "https://www.cityoffrederickmd.gov/CivicAlerts.aspx?AID=fixture-city",
          publishedAt: "2026-10-07T15:00:00.000Z", lane: "civic" },
      ],
    },
  },
} satisfies Meta<typeof LocalNewsBriefView>;

export default meta;
type Story = StoryObj<typeof meta>;

export const AttributedHeadlines: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByRole("heading", { name: "Local news" })).toBeVisible();
    await expect(canvas.getByText("Published Oct 8, 2026, 10:15 AM EDT")).toBeVisible();
    const lead = canvas.getByRole("link", { name: /County announces a public workshop/ });
    await expect(lead).toHaveAttribute("href", "https://news.google.com/rss/articles/fixture-county");
    await expect(lead).toHaveAttribute("target", "_blank");
    await expect(lead).toHaveAttribute("rel", "noopener noreferrer");
    await expect(canvas.getByRole("link", { name: "All headlines" })).toHaveAttribute("href", "/pulse?open=news");
    const official = canvas.getByText("County announces a community listening session");
    await expect(official).not.toBeVisible();
    await userEvent.click(canvas.getByText("Official updates"));
    await expect(official).toBeVisible();
    await expect(canvas.getByText("City of Frederick")).toBeVisible();
  },
};

export const UndatedHeadline: Story = {
  args: {
    news: { status: "available", items: [{ ...meta.args.news.items[0], published_at: null }] },
    official: { status: "available", items: [] },
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByText("Publication date unavailable")).toBeVisible();
    await expect(canvasElement.querySelector("time")).toBeNull();
  },
};

export const OlderPublication: Story = {
  args: {
    news: { status: "available", items: [{ ...meta.args.news.items[0], published_at: "2026-10-01T14:15:00.000Z" }] },
  },
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).getByText("Published Oct 1, 2026, 10:15 AM EDT")).toBeVisible();
  },
};

export const PartialFeeds: Story = {
  args: {
    news: { ...meta.args.news, status: "partial" },
    official: { ...meta.args.official, status: "partial" },
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByText("Some local headline feeds are unavailable. Available stories are shown below.")).toBeVisible();
    await expect(canvas.getByText(meta.args.news.items[0].title)).toBeVisible();
    await expect(canvas.getByText("Partial")).toBeVisible();
    await userEvent.click(canvas.getByText("Official updates"));
    await expect(canvas.getByText("Some official newsroom feeds are unavailable. Available updates are shown below.")).toBeVisible();
  },
};

export const UnavailableFeeds: Story = {
  args: { news: { items: [], status: "unavailable" }, official: { items: [], status: "unavailable" } },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByText("Local headlines are unavailable right now.")).toBeVisible();
    await expect(canvas.getByText("Unavailable", { exact: true })).toBeVisible();
    await expect(canvas.queryByText("No local headlines were returned by these feeds.")).not.toBeInTheDocument();
    await userEvent.click(canvas.getByText("Official updates"));
    await expect(canvas.getByText("Official city and county updates are unavailable right now.")).toBeVisible();
  },
};

export const SuccessfulEmptyFeeds: Story = {
  args: { news: { items: [], status: "available" }, official: { items: [], status: "available" } },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByText("No local headlines were returned by these feeds.")).toBeVisible();
    await userEvent.click(canvas.getByText("Official updates"));
    await expect(canvas.getByText("No civic updates were returned by these newsrooms.")).toBeVisible();
    await expect(canvas.queryByText("Unavailable", { exact: true })).not.toBeInTheDocument();
  },
};

export const LoadingHeadlines: Story = {
  render: () => <LocalNewsLoading />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByRole("region", { name: "Local news" })).toHaveAttribute("aria-busy", "true");
    await expect(canvas.getByText("Local headlines are loading.")).toBeVisible();
  },
};
