// @vitest-environment jsdom

import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  greatFrederickFair2026Pack,
  greatFrederickFair2026PackPointer,
} from "@/data/fair/great-frederick-fair-2026-pack";
import {
  FAIR_PLAN_STORAGE_KEY,
  setFairPlanParty,
} from "@/lib/fair/plan";

import FairDayWorkspace from "./FairDayWorkspace";
import { buildFairDayWorkspaceData } from "./buildFairDayWorkspaceData";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean })
  .IS_REACT_ACT_ENVIRONMENT = true;

function buttonWithText(
  root: ParentNode,
  text: string,
): HTMLButtonElement {
  const button = Array.from(root.querySelectorAll<HTMLButtonElement>("button")).find(
    (candidate) => candidate.textContent?.includes(text),
  );
  if (!button) throw new Error(`Missing button containing “${text}”.`);
  return button;
}

describe("FairDayWorkspace app journey", () => {
  let container: HTMLDivElement;
  let root: Root;
  let storedValues: Map<string, string>;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-18T20:59:00Z"));
    storedValues = new Map<string, string>();
    Object.defineProperty(window, "localStorage", {
      configurable: true,
      value: {
        getItem: (key: string) => storedValues.get(key) ?? null,
        setItem: (key: string, value: string) =>
          void storedValues.set(key, value),
        removeItem: (key: string) => void storedValues.delete(key),
      },
    });
    Object.defineProperty(window, "scrollTo", {
      configurable: true,
      value: vi.fn(),
    });
    window.history.replaceState(
      {},
      "",
      "/moments/great-frederick-fair-2026#now",
    );
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
    document.body.querySelectorAll("[data-vaul-drawer]").forEach((node) => node.remove());
    vi.useRealTimers();
  });

  async function renderFair(
    data = buildFairDayWorkspaceData(
      greatFrederickFair2026Pack,
      greatFrederickFair2026PackPointer,
      new Date("2026-09-18T20:59:00Z"),
    ),
  ) {
    await act(async () => {
      root.render(createElement(FairDayWorkspace, { data }));
    });
    return data;
  }

  async function openMode(label: "Now" | "Find" | "My Day" | "Travel") {
    const button = container.querySelector<HTMLButtonElement>(
      `[data-mobile-action-bar] button[aria-label^="${label}"]`,
    );
    if (!button) throw new Error(`Missing ${label} mode button.`);
    await act(async () => button.click());
    await act(async () => vi.advanceTimersByTimeAsync(20));
  }

  async function chooseDate(value: string) {
    const picker = container.querySelector<HTMLSelectElement>("select");
    if (!picker) throw new Error("Missing Fair day picker.");
    const valueSetter = Object.getOwnPropertyDescriptor(
      window.HTMLSelectElement.prototype,
      "value",
    )?.set;
    if (!valueSetter) throw new Error("Missing native select value setter.");
    await act(async () => {
      valueSetter.call(picker, value);
      picker.dispatchEvent(new Event("change", { bubbles: true }));
    });
  }

  it("switches real panels, updates the URL, and focuses the new heading", async () => {
    await renderFair();

    expect(container.querySelector("#fair-now-heading")).not.toBeNull();
    expect(container.querySelector("#fair-find-heading")).toBeNull();

    await openMode("Find");

    expect(window.location.hash).toBe("#find");
    expect(container.querySelector("#fair-now-heading")).toBeNull();
    expect(container.querySelector("#fair-find-heading")).not.toBeNull();
    expect(document.activeElement?.id).toBe("fair-find-heading");
    expect(window.scrollTo).toHaveBeenCalledWith({ top: 0, behavior: "auto" });

    await openMode("My Day");
    expect(container.querySelector("#fair-find-heading")).toBeNull();
    expect(document.activeElement?.id).toBe("fair-my-day-heading");

    await openMode("Travel");
    expect(container.querySelector("#fair-my-day-heading")).toBeNull();
    expect(document.activeElement?.id).toBe("fair-travel-heading");
  });

  it("opens an original #plan link in My Day and replaces it with the canonical hash", async () => {
    window.history.replaceState(
      {},
      "",
      "/moments/great-frederick-fair-2026#plan",
    );

    await renderFair();
    await act(async () => vi.advanceTimersByTimeAsync(20));

    expect(container.querySelector("#fair-my-day-heading")).not.toBeNull();
    expect(container.querySelector("#fair-now-heading")).toBeNull();
    expect(window.location.hash).toBe("#my-day");
  });

  it("sorts program rows by time, removes ticket utility rows, and exposes EventHub in Find", async () => {
    const data = await renderFair();
    await openMode("Find");

    const results = container.querySelector<HTMLOListElement>(
      '[aria-label="Fair program results"]',
    );
    if (!results) throw new Error("Missing Fair program results.");
    const text = results.textContent ?? "";

    expect(text).not.toContain("DEADLINE to purchase");
    expect(text.indexOf("Daughtry")).toBeLessThan(
      text.indexOf("2026 Agricultural Awards Ceremony"),
    );
    expect(container.querySelector<HTMLAnchorElement>(`a[href="${data.externalGuide.url}"]`)).not.toBeNull();
    expect(container.textContent).toContain("sorted by time");
  });

  it("adds a program result and carries it into My Day without a page scroll", async () => {
    await renderFair();
    await openMode("Find");

    const addDaughtry = container.querySelector<HTMLButtonElement>(
      'button[aria-label^="Add Daughtry to My Day"]',
    );
    if (!addDaughtry) throw new Error("Missing Add Daughtry control.");
    await act(async () => addDaughtry.click());

    await openMode("My Day");
    expect(container.textContent).toContain("Daughtry");
    expect(
      container.querySelector('[data-mobile-action-bar] button[aria-label="My Day, 1 saved"]'),
    ).not.toBeNull();
    expect(
      JSON.parse(storedValues.get(FAIR_PLAN_STORAGE_KEY) ?? "{}").steps,
    ).toHaveLength(1);
  });

  it("shows only the selected day's stops while keeping other days saved", async () => {
    await renderFair();
    await openMode("Find");

    const addDaughtry = container.querySelector<HTMLButtonElement>(
      'button[aria-label^="Add Daughtry to My Day"]',
    );
    if (!addDaughtry) throw new Error("Missing Add Daughtry control.");
    await act(async () => addDaughtry.click());

    await chooseDate("2026-09-20");
    await openMode("My Day");
    expect(container.textContent).not.toContain("Daughtry");
    expect(container.textContent).toContain(
      "Choose one thing you do not want to miss.",
    );
    expect(
      container.querySelector(
        '[data-mobile-action-bar] button[aria-label="My Day"]',
      ),
    ).not.toBeNull();

    await openMode("Now");
    await chooseDate("2026-09-18");
    await openMode("My Day");
    expect(container.textContent).toContain("Daughtry");
    expect(
      JSON.parse(storedValues.get(FAIR_PLAN_STORAGE_KEY) ?? "{}").steps,
    ).toHaveLength(1);
  });

  it("keeps the live ticket recommendation current when an open drawer crosses a known cutoff", async () => {
    const data = buildFairDayWorkspaceData(
      greatFrederickFair2026Pack,
      greatFrederickFair2026PackPointer,
      new Date("2026-09-18T20:59:00Z"),
    );
    const partyPlan = setFairPlanParty(
      data.initialPlan,
      {
        adults11Plus: 1,
        children10Under: 0,
        adultRiders: 0,
        childRiders: 0,
      },
      "2026-09-18T20:59:00Z",
    );
    await renderFair({ ...data, initialPlan: partyPlan });

    await act(async () => buttonWithText(container, "Review tickets").click());
    const combination = () =>
      document.body.querySelector(
        '[aria-label="Reviewed party ticket combination"]',
      )?.textContent ?? "";

    expect(combination()).toContain("1 × First Friday advance admission$8");

    await act(async () => vi.advanceTimersByTimeAsync(61_000));

    expect(combination()).not.toContain("First Friday advance admission");
    expect(combination()).toContain("1 × Adult admission online$10");
  });

  it("persists party counts and turns the next action into the next useful task", async () => {
    await renderFair();
    await act(async () => buttonWithText(container, "Review tickets").click());
    await act(async () => buttonWithText(document.body, "Compare tickets").click());

    const changeCount = async (label: string, value: number) => {
      const input = document.body.querySelector<HTMLInputElement>(
        `input[aria-label="${label}"]`,
      );
      if (!input) throw new Error(`Missing ${label} input.`);
      const valueSetter = Object.getOwnPropertyDescriptor(
        window.HTMLInputElement.prototype,
        "value",
      )?.set;
      if (!valueSetter) throw new Error("Missing native value setter.");
      await act(async () => {
        valueSetter.call(input, String(value));
        input.dispatchEvent(new Event("input", { bubbles: true }));
      });
    };

    await changeCount("Adults 11+", 3);
    await changeCount("Children 10 and under", 2);
    await changeCount("Adult riders", 2);
    await changeCount("Child riders", 1);

    expect(
      JSON.parse(storedValues.get(FAIR_PLAN_STORAGE_KEY) ?? "{}").party,
    ).toEqual({
      adults11Plus: 3,
      children10Under: 2,
      adultRiders: 2,
      childRiders: 1,
    });

    await act(async () =>
      buttonWithText(document.body, "I already have tickets").click(),
    );
    expect(container.textContent).toContain("1 of 3 handled");
    expect(container.textContent).toContain("Choose how to get there");
  });

  it("derives the return plan from a travel choice instead of asking twice", async () => {
    await renderFair();
    await openMode("Travel");

    const drive = container.querySelector<HTMLInputElement>(
      'input[value="arrival-drive"]',
    );
    if (!drive) throw new Error("Missing Drive / Park option.");
    await act(async () => drive.click());

    const stored = JSON.parse(
      storedValues.get(FAIR_PLAN_STORAGE_KEY) ?? "{}",
    );
    expect(stored.arrivalChoice).toBe("drive");
    expect(stored.readyKeys).toEqual(
      expect.arrayContaining(["arrival", "return"]),
    );

    await openMode("My Day");
    expect(container.textContent).toContain("Drive and park");
    expect(container.textContent).toContain("Head back");
    expect(container.textContent).toContain("Return to your saved parking lot");
    expect(container.textContent).not.toContain("Return plan set");
  });
});
