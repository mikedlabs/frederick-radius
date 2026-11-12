import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, userEvent, within } from "storybook/test";
import SearchInput from "./SearchInput";
import { NATIVE_REQUEST_ENTRY_KEY } from "./native-request-return";

const meta = {
  title: "Search/Native request editing",
  component: SearchInput,
  parameters: { layout: "padded", nextjs: { navigation: { pathname: "/search" } } },
  beforeEach: () => {
    const state: unknown = window.history.state;
    const href = window.location.href;
    return () => window.history.replaceState(state, "", href);
  },
  args: { scope: "brunswick", returnTo: "/today?in=brunswick" },
} satisfies Meta<typeof SearchInput>;
export default meta;
type Story = StoryObj<typeof meta>;

export const EditingAt390: Story = {
  globals: { viewport: { value: "radiusMobile", isRotated: false } },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const input = canvas.getByRole("searchbox", { name: "Search Frederick County" });
    await userEvent.type(input, "coffee & tea");
    await expect(input).toHaveValue("coffee & tea");
    await expect(window.history.state[NATIVE_REQUEST_ENTRY_KEY].draft).toEqual({ kind: "search", query: "coffee & tea" });
    await userEvent.click(canvas.getByRole("button", { name: "Clear" }));
    await expect(input).toHaveValue("");
    await expect(window.history.state[NATIVE_REQUEST_ENTRY_KEY].draft.query).toBe("");
  },
};
/**
 * An empty field at 320px stays inside the viewport and declares an ellipsis
 * for a placeholder longer than the field. A browser exposes no measurement
 * of how a placeholder is painted, so the painted result is checked by eye
 * at this viewport; this play guards the two things that can regress.
 */
export const EmptyPlaceholderAt320: Story = {
  globals: { viewport: { value: "radiusMobileNarrow", isRotated: false } },
  play: async ({ canvasElement }) => {
    const input = within(canvasElement).getByRole("searchbox", { name: "Search Frederick County" });
    await expect(getComputedStyle(input).textOverflow).toBe("ellipsis");
    await expect(input.getBoundingClientRect().right).toBeLessThanOrEqual(
      canvasElement.ownerDocument.documentElement.clientWidth,
    );
  },
};
export const UrlRequestAt320: Story = {
  args: { defaultValue: "coffee & tea" },
  globals: { viewport: { value: "radiusMobileNarrow", isRotated: false } },
};


export const NativeGetKeepsContext: Story = {
  args: { defaultValue: "coffee & tea", scope: "county", kind: "place", returnTo: "/map?q=coffee&in=brunswick" },
  play: async ({ canvasElement }) => {
    const form = canvasElement.querySelector("form")!;
    await expect(form.getAttribute("action")).toBe("/search");
    await expect(form.method).toBe("get");
    // The browser's actual successful controls also work without interception.
    await expect(Array.from(new FormData(form).entries())).toEqual([
      ["q", "coffee & tea"], ["returnTo", "/map?q=coffee&in=brunswick"], ["in", "county"], ["kind", "place"],
    ]);
  },
};
