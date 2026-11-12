// @vitest-environment jsdom

import { act, createElement, StrictMode, useState } from "react";
import { flushSync } from "react-dom";
import { createRoot, type Root } from "react-dom/client";
import { Toaster, toast } from "sonner";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import BottomDrawer from "./BottomDrawer";

const LAYER_KEY = "__frederickRadiusLayer";
const INITIAL_HREF = window.location.href;
// jsdom has no pointer capture, which Sonner requests when a toast is pressed.
Element.prototype.setPointerCapture ??= () => {};

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean })
  .IS_REACT_ACT_ENVIRONMENT = true;

function ControlledDrawer() {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button type="button" onClick={() => setOpen(true)}>
        Open controlled drawer
      </button>
      <BottomDrawer
        open={open}
        onOpenChange={setOpen}
        title="Controlled details"
        subtitle="A controlled drawer without an in-place trigger."
      >
        <div>
          <button type="button">First body action</button>
          <button type="button">Last body action</button>
        </div>
      </BottomDrawer>
    </>
  );
}

function RejectingControlledDrawer() {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button type="button" onClick={() => setOpen(true)}>
        Open rejecting drawer
      </button>
      <BottomDrawer
        open={open}
        onOpenChange={(nextOpen) => {
          if (nextOpen) setOpen(true);
        }}
        title="Required details"
      >
        <button type="button">Required body action</button>
      </BottomDrawer>
    </>
  );
}


function RouteDrawer() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)}>Open route drawer</button>
      {open ? (
        <BottomDrawer open onOpenChange={() => setOpen(false)} title="Route details">
          <button type="button">Route body action</button>
        </BottomDrawer>
      ) : null}
    </>
  );
}


function RemovableControlledDrawer({ mounted }: { mounted: boolean }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)}>Open removable drawer</button>
      <button type="button">Next task</button>
      {mounted ? (
        <BottomDrawer open={open} onOpenChange={setOpen} title="Removable details">
          <button type="button">Removable body action</button>
        </BottomDrawer>
      ) : null}
    </>
  );
}

function LayeredDrawer({
  historyLayerId,
  refuseClose = false,
}: {
  historyLayerId?: string;
  /** A parent may decline a close request, such as an unsaved form. */
  refuseClose?: boolean;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)}>Open layered drawer</button>
      <BottomDrawer
        open={open}
        onOpenChange={(next) => { if (next || !refuseClose) setOpen(next); }}
        historyLayerId={historyLayerId}
        title="Layered details"
      >
        <button type="button" onClick={() => setOpen(false)}>Show results</button>
        {/* eslint-disable-next-line @next/next/no-html-link-for-pages -- the drawer intercepts the rendered anchor, which is what next/link produces */}
        <a href="/places/baker-park-frederick">Open Baker Park</a>
        <a href="/map" target="_blank" rel="noreferrer">Open the map in a new tab</a>
        <a href="https://example.com/menu">Open the vendor site</a>
      </BottomDrawer>
    </>
  );
}

/** A tab or slot that replaces the drawer while it is still open. */
function SlotDrawer({ mounted }: { mounted: boolean }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)}>Open slot drawer</button>
      {mounted ? (
        <BottomDrawer open={open} onOpenChange={setOpen} historyLayerId="slot-details" title="Slot details">
          <button type="button">Slot body action</button>
        </BottomDrawer>
      ) : null}
    </>
  );
}

function ToastDrawer({ onUndo }: { onUndo: () => void }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)}>Open toast drawer</button>
      <BottomDrawer open={open} onOpenChange={setOpen} title="Toast details">
        <button
          type="button"
          onClick={() => toast("Saved to your list.", {
            duration: Infinity,
            action: { label: "Undo", onClick: onUndo },
          })}
        >
          Save this stop
        </button>
      </BottomDrawer>
      <Toaster />
    </>
  );
}

function UncontrolledDrawer() {
  return (
    <BottomDrawer
      trigger={<button type="button">Open uncontrolled drawer</button>}
      title="Uncontrolled details"
    >
      <button type="button">Only body action</button>
    </BottomDrawer>
  );
}

