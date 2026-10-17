import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, userEvent, waitFor, within } from "storybook/test";
import TopBar from "./TopBar";
import BottomNav from "./BottomNav";
import SideRail from "./SideRail";
import { getRouter } from "@storybook/nextjs-vite/navigation.mock";

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
  play: async ({ canvasElement }) => {
    const originalState: unknown = window.history.state;
    const router = getRouter();
    router.prefetch.mockClear();
    try {
      const tools = within(canvasElement).getByRole("link", { name: "Open tools" });
      await expect(tools.getBoundingClientRect().height).toBeGreaterThanOrEqual(44);
      await expect(tools.getBoundingClientRect().width).toBeGreaterThanOrEqual(44);
      await expect(tools).toHaveAttribute("href", "/compass");
      await userEvent.click(tools);
      await expect(tools).toHaveFocus();
      await expect(router.prefetch).toHaveBeenCalledWith("/compass");
      // The installed Vite Next link mock prevents default before the consumer
      // handler. The app must honor that cancellation; native return behavior
      // is covered by the real browser journeys and the component regression.
      await expect(window.history.state).toEqual(originalState);
    } finally { window.history.replaceState(originalState, "", window.location.href); }
  },
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

export const MapAt320LargeText: Story = {
  globals: { viewport: { value: "radiusMobileNarrow", isRotated: false } },
  parameters: { nextjs: { navigation: { pathname: "/map" } } },
  beforeEach: () => {
    const previous = document.documentElement.style.fontSize;
    document.documentElement.style.fontSize = "200%";
    return () => {
      document.documentElement.style.fontSize = previous;
    };
  },
  play: async ({ canvasElement }) => {
    const navigation = within(canvasElement).getByRole("navigation", { name: "Primary" });
    await expect(navigation).toHaveAttribute("data-app-tabbar");
    await expect(navigation.getBoundingClientRect().height).toBeLessThanOrEqual(56);
    const map = within(navigation).getByRole("link", { name: "Map" });
    await expect(map.getBoundingClientRect().height).toBeLessThanOrEqual(48);
    await expect(map.getBoundingClientRect().height).toBeGreaterThanOrEqual(44);
  },
};
