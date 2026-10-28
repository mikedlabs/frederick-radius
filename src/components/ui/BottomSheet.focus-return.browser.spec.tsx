// @vitest-environment jsdom
import { act, createRef, useState, type ComponentPropsWithoutRef } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({ usePathname: () => window.location.pathname }));
vi.mock("@/lib/haptics", () => ({ haptic: vi.fn() }));
vi.mock("framer-motion", async () => {
  const { forwardRef, useEffect, useRef } = await import("react");
  return {
    // An immediate reduced-motion exit invokes the completion callback while
    // the parent can still unmount its dialog. Keep the real history hook.
    AnimatePresence: ({ children, onExitComplete }: { children: React.ReactNode; onExitComplete: () => void }) => {
      const present = useRef(Boolean(children));
      useEffect(() => {
        if (present.current && !children) onExitComplete();
        present.current = Boolean(children);
      }, [children, onExitComplete]);
      return children;
    },
    motion: {
      div: forwardRef<HTMLDivElement, ComponentPropsWithoutRef<"div">>(function MotionDiv({ children, onClickCapture, className, style, tabIndex }, ref) {
        return <div ref={ref} onClickCapture={onClickCapture} className={className} style={style} tabIndex={tabIndex}>{children}</div>;
      }),
      button: forwardRef<HTMLButtonElement, ComponentPropsWithoutRef<"button">>(function MotionButton({ children, onClick, className, style, tabIndex, "aria-label": label }, ref) {
        return <button ref={ref} onClick={onClick} className={className} style={style} tabIndex={tabIndex} aria-label={label}>{children}</button>;
      }),
    },
    useDragControls: () => ({ start: vi.fn() }), useMotionValue: () => 0,
    useTransform: () => 0, useReducedMotion: () => true,
  };
});

import BottomSheet from "./BottomSheet";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
let root: Root, host: HTMLDivElement, opener: HTMLAnchorElement, other: HTMLButtonElement;
let nextFrame = 0;
const frames = new Map<number, FrameRequestCallback>();
const origin = "/today?in=frederick&view=morning#today-saved";

beforeEach(() => {
  window.history.replaceState({}, "", origin);
  nextFrame = 0; frames.clear();
  vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => { const id = ++nextFrame; frames.set(id, callback); return id; });
  vi.stubGlobal("cancelAnimationFrame", (id: number) => frames.delete(id));
  vi.stubGlobal("scrollTo", vi.fn());
  vi.spyOn(HTMLElement.prototype, "getClientRects").mockReturnValue([{ width: 100, height: 44 }] as unknown as DOMRectList);
  opener = document.createElement("a"); opener.href = "/places/saved-cafe"; opener.setAttribute("aria-label", "View saved place: Saved cafe");
  other = document.createElement("button"); other.textContent = "Another action";
  host = document.createElement("div"); document.body.append(opener, other, host); root = createRoot(host);
});
afterEach(async () => {
  await act(async () => root.unmount());
  document.body.replaceChildren(); frames.clear(); vi.restoreAllMocks(); vi.unstubAllGlobals();
});

async function mount() {
  const returnFocusRef = createRef<HTMLElement>(); returnFocusRef.current = opener;
  function Fixture() {
    const [present, setPresent] = useState(true);
    return present ? <BottomSheet present onClose={() => setPresent(false)} ariaLabel="Saved cafe" historyLayerId="saved-cafe" returnFocusRef={returnFocusRef}>
      {dismiss => <button onClick={dismiss}>Close details</button>}
    </BottomSheet> : null;
  }
  await act(async () => root.render(<Fixture />));
  expect(document.querySelector('[role="dialog"]')).not.toBeNull();
}
async function nativeBack() {
  await act(async () => {
    // The browser has traversed out of the temporary same-URL layer before
    // dispatching popstate. Keep that real hook/close/unmount sequence.
    window.history.replaceState({}, "", origin);
    window.dispatchEvent(new PopStateEvent("popstate", { state: {} }));
  });
  expect(document.querySelector('[role="dialog"]')).toBeNull();
}
async function paint() {
  await act(async () => {
    const callbacks = [...frames.values()]; frames.clear();
    callbacks.forEach(callback => callback(performance.now()));
  });
}

describe("reduced-motion sheet Back focus", () => {
  it("waits for the closed layer to paint, survives parent unmount and verifies a later successful focus", async () => {
    await mount();
    const focus = vi.spyOn(opener, "focus").mockImplementationOnce(() => undefined);
    await nativeBack();
    expect(focus).not.toHaveBeenCalled();
    await paint(); expect(focus).toHaveBeenCalledTimes(1); expect(document.activeElement).not.toBe(opener);
    await paint(); expect(focus).toHaveBeenCalledTimes(2); expect(document.activeElement).toBe(opener);
    await paint(); expect(focus).toHaveBeenCalledTimes(2);
    expect(window.location.pathname + window.location.search + window.location.hash).toBe(origin);
  });

  it("rechecks a successful first attempt after traversal cleanup resets focus", async () => {
    await mount(); const focus = vi.spyOn(opener, "focus"); await nativeBack();
    await paint(); expect(document.activeElement).toBe(opener);
    opener.blur(); // The retained native-Back diagnostic observed this cleanup.
    await paint(); expect(document.activeElement).toBe(opener); expect(focus).toHaveBeenCalledTimes(2);
    await paint(); expect(focus).toHaveBeenCalledTimes(2);
  });

  it("never steals a newer deliberate control focus", async () => {
    await mount(); const focus = vi.spyOn(opener, "focus"); await nativeBack();
    other.focus(); await paint(); await paint();
    expect(document.activeElement).toBe(other); expect(focus).not.toHaveBeenCalled();
  });

  it("stops retrying when a different control takes focus after the first attempt", async () => {
    await mount(); const focus = vi.spyOn(opener, "focus").mockImplementationOnce(() => undefined); await nativeBack();
    await paint(); other.focus(); await paint(); await paint();
    expect(document.activeElement).toBe(other); expect(focus).toHaveBeenCalledTimes(1);
  });

  it("does not restore into a new dialog or after leaving the exact browse location", async () => {
    await mount(); const focus = vi.spyOn(opener, "focus"); await nativeBack();
    const dialog = document.createElement("div"); dialog.setAttribute("role", "dialog"); document.body.append(dialog);
    await paint(); dialog.remove(); await paint(); expect(focus).not.toHaveBeenCalled();
    await mount(); await nativeBack(); window.history.replaceState({}, "", "/events?in=county");
    await paint(); await paint(); expect(focus).not.toHaveBeenCalled();
  });

  it("waits only the bounded frames for a temporarily inert equivalent trigger", async () => {
    await mount(); const focus = vi.spyOn(opener, "focus"); await nativeBack();
    opener.setAttribute("inert", ""); await paint(); expect(focus).not.toHaveBeenCalled();
    opener.removeAttribute("inert"); await paint(); expect(document.activeElement).toBe(opener);
    await paint(); expect(focus).toHaveBeenCalledTimes(1);
  });

  it("does not focus a permanently disabled or hidden trigger and stops after two retries", async () => {
    await mount(); const focus = vi.spyOn(opener, "focus"); await nativeBack();
    opener.setAttribute("aria-disabled", "true");
    await paint(); await paint(); await paint();
    opener.removeAttribute("aria-disabled"); await paint(); expect(focus).not.toHaveBeenCalled();
    // The history hook's two scroll frames have also settled; no timer loop.
    expect(frames.size).toBe(0);
  });
});
