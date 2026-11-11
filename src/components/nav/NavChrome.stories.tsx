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
        component: "The shared navigation keeps four pages and the existing search doorway. The chrome is flat: unboxed ink tools in the header and a tab bar attached to the screen edge. A 2px coral rule, a 700 label and a heavier icon stroke mark the selected page; a pending tap shows the same rule in ink at reduced opacity.",
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
    expect(map).toHaveAttribute("data-pending", "true");
    expect(map).not.toHaveAttribute("aria-current");
    expect(saved).toHaveAttribute("data-selected", "true");
    expect(map).toHaveAttribute("data-selected", "false");
    // Plain tool marks: a visible rule on both, solid coral for the current
    // page and translucent ink for the pending one, with a 700 current label.
    const rule = (link: HTMLElement) => getComputedStyle(link.firstElementChild as HTMLElement);
    expect(rule(saved).backgroundColor).not.toBe("rgba(0, 0, 0, 0)");
    expect(Number(rule(saved).opacity)).toBe(1);
    expect(rule(map).backgroundColor).not.toBe("rgba(0, 0, 0, 0)");
    expect(Number(rule(map).opacity)).toBeLessThan(1);
    expect(getComputedStyle(within(saved).getByText("Saved")).fontWeight).toBe("700");
    expect(getComputedStyle(saved).backgroundImage).toBe("none");
    map.dispatchEvent(new PointerEvent("pointercancel", { bubbles: true, pointerType: "touch", isPrimary: true }));
    await waitFor(() => expect(navigation).toHaveAttribute("aria-busy", "false"));
    expect(map).toHaveAttribute("data-pending", "false");
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
