// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  saved: false,
  toggle: vi.fn<() => Promise<boolean>>(),
  toast: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn() }),
}));
vi.mock("@/hooks/useSaved", () => ({ useMounted: () => true }));
vi.mock("@/hooks/useFollows", () => ({ useIsFollowed: () => mocks.saved, useToggleFollow: () => mocks.toggle, useFollowedSlugs: () => ({ authed: false }) }));
vi.mock("@/lib/haptics", () => ({ haptic: vi.fn() }));
vi.mock("@/lib/decision/telemetry", () => ({ trackDecision: vi.fn() }));
vi.mock("@/lib/pwa-display", () => ({ isStandalone: () => false, isInstallPromptSuppressedPath: () => false }));
vi.mock("@/lib/return-bridge", () => ({ currentReturnBridgeState: () => ({ completed: true, valueKind: null }), openReturnBridge: vi.fn() }));
vi.mock("sonner", () => ({ toast: mocks.toast }));

import MyRadiusButton from "./MyRadiusButton";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

describe("place detail save failure recovery", () => {
  let container: HTMLDivElement;
  let root: Root;
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.saved = false;
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
  });
  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });
  function render() { act(() => root.render(<MyRadiusButton slug="test-stop" name="Test stop" />)); }
  function button() { return container.querySelector("button")!; }

  it("recovers from unavailable storage without retaining a false Saved label", async () => {
    mocks.toggle.mockRejectedValueOnce(new DOMException("Storage full", "QuotaExceededError"));
    render();
    await act(async () => button().click());
    expect(button().getAttribute("aria-pressed")).toBe("false");
    expect(button().getAttribute("aria-label")).toBe("Save Test stop");
    expect(button().disabled).toBe(false);
    expect(mocks.toast.success).not.toHaveBeenCalled();
    expect(mocks.toast.error).toHaveBeenCalledTimes(1);
    mocks.toggle.mockImplementationOnce(async () => { mocks.saved = true; return true; });
    await act(async () => button().click());
    expect(button().getAttribute("aria-pressed")).toBe("true");
    expect(mocks.toast.success).toHaveBeenCalledTimes(1);
  });

  it("does not call a refused addition a removal", async () => {
    mocks.toggle.mockResolvedValue(false);
    render();
    await act(async () => button().click());
    expect(button().getAttribute("aria-pressed")).toBe("false");
    expect(mocks.toast).not.toHaveBeenCalled();
    expect(mocks.toast.success).not.toHaveBeenCalled();
    expect(mocks.toast.error).toHaveBeenCalledTimes(1);
  });

  it("serializes rapid taps and catches rejected Undo writes", async () => {
    let complete!: (saved: boolean) => void;
    mocks.toggle.mockReturnValueOnce(new Promise<boolean>((resolve) => { complete = resolve; }));
    render();
    await act(async () => { button().click(); button().click(); });
    expect(mocks.toggle).toHaveBeenCalledTimes(1);
    expect(button().disabled).toBe(true);
    await act(async () => { mocks.saved = true; complete(true); });
    const options = mocks.toast.success.mock.calls[0][1];
    mocks.toggle.mockRejectedValueOnce(new Error("Storage unavailable"));
    await act(async () => options.action.onClick());
    expect(mocks.toast.error).toHaveBeenCalledTimes(1);
    expect(button().getAttribute("aria-pressed")).toBe("true");
    expect(button().disabled).toBe(false);
  });
});
