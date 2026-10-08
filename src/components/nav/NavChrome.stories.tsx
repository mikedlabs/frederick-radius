import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, waitFor, within } from "storybook/test";
import TopBar from "./TopBar";
import BottomNav from "./BottomNav";
import SideRail from "./SideRail";

const meta = {
  title: "Radius Chrome/Navigation",
  component: TopBar,
  tags: ["autodocs"],
  parameters: {
    layout: "fullscreen",
    docs: {
      description: {
        component: "The shared navigation keeps four pages and the existing search doorway. A filled Brick state identifies the selected page; raised Cream surfaces keep controls legible over the page.",
      },
    },
  },
  render: () => (
    <>
      <TopBar />
      <main className="mx-auto max-w-screen-md px-4 py-8 lg:pl-24">
        <h1 className="text-2xl font-semibold">Navigation workshop</h1>
        <p className="mt-2 text-sm">Check the current page, keyboard focus, and touch targets at each viewport.</p>
      </main>
      <BottomNav />
      <SideRail />
    </>
  ),
} satisfies Meta<typeof TopBar>;

export default meta;
type Story = StoryObj<typeof meta>;

export const TodayAt320: Story = {
  globals: { viewport: { value: "radiusMobileNarrow", isRotated: false } },
  parameters: { nextjs: { navigation: { pathname: "/today" } } },
};

export const SavedAt390: Story = {
  globals: { viewport: { value: "radiusMobile", isRotated: false } },
  parameters: { nextjs: { navigation: { pathname: "/my-radius" } } },
  play: async ({ canvasElement }) => {
    const navigation = within(canvasElement).getByRole("navigation", { name: "Primary" });
    const map = within(navigation).getByRole("link", { name: "Map" });
    const saved = within(navigation).getByRole("link", { name: "Saved" });
    map.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, button: 0, pointerType: "touch", isPrimary: true }));
    await waitFor(() => expect(navigation).toHaveAttribute("aria-busy", "true"));
    expect(saved).toHaveAttribute("data-selected", "true");
    expect(map).toHaveAttribute("data-selected", "false");
    map.dispatchEvent(new PointerEvent("pointercancel", { bubbles: true, pointerType: "touch", isPrimary: true }));
    await waitFor(() => expect(navigation).toHaveAttribute("aria-busy", "false"));
    expect(saved).toHaveAttribute("data-selected", "true");
  },
};

export const CountyStatusAt430: Story = {
  globals: { viewport: { value: "radiusMobileLarge", isRotated: false } },
  parameters: { nextjs: { navigation: { pathname: "/pulse" } } },
};

export const SavedAt375: Story = {
  ...SavedAt390,
  globals: { viewport: { value: "radiusMobileCompact", isRotated: false } },
};

export const SavedAt430: Story = {
  ...SavedAt390,
  globals: { viewport: { value: "radiusMobileLarge", isRotated: false } },
};

export const DesktopEvents: Story = {
  globals: { viewport: { value: "radiusDesktop", isRotated: false } },
  parameters: { nextjs: { navigation: { pathname: "/events" } } },
};
