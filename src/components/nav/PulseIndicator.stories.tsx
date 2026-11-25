import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, userEvent, waitFor, within } from "storybook/test";
import { Button } from "@/components/ui/Button";
import { PULSE_STATUS_STORAGE_KEY } from "./PulseIndicator";
import TopBar from "./TopBar";

type Sample = "ready" | "error" | "loading" | "advisory" | "quiet" | "partial";
let changeSample: (state: Sample) => void = () => {};
let heldChecks: () => number = () => 0;
/** The pill keeps its last accepted report for the tab. Each story sets or
 * clears it, so one story never hands its report to the next. */
function storeReport(validForMs: number | null) {
  try {
    if (validForMs === null) window.sessionStorage.removeItem(PULSE_STATUS_STORAGE_KEY);
    else window.sessionStorage.setItem(PULSE_STATUS_STORAGE_KEY, JSON.stringify({ active: true, count: 2, tone: "alert", level: "Urgent", ok: true, lastUpdated: new Date().toISOString(), validUntil: new Date(Date.now() + validForMs).toISOString() }));
  } catch {
    // The workshop still shows its sample reports without storage.
  }
}
function sampleStatus(initial: Sample, stored: "none" | "valid" | "expired" = "none") {
  let state = initial;
  const original = window.fetch;
  const cancelPending = new Set<() => void>();
  storeReport(stored === "none" ? null : stored === "valid" ? 360_000 : -1_000);
  heldChecks = () => cancelPending.size;
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
    const sample = state === "advisory" ? { active: true, count: 3, tone: "caution", level: "Advisory", ok: false }
      : state === "quiet" ? { active: false, count: 0, tone: "quiet", level: "Clear", ok: true }
      : state === "partial" ? { active: false, count: 0, tone: "quiet", level: "Unknown", ok: false }
      : { active: true, count: 2, tone: "alert", level: "Urgent", ok: true };
    return Promise.resolve(Response.json({ ...sample, lastUpdated: new Date().toISOString(), validUntil: new Date(Date.now() + 360_000).toISOString() }));
  };
  window.fetch = fixture;
  return () => { if (window.fetch === fixture) window.fetch = original; for (const cancel of cancelPending) cancel(); changeSample = () => {}; heldChecks = () => 0; storeReport(null); };
}
function StatusWorkshop() {
  return <><TopBar /><main className="mx-auto max-w-screen-md space-y-4 p-4">
    <h1 className="text-2xl font-semibold">County status workshop</h1>
    <p>This workshop assembles sample reports when it opens. It does not show current alerts or publisher checks.</p>
    <div className="flex flex-wrap gap-2"><Button onClick={() => changeSample("error")}>Show failed check</Button><Button onClick={() => changeSample("ready")}>Restore sample report</Button><Button onClick={() => changeSample("loading")}>Hold the next check</Button></div>
  </main></>;
}
const meta = { title: "Radius Chrome/County status recovery", component: StatusWorkshop, tags: ["autodocs"], parameters: { layout: "fullscreen", nextjs: { navigation: { pathname: "/today" } } } } satisfies Meta<typeof StatusWorkshop>;
export default meta;
type Story = StoryObj<typeof meta>;
const unavailable = async ({ canvasElement }: { canvasElement: HTMLElement }) => {
  const canvas = within(canvasElement); await expect(await canvas.findByRole("link", { name: "County status: Unable to verify; current alerts are unverified" })).toHaveAttribute("data-pulse-state", "unavailable");
};
export const UnverifiedAt320: Story = { globals: { viewport: { value: "radiusMobileNarrow", isRotated: false } }, beforeEach: () => sampleStatus("error"), play: unavailable };
export const UnverifiedAt390: Story = { globals: { viewport: { value: "radiusMobile", isRotated: false } }, beforeEach: () => sampleStatus("error"), play: unavailable };
export const UnverifiedAt430: Story = { globals: { viewport: { value: "radiusMobileLarge", isRotated: false } }, beforeEach: () => sampleStatus("error"), play: unavailable };
export const EarlierAndRecoveryAt375: Story = {
  globals: { viewport: { value: "radiusMobileCompact", isRotated: false } }, beforeEach: () => sampleStatus("ready"),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await canvas.findByRole("link", { name: "County status: Urgent; 2 alerts reported" });
    await userEvent.click(canvas.getByRole("button", { name: "Show failed check" }));
    await expect(await canvas.findByRole("link", { name: /Earlier report had 2 alerts; current alerts are unverified/ })).toHaveAttribute("data-pulse-state", "unavailable");
    await userEvent.click(canvas.getByRole("button", { name: "Restore sample report" }));
    await expect(await canvas.findByRole("link", { name: "County status: Urgent; 2 alerts reported" })).toHaveAttribute("data-pulse-state", "ready");
  },
};
export const CheckingAt390: Story = { globals: { viewport: { value: "radiusMobile", isRotated: false } }, parameters: { nextjs: { navigation: { pathname: "/pulse" } } }, beforeEach: () => sampleStatus("loading"), play: async ({ canvasElement }) => { await expect(within(canvasElement).getByRole("link", { name: "County status: checking" })).toHaveAttribute("data-pulse-state", "checking"); } };
export const EarlierOnDesktop: Story = { ...EarlierAndRecoveryAt375, globals: { viewport: { value: "radiusDesktop", isRotated: false } } };
/** A report inside its validity window stays on screen while the next check runs. */
export const ValidReportKeptDuringRefresh: Story = {
  globals: { viewport: { value: "radiusMobile", isRotated: false } }, beforeEach: () => sampleStatus("ready"),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await canvas.findByRole("link", { name: "County status: Urgent; 2 alerts reported" });
    await userEvent.click(canvas.getByRole("button", { name: "Hold the next check" }));
    await waitFor(() => expect(heldChecks()).toBe(1));
    const status = canvas.getByRole("link", { name: "County status: Urgent; 2 alerts reported" });
    await expect(status).toHaveAttribute("data-pulse-state", "ready");
    await expect(status.querySelector("[data-pulse-mobile-state]")).toHaveTextContent("Urgent");
  },
};
/** After a reload in the same tab, a stored report that is still valid is painted before the first check returns. */
export const StoredReportPaintedFirst: Story = {
  globals: { viewport: { value: "radiusMobile", isRotated: false } }, beforeEach: () => sampleStatus("loading", "valid"),
  play: async ({ canvasElement }) => {
    const status = await within(canvasElement).findByRole("link", { name: "County status: Urgent; 2 alerts reported" });
    await waitFor(() => expect(heldChecks()).toBe(1));
    await expect(status).toHaveAttribute("data-pulse-state", "ready");
    await expect(status.querySelector("[data-pulse-mobile-state]")).toHaveTextContent("Urgent");
  },
};
/** A stored report past its deadline is never shown. The pill starts from Checking. */
export const ExpiredStoredReportIgnored: Story = {
  globals: { viewport: { value: "radiusMobile", isRotated: false } }, beforeEach: () => sampleStatus("loading", "expired"),
  play: async ({ canvasElement }) => {
    const status = await within(canvasElement).findByRole("link", { name: "County status: checking" });
    await waitFor(() => expect(heldChecks()).toBe(1));
    await expect(status).toHaveAttribute("data-pulse-state", "checking");
    await expect(status.querySelector("[data-pulse-mobile-state]")).toHaveTextContent("Checking");
  },
};

