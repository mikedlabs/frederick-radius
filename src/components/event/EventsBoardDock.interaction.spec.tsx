// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import EventsBoardDock, { type EventsBoardDockProps } from "./EventsBoardDock";

vi.mock("next/link", () => ({ default: "a" }));
vi.mock("@/lib/haptics", () => ({ haptic: vi.fn() }));
(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const noop = () => undefined;
const props: EventsBoardDockProps = {
  nowISO: "2026-10-09T16:00:00Z", dayCounts: {}, filteredCount: 2, resultTownCount: 1, countComplete: true,
  categories: [{ slug: "arts", name: "Arts & culture" }], towns: [{ slug: "thurmont", name: "Thurmont" }],
  intent: null, setIntent: noop, sub: null, setSub: noop, cat: null, setCat: noop,
  lens: "weekend", setLens: noop, tod: null, setTod: noop, day: null, setDay: noop, town: "thurmont", setTown: noop,
  q: "a very long local music search phrase with additional words", setQ: noop,
  freeOnly: false, setFreeOnly: noop, happyOnly: false, setHappyOnly: noop, kidsOnly: false, setKidsOnly: noop,
  lgbtqOnly: false, setLgbtqOnly: noop, communicationAccessOnly: false, setCommunicationAccessOnly: noop,
  recurringOnly: false, setRecurringOnly: noop, anyFilter: true, clear: noop,
  view: "list", setView: noop, sort: "recommended", setSort: noop,
};

let root: Root;
let container: HTMLDivElement;
let oldOverflow: string;
beforeEach(async () => {
  oldOverflow = document.documentElement.style.overflowY;
  vi.stubGlobal("matchMedia", () => ({ matches: false, addEventListener: noop, removeEventListener: noop }));
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  await act(async () => root.render(<><header><button>Global Find</button></header><main><EventsBoardDock {...props} /><section data-results><button>Open an event</button></section></main><aside inert data-kept-inert /></>));
});
afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  document.documentElement.style.overflowY = oldOverflow;
  vi.unstubAllGlobals();
});
function filters() { return container.querySelector<HTMLButtonElement>(".eb-filter-trigger")!; }
function done() { return container.querySelector<HTMLButtonElement>(".dock-done")!; }
async function open() {
  filters().focus();
  await act(async () => filters().click());
}

describe("Event filter ownership", () => {
  it("closes native Display and gives the active filter sole modal ownership", async () => {
    const display = container.querySelector<HTMLDetailsElement>(".eb-display-options")!;
    display.open = true;
    await open();
    expect(display.open).toBe(false);
    expect(container.querySelector('[role="dialog"]')?.getAttribute("aria-modal")).toBe("true");
    expect(container.querySelector("header")?.hasAttribute("inert")).toBe(true);
    expect(container.querySelector("[data-results]")?.hasAttribute("inert")).toBe(true);
    expect(container.querySelector(".eb-head")?.hasAttribute("inert")).toBe(true);
    expect(container.querySelector(".eb-scrim")?.hasAttribute("inert")).toBe(false);
    expect(container.querySelector(".eb-pane")?.closest("[inert]")).toBeNull();
    expect(document.documentElement.style.overflowY).toBe("hidden");
    expect(document.body.style.overflow).toBe("");
    expect(document.activeElement).toBe(done());
  });

  it("restores background ownership, scroll policy and the real opener on Done and unmount", async () => {
    document.documentElement.style.overflowY = "clip";
    await open();
    await act(async () => done().click());
    expect(container.querySelector("header")?.hasAttribute("inert")).toBe(false);
    expect(container.querySelector("[data-results]")?.hasAttribute("inert")).toBe(false);
    expect(container.querySelector("[data-kept-inert]")?.hasAttribute("inert")).toBe(true);
    expect(document.documentElement.style.overflowY).toBe("clip");
    expect(document.activeElement).toBe(filters());
    await open();
    await act(async () => root.render(null));
    expect(document.documentElement.style.overflowY).toBe("clip");
  });

  it("keeps newly rendered result branches inert until the filter closes", async () => {
    await open();
    const refreshedResult = document.createElement("section");
    container.querySelector("main")!.append(refreshedResult);
    await act(async () => { await Promise.resolve(); });
    expect(refreshedResult.hasAttribute("inert")).toBe(true);
    await act(async () => done().click());
    expect(refreshedResult.hasAttribute("inert")).toBe(false);
  });

  it("keeps time and town separate from long query text and preserves the full filter label", () => {
    expect(container.querySelector("[data-event-filter-time]")?.textContent).toBe("This weekend");
    expect(container.querySelector("[data-event-filter-scope]")?.textContent).toBe("Thurmont");
    const label = filters().getAttribute("aria-label") ?? filters().textContent;
    expect(label).toContain(props.q);
    expect(label).toContain("This weekend");
    expect(label).toContain("Thurmont");
  });
});
