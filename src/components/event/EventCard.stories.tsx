import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import type { EventWithMeta } from "@/lib/loaders/events";
import EventCard from "./EventCard";

const sample = {
  slug: "story-concert", title: "Community concert at Memorial Park", description: "",
  starts_at: "2026-09-10T18:00:00-04:00", ends_at: "2026-09-10T20:00:00-04:00",
  timezone: "America/New_York", address: "Memorial Park, Thurmont, MD", venue_name: "Memorial Park", municipality: "thurmont",
  municipality_name: "Thurmont", category: "music", category_name: "Music",
  audience: [], is_free: true, source: "manual", is_verified: false,
  source_id: "story", source_url: null, license: "Demonstration fixture", confidence: "curated",
  first_seen_at: "2026-09-01T12:00:00Z", last_verified_at: "2026-09-01T12:00:00Z",
  geom: { lng: -77.4, lat: 39.62 }, geo_confidence: "area",
} as EventWithMeta;

const meta = {
  title: "Events/Decision card", component: EventCard, tags: ["autodocs"],
  parameters: { layout: "centered" },
  decorators: [(Story) => <div className="w-[min(42rem,calc(100vw-24px))]"><Story /></div>],
  args: { event: sample, variant: "feature", nowISO: "2026-09-10T12:00:00-04:00" },
} satisfies Meta<typeof EventCard>;
export default meta;
type Story = StoryObj<typeof meta>;
export const NoPhotography: Story = {};
export const CountyComparison: Story = { args: { variant: "compact" } };
export const MissingEndAt320: Story = {
  globals: { viewport: { value: "radiusMobileNarrow", isRotated: false } },
  args: { event: { ...sample, ends_at: sample.starts_at }, variant: "glance" },
};
export const Online: Story = { args: { event: { ...sample, attendance_mode: "online" }, variant: "glance" } };
