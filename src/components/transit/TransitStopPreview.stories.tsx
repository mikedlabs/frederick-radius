import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { usePathname } from "@storybook/nextjs-vite/navigation.mock";
import { useRef, useState } from "react";
import { expect, waitFor, within } from "storybook/test";
import TransitStopPreview from "./TransitStopPreview";
import type { SelectedStop } from "./StopArrivalsPopup";

const STOP: SelectedStop = { id: "162950", name: "10th Street at Motter Avenue", lat: 39.42717, lng: -77.40899 };
const HEADSIGN = "Frederick Transit Center via Motter Avenue and Frederick Community College";
const LAYER_KEY = "__frederickRadiusLayer";
let requests: string[] = [];

function Fixture({ state = "live" }: { state?: "live" | "unavailable" }) {
  const [open, setOpen] = useState(false);
  const [used, setUsed] = useState(0);
  const trigger = useRef<HTMLButtonElement | null>(null);
  const result = useRef<HTMLHeadingElement | null>(null);
  return <main className="min-h-screen p-4" style={{ background: "var(--app-bg)" }}>
    <p>Declared {state} component fixture · not current service</p>
    <button ref={trigger} type="button" className="min-h-11 rounded-xl px-4" onClick={() => setOpen(true)}>Preview this stop</button>
    <h2 ref={result} tabIndex={-1}>Chosen stop</h2>
    <output aria-label="Use stop handoffs">{used}</output>
    {open && <TransitStopPreview stop={STOP} returnFocusRef={trigger} onClose={() => setOpen(false)}
      onUseStop={(stop) => {
        if (stop.id !== STOP.id) throw new Error("Wrong stop handed off");
        if (window.history.state?.[LAYER_KEY]) throw new Error("Temporary layer survived handoff");
        setUsed(count => count + 1);
        result.current?.focus({ preventScroll: true });
      }} />}
  </main>;
}

const meta = {
  title: "Transit/Stop preview", component: Fixture,
  parameters: { layout: "fullscreen" }, args: { state: "live" },
  beforeEach: ({ args }) => {
    const originalPath = usePathname.getMockImplementation();
    const originalFetch = window.fetch;
    const originalState = window.history.state;
    const originalSize = document.documentElement.style.fontSize;
    usePathname.mockReturnValue(window.location.pathname);
    requests = [];
    // A declared exact API fixture; never forward a fetch to any service.
    window.fetch = async (input) => {
      const path = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
      requests.push(path);
      if (path !== `/api/transit/stop-predictions?stop=${STOP.id}`) throw new Error(`Unexpected fixture request: ${path}`);
      const now = Math.floor(Date.now() / 1000);
      return Response.json({ available: args.state !== "unavailable", status: args.state === "unavailable" ? "unavailable" : "ok", feedTimestamp: now,
        predictions: args.state === "unavailable" ? [] : [{ stopId: STOP.id, routeId: "6154", headsign: HEADSIGN, arrivalEpoch: now + 480, timestamp: now }] });
    };
    return () => {
      window.fetch = originalFetch;
      window.history.replaceState(originalState, "", window.location.href);
      document.documentElement.style.fontSize = originalSize;
      if (originalPath) usePathname.mockImplementation(originalPath); else usePathname.mockReset();
    };
  },
} satisfies Meta<typeof Fixture>;
export default meta;
type Story = StoryObj<typeof meta>;

async function physical(target: HTMLElement, scroll = false) {
  if (scroll) target.scrollIntoView({ block: "center", behavior: "instant" });
  await waitFor(async () => {
    const before = target.getBoundingClientRect();
    await new Promise<void>(resolve => requestAnimationFrame(() => resolve()));
    const box = target.getBoundingClientRect();
    expect(Math.abs(box.y - before.y)).toBeLessThanOrEqual(.25);
    expect(box.height).toBeGreaterThanOrEqual(44); expect(box.width).toBeGreaterThanOrEqual(44);
    expect(box.top).toBeGreaterThanOrEqual(0); expect(box.bottom).toBeLessThanOrEqual(window.innerHeight);
    for (const [dx, dy] of [[0, 0], [-21.5, 0], [21.5, 0], [0, -21.5], [0, 21.5]]) {
      const hit = document.elementFromPoint(box.x + box.width / 2 + dx, box.y + box.height / 2 + dy);
      expect(Boolean(hit && target.contains(hit))).toBe(true);
    }
  }, { timeout: 3000 });
}

