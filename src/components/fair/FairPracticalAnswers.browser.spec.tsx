// @vitest-environment jsdom

import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { greatFrederickFair2026PracticalAnswers } from "@/data/fair/great-frederick-fair-2026-practical-answers";

import FairPracticalAnswers from "./FairPracticalAnswers";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean })
  .IS_REACT_ACT_ENVIRONMENT = true;

describe("FairPracticalAnswers result announcements", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
  });

  it("keeps one polite status mounted as searches change", async () => {
    await act(async () => {
      root.render(
        createElement(FairPracticalAnswers, {
          answers: greatFrederickFair2026PracticalAnswers,
        }),
      );
    });

    const status = container.querySelector<HTMLElement>('[role="status"]');
    const search = container.querySelector<HTMLInputElement>(
      "#fair-practical-search",
    );
    if (!status || !search) throw new Error("Missing practical-answer controls.");

    expect(status.getAttribute("aria-live")).toBe("polite");
    expect(status.getAttribute("aria-atomic")).toBe("true");
    expect(status.textContent).toBe(
      "Choose a common need or search all practical answers.",
    );

    const valueSetter = Object.getOwnPropertyDescriptor(
      window.HTMLInputElement.prototype,
      "value",
    )?.set;
    if (!valueSetter) throw new Error("Missing the native input value setter.");

    await act(async () => {
      valueSetter.call(search, "parking");
      search.dispatchEvent(new Event("input", { bubbles: true }));
    });

    expect(container.querySelectorAll('[role="status"]')).toHaveLength(1);
    expect(container.querySelector('[role="status"]')).toBe(status);
    expect(status.textContent).toMatch(
      /^\d+ practical answers? match "parking"\.$/,
    );

    await act(async () => {
      valueSetter.call(search, "no reviewed answer uses this phrase");
      search.dispatchEvent(new Event("input", { bubbles: true }));
    });

    expect(container.querySelectorAll('[role="status"]')).toHaveLength(1);
    expect(container.querySelector('[role="status"]')).toBe(status);
    expect(status.textContent).toBe(
      'No practical answers match "no reviewed answer uses this phrase".',
    );
  });

  it("lets a visitor leave a focused quick answer and browse all Fair help", async () => {
    await act(async () => {
      root.render(
        createElement(FairPracticalAnswers, {
          answers: greatFrederickFair2026PracticalAnswers,
        }),
      );
    });

    const buttonNamed = (label: string) =>
      Array.from(container.querySelectorAll<HTMLButtonElement>("button")).find(
        (button) => button.textContent?.includes(label),
      );
    const familyCare = buttonNamed("Family Care + changing");
    if (!familyCare) throw new Error("Missing the family-care quick answer.");

    await act(async () => familyCare.click());

    expect(container.textContent).toContain(
      "Where can a family handle nursing or diaper changes?",
    );
    const seeAll = buttonNamed("See all Fair help");
    if (!seeAll) throw new Error("Missing the focused-answer reset action.");

    await act(async () => seeAll.click());

    expect(
      container.querySelector('[aria-label="Filter practical answers by part of the visit"]'),
    ).not.toBeNull();
    expect(container.textContent).toContain(
      "Can I leave the Fair and come back on the same ticket?",
    );
  });
});
