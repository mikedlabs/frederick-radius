// @vitest-environment jsdom

import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { OPEN_FEEDBACK_EVENT } from "@/lib/feedback-ui";

import FeedbackWidget from "./FeedbackWidget";

let pathname = "/food-trucks";

vi.mock("next/navigation", () => ({
  usePathname: () => pathname,
}));

vi.mock("@/lib/track", () => ({
  track: vi.fn(),
}));

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean })
  .IS_REACT_ACT_ENVIRONMENT = true;

describe("FeedbackWidget public reporting", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(async () => {
    pathname = "/food-trucks";
    window.sessionStorage.clear();
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
    await act(async () => {
      root.render(createElement(FeedbackWidget));
    });
  });

  afterEach(async () => {
    vi.unstubAllGlobals();
    await act(async () => root.unmount());
    container.remove();
    document.body.querySelectorAll('[role="dialog"]').forEach((node) => node.remove());
  });

  it("opens the one generic form from an inline page request", async () => {
    await act(async () => {
      window.dispatchEvent(new CustomEvent(OPEN_FEEDBACK_EVENT));
    });

    const dialog = document.body.querySelector<HTMLElement>('[role="dialog"]');
    expect(dialog?.getAttribute("aria-label")).toBe("Send feedback");
    expect(dialog?.textContent).toContain("Email, if you want a reply");
    expect(dialog?.querySelectorAll('button[aria-pressed]').length).toBe(0);
  });

  it("ignores category detail from a retired page and stays generic", async () => {
    await act(async () => {
      window.dispatchEvent(
        new CustomEvent(OPEN_FEEDBACK_EVENT, {
          detail: { fairIssue: "map_wrong", fairContext: "Gate 3" },
        }),
      );
    });

    const dialog = document.body.querySelector<HTMLElement>('[role="dialog"]');
    expect(dialog?.getAttribute("aria-label")).toBe("Send feedback");
    expect(dialog?.textContent).not.toContain("Gate 3");
    expect(dialog?.textContent).not.toContain("What should we fix?");
    expect(dialog?.querySelectorAll('button[aria-pressed]').length).toBe(0);
  });

  it("keeps the floating trigger available on a public surface", () => {
    expect(
      container.querySelector('button[aria-label="Send feedback"]'),
    ).not.toBeNull();
  });
});