function dialog(): HTMLElement {
  const match = document.body.querySelector<HTMLElement>('[role="dialog"]');
  if (!match) throw new Error("Expected an open drawer dialog.");
  return match;
}

function closeButton(): HTMLButtonElement {
  const match = dialog().querySelector<HTMLButtonElement>(
    'button[aria-label^="Close "]',
  );
  if (!match) throw new Error("Expected a drawer close button.");
  return match;
}

async function flushScheduledWork() {
  await act(async () => {
    await vi.runAllTimersAsync();
  });
}

function layerId(): unknown {
  return (window.history.state as Record<string, unknown> | null)?.[LAYER_KEY];
}

type HistoryStack = { entries: { href: string; state: unknown }[]; index: number };

/**
 * A session history with a real entry stack. Push and replace write the
 * current entry, and Back moves the index down one entry and delivers
 * popstate with that entry's state, as a browser does a task later.
 */
function installHistoryStack(): HistoryStack {
  const native = window.history.replaceState.bind(window.history);
  const stack: HistoryStack = {
    entries: [{ href: window.location.href, state: window.history.state }],
    index: 0,
  };
  vi.spyOn(window.history, "pushState").mockImplementation((state, unused, url) => {
    stack.entries.splice(stack.index + 1);
    stack.entries.push({ href: new URL(String(url ?? window.location.href), window.location.href).href, state });
    stack.index += 1;
    native(state, unused, url);
  });
  vi.spyOn(window.history, "replaceState").mockImplementation((state, unused, url) => {
    stack.entries[stack.index] = { href: new URL(String(url ?? window.location.href), window.location.href).href, state };
    native(state, unused, url);
  });
  vi.spyOn(window.history, "back").mockImplementation(() => {
    window.setTimeout(() => {
      if (stack.index === 0) return;
      stack.index -= 1;
      const entry = stack.entries[stack.index];
      native(entry.state, "", entry.href);
      window.dispatchEvent(new PopStateEvent("popstate", { state: entry.state }));
    }, 0);
  });
  return stack;
}

/** Browser Back through the history stack. */
async function pressBack() {
  await act(async () => window.history.back());
  await flushScheduledWork();
}

/** jsdom cannot load another document, so stand in for the page's location. */
function stubLocation() {
  const real = new URL(window.location.href);
  const location = {
    href: real.href,
    origin: real.origin,
    protocol: real.protocol,
    host: real.host,
    pathname: real.pathname,
    search: real.search,
    hash: real.hash,
    replace: vi.fn(),
    assign: vi.fn(),
  };
  vi.stubGlobal("location", location);
  return location;
}

async function openFromFirstButton(container: HTMLElement): Promise<HTMLButtonElement> {
  const opener = container.querySelector<HTMLButtonElement>("button");
  if (!opener) throw new Error("Expected a drawer opener.");
  opener.focus();
  await act(async () => opener.click());
  await flushScheduledWork();
  return opener;
}

function pressOutsideOn(target: Element) {
  return act(async () => {
    target.dispatchEvent(new MouseEvent("pointerdown", { bubbles: true, button: 0 }));
  });
}

