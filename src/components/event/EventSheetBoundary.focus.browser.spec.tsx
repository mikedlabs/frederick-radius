// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { EventWithMeta } from "@/lib/loaders/events";
import EventSheetBoundary from "./EventSheetBoundary";

const sheet = vi.hoisted(() => ({ openEventSheet: vi.fn(), openEventSheetBySlug: vi.fn() }));
vi.mock("./EventSheetProvider", () => ({ useEventSheet: () => sheet }));
(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
let host: HTMLDivElement;
let root: Root;
let focus: ReturnType<typeof vi.spyOn>;
const event = { slug: "declared-component-fixture", title: "Declared component fixture" } as EventWithMeta;

beforeEach(() => {
  vi.clearAllMocks();
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  // Stop JSDOM's document navigation after the real delegated React handler.
  host.addEventListener("click", (click) => click.preventDefault());
  focus = vi.spyOn(HTMLAnchorElement.prototype, "focus");
});
afterEach(async () => { await act(async () => root.unmount()); host.remove(); vi.restoreAllMocks(); });

async function mount(options: { fetchFull?: boolean; fetchMissing?: boolean; known?: boolean; href?: string } = {}) {
  await act(async () => root.render(<EventSheetBoundary events={options.known === false ? [] : [event]} fetchFull={options.fetchFull} fetchMissing={options.fetchMissing}>
    <a href={options.href ?? `/events/${event.slug}`}>Open the declared fixture</a>
  </EventSheetBoundary>));
  return host.querySelector("a")!;
}

describe("touch event opener focus ownership", () => {
  it.each([
    { fetchFull: false, fetchMissing: false, known: true, full: false },
    { fetchFull: true, fetchMissing: false, known: true, full: true },
    { fetchFull: false, fetchMissing: true, known: false, full: true },
  ])("establishes the actual opener before the provider captures it: %j", async ({ full, ...options }) => {
    const anchor = await mount(options);
    expect(document.activeElement).toBe(document.body);
    const capture = vi.fn(() => { expect(document.activeElement).toBe(anchor); });
    (full ? sheet.openEventSheetBySlug : sheet.openEventSheet).mockImplementationOnce(capture);
    // A native touch click need not focus an anchor on Safari. Dispatching
    // click without a focus call reproduces that browser contract.
    await act(async () => anchor.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, button: 0 })));
    expect(focus).toHaveBeenCalledWith({ preventScroll: true });
    expect(capture).toHaveBeenCalledOnce();
    if (full) expect(sheet.openEventSheetBySlug).toHaveBeenCalledWith(event.slug);
    else expect(sheet.openEventSheet).toHaveBeenCalledWith(event);
  });

  it.each([{ metaKey: true }, { ctrlKey: true }, { shiftKey: true }, { altKey: true }, { button: 1 }])("preserves modified navigation without moving focus: %j", async (options) => {
    const anchor = await mount();
    await act(async () => anchor.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, button: 0, ...options })));
    expect(focus).not.toHaveBeenCalled();
    expect(sheet.openEventSheet).not.toHaveBeenCalled();
    expect(sheet.openEventSheetBySlug).not.toHaveBeenCalled();
  });

  it("keeps unknown canonical navigation and the monthly calendar outside sheet focus ownership", async () => {
    const anchor = await mount({ known: false, fetchFull: true, href: "/events/calendar" });
    await act(async () => anchor.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, button: 0 })));
    expect(focus).not.toHaveBeenCalled();
    expect(sheet.openEventSheet).not.toHaveBeenCalled();
    expect(sheet.openEventSheetBySlug).not.toHaveBeenCalled();
  });
});
