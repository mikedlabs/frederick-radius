import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, userEvent, within } from "storybook/test";
import { Button } from "@/components/ui/Button";
import TopBar from "./TopBar";

let changeSample: (state: "ready" | "error") => void = () => {};
function sampleStatus(initial: "ready" | "error" | "loading" | "partial") {
  let state = initial;
  const original = window.fetch;
  const cancelPending = new Set<() => void>();
  changeSample = (next) => { state = next; document.dispatchEvent(new Event("visibilitychange")); };
  const fixture: typeof fetch = (input, init) => {
    const url = new URL(input instanceof Request ? input.url : String(input), window.location.href);
    if (url.origin !== window.location.origin || url.pathname !== "/api/pulse/status") return original.call(window, input, init);
    if (state === "error") return Promise.resolve(new Response("Sample check unavailable", { status: 503 }));
    if (state === "loading") return new Promise<Response>((_resolve, reject) => {
      const signal = init?.signal ?? (input instanceof Request ? input.signal : undefined);
      const cancel = () => { cancelPending.delete(cancel); signal?.removeEventListener("abort", cancel); reject(new DOMException("Sample cancelled", "AbortError")); };
      cancelPending.add(cancel); signal?.addEventListener("abort", cancel, { once: true }); if (signal?.aborted) cancel();
    });
    return Promise.resolve(Response.json({ active: true, count: state === "partial" ? 1 : 2, tone: "alert", ok: state !== "partial", lastUpdated: new Date().toISOString() }));
  };
  window.fetch = fixture;
  return () => { if (window.fetch === fixture) window.fetch = original; for (const cancel of cancelPending) cancel(); changeSample = () => {}; };
}
function StatusWorkshop() {
  return <><TopBar /><main className="mx-auto max-w-screen-md space-y-4 p-4">
    <h1 className="text-2xl font-semibold">County status workshop</h1>
    <p>This workshop assembles sample reports when it opens. It does not show current alerts or publisher checks.</p>
    <div className="flex flex-wrap gap-2"><Button onClick={() => changeSample("error")}>Show failed check</Button><Button onClick={() => changeSample("ready")}>Restore sample report</Button></div>
  </main></>;
}
const meta = { title: "Radius Chrome/County status recovery", component: StatusWorkshop, tags: ["autodocs"], parameters: { layout: "fullscreen", nextjs: { navigation: { pathname: "/today" } } } } satisfies Meta<typeof StatusWorkshop>;
export default meta;
type Story = StoryObj<typeof meta>;
const unavailable = async ({ canvasElement }: { canvasElement: HTMLElement }) => {
  const canvas = within(canvasElement); await expect(await canvas.findByRole("link", { name: "County status: Unknown" })).toHaveAttribute("data-pulse-state", "unavailable");
};
export const UnknownAt320: Story = { globals: { viewport: { value: "radiusMobileNarrow", isRotated: false } }, beforeEach: () => sampleStatus("error"), play: unavailable };
export const UnknownAt390: Story = { globals: { viewport: { value: "radiusMobile", isRotated: false } }, beforeEach: () => sampleStatus("error"), play: unavailable };
export const UnknownAt430: Story = { globals: { viewport: { value: "radiusMobileLarge", isRotated: false } }, beforeEach: () => sampleStatus("error"), play: unavailable };
export const EarlierAndRecoveryAt375: Story = {
  globals: { viewport: { value: "radiusMobileCompact", isRotated: false } }, beforeEach: () => sampleStatus("ready"),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await canvas.findByRole("link", { name: "County status: Urgent, 2 alerts reported" });
    await userEvent.click(canvas.getByRole("button", { name: "Show failed check" }));
    await expect(await canvas.findByRole("link", { name: /Earlier report had 2 alerts; current alerts are unverified/ })).toHaveAttribute("data-pulse-state", "unavailable");
    await userEvent.click(canvas.getByRole("button", { name: "Restore sample report" }));
    await expect(await canvas.findByRole("link", { name: "County status: Urgent, 2 alerts reported" })).toHaveAttribute("data-pulse-state", "ready");
  },
};
export const CheckingAt390: Story = { globals: { viewport: { value: "radiusMobile", isRotated: false } }, parameters: { nextjs: { navigation: { pathname: "/pulse" } } }, beforeEach: () => sampleStatus("loading"), play: async ({ canvasElement }) => { await expect(within(canvasElement).getByRole("link", { name: "County status: checking" })).toHaveAttribute("data-pulse-state", "checking"); } };
export const EarlierOnDesktop: Story = { ...EarlierAndRecoveryAt375, globals: { viewport: { value: "radiusDesktop", isRotated: false } } };
// A report with an alert while another source is down names the alert in its
// tone; "Unknown" and the hollow ring stay for checks that reported nothing.
export const PartialCoverageAlertAt320: Story = {
  globals: { viewport: { value: "radiusMobileNarrow", isRotated: false } }, beforeEach: () => sampleStatus("partial"),
  play: async ({ canvasElement }) => {
    const link = await within(canvasElement).findByRole("link", { name: "County status: Urgent, 1 alert reported; some sources unavailable" });
    await expect(link).toHaveAttribute("data-pulse-state", "ready");
    await expect(link).not.toHaveTextContent("Unknown");
    await expect(link.querySelector("[data-pulse-mobile-state]")).toHaveTextContent("Urgent");
  },
};
export const PartialCoverageAlertOnDesktop: Story = { ...PartialCoverageAlertAt320, globals: { viewport: { value: "radiusDesktop", isRotated: false } } };
