// @vitest-environment jsdom

import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { FAIR_FEEDBACK_PATHNAME } from "@/lib/feedback";
import { OPEN_FEEDBACK_EVENT } from "@/lib/feedback-ui";

import FeedbackWidget from "./FeedbackWidget";

let pathname = FAIR_FEEDBACK_PATHNAME;

vi.mock("next/navigation", () => ({
  usePathname: () => pathname,
}));

vi.mock("@/lib/track", () => ({
  track: vi.fn(),
}));

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean })
  .IS_REACT_ACT_ENVIRONMENT = true;

describe("FeedbackWidget Fair reporting", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(async () => {
    pathname = FAIR_FEEDBACK_PATHNAME;
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

  it("opens from a map report with a trusted category and visible context", async () => {
    await act(async () => {
      window.dispatchEvent(
        new CustomEvent(OPEN_FEEDBACK_EVENT, {
          detail: {
            fairIssue: "map_wrong",
            fairContext: "Gate 3 · osm-node-123",
          },
        }),
      );
    });

    const dialog = document.body.querySelector<HTMLElement>('[role="dialog"]');
    expect(dialog?.getAttribute("aria-label")).toBe("Report a Fair issue");
    expect(dialog?.textContent).toContain("What should we fix?");
    expect(dialog?.textContent).toContain("Gate 3 · osm-node-123");
    expect(dialog?.textContent).toContain("call 911");
    expect(dialog?.textContent).toContain("not the Fair");
    expect(
      dialog?.querySelector<HTMLButtonElement>('button[aria-pressed="true"]')
        ?.textContent,
    ).toContain("Map or location");
    expect(dialog?.querySelectorAll('button[aria-pressed]').length).toBe(6);
  });

  it("offers a plainly labeled accessibility barrier report", async () => {
    await act(async () => {
      window.dispatchEvent(
        new CustomEvent(OPEN_FEEDBACK_EVENT, {
          detail: { fairIssue: "access_barrier" },
        }),
      );
    });

    const dialog =
      document.body.querySelector<HTMLElement>('[role="dialog"]');
    expect(
      dialog?.querySelector<HTMLButtonElement>(
        'button[aria-pressed="true"]',
      )?.textContent,
    ).toContain("Accessibility barrier");
    expect(
      dialog
        ?.querySelector<HTMLTextAreaElement>("#fr-feedback-message")
        ?.getAttribute("placeholder"),
    ).toBe("Tell us what made the Fair harder to access or use.");
    expect(dialog?.textContent).toContain("call 911");
    expect(dialog?.textContent).toContain("not the Fair");
  });

  it("makes a Fair category quick to select and keeps email optional", async () => {
    await act(async () => {
      window.dispatchEvent(
        new CustomEvent(OPEN_FEEDBACK_EVENT, {
          detail: { fairIssue: "schedule_change" },
        }),
      );
    });

    const dialog = document.body.querySelector<HTMLElement>('[role="dialog"]');
    const selected = dialog?.querySelector<HTMLButtonElement>(
      'button[aria-pressed="true"]',
    );
    expect(selected?.textContent).toContain("Schedule change");
    expect(
      dialog
        ?.querySelector<HTMLTextAreaElement>("#fr-feedback-message")
        ?.getAttribute("placeholder"),
    ).toBe("Tell us which time, event, or detail changed.");
    expect(dialog?.textContent).toContain("Email (optional)");
    expect(dialog?.textContent).toContain("Add it only if you want a reply.");
  });

  it("preserves the generic feedback form away from Fair Day", async () => {
    await act(async () => root.unmount());
    pathname = "/food-trucks";
    root = createRoot(container);
    await act(async () => {
      root.render(createElement(FeedbackWidget));
    });
    await act(async () => {
      window.dispatchEvent(new CustomEvent(OPEN_FEEDBACK_EVENT));
    });

    const dialog = document.body.querySelector<HTMLElement>('[role="dialog"]');
    expect(dialog?.getAttribute("aria-label")).toBe("Send feedback");
    expect(dialog?.textContent).not.toContain("What should we fix?");
    expect(dialog?.textContent).not.toContain("call 911");
    expect(dialog?.querySelectorAll('button[aria-pressed]').length).toBe(0);
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
