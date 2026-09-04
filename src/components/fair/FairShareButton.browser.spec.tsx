// @vitest-environment jsdom

import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const feedbackMocks = vi.hoisted(() => ({
  haptic: vi.fn(),
  toastSuccess: vi.fn(),
}));

vi.mock("@/lib/haptics", () => ({ haptic: feedbackMocks.haptic }));
vi.mock("sonner", () => ({
  toast: { success: feedbackMocks.toastSuccess },
}));

import FairShareButton, { fairShareUrl } from "./FairShareButton";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean })
  .IS_REACT_ACT_ENVIRONMENT = true;

describe("FairShareButton", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    vi.useFakeTimers();
    feedbackMocks.haptic.mockReset();
    feedbackMocks.toastSuccess.mockReset();
    window.history.replaceState({}, "", "/moments/great-frederick-fair-2026#program");
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it("shares one stable public Fair entry point without local state", async () => {
    const nativeShare = vi.fn(async (data: ShareData) => {
      void data;
    });
    Object.defineProperty(navigator, "share", {
      configurable: true,
      value: nativeShare,
    });
    act(() => root.render(createElement(FairShareButton)));

    await act(async () => {
      container.querySelector<HTMLButtonElement>("[data-fair-share]")?.click();
      await Promise.resolve();
    });

    expect(nativeShare).toHaveBeenCalledWith(
      expect.objectContaining({
        title: "Radius at the Fair",
        url: fairShareUrl(window.location.origin),
      }),
    );
    expect(nativeShare.mock.calls[0]?.[0]?.url).not.toContain("#program");
  });

  it("copies the same link when native sharing is unavailable", async () => {
    const writeText = vi.fn(async () => undefined);
    Object.defineProperty(navigator, "share", {
      configurable: true,
      value: undefined,
    });
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText },
    });
    act(() => root.render(createElement(FairShareButton)));

    await act(async () => {
      container.querySelector<HTMLButtonElement>("[data-fair-share]")?.click();
      await Promise.resolve();
    });

    const url = fairShareUrl(window.location.origin);
    expect(writeText).toHaveBeenCalledWith(url);
    expect(container.textContent).toContain("Copied");
    expect(feedbackMocks.toastSuccess).toHaveBeenCalledWith(
      "Fair guide link copied.",
    );
  });
});
