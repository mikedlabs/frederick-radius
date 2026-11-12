// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { replaceHistoryLayerUrl } from "@/hooks/useReversibleHistoryLayer";
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
const frames = new Map<number, FrameRequestCallback>();
let frame = 0;
const initialUrl = "/events?in=thurmont&lens=weekend";
function fixture(overrides: Partial<EventsBoardDockProps> = {}) {
  return <><header><button>Global Find</button></header><main><EventsBoardDock {...props} {...overrides} /><section data-results><button>Open an event</button></section></main><aside inert data-kept-inert /></>;
}
beforeEach(async () => {
  oldOverflow = document.documentElement.style.overflowY;
  window.history.replaceState({ __NA: true, tree: ["", "events"] }, "", initialUrl);
  frames.clear(); frame = 0;
  vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => { const id = ++frame; frames.set(id, callback); return id; });
  vi.stubGlobal("cancelAnimationFrame", (id: number) => frames.delete(id));
  vi.stubGlobal("scrollTo", vi.fn());
  vi.stubGlobal("matchMedia", () => ({ matches: false, addEventListener: noop, removeEventListener: noop }));
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  await act(async () => root.render(fixture()));
});
afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  document.documentElement.style.overflowY = oldOverflow;
  frames.clear();
  vi.restoreAllMocks(); vi.unstubAllGlobals();
});
function filters() { return container.querySelector<HTMLButtonElement>(".eb-filter-trigger")!; }
function done() { return container.querySelector<HTMLButtonElement>(".dock-done")!; }
async function open() {
  filters().focus();
  await act(async () => filters().click());
}

