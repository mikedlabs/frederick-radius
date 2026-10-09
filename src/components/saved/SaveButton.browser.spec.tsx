// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  saved: false,
  eventUnavailable: false,
  togglePlace: vi.fn<() => Promise<boolean>>(),
  toggleLocal: vi.fn<() => boolean>(),
  toast: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn() }),
}));
vi.mock("@/hooks/useSaved", () => ({ savedChangeDescription: () => "We could not confirm this change. Please try again.", useMounted: () => true, useIsSaved: () => mocks.saved, useToggleSave: () => mocks.toggleLocal, useSetEventSaved: () => mocks.toggleLocal, useEventSavedState: (id: string | null) => id === null ? false : mocks.eventUnavailable ? null : mocks.saved, useSavedList: () => [] }));
vi.mock("@/hooks/useFollows", () => ({ useFollowMutationState: () => "idle", useIsFollowed: () => mocks.saved, useToggleFollow: () => mocks.togglePlace }));
vi.mock("@/lib/haptics", () => ({ haptic: vi.fn() }));
vi.mock("@/lib/track", () => ({ track: vi.fn() }));
vi.mock("@/lib/decision/telemetry", () => ({ decisionContextFromPath: () => ({ surface: "saved", position: "list" }), trackDecision: vi.fn() }));
vi.mock("@/lib/pwa-display", () => ({ isStandalone: () => false, isInstallPromptSuppressedPath: () => false }));
vi.mock("@/lib/return-bridge", () => ({ currentReturnBridgeState: () => ({ completed: true, valueKind: null }), openReturnBridge: vi.fn() }));
vi.mock("sonner", () => ({ toast: mocks.toast }));

import SaveButton from "./SaveButton";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

describe("SaveButton truthful save feedback", () => {
  let container: HTMLDivElement;
  let root: Root;
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.saved = false;
    mocks.eventUnavailable = false;
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
  });
  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });
  function render(refType: "place" | "event" = "place") {
    act(() => root.render(<SaveButton refType={refType} refId="test-stop" label="Save Test stop" />));
  }
  function button() { return container.querySelector("button")!; }

  it("withholds selected state and action when the event store is unavailable", () => {
    mocks.eventUnavailable = true;
    render("event");
    expect(button().disabled).toBe(true);
    expect(button().hasAttribute("aria-pressed")).toBe(false);
    expect(button().getAttribute("aria-label")).toBe("Saved state unavailable for Test stop");
    expect(button().querySelector(".save-pop, .save-ring")).toBeNull();
    expect(mocks.toast.success).not.toHaveBeenCalled();
  });

  it("does not claim a save when the follow limit refuses it", async () => {
    mocks.togglePlace.mockResolvedValue(false);
    render();
    await act(async () => button().click());
    expect(button().getAttribute("aria-pressed")).toBe("false");
    expect(mocks.toast.success).not.toHaveBeenCalled();
    expect(mocks.toast.error).toHaveBeenCalled();
  });

  it("restores the unsaved state when device storage rejects an event save", async () => {
    mocks.toggleLocal.mockImplementation(() => { throw new DOMException("Storage full", "QuotaExceededError"); });
    render("event");
    await act(async () => button().click());
    expect(button().getAttribute("aria-pressed")).toBe("false");
    expect(mocks.toast.success).not.toHaveBeenCalled();
    expect(mocks.toast.error).toHaveBeenCalled();
    expect(button().disabled).toBe(false);
  });

  it("handles an asynchronous place failure and allows retry", async () => {
    mocks.togglePlace.mockRejectedValueOnce(new Error("Storage unavailable"));
    render();
    await act(async () => button().click());
    expect(button().getAttribute("aria-pressed")).toBe("false");
    expect(mocks.toast.error).toHaveBeenCalledTimes(1);
    mocks.togglePlace.mockImplementationOnce(async () => { mocks.saved = true; return true; });
    await act(async () => button().click());
    expect(button().getAttribute("aria-pressed")).toBe("true");
    expect(mocks.toast.success).toHaveBeenCalledTimes(1);
  });

  it("allows one in-flight write and only acknowledges a completed toggle", async () => {
    let complete!: (saved: boolean) => void;
    mocks.togglePlace.mockReturnValue(new Promise<boolean>((resolve) => { complete = resolve; }));
    render();
    await act(async () => { button().click(); button().click(); });
    expect(mocks.togglePlace).toHaveBeenCalledTimes(1);
    expect(button().getAttribute("aria-busy")).toBe("true");
    expect(button().getAttribute("aria-pressed")).toBe("false");
    expect(button().getAttribute("aria-label")).toBe("Saving Test stop");
    expect(button().querySelector(".save-pop, .save-ring")).toBeNull();
    expect(mocks.toast.success).not.toHaveBeenCalled();
    await act(async () => { mocks.saved = true; complete(true); });
    expect(button().disabled).toBe(false);
    expect(button().getAttribute("aria-pressed")).toBe("true");
    expect(mocks.toast.success).toHaveBeenCalledTimes(1);
  });

  it("retains confirmed selection while removal is pending and reports a failed removal", async () => {
    mocks.saved = true;
    let fail!: (error: Error) => void;
    mocks.togglePlace.mockReturnValue(new Promise<boolean>((_resolve, reject) => { fail = reject; }));
    render();
    await act(async () => button().click());
    expect(button().getAttribute("aria-pressed")).toBe("true");
    expect(button().getAttribute("aria-label")).toBe("Removing Test stop");
    expect(mocks.toast).not.toHaveBeenCalled();
    await act(async () => fail(new Error("Unavailable")));
    expect(button().getAttribute("aria-pressed")).toBe("true");
    expect(mocks.toast.error).toHaveBeenCalledTimes(1);
  });

  it("keeps a saved item selected when removal or Undo fails", async () => {
    mocks.saved = true;
    mocks.togglePlace.mockRejectedValueOnce(new Error("Storage unavailable"));
    render();
    await act(async () => button().click());
    expect(button().getAttribute("aria-pressed")).toBe("true");
    expect(mocks.toast).not.toHaveBeenCalled();
    mocks.togglePlace.mockImplementationOnce(async () => { mocks.saved = false; return false; });
    await act(async () => button().click());
    const options = mocks.toast.mock.calls[0][1];
    mocks.togglePlace.mockRejectedValueOnce(new Error("Storage unavailable"));
    await act(async () => options.action.onClick());
    expect(mocks.toast.error).toHaveBeenCalledTimes(2);
    expect(button().getAttribute("aria-pressed")).toBe("false");
  });
});