export const AdvisoryWithPartialCoverage: Story = {
  globals: { viewport: { value: "radiusMobile", isRotated: false } },
  beforeEach: () => sampleStatus("advisory"),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const status = await canvas.findByRole("link", { name: "County status: Advisory; 3 alerts reported; some sources unavailable" });
    await expect(status.querySelector("[data-pulse-mobile-state]")).toHaveTextContent("Advisory");
  },
};
export const QuietInCheckedFeeds: Story = {
  globals: { viewport: { value: "radiusDesktop", isRotated: false } },
  beforeEach: () => sampleStatus("quiet"),
  play: async ({ canvasElement }) => {
    const status = await within(canvasElement).findByRole("link", { name: "County status: Clear in checked feeds; no active alerts" });
    await expect(status).toBeVisible();
    await expect(status).toHaveTextContent("County status");
    await expect(status.querySelector("[data-pulse-desktop-state]")).toHaveTextContent("Clear in checked feeds");
    await expect(status.querySelector("[data-pulse-mobile-state]")).toHaveTextContent("Clear in checked feeds");
  },
};
export const QuietInCheckedFeedsOnPhone: Story = {
  ...QuietInCheckedFeeds,
  globals: { viewport: { value: "radiusMobileNarrow", isRotated: false } },
};
export const QuietWithPartialCoverage: Story = {
  globals: { viewport: { value: "radiusMobile", isRotated: false } },
  beforeEach: () => sampleStatus("partial"),
  play: async ({ canvasElement }) => {
    const status = await within(canvasElement).findByRole("link", { name: "County status: Unable to verify; current alerts are unverified" });
    await expect(status.querySelector("[data-pulse-mobile-state]")).toHaveTextContent("Unverified");
  },
};