describe("BottomDrawer keyboard focus", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    vi.useFakeTimers({
      toFake: [
        "setTimeout",
        "clearTimeout",
        "requestAnimationFrame",
        "cancelAnimationFrame",
      ],
    });
    Object.defineProperty(window, "matchMedia", {
      configurable: true,
      value: vi.fn().mockImplementation((query: string) => ({
        matches: false,
        media: query,
        onchange: null,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        addListener: vi.fn(),
        removeListener: vi.fn(),
        dispatchEvent: vi.fn(),
      })),
    });
    vi.stubGlobal("scrollTo", vi.fn());
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
  });

  afterEach(async () => {
    await act(async () => {
      toast.dismiss();
      root.unmount();
    });
    vi.clearAllTimers();
    vi.useRealTimers();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    // A route test moves the URL. Every test starts on the same page.
    window.history.replaceState(null, "", INITIAL_HREF);
    container.remove();
    document.body.querySelectorAll('[role="dialog"]').forEach((node) =>
      node.remove(),
    );
  });

  it("moves focus into a controlled modal and returns it after Escape", async () => {
    await act(async () => root.render(createElement(ControlledDrawer)));
    const opener = container.querySelector<HTMLButtonElement>("button");
    if (!opener) throw new Error("Expected the controlled drawer opener.");

    opener.focus();
    await act(async () => opener.click());
    await flushScheduledWork();

    expect(dialog().getAttribute("aria-modal")).toBe("true");
    expect(dialog().dataset.drawerSurface).toBe("solid");
    expect(dialog().style.background).toBe("var(--app-bg-elevated-solid)");
    expect(dialog().dataset.drawerWidth).toBe("standard");
    expect(dialog().className).toContain("sm:max-w-[760px]");
    expect(dialog().className).toContain("rounded-t-[var(--app-radius-lg)]");
    expect(layerId()).toBeUndefined();
    expect(dialog().getAttribute("aria-labelledby")).toBeTruthy();
    expect(dialog().getAttribute("aria-describedby")).toBeTruthy();
    expect(document.activeElement).toBe(closeButton());

    await act(async () => {
      document.dispatchEvent(
        new KeyboardEvent("keydown", { key: "Escape", bubbles: true }),
      );
    });
    await flushScheduledWork();

    expect(dialog().getAttribute("data-state")).toBe("closed");
    expect(document.activeElement).toBe(opener);
  });

  it("returns focus when a route drawer is removed instead of receiving open=false", async () => {
    await act(async () => root.render(createElement(RouteDrawer)));
    const opener = container.querySelector<HTMLButtonElement>("button");
    if (!opener) throw new Error("Expected the route drawer opener.");
    opener.focus();
    await act(async () => opener.click());
    await flushScheduledWork();
    expect(dialog().contains(document.activeElement)).toBe(true);
    await act(async () => closeButton().click());
    await flushScheduledWork();
    expect(document.body.querySelector('[role="dialog"]')).toBeNull();
    expect(document.activeElement).toBe(opener);
  });

  it("does not move focus back when an already closed drawer is later removed", async () => {
    await act(async () => root.render(<RemovableControlledDrawer mounted />));
    const opener = container.querySelector<HTMLButtonElement>("button");
    const next = container.querySelectorAll<HTMLButtonElement>("button")[1];
    if (!opener || !next) throw new Error("Expected persistent task controls.");
    opener.focus();
    await act(async () => opener.click());
    await flushScheduledWork();
    await act(async () => closeButton().click());
    await flushScheduledWork();
    expect(document.activeElement).toBe(opener);
    next.focus();
    await act(async () => root.render(<RemovableControlledDrawer mounted={false} />));
    await flushScheduledWork();
    expect(document.activeElement).toBe(next);
  });

  it("does not restore focus behind another aria-modal dialog without Vaul state", async () => {
    await act(async () => root.render(createElement(ControlledDrawer)));
    const opener = container.querySelector<HTMLButtonElement>("button");
    if (!opener) throw new Error("Expected the controlled opener.");
    opener.focus();
    await act(async () => opener.click());
    await flushScheduledWork();
    await act(async () => closeButton().click());
    const otherModal = document.createElement("div");
    otherModal.setAttribute("role", "dialog");
    otherModal.setAttribute("aria-modal", "true");
    const action = document.createElement("button");
    action.textContent = "Continue search";
    otherModal.append(action);
    document.body.append(otherModal);
    const openerFocus = vi.spyOn(opener, "focus");
    try {
      await flushScheduledWork();
      expect(openerFocus).not.toHaveBeenCalled();
    } finally {
      otherModal.remove();
    }
  });

  it("opts into a translucent surface and a wide layout without changing the dialog semantics", async () => {
    await act(async () => root.render(<BottomDrawer open title="Wide details" surface="translucent" width="wide"><p>Readable map details</p></BottomDrawer>));
    await flushScheduledWork();
    expect(dialog().dataset.drawerSurface).toBe("translucent");
    expect(dialog().style.background).toBe("var(--app-bg-elevated)");
    expect(dialog().dataset.drawerWidth).toBe("wide");
    expect(dialog().className).not.toContain("max-w-");
    expect(dialog().getAttribute("aria-modal")).toBe("true");
    expect(dialog().contains(document.activeElement)).toBe(true);
  });

  it("pushes one history entry and lets Back close the drawer in place", async () => {
    window.history.replaceState({ page: "beneath" }, "", window.location.href);
    const stack = installHistoryStack();
    await act(async () => root.render(<LayeredDrawer historyLayerId="layered-details" />));
    const href = window.location.href;
    const opener = await openFromFirstButton(container);

    expect(dialog().getAttribute("data-state")).toBe("open");
    expect(stack.entries).toHaveLength(2);
    expect(stack.index).toBe(1);
    expect(layerId()).toBe("layered-details");

    await pressBack();

    // Back consumed the layer entry. The page beneath is current again with
    // its own state, and closing did not remove a second entry.
    expect(dialog().getAttribute("data-state")).toBe("closed");
    expect(stack.index).toBe(0);
    expect(window.history.state).toEqual({ page: "beneath" });
    expect(window.history.back).toHaveBeenCalledTimes(1);
    expect(window.location.href).toBe(href);
    expect(document.activeElement).toBe(opener);
  });

  it("removes its history entry when its slot is replaced while it is open", async () => {
    const stack = installHistoryStack();
    await act(async () => root.render(<SlotDrawer mounted />));
    await openFromFirstButton(container);
    expect(stack.index).toBe(1);
    expect(layerId()).toBe("slot-details");

    await act(async () => root.render(<SlotDrawer mounted={false} />));
    await flushScheduledWork();

    expect(window.history.back).toHaveBeenCalledTimes(1);
    expect(stack.index).toBe(0);
    expect(layerId()).toBeUndefined();
  });

  it("does not reverse a route navigation that replaces an open drawer", async () => {
    const stack = installHistoryStack();
    await act(async () => root.render(<SlotDrawer mounted />));
    await openFromFirstButton(container);

    // The router writes the destination entry in the commit that removes the
    // page, after the drawer's own unmount work has run.
    await act(async () => {
      flushSync(() => root.render(<SlotDrawer mounted={false} />));
      window.history.pushState({ route: "place" }, "", "/places/baker-park-frederick");
    });
    await flushScheduledWork();

    expect(window.history.back).not.toHaveBeenCalled();
    expect(stack.index).toBe(2);
    expect(window.location.pathname).toBe("/places/baker-park-frederick");
  });

  it("does not remove a second entry after Back has already closed a drawer that then unmounts", async () => {
    const stack = installHistoryStack();
    await act(async () => root.render(<SlotDrawer mounted />));
    await openFromFirstButton(container);
    await pressBack();
    await act(async () => root.render(<SlotDrawer mounted={false} />));
    await flushScheduledWork();

    expect(window.history.back).toHaveBeenCalledTimes(1);
    expect(stack.index).toBe(0);
  });

  it("keeps its history entry through a Strict Mode remount", async () => {
    const stack = installHistoryStack();
    await act(async () => root.render(<StrictMode><SlotDrawer mounted /></StrictMode>));
    await openFromFirstButton(container);
    await flushScheduledWork();

    expect(window.history.back).not.toHaveBeenCalled();
    expect(stack.index).toBe(1);
    expect(layerId()).toBe("slot-details");
    expect(dialog().getAttribute("data-state")).toBe("open");
  });

  it("removes its own history entry when Close or Escape dismisses it", async () => {
    const back = vi.spyOn(window.history, "back").mockImplementation(() => {});
    await act(async () => root.render(<LayeredDrawer historyLayerId="layered-details" />));
    const opener = await openFromFirstButton(container);

    await act(async () => closeButton().click());
    await flushScheduledWork();
    expect(back).toHaveBeenCalledTimes(1);
    expect(dialog().getAttribute("data-state")).toBe("closed");
    expect(document.activeElement).toBe(opener);

    // The mocked traversal never ran, so the entry is still the layer's own
    // and reopening must reuse it instead of stacking a second one.
    const entries = window.history.length;
    await act(async () => opener.click());
    await flushScheduledWork();
    expect(window.history.length).toBe(entries);
    await act(async () => {
      document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    });
    await flushScheduledWork();
    expect(back).toHaveBeenCalledTimes(2);
    expect(dialog().getAttribute("data-state")).toBe("closed");
  });

  it("removes its history entry when the parent closes the drawer from its own control", async () => {
    const back = vi.spyOn(window.history, "back").mockImplementation(() => {});
    await act(async () => root.render(<LayeredDrawer historyLayerId="layered-details" />));
    await openFromFirstButton(container);
    const apply = Array.from(dialog().querySelectorAll("button"))
      .find((button) => button.textContent === "Show results");
    if (!apply) throw new Error("Expected the in-drawer apply action.");

    await act(async () => apply.click());
    await flushScheduledWork();

    expect(dialog().getAttribute("data-state")).toBe("closed");
    expect(back).toHaveBeenCalledTimes(1);
  });

  it("keeps its history entry while the parent declines to close", async () => {
    const back = vi.spyOn(window.history, "back").mockImplementation(() => {});
    await act(async () => root.render(<LayeredDrawer historyLayerId="layered-details" refuseClose />));
    await openFromFirstButton(container);

    await act(async () => closeButton().click());
    await flushScheduledWork();

    expect(dialog().getAttribute("data-state")).toBe("open");
    expect(back).not.toHaveBeenCalled();
    expect(layerId()).toBe("layered-details");
  });

  it("replaces its history entry when an in-app link inside it is followed", async () => {
    await act(async () => root.render(<LayeredDrawer historyLayerId="layered-details" />));
    await openFromFirstButton(container);
    const [inApp, newTab, external] = Array.from(dialog().querySelectorAll<HTMLAnchorElement>("a"));
    const location = stubLocation();
    let layerAtNavigation: unknown;
    location.replace.mockImplementation(() => { layerAtNavigation = layerId(); });
    // jsdom cannot navigate, so stop whatever the drawer leaves to the browser.
    const browserHandled: string[] = [];
    const stopNavigation = (event: MouseEvent) => {
      browserHandled.push((event.target as HTMLAnchorElement).getAttribute("href") ?? "");
      event.preventDefault();
    };
    document.addEventListener("click", stopNavigation);
    try {
      await act(async () => inApp.click());
      // The destination replaces the drawer's own entry, so one Back from
      // the place returns to the page beneath and never to a dead stop.
      expect(location.replace).toHaveBeenCalledTimes(1);
      expect(location.replace).toHaveBeenCalledWith("/places/baker-park-frederick");
      expect(layerAtNavigation).toBe("layered-details");
      expect(location.assign).not.toHaveBeenCalled();
      expect(browserHandled).toEqual([]);

      await act(async () => newTab.click());
      await act(async () => external.click());
      await act(async () => {
        inApp.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, metaKey: true }));
      });
      expect(location.replace).toHaveBeenCalledTimes(1);
      expect(location.assign).not.toHaveBeenCalled();
      expect(browserHandled).toEqual(["/map", "https://example.com/menu", "/places/baker-park-frederick"]);
    } finally {
      document.removeEventListener("click", stopNavigation);
    }
  });

  it("leaves history and links alone when no history layer is requested", async () => {
    await act(async () => root.render(<LayeredDrawer />));
    const entries = window.history.length;
    await openFromFirstButton(container);
    expect(window.history.length).toBe(entries);
    expect(layerId()).toBeUndefined();

    const inApp = dialog().querySelector<HTMLAnchorElement>("a");
    if (!inApp) throw new Error("Expected the in-app link.");
    const location = stubLocation();
    const browserHandled: boolean[] = [];
    const stopNavigation = (event: MouseEvent) => {
      browserHandled.push(!event.defaultPrevented);
      event.preventDefault();
    };
    document.addEventListener("click", stopNavigation);
    try {
      await act(async () => inApp.click());
    } finally {
      document.removeEventListener("click", stopNavigation);
    }
    expect(browserHandled).toEqual([true]);
    expect(location.replace).not.toHaveBeenCalled();
    expect(location.assign).not.toHaveBeenCalled();
  });

  it("keeps the drawer open when a toast above it is pressed, and runs the toast action", async () => {
    const undo = vi.fn();
    await act(async () => root.render(<ToastDrawer onUndo={undo} />));
    await openFromFirstButton(container);
    const save = Array.from(dialog().querySelectorAll("button"))
      .find((button) => button.textContent === "Save this stop");
    if (!save) throw new Error("Expected the in-drawer save action.");
    await act(async () => save.click());
    await flushScheduledWork();

    const action = document.querySelector<HTMLButtonElement>("[data-sonner-toaster] button[data-action]");
    if (!action) throw new Error("Expected the toast action.");
    expect(dialog().contains(action)).toBe(false);
    await pressOutsideOn(action);
    await act(async () => action.click());
    await flushScheduledWork();

    expect(undo).toHaveBeenCalledTimes(1);
    expect(dialog().getAttribute("data-state")).toBe("open");

    // The guard is narrow: any other press outside still dismisses.
    await pressOutsideOn(container);
    await flushScheduledWork();
    expect(dialog().getAttribute("data-state")).toBe("closed");
  });

  it("traps forward and backward keyboard focus inside the drawer", async () => {
    await act(async () => root.render(createElement(ControlledDrawer)));
    const opener = container.querySelector<HTMLButtonElement>("button");
    if (!opener) throw new Error("Expected the controlled drawer opener.");

    opener.focus();
    await act(async () => opener.click());
    await flushScheduledWork();

    const buttons = Array.from(
      dialog().querySelectorAll<HTMLButtonElement>("button"),
    );
    const first = buttons[0];
    const last = buttons.at(-1);
    if (!first || !last) throw new Error("Expected drawer focus targets.");

    last.focus();
    last.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Tab", bubbles: true }),
    );
    expect(document.activeElement).toBe(first);

    first.focus();
    first.dispatchEvent(
      new KeyboardEvent("keydown", {
        key: "Tab",
        shiftKey: true,
        bubbles: true,
      }),
    );
    expect(document.activeElement).toBe(last);

    opener.focus();
    expect(dialog().contains(document.activeElement)).toBe(true);
  });

  it("preserves trigger focus restoration for uncontrolled drawers", async () => {
    await act(async () => root.render(createElement(UncontrolledDrawer)));
    const opener = container.querySelector<HTMLButtonElement>("button");
    if (!opener) throw new Error("Expected the uncontrolled drawer trigger.");

    opener.focus();
    await act(async () => opener.click());
    await flushScheduledWork();

    expect(document.activeElement).toBe(closeButton());
    expect(dialog().hasAttribute("aria-describedby")).toBe(false);

    await act(async () => closeButton().click());
    await flushScheduledWork();

    expect(dialog().getAttribute("data-state")).toBe("closed");
    expect(document.activeElement).toBe(opener);
  });

  it("does not restore focus when a controlled close request is rejected", async () => {
    await act(async () => root.render(createElement(RejectingControlledDrawer)));
    const opener = container.querySelector<HTMLButtonElement>("button");
    if (!opener) throw new Error("Expected the controlled drawer opener.");

    opener.focus();
    await act(async () => opener.click());
    await flushScheduledWork();

    const openerFocus = vi.spyOn(opener, "focus");
    await act(async () => {
      document.dispatchEvent(
        new KeyboardEvent("keydown", { key: "Escape", bubbles: true }),
      );
    });
    await flushScheduledWork();

    expect(dialog().getAttribute("data-state")).toBe("open");
    expect(openerFocus).not.toHaveBeenCalled();
    expect(dialog().contains(document.activeElement)).toBe(true);
  });
});
