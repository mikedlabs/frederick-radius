import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, userEvent, waitFor, within } from "storybook/test";

import CollapsibleSection from "./CollapsibleSection";

/**
 * Each story uses its own storageKey, and the decorator clears it, so a
 * choice made while clicking through one story never changes how another
 * story (or a rerun of the same one) starts.
 */
function clearStoredChoice(key: string) {
  try {
    window.localStorage.removeItem(key);
  } catch {
    // Storage is unavailable in some preview contexts; defaultOpen applies.
  }
}

const parkRows = (
  <ul className="pb-2">
    {["Baker Park", "Carroll Creek Linear Park", "Culler Lake"].map((name) => (
      <li
        key={name}
        className="text-body px-1 py-3"
        style={{ borderTop: "1px solid var(--app-border)", color: "var(--app-ink)" }}
      >
        {name}
      </li>
    ))}
  </ul>
);

const meta = {
  title: "Radius UI/CollapsibleSection",
  component: CollapsibleSection,
  tags: ["autodocs"],
  parameters: {
    layout: "centered",
    docs: {
      description: {
        component:
          "The one disclosure heading. A collapsed section is a 52px ruled row: a 1px Border rule, the title in .text-title-sm Ink and sentence case, an optional count in quiet .text-meta-lg metadata, and a chevron. It replaces the old tracked-caps eyebrow, so a stack of disclosures reads as a list of named sections. The open or closed choice is remembered per storageKey.",
      },
    },
  },
  args: {
    title: "Frederick City",
    storageKey: "storybook.collapsible.closed",
    headingLevel: 2,
    defaultOpen: false,
    children: parkRows,
  },
  decorators: [
    (Story, context) => {
      clearStoredChoice(String(context.args.storageKey));
      return (
        <div className="w-[min(30rem,calc(100vw-24px))] p-3">
          <Story />
        </div>
      );
    },
  ],
} satisfies Meta<typeof CollapsibleSection>;

export default meta;
type Story = StoryObj<typeof meta>;

async function readyTrigger(canvasElement: HTMLElement, name: RegExp | string) {
  const trigger = within(canvasElement).getByRole("button", { name });
  await waitFor(() => expect(trigger).toBeEnabled());
  return trigger;
}

export const Closed: Story = {
  play: async ({ canvasElement }) => {
    const trigger = await readyTrigger(canvasElement, "Frederick City");
    await expect(trigger).toHaveAttribute("aria-expanded", "false");
    await expect(trigger.getBoundingClientRect().height).toBeGreaterThanOrEqual(52);

    const title = within(trigger).getByText("Frederick City");
    const titleStyle = getComputedStyle(title);
    await expect(titleStyle.fontSize).toBe("16px");
    await expect(titleStyle.fontWeight).toBe("600");
    await expect(titleStyle.textTransform).toBe("none");

    const section = canvasElement.querySelector("section")!;
    await expect(getComputedStyle(section).borderTopWidth).toBe("1px");
  },
};

export const Open: Story = {
  args: {
    storageKey: "storybook.collapsible.open",
    defaultOpen: true,
  },
  play: async ({ canvasElement }) => {
    const trigger = await readyTrigger(canvasElement, "Frederick City");
    await expect(trigger).toHaveAttribute("aria-expanded", "true");
    await expect(within(canvasElement).getByText("Baker Park")).toBeVisible();

    await userEvent.click(trigger);
    await expect(trigger).toHaveAttribute("aria-expanded", "false");
  },
};

export const WithCount: Story = {
  args: {
    title: "All restaurants",
    count: 183,
    countLabel: "places",
    storageKey: "storybook.collapsible.count",
  },
  play: async ({ canvasElement }) => {
    const trigger = await readyTrigger(canvasElement, /All restaurants/);
    const count = within(trigger).getByText("183 places");
    const countStyle = getComputedStyle(count);
    await expect(countStyle.fontSize).toBe("13px");
    await expect(countStyle.textTransform).toBe("none");
  },
};

/** A stack of town groups, as on /parks: ruled rows instead of caps labels. */
export const TownStackAt320: Story = {
  globals: {
    viewport: { value: "radiusMobileNarrow", isRotated: false },
  },
  render: () => (
    <div>
      {[
        ["Thurmont", 5],
        ["Brunswick", 3],
        ["Walkersville", 2],
        ["Myersville", 1],
      ].map(([town, parks]) => {
        const key = `storybook.collapsible.stack.${String(town).toLowerCase()}`;
        clearStoredChoice(key);
        return (
          <CollapsibleSection
            key={key}
            title={String(town)}
            count={Number(parks)}
            countLabel={parks === 1 ? "park" : "parks"}
            headingLevel={2}
            storageKey={key}
          >
            {parkRows}
          </CollapsibleSection>
        );
      })}
    </div>
  ),
};
