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
