import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, userEvent, waitFor, within } from "storybook/test";
import PreferencesPanel from "./PreferencesPanel";
import { applyAppearance, getAppearance } from "@/lib/appearance";

/**
 * Settings in the plain tool direction: 13px uppercase section labels over
 * ruled rows on the page ground. Only real controls keep a 6px border, the
 * selected state is an ink fill, switches stay capsules, and the page has
 * no coral field. The play functions also hold every target at 44px.
 */

/** Snapshot the device-local keys this panel writes, and put them back. */
function isolateStorage() {
  const snapshot = new Map<string, string>();
  for (let i = 0; i < window.localStorage.length; i++) {
    const key = window.localStorage.key(i);
    if (key && key.startsWith("fr")) snapshot.set(key, window.localStorage.getItem(key) ?? "");
  }
  for (const key of snapshot.keys()) window.localStorage.removeItem(key);
  return () => {
    for (let i = window.localStorage.length - 1; i >= 0; i--) {
      const key = window.localStorage.key(i);
      if (key && key.startsWith("fr")) window.localStorage.removeItem(key);
    }
    for (const [key, value] of snapshot) window.localStorage.setItem(key, value);
  };
}

const meta = {
  title: "Settings/Preferences",
  component: PreferencesPanel,
  parameters: {
    layout: "fullscreen",
    a11y: { test: "error" },
    nextjs: { navigation: { pathname: "/settings" } },
  },
  beforeEach: isolateStorage,
  decorators: [(Story) => (
    <main className="mx-auto max-w-screen-md p-4">
      <Story />
    </main>
  )],
} satisfies Meta<typeof PreferencesPanel>;
export default meta;
type Story = StoryObj<typeof meta>;

function rgb(owner: Document, token: string) {
  const probe = owner.createElement("span");
  probe.style.color = `var(${token})`;
  owner.body.append(probe);
  const value = owner.defaultView!.getComputedStyle(probe).color;
  probe.remove();
  return value;
}

async function assertPlainTool(canvasElement: HTMLElement, scale = 1) {
  const owner = canvasElement.ownerDocument;
  const view = owner.defaultView!;
  const coral = new Set([rgb(owner, "--app-brand"), rgb(owner, "--app-brand-press")]);
  const ink = rgb(owner, "--app-ink");

  // Sections are rows on the ground: hairline above and below, no box.
  const runs = [...canvasElement.querySelectorAll<HTMLElement>("[data-settings-rows]")];
  await expect(runs.length).toBeGreaterThanOrEqual(7);
  for (const run of runs) {
    const style = view.getComputedStyle(run);
    await expect(style.borderTopWidth).toBe("1px");
    await expect(style.borderLeftWidth).toBe("0px");
    await expect(style.borderTopLeftRadius).toBe("0px");
    await expect(style.boxShadow).toBe("none");
    await expect(style.backgroundColor).toBe("rgba(0, 0, 0, 0)");
  }

  // Section labels are 13px uppercase.
  const labels = [...canvasElement.querySelectorAll<HTMLElement>("section > h2")];
  await expect(labels.map((h) => h.textContent)).toEqual(expect.arrayContaining([
    "Your spot", "What fits", "What you're into", "Community notes", "Appearance", "Phone feedback",
  ]));
  for (const label of labels) {
    await expect(view.getComputedStyle(label).textTransform).toBe("uppercase");
    await expect(parseFloat(view.getComputedStyle(label).fontSize)).toBeCloseTo(13 * scale, 1);
  }

  // No coral field: only a switch track may carry the brand fill.
  for (const node of canvasElement.querySelectorAll<HTMLElement>("button, a, summary")) {
    if (node.getAttribute("role") === "switch") continue;
    await expect(coral.has(view.getComputedStyle(node).backgroundColor)).toBe(false);
  }

  // Every control has an effective 44px target.
  for (const node of canvasElement.querySelectorAll<HTMLElement>("button, summary")) {
    const box = node.getBoundingClientRect();
    // Controls inside a closed disclosure are not rendered yet.
    if (box.height === 0) continue;
    if (node.classList.contains("tap-44") || node.classList.contains("tap-44-y")) {
      const after = view.getComputedStyle(node, "::after");
      await expect(parseFloat(after.height)).toBeGreaterThanOrEqual(44);
      continue;
    }
    await expect(box.height).toBeGreaterThanOrEqual(44);
  }

  // Nothing pushes the page sideways.
  const frame = canvasElement.querySelector<HTMLElement>("[data-settings-frame]") ?? canvasElement;
  await expect(frame.scrollWidth).toBeLessThanOrEqual(frame.clientWidth + 1);
  return { ink, coral };
}