async function check(context: Parameters<NonNullable<Story["play"]>>[0], enlarged = false) {
  if (enlarged) document.documentElement.style.fontSize = "32px";
  const { canvasElement, userEvent, args } = context;
  // Toolbar globals alone are not engine viewport proof in browser Vitest.
  const expectedWidth = context.globals.viewport.value === "radiusMobile" ? 390 : 320;
  expect(window.innerWidth).toBe(expectedWidth);
  const page = within(canvasElement.ownerDocument.body);
  const trigger = page.getByRole("button", { name: "Preview this stop" });
  const baseState = JSON.stringify(window.history.state);
  const open = async () => {
    const before = requests.length;
    await userEvent.click(trigger);
    const dialog = await page.findByRole("dialog", { name: `Arrivals at ${STOP.name}` });
    await waitFor(() => expect(requests.length).toBe(before + 1));
    expect(dialog.querySelectorAll("[data-transit-stop-sheet-body]")).toHaveLength(1);
    const controls = within(dialog);
    expect(controls.getAllByRole("button", { name: "Use this stop" })).toHaveLength(1);
    const close = controls.getByRole("button", { name: `Close arrivals at ${STOP.name}` });
    const use = controls.getByRole("button", { name: "Use this stop" });
    await physical(close); await physical(use);
    if (args.state === "unavailable") {
      await expect(controls.getByText(/Live arrivals are unavailable/)).toBeVisible();
      const source = controls.getByRole("link", { name: "Check the official schedule" });
      expect(source).toHaveAttribute("href", "https://www.frederickcountymd.gov/207/Transit-Routes-Schedule-Information");
      await physical(source, true); // Inspect only: never follow the official link.
    } else {
      const destination = controls.getByText(`to ${HEADSIGN}`);
      await expect(destination).toBeVisible();
      expect(destination.scrollWidth).toBeLessThanOrEqual(destination.clientWidth);
      const box = destination.getBoundingClientRect();
      const range = document.createRange(); range.selectNodeContents(destination);
      for (const line of range.getClientRects()) {
        expect(line.left).toBeGreaterThanOrEqual(box.left - .5);
        expect(line.right).toBeLessThanOrEqual(box.right + .5);
      }
      if (enlarged) expect(parseFloat(getComputedStyle(destination).fontSize)).toBeGreaterThanOrEqual(30);
    }
    expect(document.documentElement.scrollWidth).toBeLessThanOrEqual(document.documentElement.clientWidth);
    return { close, use };
  };
  const closed = async (returnsToTrigger: boolean) => waitFor(() => {
    expect(page.queryByRole("dialog")).toBeNull();
    expect(JSON.stringify(window.history.state)).toBe(baseState);
    if (returnsToTrigger) expect(trigger).toHaveFocus();
  }, { timeout: 3000 });

  let controls = await open(); await userEvent.click(controls.close); await closed(true);
  await open(); await userEvent.keyboard("{Escape}"); await closed(true);
  await open(); window.history.back(); await closed(true);
  controls = await open(); await userEvent.click(controls.use); await closed(false);
  await waitFor(() => {
    expect(page.getByRole("heading", { name: "Chosen stop" })).toHaveFocus();
    expect(page.getByLabelText("Use stop handoffs")).toHaveTextContent("1");
  });
}

export const Mobile320: Story = { globals: { viewport: { value: "radiusMobileNarrow", isRotated: false } }, play: check };
export const Mobile390: Story = { globals: { viewport: { value: "radiusMobile", isRotated: false } }, play: check };
export const Mobile320EnlargedText: Story = { globals: { viewport: { value: "radiusMobileNarrow", isRotated: false }, motion: "reduce" }, play: context => check(context, true) };
export const UnavailableSchedule320: Story = { args: { state: "unavailable" }, globals: { viewport: { value: "radiusMobileNarrow", isRotated: false } }, play: check };
