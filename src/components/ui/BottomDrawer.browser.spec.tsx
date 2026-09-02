// @vitest-environment jsdom

import { act, createElement, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import BottomDrawer from "./BottomDrawer";

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

async function settleFocus(delayMs = 0) {
  await act(async () => {
    await new Promise((resolve) => window.setTimeout(resolve, delayMs));
  });
}

describe("BottomDrawer keyboard focus", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
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
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
  });

  afterEach(async () => {
    await act(async () => root.unmount());
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
    await settleFocus();

    expect(dialog().getAttribute("aria-modal")).toBe("true");
    expect(dialog().getAttribute("aria-labelledby")).toBeTruthy();
    expect(dialog().getAttribute("aria-describedby")).toBeTruthy();
    expect(document.activeElement).toBe(closeButton());

    await act(async () => {
      document.dispatchEvent(
        new KeyboardEvent("keydown", { key: "Escape", bubbles: true }),
      );
    });
    await settleFocus(600);

    expect(dialog().getAttribute("data-state")).toBe("closed");
    expect(document.activeElement).toBe(opener);
  });

  it("traps forward and backward keyboard focus inside the drawer", async () => {
    await act(async () => root.render(createElement(ControlledDrawer)));
    const opener = container.querySelector<HTMLButtonElement>("button");
    if (!opener) throw new Error("Expected the controlled drawer opener.");

    opener.focus();
    await act(async () => opener.click());
    await settleFocus();

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
    await settleFocus();

    expect(document.activeElement).toBe(closeButton());
    expect(dialog().hasAttribute("aria-describedby")).toBe(false);

    await act(async () => closeButton().click());
    await settleFocus(600);

    expect(dialog().getAttribute("data-state")).toBe("closed");
    expect(document.activeElement).toBe(opener);
  });
});
