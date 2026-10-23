import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, userEvent, waitFor, within } from "storybook/test";
import type { CommerceLink } from "@/lib/commerce/types";
import CommerceActions from "./CommerceActions";

// Synthetic destinations and source clock; the labels/provider mix reproduce
// the five published Carriage-shaped actions without making merchant requests.
// Keep the observed "Updated 1 hour ago" footer shape for the overlap case.
const checkedAt = new Date(Date.now() - 90 * 60_000).toISOString();
const links: CommerceLink[] = [
  { type: "order", provider: "toast", url: "https://www.toasttab.com/workshop/order", source: "imported", last_verified_at: checkedAt },
  { type: "menu", provider: "website", url: "https://example.org/workshop/menu-2/", source: "imported", last_verified_at: checkedAt },
  { type: "reservation", provider: "toast", url: "https://tables.toasttab.com/workshop/reserve", source: "imported", last_verified_at: checkedAt },
  { type: "catering", provider: "website", url: "https://example.org/workshop/on-site-catering/", source: "imported", last_verified_at: checkedAt },
  { type: "gift_card", provider: "toast", url: "https://www.toasttab.com/workshop/giftcards", source: "imported", last_verified_at: checkedAt },
];
let attemptedRequests: string[] = [];

const meta = {
  title: "Places/Commerce touch targets",
  component: CommerceActions,
  parameters: { layout: "fullscreen" },
  args: { links, placeSlug: "workshop-commerce", placeName: "Workshop restaurant" },
  beforeEach: () => {
    attemptedRequests = [];
    const original = window.fetch;
    window.fetch = async (input) => {
      attemptedRequests.push(typeof input === "string" ? input : input instanceof URL ? input.href : input.url);
      return new Response("{}", { headers: { "Content-Type": "application/json" } });
    };
    return () => { window.fetch = original; };
  },
} satisfies Meta<typeof CommerceActions>;
export default meta;
type Story = StoryObj<typeof meta>;

async function expectPhysicalTarget(element: HTMLElement) {
  element.scrollIntoView({ block: "center", inline: "nearest", behavior: "instant" });
  await waitFor(async () => {
    const box = element.getBoundingClientRect();
    const label = `${element.tagName}#${element.id}: ${element.textContent?.trim().slice(0, 50)}`;
    await expect(box.width, `${label} physical width`).toBeGreaterThanOrEqual(44);
    await expect(box.height, `${label} physical height`).toBeGreaterThanOrEqual(44);
    for (const [dx, dy] of [[0, 0], [-21.5, 0], [21.5, 0], [0, -21.5], [0, 21.5]]) {
      const hit = element.ownerDocument.elementFromPoint(box.x + box.width / 2 + dx, box.y + box.height / 2 + dy);
      await expect(hit !== null && element.contains(hit)).toBe(true);
    }
  });
}

async function expectIndependentEdges(gift: HTMLElement, report: HTMLElement) {
  report.scrollIntoView({ block: "center", inline: "nearest", behavior: "instant" });
  await waitFor(async () => {
    const giftBox = gift.getBoundingClientRect(), reportBox = report.getBoundingClientRect();
    // The old Report ::after stole the Gift card's bottom half-pixel even
    // though both controls appeared visible and Gift was exactly 44px tall.
    const giftHit = gift.ownerDocument.elementFromPoint(giftBox.x + giftBox.width / 2, giftBox.y + giftBox.height / 2 + 21.5);
    const reportHit = report.ownerDocument.elementFromPoint(reportBox.x + reportBox.width / 2, reportBox.y + reportBox.height / 2 - 21.5);
    await expect(giftHit !== null && gift.contains(giftHit)).toBe(true);
    await expect(reportHit !== null && report.contains(reportHit)).toBe(true);
    await expect(reportBox.top).toBeGreaterThanOrEqual(giftBox.bottom);
  });
}

function mobileStory(width: 320 | 390): Story {
  return {
    globals: { viewport: { value: width === 320 ? "radiusMobileNarrow" : "radiusMobile", isRotated: false } },
    render: (args) => <div className="p-4"><div data-commerce-fixture style={{ width: `min(${width - 32}px, calc(100vw - 32px))` }}><CommerceActions {...args} /></div></div>,
    play: async ({ canvasElement }) => {
      const canvas = within(canvasElement);
      const fixture = canvasElement.querySelector<HTMLElement>("[data-commerce-fixture]")!;
      await expect(fixture.getBoundingClientRect().width).toBe(width - 32);
      const actions = canvas.getAllByRole("link");
      await expect(actions).toHaveLength(5);
      for (const action of actions) {
        await expect(action).toHaveAttribute("target", "_blank");
        await expectPhysicalTarget(action);
      }
      const gift = canvas.getByRole("link", { name: "Gift card" });
      const report = canvas.getByRole("button", { name: "Report a broken link" });
      await expectPhysicalTarget(report);
      await expectIndependentEdges(gift, report);
      await userEvent.click(report);
      const choice = canvas.getByRole("combobox");
      const note = canvas.getByRole("textbox", { name: "What is broken about this link?" });
      const send = canvas.getByRole("button", { name: "Send report" });
      const cancel = canvas.getByRole("button", { name: "Cancel" });
      for (const control of [choice, note, send, cancel]) await expectPhysicalTarget(control);
      const giftOption = within(choice).getByRole("option", { name: "Gift card · Toast" });
      await userEvent.selectOptions(choice, giftOption);
      await userEvent.type(note, "Synthetic workshop note. Do not send.");
      await userEvent.click(cancel);
      await expect(canvas.queryByRole("combobox")).not.toBeInTheDocument();
      const closedReport = canvas.getByRole("button", { name: "Report a broken link" });
      await expectPhysicalTarget(closedReport);
      await expectIndependentEdges(gift, closedReport);
      const document = fixture.ownerDocument;
      await expect(document.documentElement.scrollWidth).toBeLessThanOrEqual(document.defaultView!.innerWidth);
      await expect(document.body.scrollWidth).toBeLessThanOrEqual(document.defaultView!.innerWidth);
      await expect(attemptedRequests).toEqual([]);
    },
  };
}

export const Mobile320 = mobileStory(320);
export const Mobile390 = mobileStory(390);
