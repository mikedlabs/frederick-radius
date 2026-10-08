import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import type { DaypartRow } from "@/lib/loaders/daypartPicks";
import DaypartNeeds from "./DaypartNeeds";

const row: DaypartRow = {
  category: "coffee",
  label: "Coffee",
  href: "/places?category=coffee",
  picks: [{ slug: "story-coffee", name: "Sample coffee place", rating: null, confidence: "confirmed", fact: "Open until 5pm.", where: "Frederick" }],
};

const meta = {
  title: "Today/Current place answer",
  component: DaypartNeeds,
  parameters: { layout: "centered" },
  decorators: [(Story) => <div data-app-primary-tab="/today" className="w-[min(38rem,calc(100vw-32px))]"><Story /></div>],
  args: { rows: [row], variant: "brief" },
  beforeEach: () => {
    const previousFetch = window.fetch;
    const fixtureFetch: typeof fetch = (input, init) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
      // A failed enhancement keeps the supplied, isolated story shelf.
      if (url.startsWith("/api/want?")) return Promise.resolve(new Response(null, { status: 503 }));
      return previousFetch(input, init);
    };
    window.fetch = fixtureFetch;
    return () => { if (window.fetch === fixtureFetch) window.fetch = previousFetch; };
  },
} satisfies Meta<typeof DaypartNeeds>;

export default meta;
type Story = StoryObj<typeof meta>;
export const ConfirmedCurrentPlace: Story = {};
export const OpeningSoon: Story = {
  args: {
    rows: [{ ...row, picks: [], openingSoon: { slug: "story-opening-soon", name: "Sample coffee place", rating: null, confidence: "confirmed", fact: "Opens at 9am.", where: "Frederick" } }],
  },
};
