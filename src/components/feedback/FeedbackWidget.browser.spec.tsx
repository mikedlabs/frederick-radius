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

  it("shows the feedback trigger to every visitor, with no beta cookie", async () => {
    expect(document.cookie).not.toContain("fr_who");
    for (const page of ["/today", "/map", "/places/baker-park-frederick"]) {
      pathname = page;
      await act(async () => {
        root.render(createElement(FeedbackWidget));
      });
      expect(container.querySelector('button[aria-label="Send feedback"]'), page).not.toBeNull();
    }
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

/**
 * The floating trigger steps aside for its own sheet, so it is gone by the
 * time the sheet records what was focused. Closing used to drop focus on
 * <body>, at the top of a long page.
 */
describe("FeedbackWidget focus return", () => {
  let container: HTMLDivElement;
  let root: Root;
  let inPage: HTMLButtonElement;

  const floatingTrigger = () =>
    document.body.querySelector<HTMLButtonElement>('button[aria-label="Send feedback"]');
  const dialog = () => document.body.querySelector<HTMLElement>('[role="dialog"]');

  async function closeWithEscape() {
    await act(async () => {
      window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    });
    // The sheet leaves on its own exit animation, then hands focus back.
    await vi.waitFor(() => expect(dialog()).toBeNull(), { timeout: 4000 });
  }

  beforeEach(async () => {
    pathname = "/food-trucks";
    window.sessionStorage.clear();
    // jsdom lays nothing out; the sheet only returns focus to a visible control.
    vi.spyOn(HTMLElement.prototype, "getClientRects")
      .mockReturnValue([{ width: 44, height: 44 }] as unknown as DOMRectList);
    // The food-truck board's own report button opens the same sheet by event.
    inPage = document.createElement("button");
    inPage.textContent = "Report a missing truck or wrong stop";
    inPage.addEventListener("click", () => window.dispatchEvent(new CustomEvent(OPEN_FEEDBACK_EVENT)));
    container = document.createElement("div");
    document.body.append(inPage, container);
    root = createRoot(container);
    await act(async () => {
      root.render(createElement(FeedbackWidget));
    });
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
    inPage.remove();
    document.body.querySelectorAll('[role="dialog"]').forEach((node) => node.remove());
    vi.restoreAllMocks();
  });

  it("returns focus to the floating trigger after it reappears", async () => {
    const trigger = floatingTrigger();
    expect(trigger).not.toBeNull();
    trigger!.focus();
    await act(async () => trigger!.click());
    expect(dialog()?.getAttribute("aria-label")).toBe("Send feedback");
    // The trigger unmounted in the commit that opened its sheet.
    expect(trigger!.isConnected).toBe(false);

    await closeWithEscape();
    await vi.waitFor(() => {
      expect(floatingTrigger()).not.toBeNull();
      expect(document.activeElement).toBe(floatingTrigger());
    }, { timeout: 2000 });
  });

  it("returns focus to the in-page button even after an earlier floating open", async () => {
    const trigger = floatingTrigger()!;
    trigger.focus();
    await act(async () => trigger.click());
    await closeWithEscape();
    await vi.waitFor(() => expect(document.activeElement).toBe(floatingTrigger()), { timeout: 2000 });

    // An event-driven open must forget the floating trigger it remembered.
    inPage.focus();
    await act(async () => inPage.click());
    expect(dialog()?.getAttribute("aria-label")).toBe("Send feedback");
    await closeWithEscape();
    await vi.waitFor(() => expect(document.activeElement).toBe(inPage), { timeout: 2000 });
    expect(floatingTrigger()).not.toBeNull();
  });
});
