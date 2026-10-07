// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { renderToString } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import PageBloom from "./PageBloom";
import { MotionConfig } from "framer-motion";

// Observe actual motion requests from the rendered component. JSDOM cannot
// draw Framer frames; real frame behavior is checked in the browser journey.
vi.mock("framer-motion", async (importOriginal) => {
  const { createElement } = await import("react");
  return { ...await importOriginal<typeof import("framer-motion")>(), motion: { div: ({ animate, transition, initial: _initial, ...props }: {
    animate?: Record<string, unknown>; transition?: { repeat?: number }; initial?: unknown;
  }) => {
    void _initial;
    return createElement("div", { ...props, "data-motion-loop":
      transition?.repeat === Infinity && Object.values(animate ?? {}).some(Array.isArray) ? "true" : "false" });
  } } };
});
(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
let root: Root | undefined;
let host: HTMLDivElement;
let hidden = false;
let reduced = false;
let media: MediaQueryList;

beforeEach(() => {
  hidden = false;
  reduced = false;
  host = document.createElement("div");
  document.body.append(host);
  vi.spyOn(document, "visibilityState", "get").mockImplementation(() => hidden ? "hidden" : "visible");
  const target = new EventTarget();
  media = Object.assign(target, { media: "(prefers-reduced-motion: reduce)", onchange: null,
    get matches() { return reduced; } }) as MediaQueryList;
  Object.defineProperty(media, "matches", { get: () => reduced });
  vi.stubGlobal("matchMedia", vi.fn(() => media));
});
afterEach(async () => {
  if (root) await act(async () => root!.unmount());
  root = undefined;
  host.remove();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
async function mount(motif = true) {
  root = createRoot(host);
  await act(async () => root!.render(<PageBloom motif={motif} />));
}
function loops() { return host.querySelectorAll('[data-motion-loop="true"]').length; }

describe("PageBloom ambient motion", () => {
  it("honors a reduced MotionConfig and still preserves the visitor's native preference", async () => {
    root = createRoot(host);
    await act(async () => root!.render(<MotionConfig reducedMotion="never"><PageBloom motif /></MotionConfig>));
    expect(loops()).toBe(3);
    const owners = [...host.querySelectorAll('[data-motion-loop="true"]')];
    await act(async () => root!.render(<MotionConfig reducedMotion="always"><PageBloom motif /></MotionConfig>));
    expect(loops()).toBe(0);
    expect(owners.every((owner) => !owner.isConnected)).toBe(true);
    expect(host.querySelectorAll("[data-ambient-layer]")).toHaveLength(3);
    await act(async () => root!.render(<MotionConfig reducedMotion="never"><PageBloom motif /></MotionConfig>));
    expect(loops()).toBe(3);
    await act(async () => { reduced = true; media.dispatchEvent(new Event("change")); });
    expect(loops()).toBe(0);
  });

  it("keeps server markup static before browser preferences are known", () => {
    expect(renderToString(<PageBloom motif />)).not.toContain('data-motion-loop="true"');
  });
  it("retains the three decorative loops for a visible full-motion browser", async () => {
    await mount();
    expect(loops()).toBe(3);
  });
  it("does not start decorative loops for a reduced-motion visitor", async () => {
    reduced = true;
    await mount();
    expect(loops()).toBe(0);
    expect(host.querySelector('[aria-hidden="true"]')).not.toBeNull();
    expect(host.querySelector(".aurora-grain")).not.toBeNull();
  });
  it("does not start loops while a document is hidden", async () => {
    hidden = true;
    await mount();
    expect(loops()).toBe(0);
  });
  it("stops hidden loops and restores them only on visible return", async () => {
    await mount();
    await act(async () => { hidden = true; document.dispatchEvent(new Event("visibilitychange")); });
    expect(loops()).toBe(0);
    await act(async () => { hidden = false; document.dispatchEvent(new Event("visibilitychange")); });
    expect(loops()).toBe(3);
  });
  it("responds to preference changes without reopening the page", async () => {
    await mount();
    await act(async () => { reduced = true; media.dispatchEvent(new Event("change")); });
    expect(loops()).toBe(0);
    await act(async () => { reduced = false; media.dispatchEvent(new Event("change")); });
    expect(loops()).toBe(3);
  });
  it("releases the running motion owners instead of just retargeting their initial frame", async () => {
    await mount();
    const owners = [...host.querySelectorAll('[data-motion-loop="true"]')];
    expect(owners).toHaveLength(3);
    await act(async () => { hidden = true; document.dispatchEvent(new Event("visibilitychange")); });
    expect(owners.every((owner) => !owner.isConnected)).toBe(true);
    expect(host.querySelectorAll("[data-ambient-layer]")).toHaveLength(3);
    expect(host.querySelectorAll("[data-motion-loop]")).toHaveLength(0);
    await act(async () => { hidden = false; document.dispatchEvent(new Event("visibilitychange")); });
    expect(loops()).toBe(3);
  });
});