export const RuledRows: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const owner = canvasElement.ownerDocument;
    const view = owner.defaultView!;
    const { ink } = await assertPlainTool(canvasElement);

    // Interest toggles: 6px bordered controls, ink fill when pressed.
    const food = canvas.getByRole("button", { name: "Eat & drink" });
    await expect(food).toHaveAttribute("aria-pressed", "false");
    await expect(view.getComputedStyle(food).borderTopLeftRadius).toBe("6px");
    await userEvent.click(food);
    await waitFor(() => expect(food).toHaveAttribute("aria-pressed", "true"));
    await waitFor(() => expect(view.getComputedStyle(food).backgroundColor).toBe(ink));
    await userEvent.click(food);
    await waitFor(() => expect(food).toHaveAttribute("aria-pressed", "false"));

    // Appearance: a 6px two-option control that keeps aria-pressed.
    const appearance = canvas.getByRole("group", { name: "Appearance" });
    const light = within(appearance).getByRole("button", { name: "Light" });
    const dark = within(appearance).getByRole("button", { name: "Dark" });
    for (const option of [light, dark]) {
      await expect(view.getComputedStyle(option).borderTopLeftRadius).toBe("6px");
      await expect(option).toHaveAttribute("aria-pressed");
    }

    // Switches keep the capsule.
    const community = canvas.getByRole("switch", { name: "Show community notes" });
    await expect(parseFloat(view.getComputedStyle(community).borderTopLeftRadius)).toBeGreaterThan(10);

    // Home Screen: "Add" is a 6px outlined button, not a coral capsule.
    const add = canvas.getByRole("button", { name: "Add" });
    await expect(view.getComputedStyle(add).borderTopLeftRadius).toBe("6px");

    // Home area: the editor shows 6px toggles with the selection exposed.
    await userEvent.click(canvas.getByRole("button", { name: /All of the county/ }));
    const county = await canvas.findByRole("button", { name: "All of the county" });
    await expect(county).toHaveAttribute("aria-pressed", "true");
    await waitFor(() => expect(view.getComputedStyle(county).backgroundColor).toBe(ink));
    await userEvent.click(county);
  },
};

export const NarrowEnlargedDark: Story = {
  parameters: { viewport: { defaultViewport: "radiusMobileNarrow" } },
  beforeEach: () => {
    const previousSize = document.documentElement.style.fontSize;
    const previousAppearance = getAppearance();
    document.documentElement.style.fontSize = "125%";
    applyAppearance("dark", false);
    return () => {
      document.documentElement.style.fontSize = previousSize;
      applyAppearance(previousAppearance, false);
    };
  },
  decorators: [(Story) => (
    <div data-settings-frame style={{ width: 320, maxWidth: "100%" }}>
      <Story />
    </div>
  )],
  play: async ({ canvasElement }) => {
    const owner = canvasElement.ownerDocument;
    const view = owner.defaultView!;
    await assertPlainTool(canvasElement, 1.25);
    // Row text grows with enlarged text because sizes are in rem.
    const label = canvasElement.querySelector<HTMLElement>("section > h2")!;
    await expect(parseFloat(view.getComputedStyle(label).fontSize)).toBeGreaterThan(13);
    // "Try feedback" stays on one line when it is shown.
    const tryButton = within(canvasElement).queryByRole("button", { name: /Try feedback/ });
    if (tryButton) {
      await expect(view.getComputedStyle(tryButton).whiteSpace).toBe("nowrap");
    }
  },
};