describe("Event filter ownership", () => {
  it("native Back closes Filters first, retains edited URL/context and restores the trigger", async () => {
    await open();
    const edited = `${initialUrl}&free=true`;
    await act(async () => { root.render(fixture({ freeOnly: true })); replaceHistoryLayerUrl(edited); });
    await act(async () => {
      const popped = new Promise(resolve => window.addEventListener("popstate", resolve, { once: true }));
      window.history.back(); await popped;
    });
    expect(container.querySelector('[role="dialog"]')?.getAttribute("aria-hidden")).toBe("true");
    expect(document.activeElement).toBe(filters());
    expect(window.location.pathname + window.location.search).toBe(edited);
    expect(window.history.state).toMatchObject({ __NA: true, tree: ["", "events"] });
    expect(filters().getAttribute("aria-label") ?? filters().textContent).toContain(props.q);
    expect(container.querySelector("[data-event-filter-time]")?.textContent).toBe("This weekend");
    expect(container.querySelector("[data-event-filter-scope]")?.textContent).toBe("Thurmont");
  });

  it.each(["Done", "Escape", "scrim", "toggle"])("%s consumes exactly the same layer and restores filter focus", async (method) => {
    await open();
    const back = vi.spyOn(window.history, "back");
    await act(async () => {
      const popped = new Promise(resolve => window.addEventListener("popstate", resolve, { once: true }));
      if (method === "Done") done().click();
      else if (method === "Escape") done().dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
      else if (method === "scrim") container.querySelector<HTMLDivElement>(".eb-scrim")!.click();
      else filters().click(); // Programmatic same-trigger toggle also owns one dismissal.
      await popped;
    });
    expect(back).toHaveBeenCalledTimes(1);
    expect(container.querySelector('[role="dialog"]')?.getAttribute("aria-hidden")).toBe("true");
    expect(document.activeElement).toBe(filters());
    expect(window.location.pathname + window.location.search).toBe(initialUrl);
  });
  it("Escape dismisses the owned pane after touch leaves focus on the body, then releases its listener", async () => {
    await open();
    const back = vi.spyOn(window.history, "back");
    done().blur();
    expect(document.activeElement).toBe(document.body);
    await act(async () => {
      const popped = new Promise(resolve => window.addEventListener("popstate", resolve, { once: true }));
      document.body.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
      await popped;
    });
    expect(container.querySelector('[role="dialog"]')?.getAttribute("aria-hidden")).toBe("true");
    expect(document.activeElement).toBe(filters());
    expect(back).toHaveBeenCalledTimes(1);
    document.body.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    expect(back).toHaveBeenCalledTimes(1);
  });
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

describe("Event Display disclosure dismissal", () => {
  const display = () => container.querySelector<HTMLDetailsElement>("details.eb-display-options")!;
  const summary = () => display().querySelector("summary")!;
  const order = () => display().querySelector<HTMLButtonElement>('button[aria-label^="Order:"]')!;
  const result = () => container.querySelector<HTMLButtonElement>("[data-results] button")!;
  // The native toggle event is queued as a task; the dismissal listeners
  // attach after it, so wait one task before acting on the open panel.
  const settle = () => act(async () => { await new Promise((resolve) => setTimeout(resolve)); });
  // A real key press is cancelable, which is how the Order menu marks the
  // Escape it consumed.
  const escape = () => act(async () => { document.body.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true })); });
  async function openDisplay() {
    await act(async () => summary().click());
    await settle();
    expect(display().open).toBe(true);
  }

  it("closes on a press outside it and leaves focus with the page", async () => {
    await openDisplay();
    order().focus();
    await act(async () => { order().dispatchEvent(new MouseEvent("pointerdown", { bubbles: true })); });
    expect(display().open).toBe(true);
    // Model the whole press: the browser focuses the pressed control after
    // pointerdown. Then wait a task so a deferred focus move would show.
    await act(async () => {
      result().dispatchEvent(new MouseEvent("pointerdown", { bubbles: true }));
      result().dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
      result().focus();
    });
    await settle();
    expect(display().open).toBe(false);
    expect(document.activeElement).toBe(result());
  });

  it("closes the open Order menu with Display when a finger starts a scroll outside", async () => {
    await openDisplay();
    await act(async () => order().click());
    expect(order().getAttribute("aria-expanded")).toBe("true");
    // A swipe sends pointerdown and no mousedown.
    await act(async () => { result().dispatchEvent(new MouseEvent("pointerdown", { bubbles: true })); });
    expect(display().open).toBe(false);
    expect(order().getAttribute("aria-expanded")).toBe("false");
  });

  it("closes on Escape and returns focus from inside the panel to the summary", async () => {
    await openDisplay();
    order().focus();
    await escape();
    expect(display().open).toBe(false);
    expect(document.activeElement).toBe(summary());
  });

  it("gives the first Escape to the open Order menu and the second to Display", async () => {
    await openDisplay();
    order().focus();
    await act(async () => order().click());
    expect(order().getAttribute("aria-expanded")).toBe("true");
    await escape();
    expect(order().getAttribute("aria-expanded")).toBe("false");
    expect(display().open).toBe(true);
    expect(document.activeElement).toBe(order());
    await escape();
    expect(display().open).toBe(false);
    expect(document.activeElement).toBe(summary());
  });

  it("closes the Order menu and Display when focus moves on to another control", async () => {
    await openDisplay();
    order().focus();
    await act(async () => order().click());
    const choice = display().querySelector<HTMLButtonElement>('[role="group"][aria-label="Order"] button')!;
    await act(async () => choice.focus());
    expect(order().getAttribute("aria-expanded")).toBe("true");
    await act(async () => result().focus());
    expect(order().getAttribute("aria-expanded")).toBe("false");
    expect(display().open).toBe(false);
    expect(document.activeElement).toBe(result());
  });

  it("stays open when a Safari press parks focus on the focusable main around it", async () => {
    // Safari does not focus a pressed button. Focus goes to the nearest
    // focusable ancestor, which in the app is <main tabindex="-1">.
    const main = container.querySelector("main")!;
    main.tabIndex = -1;
    summary().focus();
    await openDisplay();
    await act(async () => main.focus());
    expect(display().open).toBe(true);
    await act(async () => order().click());
    order().focus();
    await act(async () => main.focus());
    expect(order().getAttribute("aria-expanded")).toBe("true");
    expect(display().open).toBe(true);
  });

  it("returns focus to the summary after a keyboard choice closes the panel", async () => {
    await openDisplay();
    const compact = display().querySelector<HTMLButtonElement>('button[aria-label="Compact view"]')!;
    compact.focus();
    await act(async () => compact.click());
    expect(display().open).toBe(false);
    expect(document.activeElement).toBe(summary());
  });
});
